// Single source of truth for the quote/estimate status enum across web and
// mobile. Mirrors the Postgres `quote_status` enum defined in
// supabase/migrations/0001_init.sql (+ 0035_draft_quote_status.sql for DRAFT).
//
// This file MUST stay byte-identical between SnapQuote/lib/quoteStatus.ts
// and SnapQuote-mobile/lib/quoteStatus.ts. Cross-repo sharing is done via
// duplicated-identical files (same convention as lib/plans.ts,
// lib/socialCaption.ts, lib/analyticsTypes.ts, lib/serviceColors.ts)
// because there is no shared npm package. Any edit here needs the matching
// edit on the other side before either ships.
//
// == Lifecycle notes ===========================================================
// * DRAFT is load-bearing infrastructure, not a user-facing feature. The
//   lead-unlock flow creates a DRAFT quote row so that the public URL
//   (`public_id`) exists immediately, and the contractor's send step
//   transitions DRAFT → SENT in place. Never surface DRAFT in contractor or
//   customer UI; list views filter it out.
// * SENT → VIEWED fires on first customer view of the public page.
// * SENT or VIEWED → ACCEPTED fires on customer accept.
// * SENT or VIEWED → EXPIRED fires once sent_at is more than 7 days old.
//   Expiry may be computed per-read (see lib/quoteExpiry.ts) or physically
//   applied by the daily auto-expire cron; both must agree.
// ============================================================================

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "EXPIRED"
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// Terminal statuses — no further transitions are possible once a quote is
// in one of these states. Useful when deciding whether to short-circuit
// work (push notifications, re-expiry checks, etc.).
export const TERMINAL_QUOTE_STATUSES = ["ACCEPTED", "EXPIRED"] as const;

// Statuses that represent a "delivered to the customer" estimate. DRAFT is
// excluded because it's internal; ACCEPTED and EXPIRED are included because
// they both imply a prior SENT event. Analytics and list views count off
// this set.
export const DELIVERED_QUOTE_STATUSES = [
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "EXPIRED"
] as const;

export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return (TERMINAL_QUOTE_STATUSES as readonly QuoteStatus[]).includes(status);
}

export function isDeliveredQuoteStatus(status: QuoteStatus): boolean {
  return (DELIVERED_QUOTE_STATUSES as readonly QuoteStatus[]).includes(status);
}
