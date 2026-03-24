import { LeadsPageClient } from "@/components/LeadsPageClient";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getAddressParts } from "@/lib/leadPresentation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id,address_full,customer_name,customer_phone,customer_email,services,submitted_at,ai_suggested_price,ai_estimate_low,ai_estimate_high,ai_job_summary"
    )
    .eq("org_id", auth.orgId)
    .eq("ai_status", "ready")
    .order("submitted_at", { ascending: false });

  const leadIds = (leads ?? []).map((lead) => lead.id as string);

  const adminClient = createAdminClient();
  let photos: Array<{ lead_id: string; storage_path: string | null; public_url: string | null }> = [];
  if (leadIds.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < leadIds.length; i += chunkSize) {
      const chunk = leadIds.slice(i, i + chunkSize);
      const { data: chunkData } = await adminClient
        .from("lead_photos")
        .select("lead_id,storage_path,public_url")
        .in("lead_id", chunk)
        .limit(200);
      if (chunkData) photos = [...photos, ...chunkData];
    }
  }

  const [{ data: unlockedRows }, credits] = await Promise.all([
    supabase.from("lead_unlocks").select("lead_id").eq("org_id", auth.orgId),
    getOrgCredits(auth.orgId)
  ]);

  const relevantPhotos = (photos ?? []).filter((row) => leadIds.includes(row.lead_id as string));

  const photoCountByLead = relevantPhotos.reduce<Record<string, number>>((acc, row) => {
    acc[row.lead_id as string] = (acc[row.lead_id as string] ?? 0) + 1;
    return acc;
  }, {});
  const previewPhotosByLead = relevantPhotos.reduce<Record<string, string[]>>((acc, row) => {
    const leadId = row.lead_id as string;
    const publicUrl = row.public_url as string | null;
    if (!publicUrl || publicUrl.trim() === "") {
      return acc;
    }
    acc[leadId] = [...(acc[leadId] ?? []), publicUrl].slice(0, 2);
    return acc;
  }, {});
  const unlockedLeadIds = new Set((unlockedRows ?? []).map((row) => row.lead_id as string));

  const leadCards = (leads ?? []).map((lead) => {
    const leadId = lead.id as string;
    const services = ((lead.services as string[] | null) ?? []).filter(Boolean);
    const addressParts = getAddressParts((lead.address_full as string | null) ?? null);
    const isUnlocked = unlockedLeadIds.has(leadId);

    return {
      id: leadId,
      fullAddress: isUnlocked ? ((lead.address_full as string | null) ?? null) : null,
      locality: addressParts.locality,
      services,
      submitted_at: lead.submitted_at as string,
      ai_suggested_price: (lead.ai_suggested_price as number | null) ?? null,
      ai_estimate_low: (lead.ai_estimate_low as number | null) ?? null,
      ai_estimate_high: (lead.ai_estimate_high as number | null) ?? null,
      photo_count: photoCountByLead[leadId] ?? 0,
      previewPhotos: previewPhotosByLead[leadId] ?? [],
      ai_job_summary: ((lead.ai_job_summary as string | null) ?? "").trim() || null,
      customerName: isUnlocked ? ((lead.customer_name as string | null) ?? null) : null,
      customerPhone: isUnlocked ? ((lead.customer_phone as string | null) ?? null) : null,
      customerEmail: isUnlocked ? ((lead.customer_email as string | null) ?? null) : null,
      isUnlocked
    };
  });

  return (
    <LeadsPageClient
      orgId={auth.orgId}
      initialCreditsRemaining={credits.total}
      leads={leadCards}
    />
  );
}
