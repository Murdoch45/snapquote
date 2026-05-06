# Contractor self-accept — fix option comparison

**Date:** 2026-05-05
**Repo HEAD:** `60cc2c5`
**Mode:** Read-only analysis. No code changes.
**Companion:** [demo-preview-link-diagnostic-2026-05-05.md](demo-preview-link-diagnostic-2026-05-05.md)

---

## Bug recap (one paragraph)

Contractor clicks "Preview customer estimate page" link on the lead detail page (`app/app/leads/[id]/page.tsx:423`), lands on `/q/{publicId}` (anonymous public route), sees the customer-facing `<PublicQuoteCard>` with a fully functional Accept button, clicks it, and the no-auth `POST /api/public/quote/[publicId]/accept` endpoint flips quote+lead to ACCEPTED, fires real notifications including an "Estimate accepted" SMS to the contractor's own phone.

---

## Reference points (what's already there)

- **Web public quote page** — `app/(public)/q/[publicId]/page.tsx`: 117 lines, server component, calls `createAdminClient()` and passes data to `<PublicQuoteCard>`. No session lookup at all today.
- **PublicQuoteCard** — `components/PublicQuoteCard.tsx`: 191 lines, client component. Status displayed today (lines 169–186):
  - `DRAFT` → blue "being finalized" notice, no button.
  - `ACCEPTED` → green confirmation block with timestamp, no button.
  - `EXPIRED` (or expired-by-clock) → disabled button reading "Estimate expired".
  - `SENT`/`VIEWED` → enabled "I'm Interested — Request to Book" button.
  No `viewerIsContractor`/preview prop today.
- **Accept endpoint** — `app/api/public/quote/[publicId]/accept/route.ts`: zero auth. Pure publicId-keyed.
- **Mobile lead detail page** — `app/(tabs)/leads/[id].tsx:418-450`: already renders an "Estimate Summary" card with `<QuoteStatusBadge>` showing SENT/VIEWED/ACCEPTED for the contractor. Status visibility is **not** something the contractor lacks today.
- **Web contractor lead detail** — `app/app/leads/[id]/page.tsx:416` already shows `Price: $X (STATUS)` inline. Same point — contractor already sees status without needing the public quote page.
- **Auth helpers** — `lib/auth/requireAuth.ts` (server-component cookie session) and `lib/supabase/server.ts:createServerSupabaseClient` (cookie-based Supabase client). Both directly usable inside `route.ts`. Cost of getting the current user in the accept route: ~3 lines.

---

## Option A — Hide Accept button for contractor (UI only)

**What changes**
- `app/(public)/q/[publicId]/page.tsx`: read session via `createServerSupabaseClient`, query `organization_members` for `eq(user_id).eq(org_id, quote.org_id).maybeSingle()`, pass `viewerIsContractor: boolean` to `<PublicQuoteCard>`.
- `components/PublicQuoteCard.tsx`: add `viewerIsContractor?: boolean` prop, branch the bottom section to render nothing (or an inert placeholder) when true.

**Implementation complexity**
- ~20–30 LOC across 2 files.
- 2–3 hours including manual smoke-testing on a SENT and an ACCEPTED demo quote.

**Contractor UX**
- Sees the customer card. Bottom is empty (no button, no message). Slightly confusing — "is this the right page? what am I looking at?" Without an explicit banner, the contractor has to infer.

**Security posture**
- **Closes UI surface only.** Accept endpoint still trusts the URL alone. Anyone who:
  - Reverse-engineers the publicId (low entropy risk — randomBytes URL-safe token is fine here, but...)
  - Captures the publicId from an outbound SMS log
  - Is shoulder-surfing the contractor or has access to the contractor's browser history
  ...can still POST `/accept` and flip the row.
- **Self-accept by contractor still possible** via raw `fetch` from the browser console.

**Regression risk**
- Low. The session lookup is one read; failure modes degrade to "treat as customer" which is the current behavior.
- Edge case: customer happens to be a SnapQuote contractor in a different org (multi-org seed user, or some employee of the contractor's org logging in). Their `organization_members` won't match `quote.org_id`, so they're correctly treated as customers. ✓

**Pre-launch viability**
- Yes. Same-day or next-day. Doesn't conflict with Build 10.

---

## Option B — Show status timeline + hide Accept button (UI investment)

**What changes**
- Everything in Option A.
- Plus: lift the mobile `QuoteStatusBadge` pattern (`SnapQuote-mobile/components/quotes/QuoteStatusBadge.tsx` — 5 statuses, color-coded) into the web repo as a shared component.
- Plus: add a "preview mode" banner block in `<PublicQuoteCard>` showing badge + (probably) sent/viewed/accepted timestamps from `quote_events`. That requires either:
  - Adding `events: QuoteEvent[]` to the page-level data fetch (new join in `app/(public)/q/[publicId]/page.tsx`), or
  - Inferring states from `sent_at` / `accepted_at` on the quote row.
- Plus: design work — what does the timeline look like? Where does the badge sit? Does it replace the price card, or sit beside it?

**Implementation complexity**
- ~80–150 LOC across 3–4 files. New web component, new design surface, new data fetch path.
- 1–2 days realistic, including design iteration. Could blow up to 3 if the team disagrees on visual treatment.

**Contractor UX**
- Rich. Contractor sees the customer view + a "this is what your customer sees, here's the live status" overlay.
- **But:** the contractor already has all this status visibility on `app/app/leads/[id]/page.tsx:416` ("Price: $X (SENT)") and on the mobile lead detail page (`QuoteStatusBadge`). The marginal UX value of putting it on the public quote page is small. The public quote page's job is "show the contractor what the customer sees" — adding status overlays actively undermines that purpose.

**Security posture**
- **Same as Option A — UI only.** Endpoint still wide open. None of the work in Option B touches `route.ts`.

**Regression risk**
- Medium. New component, new data path, new visual treatment. More surface area to break. The `quote_events` join is a new query pattern on this route.

**Pre-launch viability**
- Tight for Build 10. Could ship in 1–2 days but eats design/review bandwidth. Not advised pre-launch.

---

## Option C — Disable button + preview banner + server-side guard (defense in depth)

**What changes**
- Everything in Option A (session lookup → `viewerIsContractor` prop).
- `<PublicQuoteCard>`: when `viewerIsContractor`, replace the accept button with a "Preview mode — customer actions disabled. This is what your customer sees." banner. Still show DRAFT/EXPIRED/ACCEPTED status blocks (already there) so the contractor sees terminal states.
- `app/api/public/quote/[publicId]/accept/route.ts`: at the top, fetch session from cookie-based `createServerSupabaseClient`, if `user` exists query `organization_members` for `eq(user_id).eq(org_id, quote.org_id).maybeSingle()`, return 403 "Cannot accept your own estimate." if a row exists.

**Implementation complexity**
- ~50–70 LOC across 3 files (page.tsx, PublicQuoteCard.tsx, accept/route.ts).
- 4–6 hours including manual testing of the four cases:
  1. Anonymous customer → accepts ✓
  2. Logged-in contractor of same org → 403 + UI hidden ✓
  3. Logged-in user from different org → accepts ✓ (treated as customer)
  4. Logged-out contractor (cleared cookies) → accepts ✓ — hole still partly open here, but the only attacker is the contractor themselves intentionally bypassing.

**Contractor UX**
- Banner explains preview mode. Clear affordance. Status blocks for terminal quotes still show up because they were always there in `<PublicQuoteCard>`. No new design needed — it's the existing card minus the Accept button.

**Security posture**
- **Closes the hole as far as practical.**
  - UI prevents accidental clicks.
  - Server guard prevents intentional console-fetch from a logged-in contractor.
  - Remaining gap: a contractor who logs out, then visits `/q/{publicId}`, can still self-accept. This is a "user is actively trying to cheat themselves" scenario — out of scope for an auth fix; covered better by audit logging (record `accepted_by_user_id` so a later post-mortem can spot anomalies).
- The endpoint stays anonymous-OK by design (real customers never have sessions). The guard is a deny-list, not an allow-list.

**Regression risk**
- Low–medium. Risks:
  - Cookie-based session in `createServerSupabaseClient` could fail differently inside an API route than inside a server component. Worth a quick verify but the helper is already used widely.
  - 403 in the accept route changes the surface for a legitimate "user is a contractor in a totally unrelated org viewing a quote a friend sent them" — but the guard is `eq(org_id, quote.org_id)`, so it only fires when the user is a member of THIS quote's org. Other-org membership is fine.

**Pre-launch viability**
- Yes. Half-day to one full day. Comfortably fits before Build 10 lands.

---

## Option D — Delete the preview link entirely

**What changes**
- `app/app/leads/[id]/page.tsx:423-425`: delete the three-line `<Link>`. Done.

**Implementation complexity**
- 1 LOC. 5 minutes including grep for any other reference (spoiler: there is none — only the one site).

**Contractor UX**
- Loses the convenience preview. Contractor who wants to see what the customer sees can:
  - Copy the message from the post-send Copy buttons (`QuoteComposer.tsx:560-578`) and click the link from there.
  - Open the link from a sent email/SMS to the customer in a separate browser session.
  - Right-click and copy the URL from the link they used to be able to click. (Wait, can't — link is gone.)
- The contractor app/lead detail page already shows status, sent_via, and price. The customer-rendering preview is genuinely lost.

**Security posture**
- **Does not close the hole.** The publicId is still in:
  - The "Copy Link" button output in QuoteComposer's post-send state.
  - The outbound SMS body (`previewMessage` template).
  - The customer's email body.
  - DB.
- Anyone with the publicId can still POST `/accept`. Removing the link is removing a discoverability path, not closing the auth boundary.
- The contractor specifically can still self-accept: they sent themselves the link; they have it in their own copy buffer.

**Regression risk**
- Zero. Pure removal. Nothing else references this link.

**Pre-launch viability**
- Yes. Trivial. Could be in the next commit.

---

## Comparison table

| | A (UI hide) | B (UI hide + status overlay) | C (UI + server guard) | D (delete link) |
|---|---|---|---|---|
| LOC | ~25 | ~120 | ~60 | 1 |
| Files touched | 2 | 3–4 | 3 | 1 |
| Time-to-ship | 2–3h | 1–2d | 4–6h | 5min |
| Closes UI hole | ✓ | ✓ | ✓ | ✓ (by removing the discovery path) |
| Closes endpoint hole | ✗ | ✗ | ✓ | ✗ |
| Contractor still has preview | ✓ | ✓ (richer) | ✓ | ✗ |
| Build 10 compatible | ✓ | tight | ✓ | ✓ |
| Regression risk | low | medium | low–medium | none |

---

## Recommendation: **Option C**

**One-line rationale:** Only C closes the actual auth hole; A/B leave the endpoint trusting URL-only forever, and D removes a useful affordance without fixing the bug it's a symptom of.

**Justification:**

The bug is **not** "the preview link exposes a footgun." The bug is "the accept endpoint has no auth check." The link is the most visible attack path, but anyone with a publicId — leaked from an SMS log, a forwarded email, a screen share — can hit `/accept` and flip the row. **D doesn't fix the bug; it hides the entry point**. **A and B fix the entry point but leave the endpoint open.** Only **C** addresses the underlying boundary.

The cost premium for C over A is small — the server guard is ~15 LOC of well-trodden Supabase auth code (the same shape as `requireMemberForApi`). The marginal time difference between "ship A and feel uneasy" and "ship C and be done" is a couple of hours. Pre-launch, with App Review around the corner, you want the audit answer to be "no, contractors cannot accept their own estimates," not "no UI path, but yes if they `fetch()` from the console."

Option B is over-investment. The contractor already has full status visibility on their own lead detail page (mobile via `QuoteStatusBadge`, web via the inline `(STATUS)` text). Adding a duplicate status visualization to the public quote page solves a problem the contractor doesn't have, while ignoring the problem they do have (the endpoint).

Option D is tempting for speed but is a backwards step ergonomically — contractors legitimately want to QA the customer rendering before sending, especially for new templates or first-time use. Removing the link without replacing the affordance loses real workflow value.

**Suggested commit shape for C:**

1. **Server guard first** (the load-bearing change). Add session-aware deny in `app/api/public/quote/[publicId]/accept/route.ts`. Test with curl/console-fetch as logged-in contractor → 403, anonymous → success. This alone is a real fix and could ship as a single commit.
2. **UI follow-up** in a second commit: `viewerIsContractor` prop, hide the button, add the preview banner. This is polish on top of the now-secure endpoint.

Splitting it this way means even if (1) ships and (2) gets stuck in review, the security hole is already closed.

**Optional follow-up (not blocking):** add `accepted_by_user_id` to `quotes` and populate it when the accept request carries a session. Gives audit visibility for the "logged-out contractor self-accepting" residual case without trying to engineer it away.

---

## Specifically answering the prompt's sub-questions

> Could the mobile status badge pattern be lifted into the web public quote page in contractor preview mode?

Yes, technically (`QuoteStatusBadge.tsx` is a clean 40-line component), but **don't**. The contractor already has status visibility everywhere they need it. Lifting this onto the customer-facing page is feature creep that doesn't address the bug.

> What would it take to add a `viewerIsContractor` prop to `<PublicQuoteCard>`?

Trivial. Add to `QuoteData`/props type, branch the bottom 30-line section. ~10 LOC inside the component.

> What's the cheapest way to add a session-aware guard to the accept endpoint?

```ts
// At top of POST handler, before existing publicId lookup:
const supabase = await createServerSupabaseClient();
const { data: { user } } = await supabase.auth.getUser();
// ...existing quote lookup...
if (user) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", quote.org_id)
    .maybeSingle();
  if (membership) {
    return NextResponse.json(
      { error: "Cannot accept your own estimate." },
      { status: 403 }
    );
  }
}
```

~12 LOC. Uses helpers that already exist. Same query shape as `lib/auth/requireRole.ts`.

> Downside to Option D (delete the link)?

Two: (1) contractors lose a real QA affordance with no replacement, and (2) it's security theatre — the bug isn't the link, it's the endpoint, and D leaves the endpoint untouched. Don't ship D alone. If you're going to delete the link, do it in addition to C, not instead of.
