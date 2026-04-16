import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/auditLog";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { SERVICE_OPTIONS } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalNullableString(maxLength?: number) {
  const base = typeof maxLength === "number" ? z.string().max(maxLength) : z.string();
  return base.optional().nullable().or(z.literal("").transform(() => null));
}

const patchSettingsSchema = z
  .object({
    business_name: z.string().trim().min(2).max(120).optional(),
    public_slug: z.string().trim().min(3).max(80).regex(SLUG_PATTERN).optional(),
    phone: optionalNullableString(),
    email: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
    services: z.array(z.enum(SERVICE_OPTIONS)).min(1).optional(),
    business_address_full: optionalNullableString(),
    business_address_place_id: optionalNullableString(),
    business_lat: z.number().finite().optional().nullable(),
    business_lng: z.number().finite().optional().nullable(),
    quote_sms_template: optionalNullableString(4000),
    travel_pricing_disabled: z.boolean().optional(),
    notification_lead_email: z.boolean().optional(),
    notification_lead_sms: z.boolean().optional(),
    notification_accept_email: z.boolean().optional(),
    notification_accept_sms: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No settings changes were provided."
  });

export async function PATCH(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = patchSettingsSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("contractor_profile")
      .select("id,public_slug")
      .eq("org_id", auth.orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    if (body.public_slug && existing.public_slug !== body.public_slug) {
      const [{ data: matchingOrg }, { data: matchingProfile }] = await Promise.all([
        admin
          .from("organizations")
          .select("id")
          .eq("slug", body.public_slug)
          .neq("id", auth.orgId)
          .maybeSingle(),
        admin
          .from("contractor_profile")
          .select("org_id")
          .eq("public_slug", body.public_slug)
          .neq("org_id", auth.orgId)
          .maybeSingle()
      ]);

      if (matchingOrg || matchingProfile) {
        return NextResponse.json({ error: "Slug is already in use." }, { status: 409 });
      }
    }

    const updatePayload: Record<string, unknown> = {};

    if ("business_name" in body) updatePayload.business_name = body.business_name;
    if ("public_slug" in body) updatePayload.public_slug = body.public_slug;
    if ("phone" in body) updatePayload.phone = body.phone || null;
    if ("email" in body) updatePayload.email = body.email || null;
    if ("services" in body) updatePayload.services = body.services;
    if ("business_address_full" in body) {
      updatePayload.business_address_full = body.business_address_full?.trim() || null;
    }
    if ("business_address_place_id" in body) {
      updatePayload.business_address_place_id = body.business_address_place_id?.trim() || null;
    }
    if ("business_lat" in body) updatePayload.business_lat = body.business_lat ?? null;
    if ("business_lng" in body) updatePayload.business_lng = body.business_lng ?? null;
    if ("quote_sms_template" in body) {
      updatePayload.quote_sms_template = body.quote_sms_template?.trim() || null;
    }
    if ("travel_pricing_disabled" in body) {
      updatePayload.travel_pricing_disabled = body.travel_pricing_disabled;
      // Keep the legacy mobile_contractor column mirrored until the old field
      // can be removed in a dedicated cleanup migration.
      updatePayload.mobile_contractor = body.travel_pricing_disabled;
    }
    if ("notification_lead_email" in body) {
      updatePayload.notification_lead_email = body.notification_lead_email;
    }
    if ("notification_lead_sms" in body) {
      updatePayload.notification_lead_sms = body.notification_lead_sms;
    }
    if ("notification_accept_email" in body) {
      updatePayload.notification_accept_email = body.notification_accept_email;
    }
    if ("notification_accept_sms" in body) {
      updatePayload.notification_accept_sms = body.notification_accept_sms;
    }

    const { data: updated, error } = await admin
      .from("contractor_profile")
      .update(updatePayload)
      .eq("org_id", auth.orgId)
      .select("*")
      .single();

    if (error || !updated) {
      throw error ?? new Error("Failed to update settings.");
    }

    if (typeof body.business_name === "string" && body.business_name.trim()) {
      const { error: organizationError } = await admin
        .from("organizations")
        .update({ name: body.business_name.trim() })
        .eq("id", auth.orgId);

      if (organizationError) {
        throw organizationError;
      }
    }

    void recordAudit(admin, {
      orgId: auth.orgId,
      action: "settings.updated",
      actorUserId: auth.userId,
      metadata: {
        changed_fields: Object.keys(updatePayload).sort()
      }
    });

    return NextResponse.json({ ok: true, profile: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings." },
      { status: 400 }
    );
  }
}
