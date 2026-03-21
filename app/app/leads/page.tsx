import { LeadsPageClient } from "@/components/LeadsPageClient";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getAddressParts, getLeadJobType, getLeadQuestionPreview } from "@/lib/leadPresentation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id,address_full,customer_name,customer_phone,customer_email,services,submitted_at,ai_suggested_price,description,service_question_answers"
    )
    .eq("org_id", auth.orgId)
    .eq("ai_status", "ready")
    .order("submitted_at", { ascending: false });

  const leadIds = (leads ?? []).map((lead) => lead.id as string);

  const [{ data: photos }, { data: unlockedRows }, credits] = await Promise.all([
    leadIds.length > 0
      ? supabase.from("lead_photos").select("lead_id").in("lead_id", leadIds).limit(500)
      : Promise.resolve({ data: [] as Array<{ lead_id: string }> }),
    supabase.from("lead_unlocks").select("lead_id").eq("org_id", auth.orgId),
    getOrgCredits(auth.orgId)
  ]);

  const relevantPhotos = (photos ?? []).filter((row) => leadIds.includes(row.lead_id as string));

  const photoCountByLead = relevantPhotos.reduce<Record<string, number>>((acc, row) => {
    acc[row.lead_id as string] = (acc[row.lead_id as string] ?? 0) + 1;
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
      photo_count: photoCountByLead[leadId] ?? 0,
      description: (lead.description as string | null) ?? null,
      customerName: isUnlocked ? ((lead.customer_name as string | null) ?? null) : null,
      customerPhone: isUnlocked ? ((lead.customer_phone as string | null) ?? null) : null,
      customerEmail: isUnlocked ? ((lead.customer_email as string | null) ?? null) : null,
      jobType: getLeadJobType(lead.service_question_answers, services),
      questionPreview: getLeadQuestionPreview(lead.service_question_answers),
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
