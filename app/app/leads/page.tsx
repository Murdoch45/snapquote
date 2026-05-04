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
      "id,address_full,customer_name,customer_phone,customer_email,services,submitted_at,ai_status,ai_suggested_price,ai_estimate_low,ai_estimate_high,ai_job_summary",
      { count: "exact" }
    )
    .eq("org_id", auth.orgId)
    .in("ai_status", ["ready", "failed"])
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

  // Scope lead_unlocks to the 25 visible lead IDs rather than fetching
  // every unlock row for the org. At org sizes we see in production this
  // is a small win today (61 rows total) but keeps the query constant-
  // time as orgs accumulate unlocks.
  const [{ data: unlockedRows }, credits] = await Promise.all([
    leadIds.length > 0
      ? supabase
          .from("lead_unlocks")
          .select("lead_id")
          .eq("org_id", auth.orgId)
          .in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { lead_id: string }[] }),
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
  // for anyone viewing older leads.
  //
  // Signing is done in ONE batched call (createSignedUrls) rather than a
  // per-photo round-trip. A previous implementation fired up to
  // 2 * LEADS_PER_PAGE = 50 individual Storage API requests per page
  // load, which was the dominant contributor to 30-second load times.
  type PreviewCandidate = (typeof relevantPhotos)[number];
  const previewCandidates = relevantPhotos.reduce<Record<string, PreviewCandidate[]>>(
    (acc, row) => {
      const leadId = row.lead_id as string;
      const existing = acc[leadId] ?? [];
      if (existing.length >= 2) return acc;
      acc[leadId] = [...existing, row];
      return acc;
    },
    {}
  );

  const ONE_HOUR = 60 * 60;
  const previewPhotosByLead: Record<string, string[]> = {};
  const pathOrder: { leadId: string; path: string; fallback: string | null }[] = [];

  for (const [leadId, rows] of Object.entries(previewCandidates)) {
    for (const row of rows) {
      const storagePath = (row.storage_path as string | null) ?? null;
      const rawFallback = (row.public_url as string | null) ?? null;
      const fallback = rawFallback && rawFallback.trim() ? rawFallback : null;
      if (storagePath) {
        pathOrder.push({ leadId, path: storagePath, fallback });
      } else if (fallback) {
        previewPhotosByLead[leadId] = [...(previewPhotosByLead[leadId] ?? []), fallback];
      }
    }
  }

  if (pathOrder.length > 0) {
    const { data: signedResults } = await adminClient.storage
      .from("lead-photos")
      .createSignedUrls(
        pathOrder.map((entry) => entry.path),
        ONE_HOUR
      );
    if (signedResults) {
      // createSignedUrls preserves input order.
      signedResults.forEach((result, idx) => {
        const { leadId, fallback } = pathOrder[idx];
        const url = result.signedUrl || fallback;
        if (!url) return;
        previewPhotosByLead[leadId] = [...(previewPhotosByLead[leadId] ?? []), url];
      });
    } else {
      // Signing batch failed — fall back to whatever 24-hour public_url
      // we stored at upload time. Previews for older leads may not
      // resolve, but that's strictly better than showing nothing.
      for (const { leadId, fallback } of pathOrder) {
        if (!fallback) continue;
        previewPhotosByLead[leadId] = [...(previewPhotosByLead[leadId] ?? []), fallback];
      }
    }
  }
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
      ai_status: (lead.ai_status as string | null) ?? "ready",
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
