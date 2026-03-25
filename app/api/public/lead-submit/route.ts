import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";
import { generateEstimateAsync } from "@/lib/ai/estimate";
import {
  buildCustomerConfirmationEmail,
  buildNewLeadNotificationEmail
} from "@/lib/emailTemplates";
import { haversineMiles } from "@/lib/maps";
import { notifyContractor, notifyCustomer, sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { normalizeServiceTypes } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";
import { leadSubmitSchema, parseLeadSubmitQuestionAnswers } from "@/lib/validations";

export const runtime = "nodejs";
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

export async function POST(request: Request) {
  try {
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

    console.log("lead-submit parsed payload:", {
      contractorSlug: payload.contractorSlug,
      hasCustomerPhone: Boolean(payload.customerPhone),
      hasCustomerEmail: Boolean(payload.customerEmail),
      customerEmail: payload.customerEmail ?? null,
      servicesCount: payload.services.length
    });

    const admin = createAdminClient();
    const { data: contractor, error: contractorError } = await admin
      .from("contractor_profile")
      .select(
        "org_id,business_name,public_slug,phone,email,business_address_full,business_lat,business_lng,travel_pricing_disabled,notification_lead_sms,notification_lead_email"
      )
      .eq("public_slug", payload.contractorSlug)
      .single();

    if (contractorError) {
      throw contractorError;
    }

    if (!contractor) {
      return NextResponse.json({ error: "Contractor slug not found." }, { status: 404 });
    }

    console.log("lead-submit contractor profile:", {
      orgId: contractor.org_id,
      contractorSlug: contractor.public_slug,
      hasPhone: Boolean(contractor.phone),
      hasEmail: Boolean(contractor.email),
      notificationLeadSms: contractor.notification_lead_sms,
      notificationLeadEmail: contractor.notification_lead_email
    });

    const orgId = contractor.org_id as string;

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

    console.log("lead-submit customer created:", {
      customerId: customer.id,
      orgId
    });

    const { data: lead, error: leadError } = await admin
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

    if (leadError || !lead) {
      throw leadError || new Error("Failed to create lead.");
    }

    const leadId = lead.id as string;
    console.log("lead-submit lead created:", { leadId, orgId });
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
      // eslint-disable-next-line no-await-in-loop
      const { data: signed } = await admin.storage
        .from("lead-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
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

    after(async () => {
      try {
        await generateEstimateAsync(leadId);

        if (!contractor.notification_lead_email) {
          return;
        }

        const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
        if (!ownerEmail) {
          return;
        }

        const { data: hydratedLead } = await admin
          .from("leads")
          .select("id,job_city,job_state,ai_estimate_low,ai_estimate_high,customer_name,services")
          .eq("id", leadId)
          .single();

        if (!hydratedLead) {
          return;
        }

        const email = buildNewLeadNotificationEmail({
          customerName: hydratedLead.customer_name as string,
          serviceType: ((hydratedLead.services ?? []) as string[]).join(", "),
          cityState: [hydratedLead.job_city, hydratedLead.job_state].filter(Boolean).join(", "),
          estimateLow:
            hydratedLead.ai_estimate_low != null ? Number(hydratedLead.ai_estimate_low) : null,
          estimateHigh:
            hydratedLead.ai_estimate_high != null ? Number(hydratedLead.ai_estimate_high) : null,
          leadUrl: `${getAppUrl()}/app/leads/${leadId}`
        });

        const sent = await sendEmail({
          to: ownerEmail,
          subject: email.subject,
          text: email.text,
          html: email.html
        });

        if (!sent) {
          console.warn("lead-submit contractor email notification failed:", {
            orgId,
            leadId,
            ownerEmail
          });
        }
      } catch (error) {
        console.error("lead-submit after() email flow failed:", {
          orgId,
          leadId,
          error
        });
      }
    });

    const leadLink = `${getAppUrl()}/app/leads/${leadId}`;
    const serviceText = payload.services.join(", ");

    if (!contractor.notification_lead_email && contractor.email) {
      console.warn("lead-submit contractor email notification disabled:", {
        contractorSlug: contractor.public_slug,
        contractorEmail: contractor.email
      });
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
    console.log("lead-submit contractor notifications:", contractorNotifications);

    const customerConfirmationEmail = buildCustomerConfirmationEmail({
      businessName: contractor.business_name as string,
      businessPhone: (contractor.phone as string | null) ?? null,
      businessEmail: (contractor.email as string | null) ?? null,
      requestPageUrl: `${getAppUrl()}/${payload.contractorSlug}`
    });

    const customerNotifications = await notifyCustomer({
      phone: payload.customerPhone,
      email: null,
      smsBody: `We received your request. You will get your estimate shortly. - ${contractor.business_name}`,
      emailSubject: customerConfirmationEmail.subject,
      emailBody: customerConfirmationEmail.text
    });
    console.log("lead-submit customer notifications:", customerNotifications);

    if (payload.customerEmail) {
      const customerEmailSent = await sendEmail({
        to: payload.customerEmail,
        subject: customerConfirmationEmail.subject,
        text: customerConfirmationEmail.text,
        html: customerConfirmationEmail.html
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
