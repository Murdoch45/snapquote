import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { triggerEstimatorForLead } from "@/lib/ai/triggerEstimator";
import { buildCustomerConfirmationEmail } from "@/lib/emailTemplates";
import { haversineMiles } from "@/lib/maps";
import { notifyContractor, notifyCustomer, sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rateLimit";
import { normalizeServiceTypes } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";
import { leadSubmitSchema, parseLeadSubmitQuestionAnswers } from "@/lib/validations";

export const runtime = "nodejs";
export const maxDuration = 60;

const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Customer-facing lead submission endpoint.
 *
 * Photo uploads no longer travel through this endpoint — they upload as
 * the customer picks them via /api/public/lead-photo-upload, and the
 * client sends the resulting storagePath / publicUrl pairs here at
 * submit time. That decoupling drops the customer's wait time on this
 * call from "Turnstile + DB writes + photo upload + provider notifies"
 * down to "Turnstile + DB writes" — typically under 2s. See
 * docs/current-state.md "Customer lead submission" section for the full
 * upload-as-picked + submit-doesn't-wait pattern.
 *
 * The client-supplied tempLeadId becomes the lead row's id (overriding
 * the gen_random_uuid() default) so the storage paths created by the
 * photo upload endpoint already reference the right lead. No rename or
 * move needed. Photos still in flight at submit time will see the lead
 * exist when they finish and attach themselves via the unique-
 * constrained INSERT in /api/public/lead-photo-upload.
 *
 * The notification fire-and-forget pattern from fix #4 stays: estimator
 * trigger + Telnyx contractor SMS + Telnyx customer SMS + Resend
 * customer confirmation email all run inside after(), in parallel via
 * Promise.allSettled, so the customer's response doesn't block on any
 * external provider.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`lead-submit:${ip}`, 20, ONE_HOUR)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const bodyObj = (body ?? {}) as Record<string, unknown>;

    const turnstileToken = typeof bodyObj.turnstileToken === "string" ? bodyObj.turnstileToken : "";
    if (!turnstileToken) {
      return NextResponse.json({ error: "Bot verification failed." }, { status: 400 });
    }

    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY ?? "",
          response: turnstileToken
        })
      }
    );
    const verificationJson = (await verificationResponse.json().catch(() => null)) as
      | { success?: boolean }
      | null;

    if (!verificationResponse.ok || verificationJson?.success !== true) {
      return NextResponse.json({ error: "Bot verification failed." }, { status: 400 });
    }

    const services = normalizeServiceTypes(
      Array.isArray(bodyObj.services) ? (bodyObj.services as unknown[]).map((value) => String(value)) : []
    );
    const serviceQuestionAnswers = parseLeadSubmitQuestionAnswers(bodyObj.serviceQuestionAnswers);

    const payload = leadSubmitSchema.parse({
      contractorSlug: typeof bodyObj.contractorSlug === "string" ? bodyObj.contractorSlug : "",
      tempLeadId: typeof bodyObj.tempLeadId === "string" ? bodyObj.tempLeadId : "",
      customerName: typeof bodyObj.customerName === "string" ? bodyObj.customerName : "",
      customerPhone: typeof bodyObj.customerPhone === "string" ? bodyObj.customerPhone : "",
      customerEmail: typeof bodyObj.customerEmail === "string" ? bodyObj.customerEmail : "",
      addressFull: typeof bodyObj.addressFull === "string" ? bodyObj.addressFull : "",
      addressPlaceId: typeof bodyObj.addressPlaceId === "string" ? bodyObj.addressPlaceId : "",
      lat: typeof bodyObj.lat === "number" ? bodyObj.lat : undefined,
      lng: typeof bodyObj.lng === "number" ? bodyObj.lng : undefined,
      services,
      description: typeof bodyObj.description === "string" ? bodyObj.description : "",
      serviceQuestionAnswers,
      photoStoragePaths: Array.isArray(bodyObj.photoStoragePaths)
        ? (bodyObj.photoStoragePaths as Array<Record<string, unknown>>).map((entry) => ({
            storagePath: typeof entry?.storagePath === "string" ? entry.storagePath : "",
            publicUrl: typeof entry?.publicUrl === "string" ? entry.publicUrl : ""
          }))
        : []
    });

    const admin = createAdminClient();
    const { data: contractor, error: contractorError } = await admin
      .from("contractor_profile")
      .select(
        "org_id,business_name,public_slug,phone,email,business_address_full,business_lat,business_lng,travel_pricing_disabled,notification_lead_sms,notification_lead_email"
      )
      .eq("public_slug", payload.contractorSlug)
      .single();

    if (contractorError && contractorError.code !== "PGRST116") {
      throw contractorError;
    }

    if (!contractor) {
      // Generic 400 instead of 404 to avoid distinguishing "slug exists" from
      // "slug doesn't exist" via status codes when the slug is malformed.
      return NextResponse.json(
        { error: "We couldn't find that contractor. Please check the link and try again." },
        { status: 400 }
      );
    }

    const orgId = contractor.org_id as string;

    // Verify every supplied storage path is scoped to this org + tempLeadId.
    // The upload endpoint already enforces this on write, but the submit
    // endpoint is the trust boundary that links these paths to a real
    // lead row, so we revalidate the prefix here. Anything that doesn't
    // match is dropped silently rather than rejecting the whole submit
    // (a malformed path would otherwise abandon a customer mid-form).
    const expectedPrefix = `${orgId}/${payload.tempLeadId}/`;
    const validPhotoPaths = payload.photoStoragePaths.filter((entry) =>
      entry.storagePath.startsWith(expectedPrefix)
    );
    const droppedPathCount = payload.photoStoragePaths.length - validPhotoPaths.length;
    if (droppedPathCount > 0) {
      Sentry.captureMessage("lead-submit dropped photo paths with bad prefix", {
        level: "warning",
        tags: { area: "lead-submit", stage: "photo-path-prefix" },
        extra: {
          orgId,
          tempLeadId: payload.tempLeadId,
          droppedPathCount,
          totalPaths: payload.photoStoragePaths.length
        }
      });
    }

    // 30-day inactivity gate for Solo plans. Paid plans (TEAM/BUSINESS) are
    // always accepted; cancelled/expired subscriptions get downgraded to SOLO
    // by the subscription lifecycle, so no separate "expired" branch is
    // needed — they fall through this same check.
    const { data: gateOrg, error: gateOrgError } = await admin
      .from("organizations")
      .select("plan,last_active_at")
      .eq("id", orgId)
      .single();

    if (gateOrgError || !gateOrg) {
      throw gateOrgError ?? new Error("Organization not found.");
    }

    if ((gateOrg.plan as string) === "SOLO") {
      const lastActiveIso = gateOrg.last_active_at as string | null;
      const lastActiveMs = lastActiveIso ? new Date(lastActiveIso).getTime() : 0;
      if (!lastActiveMs || Date.now() - lastActiveMs > THIRTY_DAYS_MS) {
        return NextResponse.json(
          {
            error:
              "This contractor isn't accepting new requests right now. Please reach out to them directly.",
            code: "SUBSCRIPTION_INACTIVE"
          },
          { status: 402 }
        );
      }
    }

    const travelDistanceMiles =
      !contractor.travel_pricing_disabled &&
      contractor.business_lat != null &&
      contractor.business_lng != null
        ? Number(
            haversineMiles(
              {
                lat: Number(contractor.business_lat),
                lng: Number(contractor.business_lng)
              },
              {
                lat: Number(payload.lat),
                lng: Number(payload.lng)
              }
            ).toFixed(1)
          )
        : null;

    let createdCustomerId: string | null = null;
    let leadId: string | null = null;

    try {
      let existingCustomer: { id: string } | null = null;

      if (payload.customerEmail) {
        const { data: customerByEmail, error: customerByEmailError } = await admin
          .from("customers")
          .select("id")
          .eq("org_id", orgId)
          .eq("email", payload.customerEmail)
          .limit(1)
          .maybeSingle();

        if (customerByEmailError) {
          throw customerByEmailError;
        }

        existingCustomer = (customerByEmail as { id: string } | null) ?? null;
      }

      if (!existingCustomer && payload.customerPhone) {
        const { data: customerByPhone, error: customerByPhoneError } = await admin
          .from("customers")
          .select("id")
          .eq("org_id", orgId)
          .eq("phone", payload.customerPhone)
          .limit(1)
          .maybeSingle();

        if (customerByPhoneError) {
          throw customerByPhoneError;
        }

        existingCustomer = (customerByPhone as { id: string } | null) ?? null;
      }

      if (!existingCustomer) {
        const { data: customer, error: customerError } = await admin
          .from("customers")
          .insert({
            org_id: orgId,
            name: payload.customerName,
            phone: payload.customerPhone || null,
            email: payload.customerEmail || null
          })
          .select("id")
          .single();

        if (customerError || !customer) {
          throw customerError || new Error("Failed to create customer.");
        }

        createdCustomerId = customer.id as string;
      }

      // Lead row uses the client-supplied tempLeadId as its primary key.
      // The Postgres column has gen_random_uuid() as its default, but
      // explicit insertion is allowed — and it's required for our flow
      // because photos uploaded before submit are pathed at
      // ${orgId}/${tempLeadId}/... and need to share an id with the lead
      // row to attach.
      const { data: insertedLead, error: leadError } = await admin
        .from("leads")
        .insert({
          id: payload.tempLeadId,
          org_id: orgId,
          contractor_slug_snapshot: payload.contractorSlug,
          customer_name: payload.customerName,
          customer_phone: payload.customerPhone || null,
          customer_email: payload.customerEmail || null,
          address_full: payload.addressFull,
          address_place_id: payload.addressPlaceId || null,
          lat: payload.lat,
          lng: payload.lng,
          travel_distance_miles: travelDistanceMiles,
          services: payload.services,
          service_question_answers: payload.serviceQuestionAnswers,
          description: payload.description || null,
          status: "NEW",
          ai_status: "processing"
        })
        .select("id")
        .single();

      if (leadError || !insertedLead) {
        throw leadError || new Error("Failed to create lead.");
      }

      leadId = insertedLead.id as string;
    } catch (error) {
      if (createdCustomerId) {
        const { error: cleanupError } = await admin
          .from("customers")
          .delete()
          .eq("id", createdCustomerId)
          .eq("org_id", orgId);

        if (cleanupError) {
          console.error("lead-submit customer cleanup failed:", cleanupError);
        }
      }

      throw error;
    }

    if (!leadId) {
      throw new Error("Failed to create lead.");
    }

    // Insert lead_photos rows for the storage paths the client claims
    // are already uploaded. Photos still in flight at submit time will
    // attach themselves later via /api/public/lead-photo-upload's
    // auto-attach branch — both writers are idempotent against the
    // (lead_id, storage_path) unique constraint added in migration 0066.
    if (validPhotoPaths.length > 0) {
      const photoRows = validPhotoPaths.map((entry) => ({
        lead_id: leadId,
        org_id: orgId,
        storage_path: entry.storagePath,
        // public_url here is the 24h signed URL minted by the upload
        // endpoint. AI ingest needs a URL it can fetch; render-time
        // signing on the dashboard separately mints a fresh 1h URL.
        public_url: entry.publicUrl
      }));
      const { error: photoInsertError } = await admin
        .from("lead_photos")
        .upsert(photoRows, {
          onConflict: "lead_id,storage_path",
          ignoreDuplicates: true
        });
      if (photoInsertError) {
        // Storage objects exist but lead_photos rows didn't write.
        // Surface to Sentry; the lead still ships, just possibly with
        // missing photo references that the rescue cron / contractor
        // can manually sort out.
        Sentry.captureException(photoInsertError, {
          tags: { area: "lead-submit", stage: "photo-row-insert" },
          extra: {
            orgId,
            leadId,
            photoCount: photoRows.length,
            storagePaths: photoRows.map((p) => p.storage_path)
          }
        });
      }
    }

    const leadLink = `${getAppUrl()}/app/leads/${leadId}`;
    const serviceText = payload.services.join(", ");

    if (!contractor.notification_lead_email && contractor.email) {
      console.warn("lead-submit contractor email notification disabled.");
    }

    // Everything that doesn't need to block the customer's response goes
    // inside this single after() block: estimator trigger, contractor
    // SMS, customer SMS, customer confirmation email. Notifications
    // and the AI estimator are non-blocking. The customer's response
    // returns immediately after the lead row + photo_rows write below.
    //
    // Contractor email (previously sent here) still fires from
    // sendNewLeadNotifications inside the estimator's terminal paths so
    // it reaches the contractor on success, failure, and rescue alike.
    const customerConfirmationEmail = buildCustomerConfirmationEmail({
      businessName: contractor.business_name as string,
      businessPhone: (contractor.phone as string | null) ?? null,
      businessEmail: (contractor.email as string | null) ?? null
    });
    const contractorNotificationOptions = {
      smsEnabled: contractor.notification_lead_sms as boolean,
      emailEnabled: false,
      phone: contractor.phone as string | null,
      email: null,
      smsBody: `New estimate request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`,
      emailSubject: "New SnapQuote lead",
      emailBody: `New estimate request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`
    };
    const customerNotificationOptions = {
      phone: payload.customerPhone,
      email: null as string | null,
      smsBody: `We received your request. You will get your estimate shortly. - ${contractor.business_name}`,
      emailSubject: customerConfirmationEmail.subject,
      emailBody: customerConfirmationEmail.text
    };
    const customerEmailRecipient = payload.customerEmail || null;
    const customerEmailReplyTo = (contractor.email as string | null) ?? null;

    const finalLeadId = leadId;
    const finalOrgId = orgId;

    after(async () => {
      const triggerResult = await triggerEstimatorForLead(finalLeadId);
      if (!triggerResult.ok) {
        console.error("lead-submit estimator trigger failed:", triggerResult.error);
        const { error: failureUpdateError } = await admin
          .from("leads")
          .update({ ai_status: "failed" })
          .eq("id", finalLeadId)
          .eq("org_id", finalOrgId);
        if (failureUpdateError) {
          console.error(
            "lead-submit failed to persist estimator-trigger failure state:",
            failureUpdateError
          );
        }
      }

      await Promise.allSettled([
        notifyContractor(contractorNotificationOptions).catch((error) => {
          console.warn("lead-submit contractor notification failed:", error);
        }),
        notifyCustomer(customerNotificationOptions).catch((error) => {
          console.warn("lead-submit customer notification failed:", error);
        }),
        customerEmailRecipient
          ? sendEmail({
              to: customerEmailRecipient,
              subject: customerConfirmationEmail.subject,
              text: customerConfirmationEmail.text,
              html: customerConfirmationEmail.html,
              replyTo: customerEmailReplyTo
            }).catch((error) => {
              console.warn("lead-submit customer email failed:", error);
            })
          : Promise.resolve()
      ]);
    });

    return NextResponse.json({
      success: true,
      leadId,
      received: true
    });
  } catch (error) {
    console.error("lead-submit failed:", error);
    Sentry.captureException(error, {
      tags: { area: "lead-submit", stage: "top-level" }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead submission failed." },
      { status: 400 }
    );
  }
}
