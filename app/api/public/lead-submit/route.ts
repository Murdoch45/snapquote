import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";
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

const MAX_PHOTO_UPLOADS = 10;

function parseNumber(input: FormDataEntryValue | null): number | undefined {
  if (!input || typeof input !== "string" || input.length === 0) return undefined;
  const num = Number(input);
  return Number.isFinite(num) ? num : undefined;
}

function parseJsonField<T>(input: FormDataEntryValue | null, fallback: T): T {
  if (!input || typeof input !== "string" || input.trim().length === 0) return fallback;

  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`lead-submit:${ip}`, 20, ONE_HOUR)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const formData = await request.formData();
    const turnstileToken = String(formData.get("turnstileToken") ?? "");

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

    const services = normalizeServiceTypes(formData.getAll("services[]").map((value) => String(value)));
    const rawServiceQuestionAnswers = parseJsonField<unknown>(formData.get("serviceQuestionAnswers"), null);
    const serviceQuestionAnswers = parseLeadSubmitQuestionAnswers(rawServiceQuestionAnswers);
    const photos = formData.getAll("photos").filter((item): item is File => item instanceof File);

    const payload = leadSubmitSchema.parse({
      contractorSlug: String(formData.get("contractorSlug") ?? ""),
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      addressFull: String(formData.get("addressFull") ?? ""),
      addressPlaceId: String(formData.get("addressPlaceId") ?? ""),
      lat: parseNumber(formData.get("lat")),
      lng: parseNumber(formData.get("lng")),
      services,
      description: String(formData.get("description") ?? ""),
      serviceQuestionAnswers,
      photoCount: photos.length
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
    let lead:
      | {
          id: string;
          parcel_lot_size_sqft: number | string | null;
        }
      | null = null;

    try {
      let existingCustomer:
        | {
            id: string;
          }
        | null = null;

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

      // This is not a true DB transaction: if the lead insert fails after creating a brand-new
      // customer row, we best-effort delete that orphaned customer to avoid leaving stray data behind.
      const { data: insertedLead, error: leadError } = await admin
        .from("leads")
        .insert({
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
        .select("id,parcel_lot_size_sqft")
        .single();

      if (leadError || !insertedLead) {
        throw leadError || new Error("Failed to create lead.");
      }

      lead = insertedLead as { id: string; parcel_lot_size_sqft: number | string | null };
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

    if (!lead) {
      throw new Error("Failed to create lead.");
    }

    const leadId = lead.id as string;
    const uploadedPaths: { path: string; url: string }[] = [];
    const attemptedPhotoUploads = photos.slice(0, MAX_PHOTO_UPLOADS);

    for (const photo of attemptedPhotoUploads) {
      const ext = photo.type.includes("png") ? "png" : "jpg";
      const path = `${orgId}/${leadId}/${randomUUID()}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      const arrayBuffer = await photo.arrayBuffer();
      // eslint-disable-next-line no-await-in-loop
      const { error: uploadError } = await admin.storage
        .from("lead-photos")
        .upload(path, arrayBuffer, {
          contentType: photo.type || "image/jpeg",
          upsert: false
        });
      if (uploadError) continue;
      // We DON'T persist a long-lived signed URL anymore. The path is stored
      // permanently and fresh signed URLs are generated on demand at render
      // time (1-hour TTL). public_url is kept for AI ingest which needs a
      // URL right away — give it a 24-hour token, plenty for processing.
      // eslint-disable-next-line no-await-in-loop
      const { data: signed } = await admin.storage
        .from("lead-photos")
        .createSignedUrl(path, 60 * 60 * 24);
      uploadedPaths.push({ path, url: signed?.signedUrl ?? "" });
    }

    if (uploadedPaths.length > 0) {
      const photoRows = uploadedPaths.map((photo) => ({
        lead_id: leadId,
        org_id: orgId,
        storage_path: photo.path,
        public_url: photo.url
      }));
      await admin.from("lead_photos").insert(photoRows);
    }

    // Kick off the estimator on a Supabase Edge Function. The hand-off is
    // a single HTTP call (~1s) so it's safe inside after() — after() is
    // only carrying the trigger, not the estimator itself. The edge
    // function then drives the estimator via /api/internal/run-estimator,
    // where it runs on a fresh Vercel invocation with a full budget and
    // can't be reclaimed by the lead-submit instance returning.
    //
    // Contractor email (previously sent here) now fires from
    // sendNewLeadNotifications inside the estimator's terminal paths, so
    // it reaches the contractor on success, failure, and rescue alike.
    after(async () => {
      const triggerResult = await triggerEstimatorForLead(leadId);
      if (!triggerResult.ok) {
        console.error("lead-submit estimator trigger failed:", triggerResult.error);
        const { error: failureUpdateError } = await admin
          .from("leads")
          .update({ ai_status: "failed" })
          .eq("id", leadId)
          .eq("org_id", orgId);
        if (failureUpdateError) {
          console.error(
            "lead-submit failed to persist estimator-trigger failure state:",
            failureUpdateError
          );
        }
      }
    });

    const leadLink = `${getAppUrl()}/app/leads/${leadId}`;
    const serviceText = payload.services.join(", ");

    if (!contractor.notification_lead_email && contractor.email) {
      console.warn("lead-submit contractor email notification disabled.");
    }

    const contractorNotifications = await notifyContractor({
      smsEnabled: contractor.notification_lead_sms as boolean,
      emailEnabled: false,
      phone: contractor.phone as string | null,
      email: null,
      smsBody: `New estimate request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`,
      emailSubject: "New SnapQuote lead",
      emailBody: `New estimate request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`
    });

    const customerConfirmationEmail = buildCustomerConfirmationEmail({
      businessName: contractor.business_name as string,
      businessPhone: (contractor.phone as string | null) ?? null,
      businessEmail: (contractor.email as string | null) ?? null
    });

    const customerNotifications = await notifyCustomer({
      phone: payload.customerPhone,
      email: null,
      smsBody: `We received your request. You will get your estimate shortly. - ${contractor.business_name}`,
      emailSubject: customerConfirmationEmail.subject,
      emailBody: customerConfirmationEmail.text
    });
    if (payload.customerEmail) {
      const customerEmailSent = await sendEmail({
        to: payload.customerEmail,
        subject: customerConfirmationEmail.subject,
        text: customerConfirmationEmail.text,
        html: customerConfirmationEmail.html,
        // Replies route back to the contractor instead of estimates@.
        replyTo: (contractor.email as string | null) ?? null
      });

      if (customerEmailSent) {
        customerNotifications.push("email");
      }
    }

    return NextResponse.json({
      success: true,
      leadId,
      received: true,
      photoUploadPartialFailure: uploadedPaths.length < attemptedPhotoUploads.length
    });
  } catch (error) {
    console.error("lead-submit failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead submission failed." },
      { status: 400 }
    );
  }
}
