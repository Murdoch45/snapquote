# Diagnostic — "Preview customer estimate page" link + contractor self-accept

**Date:** 2026-05-05
**Repo HEAD:** `60cc2c5` (working dir clean except docs/*.md)
**Mode:** Read-only diagnostic. No code, DB, or config modified.

---

## Task 1 — Where the link lives

**File:** `app/app/leads/[id]/page.tsx`
**Lines:** 423–425

```tsx
<Link href={`/q/${existingQuote.public_id}`} target="_blank">
  Preview customer estimate page
</Link>
```

**Href:** `/q/{public_id}` — the same URL the customer receives by email/SMS. Opens in a new tab (`target="_blank"`). No query string, no `?preview=1` flag, no className.

**Conditional that gates it:** the link sits inside a `<div>` rendered when `isSentQuote` is true. That branch starts at line 412:

```tsx
{isSentQuote ? (
  <div className="space-y-2 text-sm">
    <p>Estimate already sent for this lead.</p>
    <p>Price: {quoteEstimateDisplay ?? toCurrency(Number(existingQuote.price))} ({existingQuote.status})</p>
    {Array.isArray(existingQuote.sent_via) && (...).length > 0 ? (
      <p>Sent via {formatSentVia(...)}.</p>
    ) : null}
    <Link href={`/q/${existingQuote.public_id}`} target="_blank">
      Preview customer estimate page
    </Link>
  </div>
) : isLocked ? (...) : canComposeQuote ? (...) : null}
```

`isSentQuote` is defined on line 161:

```ts
const isSentQuote = existingQuote && !isDraftQuote && !isExpiredQuote;
// where:
//   isDraftQuote   = existingQuoteStatus === "DRAFT"      (line 154)
//   isExpiredQuote = existingQuoteStatus === "EXPIRED"    (line 159)
```

So the link renders for any quote whose status is **not** DRAFT and **not** EXPIRED — i.e. SENT, VIEWED, ACCEPTED, DECLINED. That's the entire conditional. There is no plan tier check, no role check, no org allowlist, no feature flag, no env-var gate.

**Important:** the "Estimate already sent for this lead." text the user describes on the personal page is part of the **same JSX block** as the Preview link (lines 414 and 423 — siblings inside one `<div>`). They render together or not at all. There is no code path where "Estimate already sent" appears without the Preview link directly below it.

The "Copy Link" / "Copy Message" buttons the user describes on personal are not in this block. They live in `components/QuoteComposer.tsx:560–578`, inside the composer's post-send transient state (`sent === true`). QuoteComposer only mounts when `canComposeQuote = !existingQuote || isDraftQuote || isExpiredQuote`. So those buttons and the `isSentQuote` branch are mutually exclusive on a server-rendered page load — they cannot coexist on a single full-page render.

---

## Task 2 — Why demo sees the link and personal "doesn't"

Based on the code as it exists at HEAD `60cc2c5`, **there is no codepath that would render this link in one org and not the other**. The link is purely status-gated. Both orgs hit the same Vercel deploy with the same `app/app/leads/[id]/page.tsx`.

Possible reconciliations of the user's observation:

1. **The two observations are different page states, not the same state.** Most likely:
   - Personal screenshot: contractor had **just clicked Send** in the same session — the page was server-rendered with `canComposeQuote=true` (DRAFT or no quote), the QuoteComposer mounted, the contractor sent, the composer flipped its local `sent` state, and the post-send buttons appeared. The "Estimate already sent" banner did **not** render here — the user may be misremembering which copy was on the page.
   - Demo screenshot: page was loaded fresh with quote already in SENT/ACCEPTED state — `isSentQuote=true` branch rendered, including the Preview link.
   The two screenshots are of the same code in two different moments of the same workflow, not of two different code branches.

2. **Personal quote status is DRAFT or EXPIRED**, so `isSentQuote=false` and the entire branch (Preview link **and** the "Estimate already sent" text) is suppressed. This contradicts the user's statement that personal shows "Estimate already sent for this lead.", so this would only fit if the user was looking at the wrong page or misreading state.

3. **CSS / styling making the link invisible-but-present.** The `<Link>` has no `className`. The default global anchor style is `app/globals.css:78`:
   ```css
   a { @apply text-primary transition-colors hover:text-primary/80; }
   ```
   That's blue text — visible in both light and dark mode. No mechanism here to hide it on personal but not demo.

**To distinguish (1) from (2)/(3), inspect the deployed HTML on personal directly:** open the browser devtools while looking at the personal lead detail page that supposedly shows "Estimate already sent" + Copy buttons, and check whether `<a href="/q/...">Preview customer estimate page</a>` is in the DOM (just visually missed) or genuinely absent (which would mean the JSX block isn't rendering, which would mean the "Estimate already sent" text the user described isn't actually on screen and the user is conflating page states). I cannot verify the deployed DOM from this read-only static analysis.

### Git history on this conditional

`grep --pickaxe "Preview customer estimate"` against all branches returns one commit:

| Commit | Date | Author | Notes |
|---|---|---|---|
| `998e3fc` | 2026-03-24 | Murdoch | "checkpoint before landing page redesign" — added the Link + the surrounding `isSentQuote` block in its current form. |

The conditional has not been changed since. No commit has added an org/plan/flag-based gate to it.

### Cross-check for org-specific code (Task 4)

Grep across the entire repo:

- **`bce3a561-455c-468e-9408-497803811800`** — 1 hit, in `docs/audit-2-app-store-readiness-2026-05-04.md`. **Zero hits in code.**
- **`demo@snapquote.us`** — code hits in `lib/demo/shared.ts:19` (constant), `lib/demo/server.ts` (landing page demo data), `components/landing/ProductDemo.tsx:756` (landing fallback), `scripts/seedDemo.ts` (seeder). All are landing-page / demo-seed plumbing — none touch the lead detail page or quote rendering.
- **`DEMO_ORG_ID` env var** — referenced in:
  - `lib/env.ts:12` — declared required.
  - `lib/auth/requireRole.ts:33,104,148` — `requireOwnerForApi` / `requireMemberForApi` reject API writes when `orgId === DEMO_ORG_ID` (returns 403 "Demo org is read-only.").
  - `app/app/layout.tsx:58` — renders an amber "Demo workspace: read-only" banner when `auth.orgId === DEMO_ORG_ID`.
  - `lib/demo/server.ts:315`, `scripts/seedDemo.ts:573` — seeder/demo plumbing.

None of this gates the Preview link. The `requireRole` guard would actually make the demo org **less** permissive (writes blocked), not more. The layout banner is the only org-conditional rendering on the contractor app shell.

---

## Task 3 — Contractor self-accept

**Verdict: this is a real auth-boundary bug, not intentional preview-mode behavior.**

### Public quote page — `app/(public)/q/[publicId]/page.tsx`

- Server component. Uses `createAdminClient()` (service-role) and looks up the quote by `public_id` only.
- No auth check: anonymous request loads the same data as the contractor's own request.
- Renders `<PublicQuoteCard>` with the quote data. There is **no `previewMode` prop**, no `isContractor` prop, no query-string detection — the contractor's `/q/{publicId}` view is byte-identical to the customer's.

### `<PublicQuoteCard>` — `components/PublicQuoteCard.tsx`

- Has an `Accept` button that calls `POST /api/public/quote/{publicId}/accept` (line 88).
- No conditional disable on the Accept button beyond the status itself (DRAFT/EXPIRED/already-ACCEPTED). For a SENT/VIEWED quote, the button is enabled regardless of who is viewing.

### Accept endpoint — `app/api/public/quote/[publicId]/accept/route.ts`

- `POST` handler with `runtime = "nodejs"`.
- **No auth check at all.** No `requireMemberForApi`, no Supabase session lookup, no header validation, no CSRF token. Pure public endpoint keyed only by the `publicId` URL segment (line 19).
- Looks up the quote by `public_id`, validates status is not ACCEPTED/EXPIRED/DRAFT, then unconditionally:
  - Updates `quotes.status = 'ACCEPTED'`, sets `accepted_at` (line 63).
  - Updates `leads.status = 'ACCEPTED'` (line 83).
  - Inserts `quote_events` ACCEPTED row (line 91).
  - Sends contractor SMS / push / email notifications.

**There is no check that the requester is not the org's own user.** The contractor following the Preview link from the lead detail page lands on this endpoint with the same trust boundary as a customer email recipient.

### Why this is a real bug, not preview-mode

- The link is named "Preview customer estimate page" and `target="_blank"` — semantically a preview affordance.
- But the destination has no preview mode. There's no `?preview=1` param, no auth-aware branch, no disabled state, no banner warning the contractor "this is what your customer sees, do not click Accept."
- The contractor's session cookie is irrelevant because the public route never reads it. Conversely the contractor is not blocked from the route because it's deliberately public for unauthenticated customers.
- Net effect: the same UI a customer sees is shown to the contractor with a fully functional Accept button that flips real DB state and triggers real outbound notifications (including an "Estimate accepted" SMS to the contractor's own phone, since `notifyContractor` reads `notification_accept_sms` from contractor_profile).

This appears to be an inadvertent oversight — the preview link was added in `998e3fc` to give contractors a way to QA the customer rendering, but no preview-vs-real distinction was implemented on the destination page or the accept endpoint.

---

## Recommendations

### 1. Add a contractor-aware "preview mode" to the public quote page (cleanest fix)

When the request to `/q/{publicId}` carries an authenticated session whose `orgId` matches `quote.org_id`, render the page in preview mode:
- Show a banner: "Preview mode — this is what your customer sees. Customer actions are disabled."
- Pass `previewMode=true` to `<PublicQuoteCard>` and disable the Accept button (or render it as a static label).

Additionally, harden the accept endpoint to reject the org's own users:
- Best-effort read of the Supabase session in `route.ts`. If the user is a member of `quote.org_id`, return 403 ("Cannot accept your own estimate.").
- This is defense-in-depth; the UI disable above is the primary fix.

### 2. Or: change the link to bypass the customer page entirely

Replace the `/q/{publicId}` href with a contractor-only preview route (e.g. `/app/leads/{id}/preview` or a modal) that reuses `<PublicQuoteCard>` in `previewMode` without ever exposing a working accept button. This keeps the customer route stricter (still anonymous-OK for customer email links) and avoids relying on an auth check inside a deliberately-public endpoint.

### 3. Audit the unauthenticated `/api/public/quote/{publicId}/*` endpoints

`/accept` and `/viewed` (and any others under `app/api/public/quote/[publicId]/`) are keyed only on `publicId`. The publicId is generated as `randomBytes(...).toString("base64url")` (sufficient entropy), but the lack of any rate-limit / replay guard means anyone with the URL — including the contractor's browser history, anyone shoulder-surfing the contractor screen, anyone with access to forwarded customer email, anyone the customer shared the link with — can flip status. Consider:
- A nonce or single-use token bound to the customer's email click vs. a separate contractor preview path.
- At minimum, log `accepted_by_user_id` (null for true anonymous, populated when an authenticated session is present) so a contractor self-accept is visible in the audit trail rather than indistinguishable from a real customer accept.

---

## Summary table

| Question | Answer |
|---|---|
| Where is the link rendered? | [app/app/leads/[id]/page.tsx:423](app/app/leads/%5Bid%5D/page.tsx:423) |
| What gates it? | `isSentQuote = existingQuote && status !== 'DRAFT' && status !== 'EXPIRED'`. Nothing else. |
| Plan / org / flag dependency? | None. Verified by grep — no `DEMO_ORG_ID` / `bce3a561-...` reference touches this codepath. |
| Why does demo show it and personal doesn't? | Per code, there is no path where one renders and the other doesn't with identical quote status. Most likely the two observations are of different page states (demo loaded fresh on a SENT/ACCEPTED quote vs. personal observed mid-send-flow when QuoteComposer is still mounted with post-send Copy buttons). Needs DOM inspection to confirm. |
| Public quote page auth? | None. Anonymous, `createAdminClient` lookup by `public_id`. |
| Accept endpoint auth? | None. `POST /api/public/quote/[publicId]/accept` has no session check whatsoever. |
| Self-accept intended? | **No.** The link is labeled "Preview" but the destination has no preview mode and no contractor-self gate. Real bug. |
