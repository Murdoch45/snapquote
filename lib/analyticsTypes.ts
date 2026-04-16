// Shape of the jsonb payload returned by the Postgres RPC
// get_org_analytics (supabase/migrations/0052_get_org_analytics.sql).
// The RPC is the single source of truth for analytics math; both clients
// consume this exact shape.
//
// This file MUST stay byte-identical with SnapQuote-mobile/lib/analyticsTypes.ts.
// Cross-repo sharing is done via duplicated-identical files (same
// convention as lib/plans.ts and lib/socialCaption.ts) because there is
// no shared npm package. Any edit here needs the matching edit on the
// mobile side before either ships.

export type AnalyticsSeriesPoint = {
  date: string; // ISO YYYY-MM-DD in the caller timezone
  count: number;
};

export type AnalyticsRateSeriesPoint = {
  date: string; // ISO YYYY-MM-DD in the caller timezone
  rate: number; // 0..100, one decimal
};

export type AnalyticsServicesPoint = {
  name: string;
  value: number;
};

export type AnalyticsTotals = {
  totalLeads: number;
  quotesSent: number;
  quotesAccepted: number;
  acceptanceRate: number; // 0..100, one decimal
  avgQuoteValue: number; // dollars, two decimals, 0 when no data
  avgResponseMinutes: number | null; // null when no scoped responses
};

export type AnalyticsResponse = {
  totals: AnalyticsTotals;
  leadsOverTime: AnalyticsSeriesPoint[];
  quotesOverTime: AnalyticsSeriesPoint[];
  acceptanceRateOverTime: AnalyticsRateSeriesPoint[];
  servicesBreakdown: AnalyticsServicesPoint[];
};
