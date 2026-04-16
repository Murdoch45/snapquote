import "server-only";
import { subDays } from "date-fns";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AnalyticsResponse } from "@/lib/analyticsTypes";

export type OrgContext = {
  userId: string;
  orgId: string;
  role: "OWNER" | "MEMBER";
};

export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;
  return {
    userId: user.id,
    orgId: membership.org_id as string,
    role: membership.role as "OWNER" | "MEMBER"
  };
}

// Fixed 30-day window on web to preserve the existing UI contract. The
// mobile client passes its own range; if web ever grows a range picker it
// can swap these two dates for user-supplied values.
const WEB_ANALYTICS_WINDOW_DAYS = 30;

/**
 * Pull the analytics snapshot for an org. All aggregation happens inside
 * the get_org_analytics Postgres RPC (see migration 0052) so the web and
 * mobile clients agree on the numbers. This helper is a thin wrapper that
 * supplies the web's fixed 30-day window and 'UTC' bucketing.
 */
type WebAnalytics = Omit<AnalyticsResponse, "totals"> & {
  totals: Omit<AnalyticsResponse["totals"], "avgResponseMinutes"> & {
    // The RPC returns null when there are no qualifying responses in the
    // window. The web UI (app/app/page.tsx formatResponseTime) was written
    // before nullability — it treats 0 as "no data". Coerce at the data
    // layer to preserve the existing UI contract without a UI change.
    avgResponseMinutes: number;
  };
};

export async function getAnalytics(orgId: string): Promise<WebAnalytics> {
  const supabase = await createServerSupabaseClient();
  const end = new Date();
  const start = subDays(end, WEB_ANALYTICS_WINDOW_DAYS);

  const { data, error } = await supabase.rpc("get_org_analytics", {
    p_org_id: orgId,
    p_start_date: start.toISOString(),
    p_end_date: end.toISOString(),
    p_timezone: "UTC"
  });

  if (error) {
    throw new Error(`Analytics query failed: ${error.message}`);
  }

  const raw = data as AnalyticsResponse;
  return {
    ...raw,
    totals: {
      ...raw.totals,
      avgResponseMinutes: raw.totals.avgResponseMinutes ?? 0
    }
  };
}
