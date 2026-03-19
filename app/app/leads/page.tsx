import { LeadsPageClient } from "@/components/LeadsPageClient";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";

export default async function LeadsPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const usage = await getMonthlyUsage(auth.orgId);
  const isLocked = !usage.canSend;

  const [{ data: leads }, { data: photos }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,address_full,services,submitted_at,ai_suggested_price")
      .eq("org_id", auth.orgId)
      .eq("ai_status", "ready")
      .order("submitted_at", { ascending: false }),
    supabase.from("lead_photos").select("lead_id").eq("org_id", auth.orgId)
  ]);

  const photoCountByLead = (photos ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.lead_id as string] = (acc[row.lead_id as string] ?? 0) + 1;
    return acc;
  }, {});

  const leadCards = (leads ?? []).map((lead) => ({
    ...lead,
    photo_count: photoCountByLead[lead.id as string] ?? 0,
    isLocked
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500">Incoming quote requests.</p>
      </div>
      <LeadsPageClient
        orgId={auth.orgId}
        leads={
          leadCards as {
            id: string;
            address_full: string;
            services: string[];
            submitted_at: string;
            ai_suggested_price: number | null;
            photo_count?: number;
            isLocked: boolean;
          }[]
        }
      />
    </div>
  );
}
