// Authoritative 7-day expiry rule for quotes/estimates.
//
// This file MUST stay byte-identical between SnapQuote/lib/quoteExpiry.ts
// and SnapQuote-mobile/lib/quoteExpiry.ts. Cross-repo sharing is done via
// duplicated-identical files (same convention as lib/plans.ts,
// lib/socialCaption.ts, lib/analyticsTypes.ts, lib/serviceColors.ts,
// lib/quoteStatus.ts) because there is no shared npm package. Any edit
// here needs the matching edit on the other side before either ships.
//
// == Why this lives in one place ================================================
// The 7-day rule used to be duplicated in four places: the web server's
// read paths, the web client's PublicQuoteCard useMemo, the mobile list
// screen's client-side display-only transform, and the daily cron job that
// physically flips status to EXPIRED. Three of those could drift from the
// DB at any time, and the mobile client occasionally showed a status that
// disagreed with what the web server returned for the same quote.
//
// The rule now lives here only. Every read path in both repos calls
// computeEffectiveQuoteStatus() after fetching a quote row from Supabase,
// so the status returned to any caller already reflects expiry — even if
// the cron hasn't run yet. Clients may trust `status` verbatim; there is
// no need for a client-side expiry coercion anywhere.
//
// The cron job continues to physically UPDATE status=EXPIRED so the DB
// eventually catches up, which keeps list queries that filter `.eq("status",
// "EXPIRED")` correct. The cron and this helper always agree because they
// implement the same rule.
// ============================================================================

import type { QuoteStatus } from "./quoteStatus";

export const QUOTE_EXPIRY_DAYS = 7;
export const QUOTE_EXPIRY_MS = QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Returns the UTC Date at which a quote sent at `sentAt` becomes expired.
// Accepts ISO strings or Date instances so server and client code can
// share it without a date library. DRAFT quotes have sent_at=null and
// should never reach this helper — see computeEffectiveQuoteStatus for
// the defensive guard.
export function publicQuoteExpiry(sentAt: string | Date): Date {
  const sent = sentAt instanceof Date ? sentAt : new Date(sentAt);
  return new Date(sent.getTime() + QUOTE_EXPIRY_MS);
}

// Returns what the quote's status effectively is right now, given the DB
// status + sent_at timestamp. A SENT or VIEWED quote past the 7-day
// boundary is reported as EXPIRED even if the cron hasn't flipped it yet.
// Every other status (DRAFT, ACCEPTED, EXPIRED) is returned as-is — those
// are terminal or not-yet-delivered and expiry doesn't apply.
//
// Pass `now` in tests to pin the clock; production callers should let it
// default. The function is pure, so it's safe in server components, API
// routes, React-Native list screens, and cron handlers alike.
export function computeEffectiveQuoteStatus(
  status: QuoteStatus,
  sentAt: string | Date | null | undefined,
  now: Date = new Date()
): QuoteStatus {
  if (status !== "SENT" && status !== "VIEWED") return status;
  if (!sentAt) return status;
  const expiresAt = publicQuoteExpiry(sentAt);
  return now > expiresAt ? "EXPIRED" : status;
}
