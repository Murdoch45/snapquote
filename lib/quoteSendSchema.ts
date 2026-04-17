// Shared validation schema for the POST /api/app/quote/send payload.
//
// This file MUST stay byte-identical between SnapQuote/lib/quoteSendSchema.ts
// and SnapQuote-mobile/lib/quoteSendSchema.ts. Cross-repo sharing is done via
// duplicated-identical files (same convention as lib/plans.ts,
// lib/socialCaption.ts, lib/analyticsTypes.ts, lib/serviceColors.ts,
// lib/quoteStatus.ts, lib/quoteExpiry.ts) because there is no shared npm
// package. Any edit here needs the matching edit on the other side before
// either ships.
//
// == Why it's here ============================================================
// Pre-share, the web used this schema server-side via `sendQuoteSchema.parse(…)`
// in /api/app/quote/send, while the mobile app did ad-hoc manual checks in
// app/(modals)/send-quote/[leadId].tsx and then POSTed to the same endpoint.
// That meant:
//   * Web UI and server agreed (they used the same file).
//   * Mobile UI and server could disagree on edge cases (e.g. mobile would
//     pre-submit and get a 400 back for something the web would have
//     caught client-side).
// Sharing the schema guarantees both clients pre-validate identically. The
// backend continues to `.parse()` authoritatively on every request — the
// shared schema is not a replacement for server-side validation.
// ============================================================================

import { z } from "zod";

export const sendQuoteSchema = z
  .object({
    leadId: z.string().uuid(),
    publicId: z.string().min(6).max(24).optional(),
    estimatedPriceLow: z.number().positive(),
    estimatedPriceHigh: z.number().positive(),
    message: z.string().min(12).max(4000),
    sendEmail: z.boolean(),
    sendText: z.boolean()
  })
  .superRefine((val, ctx) => {
    if (!val.sendEmail && !val.sendText) {
      ctx.addIssue({
        path: ["sendEmail"],
        code: z.ZodIssueCode.custom,
        message: "Select email, text, or both before sending the estimate."
      });
    }

    if (val.estimatedPriceLow > val.estimatedPriceHigh) {
      ctx.addIssue({
        path: ["estimatedPriceLow"],
        code: z.ZodIssueCode.custom,
        message: "Low price cannot exceed high price."
      });
    }
  });

export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;
