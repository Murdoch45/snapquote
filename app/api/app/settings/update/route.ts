import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSettingsSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = updateSettingsSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("contractor_profile")
      .select("id,public_slug")
      .eq("org_id", auth.orgId)
      .single();

    if (!existing) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    if (existing.public_slug !== body.publicSlug) {
      const { data: slugMatch } = await admin
        .from("contractor_profile")
        .select("id")
        .eq("public_slug", body.publicSlug)
        .maybeSingle();
      if (slugMatch) {
        return NextResponse.json({ error: "Slug is already in use." }, { status: 409 });
      }
    }

    const { error } = await admin
      .from("contractor_profile")
      .update({
        business_name: body.businessName,
        public_slug: body.publicSlug,
        phone: body.phone || null,
        email: body.email || null,
        notification_lead_sms: body.notificationLeadSms,
        notification_lead_email: body.notificationLeadEmail,
        notification_accept_sms: body.notificationAcceptSms,
        notification_accept_email: body.notificationAcceptEmail
      })
      .eq("org_id", auth.orgId);

    if (error) throw error;

    await admin.from("organizations").update({ name: body.businessName }).eq("id", auth.orgId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings." },
      { status: 400 }
    );
  }
}
