import { LeadsPageClient } from "@/components/LeadsPageClient";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getAddressParts } from "@/lib/leadPresentation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LEADS_PER_PAGE = 25;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function LeadsPage({ searchParams }: Props) {
  const params = await searchParams;
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const rangeFrom = (currentPage - 1) * LEADS_PER_PAGE;
  const rangeTo = rangeFrom + LEADS_PER_PAGE - 1;

  const { data: leads, count } = await supabase
    .from("leads")
    .select(
      "id,address_full,customer_name,customer_phone,customer_email,services,submitted_at,ai_suggested_price,ai_estimate_low,ai_estimate_high,ai_job_summary",
      { count: "exact" }
    )
    .eq("org_id", auth.orgId)
    .eq("ai_status", "ready")
    .order("submitted_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  const leadIds = (leads ?? []).map((lead) => lead.id as string);

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

  // Pick up to 2 photos per lead for preview, then mint fresh 1-hour signed
  // URLs from storage_path. The public_url column holds a 24-hour signed URL
  // from upload time and expires, so relying on it makes previews disappear
  // for anyone viewing older leads. Generating signed URLs at render time
  // matches how the lead detail page serves photos.
  const previewCandidates = relevantPhotos.reduce<Record<string, typeof relevantPhotos>>((acc, row) => {
    const leadId = row.lead_id as string;
    const existing = acc[leadId] ?? [];
    if (existing.length >= 2) return acc;
    acc[leadId] = [...existing, row];
    return acc;
  }, {});
  const ONE_HOUR = 60 * 60;
  const previewPhotosByLead: Record<string, string[]> = {};
  await Promise.all(
    Object.entries(previewCandidates).map(async ([leadId, rows]) => {
      const urls = await Promise.all(
        rows.map(async (row) => {
          const storagePath = row.storage_path as string | null;
          if (storagePath) {
            const { data: signed } = await adminClient.storage
              .from("lead-photos")
              .createSignedUrl(storagePath, ONE_HOUR);
            if (signed?.signedUrl) return signed.signedUrl;
          }
          const fallback = row.public_url as string | null;
          return fallback && fallback.trim() ? fallback : null;
        })
      );
      const filtered = urls.filter((url): url is string => Boolean(url));
      if (filtered.length > 0) previewPhotosByLead[leadId] = filtered;
    })
  );
  const unlockedLeadIds = new Set((unlockedRows ?? []).map((row) => row.lead_id as string));
  const totalLeads = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalLeads / LEADS_PER_PAGE));

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
      currentPage={currentPage}
      totalPages={totalPages}
      totalLeads={totalLeads}
    />
  );
}
