import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type AnalyticsRange = "30d" | "90d" | "ytd" | "all";

export const ANALYTICS_RANGES: AnalyticsRange[] = ["30d", "90d", "ytd", "all"];

export function isAnalyticsRange(value: string | undefined): value is AnalyticsRange {
  return value === "30d" || value === "90d" || value === "ytd" || value === "all";
}

function getStartDate(range: AnalyticsRange, now: Date): Date | null {
  switch (range) {
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "ytd":
      // Jan 1 UTC. The RPC rebuckets against the tz we pass ('UTC' on
      // web) so day labels line up with the UTC calendar.
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "all":
      return null;
  }
}

type WebAnalytics = Omit<AnalyticsResponse, "totals"> & {
  totals: Omit<AnalyticsResponse["totals"], "avgResponseMinutes"> & {
    // The RPC returns null when there are no qualifying responses in the
    // window. The web UI (app/app/page.tsx formatResponseTime) was written
    // before nullability — it treats 0 as "no data". Coerce at the data
    // layer to preserve the existing UI contract without a UI change.
    avgResponseMinutes: number;
  };
};

const ANALYTICS_CACHE_TTL_SECONDS = 300;

async function fetchAnalyticsFromRpc(
  orgId: string,
  range: AnalyticsRange
): Promise<WebAnalytics> {
  // Uses the service-role admin client because unstable_cache closures
  // can't read cookies/headers. Safe here because every caller below has
  // already run requireAuth() to confirm the user is a member of orgId.
  // Migration 0053 lets the RPC skip its is_org_member gate when
  // auth.uid() IS NULL (service role) — see comment on that migration.
  const admin = createAdminClient();
  const now = new Date();
  const start = getStartDate(range, now);

  const { data, error } = await admin.rpc("get_org_analytics", {
    p_org_id: orgId,
    p_start_date: start ? start.toISOString() : null,
    p_end_date: now.toISOString(),
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

/**
 * Pull the analytics snapshot for an org. Aggregation happens inside the
 * get_org_analytics Postgres RPC (migration 0052); responses are cached
 * with a 5-minute TTL keyed on orgId + range so repeated views of the
 * page within that window don't re-run the aggregation.
 *
 * The cache TTL is short enough that contractors see fresh-ish data on
 * browser refresh and long enough to meaningfully reduce DB load.
 */
export async function getAnalytics(
  orgId: string,
  range: AnalyticsRange = "30d"
): Promise<WebAnalytics> {
  const cached = unstable_cache(
    () => fetchAnalyticsFromRpc(orgId, range),
    ["analytics-rpc", orgId, range],
    {
      revalidate: ANALYTICS_CACHE_TTL_SECONDS,
      tags: [`analytics:${orgId}`]
    }
  );
  return cached();
}
