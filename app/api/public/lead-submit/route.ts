import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { generateEstimate } from "@/lib/ai/estimate";
import { notifyContractor, notifyCustomer } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";
import { leadSubmitSchema } from "@/lib/validations";

function parseNumber(input: FormDataEntryValue | null): number | undefined {
  if (!input || typeof input !== "string" || input.length === 0) return undefined;
  const num = Number(input);
  return Number.isFinite(num) ? num : undefined;
}

async function geocodeAddressIfNeeded(
  address: string,
  currentLat?: number | null,
  currentLng?: number | null
): Promise<{ lat?: number; lng?: number }> {
  if (currentLat != null && currentLng != null) {
    return { lat: currentLat, lng: currentLng };
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return {};
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return {};
  const json = await response.json();
  const location = json?.results?.[0]?.geometry?.location;
  if (!location) return {};
  return {
    lat: Number(location.lat),
    lng: Number(location.lng)
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const services = formData.getAll("services[]").map((value) => String(value));

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
      description: String(formData.get("description") ?? "")
    });

    console.log("lead-submit parsed payload:", {
      contractorSlug: payload.contractorSlug,
      hasCustomerPhone: Boolean(payload.customerPhone),
      hasCustomerEmail: Boolean(payload.customerEmail),
      customerEmail: payload.customerEmail ?? null,
      servicesCount: payload.services.length
    });

    const admin = createAdminClient();
    const { data: contractor } = await admin
      .from("contractor_profile")
      .select(
        "org_id,business_name,public_slug,phone,email,notification_lead_sms,notification_lead_email"
      )
      .eq("public_slug", payload.contractorSlug)
      .single();

    if (!contractor) {
      return NextResponse.json({ error: "Contractor slug not found." }, { status: 404 });
    }

    const orgId = contractor.org_id as string;
    const geocoded = await geocodeAddressIfNeeded(payload.addressFull, payload.lat, payload.lng);

    const { data: customer } = await admin
      .from("customers")
      .insert({
        org_id: orgId,
        name: payload.customerName,
        phone: payload.customerPhone || null,
        email: payload.customerEmail || null
      })
      .select("id")
      .single();

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
        lat: geocoded.lat ?? payload.lat ?? null,
        lng: geocoded.lng ?? payload.lng ?? null,
        services: payload.services,
        description: payload.description || null,
        status: "NEW"
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      throw leadError || new Error("Failed to create lead.");
    }

    const leadId = lead.id as string;
    const photos = formData.getAll("photos").filter((item): item is File => item instanceof File);
    const uploadedPaths: { path: string; url: string }[] = [];

    for (const photo of photos.slice(0, 5)) {
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
        .createSignedUrl(path, 60 * 60 * 24 * 30);
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

    const estimate = await generateEstimate({
      businessName: contractor.business_name as string,
      services: payload.services,
      address: payload.addressFull,
      description: payload.description,
      photoUrls: uploadedPaths.map((p) => p.url)
    });

    await admin
      .from("leads")
      .update({
        ai_job_summary: estimate.jobSummary,
        ai_estimate_low: estimate.estimateLow,
        ai_estimate_high: estimate.estimateHigh,
        ai_suggested_price: estimate.suggestedPrice,
        ai_draft_message: estimate.draftMessage,
        ai_generated_at: new Date().toISOString()
      })
      .eq("id", leadId)
      .eq("org_id", orgId);

    const leadLink = `${getAppUrl()}/app/leads/${leadId}`;
    const serviceText = payload.services.join(", ");

    const contractorNotifications = await notifyContractor({
      smsEnabled: contractor.notification_lead_sms as boolean,
      emailEnabled: contractor.notification_lead_email as boolean,
      phone: contractor.phone as string | null,
      email: contractor.email as string | null,
      smsBody: `New quote request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`,
      emailSubject: "New SnapQuote lead",
      emailBody: `New quote request: ${serviceText} at ${payload.addressFull}. Open: ${leadLink}`
    });
    console.log("lead-submit contractor notifications:", contractorNotifications);

    const customerNotifications = await notifyCustomer({
      phone: payload.customerPhone,
      email: payload.customerEmail,
      smsBody: `We received your request. You will get your estimate shortly. - ${contractor.business_name}`,
      emailSubject: `${contractor.business_name} received your quote request`,
      emailBody: `We received your request and will send your estimate shortly. - ${contractor.business_name}`
    });
    console.log("lead-submit customer notifications:", customerNotifications);

    return NextResponse.json({ leadId, received: true });
  } catch (error) {
    console.error("lead-submit failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead submission failed." },
      { status: 400 }
    );
  }
}
