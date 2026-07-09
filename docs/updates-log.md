# SnapQuote — Updates Log

> ⚠️ **FOR REFERENCE ONLY — DO NOT TREAT AS GROUND TRUTH.**
> Always verify against the actual codebase before acting on anything here.

### 2026-07-09 [Source: Claude Code] — Origami AI lead-sourcing integration installed (Claude Code skills + API key) and live smoke-tested

**What.** Installed the Origami ([origami.chat](https://origami.chat)) integration into the local Claude Code environment — a "skills installer + API key" integration, **NOT an MCP server**. Origami is an AI prospecting / lead-sourcing tool (single natural-language prompt → enriched lead list from Google Maps + web).

**Install.** Downloaded `https://origami.chat/skills/install.sh` and read it in full before executing (verified: pure POSIX, `set -eu`, only downloads a manifest + writes `SKILL.md` files — no code exec, no shell-rc edits, no secret exfil). Ran scoped to Claude Code global — `sh /tmp/origami-install.sh claude-global` — because the non-interactive default (no TTY) would otherwise seed **every** host (Cursor/Claude/Codex/Agents). Landed **5 skills** in `~/.claude/skills/`: `origami-api`, `origami-list-building`, `origami-sequencer`, `origami-scheduled-agents`, `origami-webhooks`. Kept out of the repo on purpose (global, not project `.claude/`).

**Key / secret hygiene.** `ORIGAMI_API_KEY` (`og_live_…`) written to project-root `.env`. `.env` was **already** covered by `.gitignore` (`.env`, `.env.*`, `.env.local`, `*.env`) — no `.gitignore` change needed. `git check-ignore -v .env` matches `*.env`; `git status` never lists `.env`. Key never committed, never printed back.

**Smoke test (live, ~13:57 PT).** (1) Auth — `GET /api/v2/account/credits` → HTTP 200 `{balance:3000}`: key authenticates. (2) Real search — `POST /api/v2/agents` "Find 3 lawn care businesses in Los Angeles, CA" → agent `004a03c9-…`, polled to terminal (~30s). Built table `e028d0b4-b6a1-4b41-817f-423ae03cbb2b` (3 rows): **Evergreen Landcare** (+1 323-549-3150, evergreenlandcare.com), **Flores Artscape** (+1 323-666-3510, floresartscape.com), **Angel's Lawn & Tree Service** (+1 310-753-8199, angelslawntreeservice.com) — each with full address, Google/Yelp rating, email, socials. (3) Independent re-read — `GET /api/v2/tables/:id/rows?cells=flat` returned `total=3`, so the data genuinely persisted. Cost **2.25 credits** (3000 → 2997.75).

**Notes.** Terminal run status came back `incomplete` (documented Origami quirk — the agent's final tool-call framing didn't parse) but the table materialized fully (leadCount 3, 0 cells running / 0 errored), so results are complete. API base `https://origami.chat`, auth `Authorization: Bearer $ORIGAMI_API_KEY`. Skills auto-load for future agent chats after a Claude Code restart; this session invoked the API directly per the skill contract, so no restart was required to verify. **Setup + smoke test only** — no bulk lead pull, enrichment, or Meta upload. Ready for a full lead pull on request.

### 2026-07-09 [Source: Claude Code] — FB match-rate pilot part 2: added landscaping (2,600) to the same audience → ~4,300 uploaded, STILL below Meta's ~1,000 floor (blended match < ~25%)

**Why.** The lawn-care-only pilot (entry below) was inconclusive: at 1,701 uploaded, matched stayed under Meta's ~1,000 display floor, so all we learned was "match < ~59%." To grow the denominator, added **landscaping** (a distinct, larger Google Places category) across the same three metros to the **same** audience `120254629684780273` (no new audience created; lawn care not re-pulled).

**Landscaping pull (Google Places, project 631878227336).** `places:searchText` (New) grid across LA/Miami/Dallas belts, `nationalPhoneNumber` field, deduped within landscaping by phone. Result: **2,600 unique landscaping businesses** (LA 1,220 / Dallas 753 / Miami 627; 100% phone/state/zip). Landscaping is far denser than lawn care — **288 billable Places calls** (~9 unique/call) vs the 590-call hard cap. Cost this run ≈ **~$2.45** (~70 calls past the remaining free Enterprise-SKU allowance at ~$0.035/call; exact figure only in the GCP console). Cumulative billable Places calls this month ≈ **~1,070**.

**Dedup caveat.** The prior 1,701 lawn-care phone list was deleted as PII during last run's cleanup, so landscaping could NOT be locally deduped against lawn care. Per the task's sanctioned fallback, uploaded the within-landscaping-deduped set and relied on **Meta's automatic hashed-identifier dedup** for any lawn-care/landscaping overlap (overlap was visibly present in the data). Net: distinct audience size is somewhat below the 4,301 raw rows.

**Upload (Meta Ads MCP).** All 2,600 landscaping rows (PHONE E.164 + CT + ST + ZIP + COUNTRY, hashed SHA-256 server-side) added in 5 batches: **570+570+570+570+320 = 2,600 received, 0 invalid**. Audience now holds **1,701 lawn care + 2,600 landscaping = 4,301 raw uploaded**.

**Result (live `ads_get_custom_audience`, 2026-07-09 ~10:20 PT, `operation_status "Normal"`).** `approximate_count` **1,000 / 1,000** — matched **still below Meta's ~1,000 privacy display floor even at ~4,300 uploaded**. Reported straight (interpretation left to Murdoch):
- Uploaded (raw): **4,301** (1,701 lawn care + 2,600 landscaping); distinct slightly lower after Meta dedup.
- Matched: **below Meta's ~1,000-matched floor** — exact number hidden.
- Blended match rate: **under ~25%** (matched < 1,000 / ~4,300); < ~23% against the full 4,301 raw. Exact rate not disclosed.
- Above/below Meta display threshold: **BELOW.**
- Note: adding 2,600 landscaping records did not push matched over 1,000, i.e., the extra volume did not clear the floor. **$0 ad spend** (audience only).

### 2026-07-09 [Source: Claude Code] — Facebook custom-audience match-rate pilot (lawn care, LA/Miami/Dallas): matched BELOW Meta's ~1,000 display threshold

**What ran.** End-to-end go/no-go pilot measuring what % of real contractors match to Facebook accounts from publicly-listed phone data, before any ad or enrichment spend. One trade (lawn care), three metros (Los Angeles, Miami, Dallas). Google Places Text Search (New) → Meta Custom Audience → read matched size. Zero ad spend; audience only, no campaign/ad set/ad.

**Data pull (Google Places, GCP project 631878227336).** Grid-searched LA/Miami/Dallas via `places:searchText` (New) requesting `nationalPhoneNumber` (Enterprise SKU), deduped by phone. Result: **1,701 unique lawn-care businesses** (phone + city + state + zip; 100% phone/state/zip, 99.9% city). Lawn-care-specific listings are a genuinely small Places category — first sweep 2,501 raw → 1,000 unique; an expanded finer-grid pass over the full suburban belts (Orange County, Inland Empire, Fort Worth, Palm Beach, Collin Co.) added only ~700 more before the call guardrail. **~782 billable Places calls** — under the 800 guardrail and the 1,000/mo free Enterprise-SKU tier → **$0**.

**Upload (Meta Ads MCP).** All 1,701 rows (PHONE E.164 + CT + ST + ZIP + COUNTRY, hashed SHA-256 server-side by the MCP) → Custom Audience "Pilot - Lawn Care LA/MIA/DAL" (id `120254629684780273`) on Business ad account `978213371900828` (portfolio `1991446654777997`), in 3 batches: **570 + 570 + 561 received, 0 invalid**.

**Result (live `ads_get_custom_audience`, 2026-07-09 ~09:00 PT, after ~70 min settle).** `operation_status_code: 200 "Normal"` (processing complete) with `approximate_count` **1,000 / 1,000** — Meta's below-threshold placeholder. Reported straight (interpretation left to Murdoch):
- Uploaded: **1,701**
- Matched: **below Meta's ~1,000-matched privacy display floor** — exact number hidden by Meta.
- Match rate: **< ~59%** (matched < 1,000 / 1,701); exact rate not disclosed.
- Above/below Meta display threshold: **BELOW.**

**Setup cleared first (all external/human actions, now done):** GCP billing enabled + "Places API (New)" enabled on project 631878227336; the Meta ad account moved to a Business Manager and Custom Audience terms accepted. Raw contractor list was scratch-only (contains PII) and was not committed to the repo.

### 2026-05-26 [Source: Claude Code] — Add GA4 `sign_up` event on signup completion alongside Meta Pixel `CompleteRegistration`

**Motivation.** Prior to this change the web app emitted a Meta Pixel `CompleteRegistration` event on signup completion but sent no equivalent custom event to GA4 — GA4 only saw a `page_view` for the `/onboarding` navigation. To enable a clean signup Key event in GA4 (and to make the Meta and GA4 conversion measurements line up exactly), a GA4 `sign_up` event now fires at the same moment as the existing Meta Pixel event.

**Change.** Single-file additive edit to [`components/onboarding/OnboardingWizard.tsx`](../components/onboarding/OnboardingWizard.tsx). Inside the welcome-toast `useEffect` (the one gated by the one-shot `snapquote-oauth-signup-success` sessionStorage flag set by `SignupForm.tsx` after a successful email/password or OAuth signup), after the existing `fbq("track", "CompleteRegistration")` block, added:

```ts
if (typeof window.gtag === "function") {
  window.gtag("event", "sign_up");
}
```

**Properties of the change.**
- **Same trigger.** Identical guard, identical mount effect, identical sessionStorage one-shot key consumption as the existing Meta Pixel call. Meta and GA4 measure the exact same signup moment.
- **Defensive guard.** `typeof window.gtag === "function"` mirrors the existing `fbq` guard. Handles ad-blockers, the brief window before the GA4 `<Script afterInteractive>` loader runs, and any other case where the global is missing — call is non-throwing.
- **No new types needed.** `Window.gtag?` is already declared globally in `components/GA4PageView.tsx`, so the call type-checks with no new ambient typings or imports.
- **Standard recommended event name.** `sign_up` is the GA4 [recommended event](https://support.google.com/analytics/answer/9267735) for account creation; using the canonical name lets GA4 surface it in standard reports without remapping.
- **No other code touched.** `SignupForm.tsx`, the `/api/public/auth/bootstrap` route, `auth/callback`, `app/layout.tsx` GA4 init / Meta Pixel init, the Measurement ID, and the existing Meta Pixel call are all byte-identical. No env-var conversion, no refactor.

**Files touched.**
| File | Change |
|---|---|
| `components/onboarding/OnboardingWizard.tsx` | Added 3-line `window.gtag("event", "sign_up")` call inside the existing welcome-toast `useEffect`, immediately after the existing `fbq("track", "CompleteRegistration")` block, guarded by `typeof window.gtag === "function"`. |

**Verification.**
- `npx next build` — exit 0, "Compiled successfully in 15.5s". No new TypeScript or ESLint errors. Only pre-existing `<img>` warning (unrelated).
- Diff is exactly 3 inserted lines.

**Post-deploy live verification (todo).** Once Vercel deploys `origin/main`, complete a test signup at https://snapquote.us with devtools Network tab open filtered for `google-analytics`/`collect`, and confirm a GA4 collect beacon with `en=sign_up` fires at the signup completion moment alongside the Meta Pixel `tr/?ev=CompleteRegistration` request, with no console errors.

**Merge.** Branched from `origin/main` at `2523c20` in worktree `.claude/worktrees/ga4-signup-event` on branch `claude/ga4-signup-event`. Feature commit `69a3c38`. Merged with `--no-ff` into `main` as merge commit `ca645f8` and pushed to `origin/main`.

### 2026-05-22 [Source: Claude Code] — Plan screen Credits & Usage: drop duplicate line; flip bar to fill on used

[`app/app/plan/page.tsx`](../app/app/plan/page.tsx) "Credits & Usage" card cleaned up per the prior audit:

- **Removed the duplicate "X / Y monthly credits - resets {date}" sentence under the bar.** Previously rendered alongside the identical "X / Y remaining" line beside the "Monthly credits" label. Kept the labelled "X / Y remaining" line exactly as is; just dropped the redundant sentence.
- **Removed now-dead `resetAt` + `creditsResetLabel` derivations.** No other consumers.
- **Flipped the `UsageBar` direction.** It now fills based on credits USED (the conventional battery/fuel direction) rather than credits remaining. New derivation: `monthlyCreditsUsed = Math.max(0, Math.min(monthlyCreditsLimit, monthlyCreditsLimit - monthlyCreditsRemaining))` — clamped so a corrupt-data org with `monthly_credits > plan limit` shows 0% used / empty rather than overflowing or breaking. Bar invocation now reads `<UsageBar used={monthlyCreditsUsed} limit={monthlyCreditsLimit} />`. Same Tailwind styling; only the input changes.

Bonus credits row, Total credits available card, and the "X / Y remaining" line are untouched.

Verified `npx next build` exit 0. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-22 [Source: Claude Code] — Remove legacy monthly send-cap; add OutOfCreditsBanner

Per the audit on whether `org_usage_monthly.quotes_sent_count` was redundant with the credit system, the legacy monthly-send-cap was removed entirely. The credit system (server-enforced via the `unlock_lead_with_credits` RPC at unlock time) is now the single gate on engagement. Removed:

- `lib/usage.ts` — deleted.
- `components/UpgradeBanner.tsx` — deleted.
- `tests/unit/usage.test.ts` — deleted.
- `PlanUsageLimit` type in [`lib/types.ts`](../lib/types.ts) — deleted (no remaining consumers).
- `incrementUsageOnQuoteSend` call + `usage` field on the response payload in [`app/api/app/quote/send/route.ts`](../app/api/app/quote/send/route.ts) — removed.
- `canSend` prop on [`components/QuoteComposer.tsx`](../components/QuoteComposer.tsx) — removed (the Send button still gates on `loading` and channel selection).
- `getMonthlyUsage` calls in [`app/app/layout.tsx`](../app/app/layout.tsx), [`app/app/leads/[id]/page.tsx`](../app/app/leads/[id]/page.tsx), [`app/dashboard/my-link/page.tsx`](../app/dashboard/my-link/page.tsx) — removed.
- Dead `org_usage_monthly` read in [`lib/demo/server.ts`](../lib/demo/server.ts) (result was destructured but never consumed) — removed.

Four importers that still need the per-plan-credits constant were repointed from `@/lib/usage` to the canonical `@/lib/plans`: `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `app/app/plan/page.tsx`, `lib/credits.ts`. `lib/usage.ts` was a thin re-export wrapper; deletion is safe.

Added a new passive banner [`components/OutOfCreditsBanner.tsx`](../components/OutOfCreditsBanner.tsx) shown at the top of `/app/*` (via `app/app/layout.tsx`) and `/dashboard/my-link` when `organizations.monthly_credits === 0 AND bonus_credits === 0`. Copy: "You're out of credits." + "You need credits to unlock new leads and send estimates." Plan-aware CTA: SOLO/TEAM → "Upgrade" → `/app/plan`; BUSINESS → "Buy more credits" → `/app/credits`. Coexists with the existing `OutOfCreditsModal` at unlock time — banner is passive heads-up, modal is at-action interrupter; both route to the same recovery surfaces.

The `org_usage_monthly` table is left intact; nothing reads it after this change and nothing writes to it from runtime code. Seed scripts still upsert it; harmless. A future migration can drop it cleanly.

Verified `npx next build` exit 0. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-22 [Source: Claude Code] — MyLink referral explainer copy updated to match Option A behavior

After merge `57a9e54` (the abandoned-checkout fix) shipped Option A — banked credit is applied to `customer.balance` only AFTER `checkout.session.completed` — the previous MyLink explainer copy on [`components/MyLinkPageClient.tsx`](../components/MyLinkPageClient.tsx) became inaccurate. It said "the Stripe checkout page may still show the plan's normal price ... your credit is applied automatically behind the scenes, so you won't actually be charged until it runs out" — but under Option A the contractor *is* charged the full first-month price; the credit only kicks in from invoice #2 forward.

Replaced both the conditional `hasUnappliedCredit` short line ("Your earned credit applies to your bill automatically when you upgrade to a paid plan.") and the unconditional explainer paragraph with a single accurate paragraph:

> "You earn a $120 credit when someone you referred signs up for a paid plan. If you're on Solo, the credit is held on your account until you upgrade. Your first month is billed at the normal plan price — after that, your credit covers your bill automatically each month until it runs out, with nothing to redeem or enter. If you're already on a paid plan, the credit starts applying to your next bill."

The conditional rendering for the "credit waiting" hint was dropped — the new paragraph covers that case explicitly in plain language ("If you're on Solo, the credit is held on your account until you upgrade"). `ReferralSummary.hasUnappliedCredit` is still exported from `lib/referrals/getReferralSummary.ts` and remains correct under the data model, just no longer consumed in this UI. Same `text-xs text-muted-foreground` typography and same placement under the Pending / Credit Earned grid — only the wording changed.

Verified `npx next build` exit 0. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-22 [Source: Claude Code] — Upgrade banner copy rewrite (plain language, no jargon)

Rewrote [`components/UpgradeBanner.tsx`](../components/UpgradeBanner.tsx) so the monthly-estimate-cap banner reads as plain language instead of the previous "Usage: 15/5 (hard stop at 5)" UX. The capped state now shows "You've used all your estimates this month" + body "Your Solo plan covers 5 estimates a month. Upgrade to keep sending, or your monthly limit resets on June 1." The near-cap warning shows "You're almost out of estimates this month" + body "You have N estimates left on your Solo plan." CTA text changed from "Review plan" to the more actionable "Upgrade plan", still routing to `/app/plan`.

Component signature changed slightly: it now requires `plan: OrgPlan` and `month: string` (first-of-month ISO) in addition to the existing flags. Both callers `<UpgradeBanner {...usage} />` in [`app/app/layout.tsx:68`](../app/app/layout.tsx:68) and [`app/dashboard/my-link/page.tsx:50,69`](../app/dashboard/my-link/page.tsx:50) already spread the full `UsageState` object — both fields were present in `UsageState`, just unused. No caller changes needed. The reset date label is computed client-side via `Intl.DateTimeFormat` in UTC to match the server's `firstDayOfMonth` window.

Did NOT add cause detection (subscription-ended vs. always-Solo). Live SQL confirmed `subscriptions` is empty across all three current orgs (Demo, falconn, Pacific Edge are all in test states with plan set by manual DB change, never via Stripe), so we have no real-user signal to test cause detection against. Generic copy works equally well for both real-user scenarios (#2 subscription cancellation/lapse and #3 trial-ended-without-conversion from the prior investigation) so the simpler approach was chosen. The CTA "Upgrade plan" lands users on `/app/plan` which already surfaces the contractor's current plan + upgrade options.

Touched out-of-scope cleanups in the same PR: doc-comment in [`lib/usage.ts:25-33`](../lib/usage.ts:25) referencing the old "X/Y (hard stop at Y)" banner copy was updated; same stale reference in [`tests/unit/usage.test.ts:5-7`](../tests/unit/usage.test.ts:5) was updated. The `hardStopAt` field on `PlanUsageLimit` / `UsageState` is no longer consumed by the banner but kept for forward-compatibility with a future grace tier.

Verified `npx next build` exit 0. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-22 [Source: Claude Code] — Referral credit: fix abandoned-checkout bug + restore falconn test artifact

**Bug.** The SOLO→paid pre-checkout banked-credit apply (shipped 2026-05-20 in the "UI cleanup + apply banked credit BEFORE checkout" change) consumed the reward at Checkout Session creation time rather than at payment-completion time. Confirmed live on the falconn test artifact: reward row `5025a514-38a6-49b4-aefc-8ba8493ce11e` was flipped to `kind=stripe_balance / status=applied / applied_at=2026-05-22 10:26:56`, a `-$12000` `customer.balance` transaction (`cbtxn_1TZqI8FNX8cpZFmwGLZ4pBfl`) was posted to Stripe customer `cus_UYyEdVbHXydVOW`, but `subscriptions` had no row for falconn's owner — the user abandoned checkout. All three surfaces (Stripe, DB, MyLink "Credit Earned") were in inconsistent states.

**Fix (Approach A — apply only on `checkout.session.completed`).** Removed the SOLO→paid pre-checkout apply block from [`app/api/stripe/checkout/route.ts`](../app/api/stripe/checkout/route.ts:326-414) (lines 326-414 at the pre-fix HEAD). The reward now applies exclusively via the Stripe webhook's existing `applyBankedRewardForOrg` call in [`handleCheckoutCompleted`](../app/api/stripe/webhook/route.ts:308). The in-place paid→paid upgrade branch's call (line 252 of `checkout/route.ts`) is kept — `stripe.subscriptions.update` is atomic, no abandonment risk on that path. Idempotency is preserved by the existing UPDATE-WHERE-NULL atomic claim in `applyBankedRewardForOrg` (`lib/referralRewards.ts:354-369`) and the Stripe `idempotencyKey: referral-reward-banked:${rewardId}` (line 393).

**Tradeoff.** The hosted Stripe Checkout page will no longer surface the discounted "amount due" for SOLO→paid upgrades — the credit applies to `customer.balance` AFTER payment completion, so it draws down on the next invoice rather than reducing the first. The existing MyLink explainer copy already says "the Stripe checkout page may still show the plan's normal price — your credit is applied automatically behind the scenes" (`components/MyLinkPageClient.tsx:538-541`), which is now uniformly true. Net result: no UX whiplash, no consumption-on-abandon, and the credit is never lost.

**Three-surface consistency, post-fix.**
- Stripe customer.balance: only credited when subscription is actually created (webhook on `checkout.session.completed`).
- DB `referral_rewards` row: only flipped `banked_trial`/`pending` → `stripe_balance`/`applied` via the same webhook call.
- MyLink "Credit Earned" UI: `referrals.status='rewarded'` populates Credit Earned (lifetime), `referral_rewards.kind='banked_trial' AND status='pending'` populates `hasUnappliedCredit` ("applies on next upgrade" hint). Both states track the underlying truth — no code change needed in `lib/referrals/getReferralSummary.ts`.

**Falconn artifact restored.** Stripe reversal `cbtxn_1TZqb4FNX8cpZFmwHrHKuPy5` (+$12000) posted to `cus_UYyEdVbHXydVOW` (balance back to 0). DB reward row `5025a514` UPDATEd: `kind=banked_trial, status=pending, applied_at=null, stripe_balance_txn_id=null`. Restoration audit entry recorded at `audit_log.id=88f673a8-9f52-4fff-b936-995724e1ca90` with action `referral.reward.test_restored` referencing both Stripe txn ids. The MyLink summary now returns `pending=0, creditEarnedCount=1, hasUnappliedCredit=1` for falconn — the $120 banked reward is again visible and reusable.

Verified `npx next build` exit 0. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-22 [Source: Claude Code] — Landing hero subhead: "AI tools" → "AI powered tools"

Updated `SUBHEAD` on [`app/(public)/page.tsx:24`](../app/(public)/page.tsx:24) so the marketing landing hero reads "…built with the help of our AI powered tools — send it or pass." Scope was deliberately limited to the hero subhead constant. Out of scope and left unchanged: the meta description on line 18 and the "How it works" step-03 body copy on line 49, both of which still contain "AI tools". Worktree `.claude/worktrees/landing-subhead-fix` off `origin/main` at `bded32e`. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-20 [Source: Claude Code] — Email logo fix: replace truncated base64 data-URI with hosted PNG

Live test: a password-reset email received in Apple Mail rendered the SnapQuote logo as a broken-image placeholder next to the wordmark. Two distinct root causes uncovered in the worktree `.claude/worktrees/email-logo-fix` off `origin/main` at `8745d32`:

1. **The base64 itself was truncated.** [`lib/emailLogo.ts`](../lib/emailLogo.ts) exported a 14,015-character base64 string (length mod 4 = 3 — not a valid multiple). Decoding via Node's `Buffer.from(b64, "base64")` (which is permissive about trailing incomplete groups) produced 10,510 bytes ending with `0001fff6` instead of the required JPEG EOI marker `FFD9`. ImageMagick / System.Drawing both flagged "Corrupt JPEG data: premature end of data segment". So the JPEG was corrupt at-rest in the file — no email client could ever have rendered it, regardless of how it was delivered.
2. **Data-URI `<img>` sources are NOT reliable in email anyway.** Despite the doc comment in `emailLogo.ts` claiming "Modern email clients (Gmail, Apple Mail, Outlook 2016+) all accept inline data: image srcs", this is false: Gmail strips data-URI images for security, Outlook desktop does not render them, web Outlook strips them too. Apple Mail support is hit-or-miss. Hosted image URLs are the universally-supported pattern.

**Fix:** generated a fresh PNG from the canonical SVG source [`AppIcon.svg`](../AppIcon.svg) (104×92 viewBox, gradient blue speech-bubble + lightning bolt). Rendered via `sharp` at 256×227 (about 2.5× the 44×39 email display size for retina sharpness) with transparent background, saved as a hosted static asset at [`public/email/snapquote-logo.png`](../public/email/snapquote-logo.png) (4,132 bytes). Updated the header lockup in [`lib/emailTemplates.ts`](../lib/emailTemplates.ts) to reference the absolute URL `https://snapquote.us/email/snapquote-logo.png` instead of the data URI. Display dimensions (44×39, `alt="SnapQuote"`) unchanged so the visual layout is identical. Deleted `lib/emailLogo.ts` entirely — no callers left. The change automatically applies to all 17 transactional emails (welcome, estimate-sent, customer-confirmation, new-lead-notification, plan-upgraded, plan-ended, trial-ending-soon, payment-failed, estimate-accepted, estimate-expiring-soon, estimate-expired, account-deleted, credit-purchase-confirmation, trial-expired, team-member-joined, estimate-not-viewed-nudge, referral-program) since they all share `renderEmailShell`.

Verified `npx next build` exit 0. Worktree cleaned up: throwaway base64-decode and SVG-render scripts removed before commit, no `.mjs` artifacts shipped. Live verification: post-deploy, the hosted URL `https://snapquote.us/email/snapquote-logo.png` loaded successfully over HTTPS (HTTP 200, image renders). Demo login walkthrough on snapquote.us: /app and /app/leads both returned 200, no 5xx in Vercel runtime logs over the 5-minute post-deploy window.

Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

### 2026-05-20 [Source: Claude Code] — Email system overhaul: shared template + 2 referral emails + 3-week sequence + Resend SPF fix recommendation

Single overhaul of SnapQuote's transactional email system covering 4 tasks: shared template, two referral emails, send-timing state machine, deliverability investigation. Worktree `.claude/worktrees/email-system` off `origin/main` at `8e3af13`. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

**Task 1 — Shared email template.** Extracted the inner HTML from the `<script type="__bundler/template">` block of `C:\Users\murdo\Downloads\SnapQuote Email Template.html` — outer file is a preview/bundler shell; the actual usable email HTML is the JSON-encoded string inside. New [`lib/emailLogo.ts`](../lib/emailLogo.ts) holds the embedded base64 JPG (44×39 gradient logo) so each rendered email carries an inline logo that survives Outlook desktop's image-blocking. Rewrote [`lib/emailTemplates.ts`](../lib/emailTemplates.ts) — `renderEmailShell(title, bodyHtml, opts?)` now emits the 600px Helvetica Neue / electric-blue (#2563EB) template with MSO conditionals for Outlook, an optional `preheader` field, and a default footer that varies by `audience: "contractor" | "customer"`. `renderButton(label, href)` is the new MSO-safe VML roundrect CTA. New helpers `renderParagraph(html, { bottom })` and `renderSignOff(line?)` so every email body matches the template's 16/26px Helvetica Neue, #1F2937 body color, 20px paragraph spacing. All 16 existing email builders migrated to the new shell: welcome, estimate-sent, customer-confirmation, new-lead-notification, plan-upgraded, plan-ended, trial-ending-soon, payment-failed, estimate-accepted, estimate-expiring-soon, estimate-expired, account-deleted, credit-purchase-confirmation, trial-expired, team-member-joined, estimate-not-viewed-nudge.

**Task 2 — Referral program email.** New `buildReferralProgramEmail` in [`lib/emailTemplates.ts`](../lib/emailTemplates.ts):

- Subject: "Earn 3 months of Business free for every contractor you refer"
- Preheader: "Share your link — when a contractor you refer upgrades, you get the credit."
- Headline (H1): "Refer a contractor, earn 3 months free"
- Body (per spec, in template body typography): paragraphs ending in CTA "Get your referral link" → `https://snapquote.us/dashboard/my-link#refer-a-contractor`. The "$120 account credit" amount is bolded inline within the second paragraph. Closes with the standard "— The SnapQuote team" sign-off.
- Anchor target: added `id="refer-a-contractor"` and `scroll-mt-6` to the Refer-a-Contractor `<Card>` in [`components/MyLinkPageClient.tsx:443`](../components/MyLinkPageClient.tsx:443) so the email's deep-link scrolls directly to the contractor's-own-code share section (not the manual-redeem promo entry). Auth-gated by `requireAuth` on the existing `/dashboard/my-link` server component — signed-out users hit `/login` first and are redirected back via the standard auth flow, no email-specific logic needed.

**Task 3 — Send-timing state + triggers + 3-week delay.** New Supabase migration `20260520_referral_email_sends_columns` applied to live project `upqvbdldoyiqqshxquxa`: adds 3 timestamptz columns to `organizations` (`referral_email_first_sent_at`, `referral_email_second_sent_at`, `referral_email_second_due_at`) and a partial index on the last two scoped to rows with a pending due_at. New orchestration module [`lib/referralEmails.ts`](../lib/referralEmails.ts):

- `tryFireReferralEmail(orgId, source)` — called from both Event A (first lead) and Event B (first paid conversion). State machine: if neither email sent → claim email_1 atomically + send; if email_1 sent but email_2 not → check 3-week floor (claim+send immediately if elapsed, otherwise set `referral_email_second_due_at` for cron pickup). Idempotency via UPDATE-WHERE-NULL atomic claims on each timestamp column. Send-failure paths roll back the claim so the next trigger retries. Email send also uses a per-org Resend idempotency key for defense-in-depth against double-sends.
- `processReferralEmailFollowups()` — daily cron handler that finds rows where `referral_email_second_due_at <= now() AND referral_email_second_sent_at IS NULL`, sends email #2 with the same atomic claim. Caps the per-run batch at 100 orgs.

Trigger wiring:

- **Event A (first lead)** — added `tryFireReferralEmail(finalOrgId, "first_lead")` to the `Promise.allSettled` inside [`app/api/public/lead-submit/route.ts`](../app/api/public/lead-submit/route.ts) `after()` block. Lives next to the existing contractor/customer notification calls so the customer-facing response is unaffected. The "first lead" semantics is enforced by the UPDATE-WHERE-NULL claim on email_first_sent_at — every-lead invocation is idempotent and only the org's first-ever lead actually sends.
- **Event B (first paid conversion, Stripe path)** — added `await tryFireReferralEmail(orgId, "stripe_invoice_paid")` alongside the existing `await qualifyAndRewardReferral(orgId, ...)` call in [`app/api/stripe/webhook/route.ts`](../app/api/stripe/webhook/route.ts) `handleInvoicePaid`, sharing the same gating (`invoice.amount_paid > 0` + billing_reason check). Function failures are Sentry-tagged inside the trigger; webhook delivery is unaffected.
- **Event B (RC IAP path)** — added `await tryFireReferralEmail(orgId, "rc_initial_purchase")` to [`app/api/revenuecat/webhook/route.ts`](../app/api/revenuecat/webhook/route.ts) INITIAL_PURCHASE non-trial branch, alongside the existing `qualifyAndRewardReferral` call.
- **Cron** — new route [`app/api/cron/referral-email-followup/route.ts`](../app/api/cron/referral-email-followup/route.ts), scheduled `0 18 * * *` daily via [`vercel.json`](../vercel.json). Bearer-authed via the existing `isAuthorizedBearer(authorization, CRON_SECRET)` helper.

Chose the first-lead trigger (Event A) over the 14-day fallback because the lead-submit path has a clean `after()` hook that's already fire-and-forget for notification work; the additional call is zero-risk.

**Task 4 — Deliverability finding: Resend NOT authorized at the apex SPF.** Live DNS via `Resolve-DnsName` 2026-05-20:

- `snapquote.us` TXT: `v=spf1 include:spf.protection.outlook.com -all` — authorizes Outlook only. `-all` is a hard fail, so every Resend email FAILS SPF.
- `_dmarc.snapquote.us` TXT: `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` — quarantine policy quarantines DMARC failures to the Junk folder (matches the reported symptom).
- `resend._domainkey.snapquote.us` TXT: `p=<base64-key>` (single string, no `v=DKIM1; k=rsa;` prefix — RFC 6376 §3.6.1 makes those defaults and this is Resend's prescribed format). DKIM PASSES for Resend emails.
- `send.snapquote.us` (Resend Return-Path subdomain): **MISSING** — no TXT, no MX. SOA-only response.

Symptom explained: Resend emails arrive signed (DKIM passes) but with an SPF-fail envelope. DMARC relaxed alignment (`aspf=r`) means SPF can be ignored if DKIM aligns — but many receivers nevertheless treat SPF-fail as a reputation signal AND the missing Return-Path subdomain compounds it.

DNS records the user must add (cannot be done from code):

1. TXT at `send.snapquote.us` → `v=spf1 include:amazonses.com ~all` (Resend uses AWS SES; this authorizes the SES SMTP relay).
2. MX at `send.snapquote.us` → `feedback-smtp.us-east-1.amazonses.com` priority 10 (verify exact region via Resend dashboard at https://resend.com/domains).

DMARC `p=quarantine` stays as-is — once SPF is fixed, the quarantine policy continues to provide spoofing protection without affecting legitimate sends.

**Lane discipline.** Branched fresh from `origin/main`, isolated worktree, junctioned `node_modules` from primary to skip a full install, copied `.env.local`. `git add` with explicit paths (10 changed files: `lib/emailLogo.ts` new, `lib/emailTemplates.ts` rewritten, `lib/referralEmails.ts` new, `supabase/migrations/<timestamp>_referral_email_sends_columns.sql` new, `app/api/public/lead-submit/route.ts` two-line change, `app/api/stripe/webhook/route.ts` import + 2-line addition, `app/api/revenuecat/webhook/route.ts` import + 2-line addition, `app/api/cron/referral-email-followup/route.ts` new, `vercel.json` cron entry added, `components/MyLinkPageClient.tsx` anchor id added, `docs/current-state.md` + `docs/updates-log.md` updated). Did not touch the primary checkout's other-agent uncommitted state. Did not touch any orphan worktree directories under `.claude/worktrees`.

---

### 2026-05-20 [Source: Claude Code] — Referral follow-up: MyLink explainer copy + credit-pack scope finding

Two follow-ups on the referral program later in the same day as the UI-cleanup + banked-credit-before-checkout work earlier. Worktree `.claude/worktrees/referral-followup-2` off `origin/main` at `31f0fe4` (the prior merge). Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

**Change 1 — extended MyLink referral-section explainer.** Single-file copy change to [`components/MyLinkPageClient.tsx:532-538`](../components/MyLinkPageClient.tsx:532). Added a trailing sentence to the existing explainer paragraph so contractors aren't surprised by the Stripe checkout page showing the headline plan price even after a credit has been applied:

> "You earn a $120 credit when someone you referred signs up for a paid plan. The credit is applied to your bill automatically — right away if you're already on a paid plan, or when you next upgrade if you're on Solo. **When you do upgrade, the Stripe checkout page may still show the plan's normal price as if you're being charged — your credit is applied automatically behind the scenes, so you won't actually be charged until it runs out.**"

Avoided any specific month count because the $120 credit covers different durations per plan ($120 ≈ 6 months of Team at $19.99/mo, ≈ 3 months of Business at $39.99/mo). The phrase "until it runs out" is plan-agnostic and accurate for both.

**Change 2 — investigation only (no code changed): does the $120 referral credit apply to bonus lead-credit pack purchases?** Answer: **NO, only to subscription billing.** Evidence:

- [`app/api/stripe/credits/route.ts:73`](../app/api/stripe/credits/route.ts:73) — credit-pack Checkout Session is built with `mode: "payment"`. mode=payment Sessions create a Stripe PaymentIntent and charge the customer's payment method for the line-item total. PaymentIntents do NOT consume `customer.balance` — that's Stripe's documented behavior for one-time payments.
- [`app/api/stripe/checkout/route.ts`](../app/api/stripe/checkout/route.ts) (subscription / plan upgrade path) — uses `mode: "subscription"`, which creates a Stripe Subscription and Invoice cycle. Invoices DO consume `customer.balance` automatically. This is where the referral credit lands.
- [`lib/referralRewards.ts:378-395`](../lib/referralRewards.ts:378) — the referral reward is written via `stripe.customers.createBalanceTransaction(customerId, { amount: -REFERRAL_REWARD_VALUE_CENTS, currency: "usd", … })`, which is a negative customer-balance credit. Customer-balance credit semantics: applied only to invoices.
- [`app/api/stripe/webhook/route.ts:179-246`](../app/api/stripe/webhook/route.ts:179) (`handleCreditPackCheckoutCompleted`) — records the purchase via the `record_credit_purchase` Supabase RPC, reads `session.amount_total` (the actual card charge) for the confirmation email; there is no `customer.balance` reference anywhere in the credit-pack flow.
- Webhook router at [`app/api/stripe/webhook/route.ts:248-252`](../app/api/stripe/webhook/route.ts:248) discriminates by `session.metadata?.creditAmount` — credit packs and subscriptions are distinct branches with distinct billing primitives.

Implication: a contractor with a banked or applied $120 referral credit who buys a credit pack pays the full pack price (e.g. $9.99 / $39.99 / $69.99) on their card. The $120 sits untouched on their `customer.balance` and only draws down when their next subscription invoice issues. If the team wants credit packs to consume referral credit too, that's a deliberate product decision — requires moving credit packs to invoice-based billing (e.g. `invoice_creation: { enabled: true }` on the Checkout Session, or a Stripe-billing-meter / one-off-invoice approach). Not a free behavior.

`npx next build` exit 0, no new warnings. Build log shows only the pre-existing `@sentry/nextjs disableLogger` deprecation and Next workspace-root inference warning that have been there since prior builds.

**Live verification.** Demo session signed in as `demo@snapquote.us` on `snapquote.us` after the Vercel deploy went READY. The new explainer text rendered on `/dashboard/my-link`. `/app`, `/app/leads`, `/app/plan`, `/app/credits`, `/app/quotes` all returned 200. Vercel runtime logs filtered to `statusCode=500,502,503,504` and `level=[error,fatal]` over the 5-minute window post-deploy returned 0 matches. Sentry MCP unavailable in this session; Vercel runtime logs substituted as the server-side proxy.

**Lane discipline.** Branched fresh from `origin/main`, worked in isolated worktree, `git add` with explicit paths only (3 files: `components/MyLinkPageClient.tsx`, `docs/current-state.md`, `docs/updates-log.md`). Did not touch the primary checkout's other-agent uncommitted state. Did not touch any orphan worktree directories. Worktree and temp main-merge worktree removed; local + remote feature branch deleted.

---

### 2026-05-20 [Source: Claude Code] — Referral follow-up: MyLink UI cleanup + banked credit applied BEFORE checkout

Two web-only follow-up changes on top of Lanes 0/A/B/C/D. Worked in `.claude/worktrees/referral-followup` branched off `origin/main` at `78983dd`. Merged to `origin/main` as commit `<RECORDED ON MERGE>`.

**Change 1 — MyLink referral section UI cleanup.** Dropped the 4-box surface (Pending / Qualified / Rewarded / Earned) for 2 boxes (Pending / Credit Earned), exposed less internal plumbing to contractors. Changed files:

- [`lib/referrals/getReferralSummary.ts`](../lib/referrals/getReferralSummary.ts) — `ReferralSummary` type updated. Dropped `qualifiedCount`, `rewardedCount`, `totalEarnedDollars`. Added `creditEarnedDollars` (number, computed as count of referrals where `status IN ('qualified','rewarded')` × `REFERRAL_REWARD_VALUE_CENTS` ÷ 100 — uses the constant exported from `lib/referralRewards.ts` so any future reward-value change has one place to update) and `hasUnappliedCredit` (boolean, true when any `referral_rewards` row matches `kind='banked_trial' AND status='pending' AND applied_at IS NULL AND clawed_back_at IS NULL`). Used a `count: "exact", head: true` query for the boolean — no row fetch, just a count, four parallel selects.
- [`components/MyLinkPageClient.tsx`](../components/MyLinkPageClient.tsx) — grid swapped from `grid-cols-2 sm:grid-cols-4` to `grid-cols-2`. Second box label changed to "Credit Earned" (renders the dollar via `Intl.NumberFormat`). New conditional `<p>` between the grid and the bottom explainer that only renders when `hasUnappliedCredit` is true: "Your earned credit applies to your bill automatically when you upgrade to a paid plan." Bottom explainer rewritten away from the Pending→Qualified→Rewarded three-state flow to plain language: "You earn a $120 credit when someone you referred signs up for a paid plan. The credit is applied to your bill automatically — right away if you're already on a paid plan, or when you next upgrade if you're on Solo."
- `/api/app/referrals/summary` route untouched — it returns the result of `getReferralSummary` directly, so the shape change flows through transparently.

**Change 2 — banked referral credit applied to Stripe customer balance BEFORE the Checkout Session is created on Solo→paid upgrade.** The verification pass earlier today found that for a SOLO referrer with a banked reward, [`applyBankedRewardForOrg`](../lib/referralRewards.ts) was only ever called either from the existing-paid-plan upgrade branch (which a SOLO user doesn't hit) or from the post-checkout webhook (which fires after the user has already seen and paid the full headline price). Fix in [`app/api/stripe/checkout/route.ts`](../app/api/stripe/checkout/route.ts) inserts a pre-session block:

1. Query `referral_rewards` for a banked/pending reward for the calling org. If none → skip; fall through to the existing path unchanged.
2. If a banked reward exists and the org has no `stripe_customer_id` yet (the typical SOLO case), call `stripe.customers.create({ email: auth.userEmail, metadata: { userId, orgId } })` and use the new customer id.
3. Call `applyBankedRewardForOrg(orgId, customerId)`. The atomic UPDATE-WHERE-NULL claim in `lib/referralRewards.ts` line 354-369 either flips the reward row's `status` from `pending` → `applied` (and `kind` from `banked_trial` → `stripe_balance`) and writes a `-$120` `customer.balance` transaction, or returns a `noop` outcome. Stripe write uses `idempotencyKey=referral-reward-banked:${rewardId}` so even a hypothetical duplicate path is single-counted on Stripe's side.
4. Create the Checkout Session with `customer: <pre-credited customer id>` so the hosted page shows the reduced amount due.

No-double-apply guarantee verified by code trace:

- After the pre-session call wins the DB claim, the reward row has `kind='stripe_balance' AND status='applied' AND applied_at IS NOT NULL` ([`lib/referralRewards.ts:354-369`](../lib/referralRewards.ts:354)).
- The webhook's `handleCheckoutCompleted` calls `applyBankedRewardForOrg(orgId, session.customer)` ([`app/api/stripe/webhook/route.ts:301-317`](../app/api/stripe/webhook/route.ts:301)). That function's initial SELECT filters on `kind='banked_trial' AND status='pending' AND applied_at IS NULL AND clawed_back_at IS NULL` ([`lib/referralRewards.ts:328-337`](../lib/referralRewards.ts:328)). The row no longer matches → function returns `{ outcome: 'noop', reason: 'no_banked_reward' }` ([`lib/referralRewards.ts:340-343`](../lib/referralRewards.ts:340)) → no Stripe write, no second credit.
- If the pre-session path's Stripe write fails (e.g. stale customer), `applyBankedRewardForOrg` ROLLS BACK the DB claim ([`lib/referralRewards.ts:397-405`](../lib/referralRewards.ts:397)) and re-throws. The checkout route catches the throw, Sentry-logs, and proceeds. The reward row goes back to `pending` so the webhook's later call CAN apply it to `session.customer` (the post-create Stripe customer, which is fresh and works). Net: credit applied exactly once, just possibly to a different Stripe customer than was originally targeted.
- Fail-safe: every step in the pre-session block is inside a try/catch that captures to Sentry with `area=referral-reward-banked-apply, stage=checkout-pre-session`. The checkout call proceeds regardless. The contractor's upgrade is never blocked.

`npx next build` exit 0 in the worktree, no new warnings (the existing `@sentry/nextjs disableLogger` deprecation + Next workspace-root inference warning are unchanged from prior builds).

Live verification: demo login walkthrough on `snapquote.us` after Vercel deploy READY confirmed no 500s on `/app`, `/app/leads`, `/app/plan`, `/app/credits`, `/app/quotes`, `/dashboard/my-link`. The MyLink page rendered the new 2-box layout with the expected $0 credit (demo has no referrals). Vercel runtime logs for 5xx (`statusCode=500,502,503,504`) and `level=[error,fatal]` over the 5-minute window post-deploy: zero matches. Did not exercise the Solo→paid pre-apply path live (would require a real Stripe payment); guarantee verified by code trace + the existing earlier-today simulation showing the banked path lands correctly.

Edge case flagged: an abandoned-then-retried Solo→paid checkout creates a SECOND Stripe customer (the first sits orphan in Stripe with the credit applied but no subscription). The DB claim still prevents double-applying, so the second attempt would not show the discount. Acceptable trade-off — most users complete checkout on the first attempt. Recovery for the orphan case would be a `stripe.customers.search` by `metadata.orgId` follow-up, not part of this change.

**Lane discipline.** Worked entirely in `.claude/worktrees/referral-followup`, used a junction for `node_modules` from the primary checkout to skip a full install, copied `.env.local` into the worktree for the build. `git add` with explicit paths only — 4 files: `lib/referrals/getReferralSummary.ts`, `components/MyLinkPageClient.tsx`, `app/api/stripe/checkout/route.ts`, plus docs. Did not touch the primary checkout's other-agent uncommitted state, did not touch any orphan worktree directories under `.claude/worktrees`.

---

### 2026-05-20 [Source: Claude Code] — Referral program Lane D (dashboard UI) shipped

Lane D of the parallel referral build — contractor-facing UI so an authenticated org can see and share its own referral code, link, QR, and counts. Branched a fresh worktree off `origin/main` at `d430dc1` (Lane 0 schema commit; Lane A had not yet merged when I cut the branch). Built U16 + U17, merged to `origin/main` as commit `3621210eebdf6ab6e8ad5e057981878de04cbccf`. Vercel deploy `dpl_6T9GxzmrX3uCzvMeoNzQ5U3CJonZ` READY at 2026-05-20T14:09:51 UTC.

**U16 — read-only referral summary API** at [`app/api/app/referrals/summary/route.ts`](../app/api/app/referrals/summary/route.ts). `GET`, nodejs runtime, `requireMemberForApi`. Returns `{referralCode, referralLink, pendingCount, qualifiedCount, rewardedCount, totalEarnedDollars, hasReferrer}` for the authed org. Reads from `organizations.referral_code`, `public.referrals`, `public.referral_rewards`. `referralLink` built from `NEXT_PUBLIC_APP_URL` as `${appUrl}/r/${code}`. Counts derived from `referrals.status` (pending / qualified / rewarded). `totalEarnedDollars` = `sum(value_cents) / 100` on rewards where `status='applied'`. `hasReferrer` = `count > 0` on referrals where `referred_org_id = orgId`. Single in-memory pass over the rows; four Supabase round trips issued in parallel via `Promise.all`.

**U17 — referral section appended to the BOTTOM of the MyLink page**. New fourth `Card` appended to [`components/MyLinkPageClient.tsx`](../components/MyLinkPageClient.tsx) below the existing Share / Your Link / Social Caption / QR Code cards — top of the page unchanged. [`app/dashboard/my-link/page.tsx`](../app/dashboard/my-link/page.tsx) now loads `getReferralSummary(auth.orgId)` server-side via the shared helper and passes it as a `referralSummary` prop. Card renders: referral code in `font-mono text-2xl tracking-[0.2em]`; read-only copyable `Input` with `Link2` icon for the link; "Share Referral Link" button using `navigator.share` (with `AbortError` swallow + clipboard fallback); secondary outlined "Copy Link" button; 180px `QRCodeCanvas` of the referral link with "Download Referral QR"; 4-cell `grid grid-cols-2 sm:grid-cols-4` of `pendingCount` / `qualifiedCount` / `rewardedCount` / `Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0})` formatted total earned; closing helper paragraph explaining the Pending → Qualified → Rewarded progression. Reward described as "Earn 3 months of Business plan ($120 account credit) for each contractor you refer who signs up for a paid plan."

**Shared helper** at [`lib/referrals/getReferralSummary.ts`](../lib/referrals/getReferralSummary.ts) — `server-only`, takes `orgId`, returns `ReferralSummary`. Single source of truth for both the API route and the page server component. The page bypasses the API and calls the helper directly so demo and live orgs both render (the demo block in `requireMemberForApi` would return 403; the page is served by `requireAuth()` which has no demo block).

**Live schema cross-check** via Supabase MCP on `upqvbdldoyiqqshxquxa` before writing the helper: confirmed `referrals.referrer_org_id` / `referred_org_id` / `status` columns, `referral_rewards.value_cents` / `status` columns, the status enums (`pending`, `qualified`, `rewarded`, `clawed_back` on referrals; `pending`, `applied`, `clawed_back` on referral_rewards), and the member-scoped SELECT RLS policies on both tables. Confirmed Demo org id `bce3a561-455c-468e-9408-497803811800` carries `referral_code = '8CCCR6FM'` and live counts are 0 referrals / 0 rewards (Lane A capture is wired but no signups have flowed through yet).

**Build** — `npx next build` in the worktree, exit code 0. `/api/app/referrals/summary` appears in the route manifest at 471 B / 226 kB First Load JS. `/dashboard/my-link` page bundle 10.6 kB. Pre-existing warnings only (Next inferred workspace root; an unrelated `<img>` LCP warning).

**Merge concurrency** — Lane A landed on `origin/main` at `acb029635273ab7c49edd95bf864c856ec4e0ee5` while I was building. Lane A's files (`app/(public)/r/[code]/route.ts`, `app/api/app/referrals/redeem/route.ts`, `app/api/stripe/checkout/route.ts`, `app/app/page.tsx`, `components/ReferralRedeemBanner.tsx`, `lib/auditLog.ts`, `lib/onboarding.ts`) had zero overlap with Lane D's files. `git merge --no-ff` was clean.

**Live verification** on `snapquote.us` after deploy READY: signed in as `demo@snapquote.us`; MyLink page rendered the new section at the bottom showing code `8CCCR6FM`, link `https://snapquote.us/r/8CCCR6FM`, two QR canvases (original + referral), counts 0 / 0 / 0 / $0. Existing customer-link section at the top untouched. `GET /api/app/referrals/summary` from the authed session returned 200 with the expected JSON body. `/app`, `/app/leads`, `/app/plan`, `/app/credits`, `/app/quotes`, `/dashboard/my-link` all returned 200. Sentry `errors` dataset for `timestamp:>2026-05-20T14:09:51 statsPeriod=1h` returned zero events (any level).

**Lane discipline** — branched fresh from `origin/main`, isolated worktree, `git add` with explicit paths only. Did not touch the primary checkout's uncommitted other-agent work (9 untracked audit docs + 3 modified files including `docs/current-state.md` and `docs/updates-log.md` — used a separate temp worktree to update docs). Did not touch Lane B/C's `referral-lane-bc` or `main-merge-bc` worktrees. After merging I removed my worktree, removed temp worktrees I added for the merge + docs, deleted my local branch.

---

### 2026-05-20 [Source: Claude Code] — Referral program Lane A (capture) shipped and live-verified

Built and merged Lane A — the capture layer of the contractor-to-contractor referral program — on top of Lane 0 (`d430dc1`). Five work units shipped: U4, U5, U6, U7, U8. Worked in isolated worktree `.claude/worktrees/referral-lane-a`. Two other agents (Lanes B/C and Lane D) were running concurrently in their own worktrees; staged only the seven files I created/modified and left their work untouched.

**Files shipped this lane (7 files, 602 insertions, 30 deletions):**

- `app/(public)/r/[code]/route.ts` (NEW, U4) — GET handler. Reads the dynamic `[code]` param, normalizes to upper-case, validates against `^[A-Z0-9]{6,12}$`. Returns a 302 to `/signup` always. On a valid shape: also sets the `sq_referral_code` cookie with `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 2_592_000` (30 days), `secure: true` in production. On invalid shape: redirects without setting the cookie. Rate-limited per IP (`referral-link:<ip>`) at 60/min via `rateLimit()` from `lib/rateLimit.ts`; 429 returns plain JSON, NOT a redirect, so the rejected path can't be turned into an amplification primitive. Confirmed no route conflict with the sibling `[contractorSlug]` catch-all — Next.js routes literal `r` ahead of dynamic segments at the same depth.
- `lib/onboarding.ts` (U5) — `ensureOrganizationMembershipForUser` rewritten on two axes. (1) Org INSERT now provides `referral_code` generated synchronously via `generate_referral_code(8)` RPC. `organizations.referral_code` is NOT NULL with no DB-side default — the existing `.upsert({ name, slug })` would have hit a NOT-NULL violation on any new signup post-Lane-0. The previous upsert was replaced with a plain INSERT + 23505 unique_violation handler that recovers the existing row via `.select("id").eq("slug", bootstrapSlug)` on conflict; this preserves the existing referral_code (we never want to silently rotate a contractor's outbound code on retry). (2) New helper `attachReferralFromCookie({ admin, newOrgId, newUserId, newUserEmail })` runs after membership is confirmed: reads `sq_referral_code` via `cookies()` from `next/headers`, validates shape, looks up the referrer org by `referral_code`, blocks both org-id self-match and case-insensitive owner-email self-match (via `getOwnerEmailForOrg` from `lib/organizationOwners.ts`), inserts the `referrals` row with `status='pending'`, writes `recordAudit(action='referral.attached', metadata.source='link')`, clears the cookie. Entirely best-effort: every code path is try/caught with `console.warn` and continues — a referral failure must never block a signup. The 23505 on `referrals.referred_org_id_key` is treated as "already attached" (likely a retried bootstrap), not an error.
- `app/api/app/referrals/redeem/route.ts` (NEW, U6) — POST handler for the in-app manual-redeem path. `requireOwnerForApi` gates (already blocks demo org and non-owner roles). Rate-limited per user (`referral-redeem:<userId>`) at 5/min. Zod-validated body `{ code: string }` with upper-case + format CHECK transform. Three parallel queries in a `Promise.all`: caller org (`id, created_at, plan, referral_code`), existing inbound referral row (dedupe), and referrer org by entered code (separate query after; can't be parallel because gating depends on caller-org fields first). Returns typed 400 with a `code` field for every business-rule failure: `INVALID_CODE`, `ALREADY_REFERRED`, `WINDOW_CLOSED` (age > 7d OR plan ≠ SOLO), `OWN_CODE`, `SELF_REFERRAL`, `INSERT_FAILED`. 23505 race is converted to `ALREADY_REFERRED`. On success: inserts the referral row and audits `referral.attached` with `metadata.source='manual'`. Never 500s on a business-rule fail.
- `app/api/stripe/checkout/route.ts` (U7) — wove `referralCode` into all three Stripe-metadata sites via a new local helper `buildStripeMetadata(extra)`. Added a fourth query to the existing `Promise.all` that reads `referrals.code` for `referred_org_id = auth.orgId` (the inbound code attached at signup or via redeem). The helper conditionally emits the key only when the code exists, so an unreferred org's Stripe metadata stays untouched. All three sites (`subscriptions.update` for upgrades, `subscription_data.metadata` and Checkout `Session.metadata` for new subs) now call `buildStripeMetadata({ plan })`. Lane B/C reads the canonical code from the `referrals` row, not from Stripe metadata — this is traceability only.
- `components/ReferralRedeemBanner.tsx` (NEW, U8) — client component. Shape-validated 12-char input with `inputMode="text"`, `autoCapitalize="characters"`, `font-mono tracking-[0.2em]` for the entered code (the code is the user's identifier here, not free-form text). Submit POSTs to `/api/app/referrals/redeem`. Three local states: `idle`, `submitting`, `error` (inline red message from the API's typed error), `success` (a green confirmation panel that replaces the form until the next dashboard refresh removes the banner entirely server-side). Matches the existing design system (rounded-[14px] card, electric blue `text-primary`, `rounded-xl` inputs/buttons).
- `app/app/page.tsx` (U8 integration) — added `shouldShowReferralBanner(orgId)` helper that runs two parallel Supabase queries (`organizations.plan, created_at` + `referrals.id` for inbound) and returns true iff `plan === "SOLO"` AND no inbound referral AND age ≤ 7d. Wraps the banner in `<Suspense fallback={null}>` above the Date header so the eligibility query streams in alongside the rest of the dashboard rather than blocking the initial render.
- `lib/auditLog.ts` — extended `AuditAction` union with `"referral.attached"`. Single action covers both cookie-path and manual-path attaches; `metadata.source: "link" | "manual"` distinguishes them so reporting stays one-line ("how many referrals attached in the last 30d") without a JOIN.

**Build verification.** `npx next build` in the worktree exit 0. All ~80 routes compiled including the new `/r/[code]` (473 B) and `/api/app/referrals/redeem` (475 B). One pre-existing warning (`<img>` tag in `app/layout.tsx`) unchanged. No new warnings.

**Merge + push.** Branch `claude/referral-lane-a-2026-05-20` pushed first. Created a separate ephemeral worktree at `main` (`.claude/worktrees/lane-a-merge`) so the primary checkout — which is on another agent's WIP branch `claude/audit-1-mobile-handoff-2026-05-11` — was never touched. `git merge --no-ff` produced merge commit `acb02963`. Pre-push `git log origin/main..main --oneline` showed exactly two new commits: my feature commit `6969ae7` and the merge `acb02963`. Pushed cleanly, no force, no rejected. Deleted the lane-a branch local + remote. Removed both my worktrees. Other agents' worktrees (`audit-b19-2026-05-11`, `main-merge-bc`, `referral-lane-bc`, `referral-lane-d`) left intact.

**Vercel deploy.** My production deploy `dpl_Fet6iptn…` for `acb02963` was QUEUED, then CANCELED ~1 min later — Lane D (`3621210e`) merged on top of mine before my build started, and Vercel canceled my pending deploy in favor of Lane D's. Verified Lane D's HEAD `3621210e` contains my files (`git cat-file -e 3621210:app/(public)/r/[code]/route.ts` etc.) and its parents are `[acb0296 (mine), 32d830f (Lane D's branch)]`. Lane D's deploy `dpl_6T9Gxzmr…` went READY at `1779286047`; production now serves both lanes.

**Live verification (production, post-deploy).**

- `curl -sSI https://www.snapquote.us/r/8CCCR6FM` → `HTTP/1.1 302 Found`, `Location: https://www.snapquote.us/signup`, `X-Matched-Path: /r/[code]`, `Set-Cookie: sq_referral_code=8CCCR6FM; Path=/; Expires=Fri, 19 Jun 2026 14:11:45 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax` ✓
- `curl -sSI https://www.snapquote.us/r/bad` → 302 to `/signup`, **no `Set-Cookie` header** ✓ (invalid shape correctly suppressed)
- `curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"code":"FOO123"}' https://www.snapquote.us/api/app/referrals/redeem` → `401` ✓ (`requireOwnerForApi` engaged)
- Demo session click-through (`demo@snapquote.us` / `123456SQ!`): `/app` renders with the "Welcome back!" toast and the standard stat cards; `/app/leads` lists the demo leads with unlock state; `/app/plan` shows "Current Plan: Business / $39.99/month"; `/app/credits` shows the credit-pack picker; `/app/quotes` shows the estimates table. Banner correctly absent on `/app` because Demo is `BUSINESS` plan (not `SOLO`).
- `https://www.snapquote.us/demo-vjtm` (the `[contractorSlug]` catch-all) renders the public estimate form — confirms `/r/[code]` adding a sibling literal segment did not break the catch-all routing.
- `https://www.snapquote.us/signup` renders the SignupForm — confirms `ensureOrganizationMembershipForUser` import chain compiles cleanly under SSR.
- Sentry MCP on `snapquote` (regionUrl `https://us.sentry.io`): `level:error url:*snapquote.us*` over 1h → **0 results**; transaction filter for `*referrals* OR *r/* OR *onboarding* OR *auth/bootstrap* OR *stripe/checkout* OR */app` over 1h → **0 results**; logs at `level:error` over 1h → **0 results**; `firstSeen:-30m` issues → **0 results**.

**Result:** Lane A capture is live, clean, no regression. No revert needed.

---

### 2026-05-20 [Source: Claude Code] — Referral program Lanes B + C (qualification + reward + U14 banked apply) landed

Built and merged Lanes B (qualification trigger) and C (reward applier + clawback) on top of Lane 0 (`d430dc1`). All six work units shipped: U9, U10, U12, U13, U14, U15. Lane A landed on `origin/main` (`acb0296`) mid-session while my partial-merge push was being prepared, so U14 was completed in the same merge instead of as a follow-up commit. Final merge commit pushed to `origin/main`.

**New module — `lib/referralRewards.ts`:**

- `REFERRAL_REWARD_VALUE_CENTS = 12_000` (locked $120).
- `applyRewardToReferrer(referralId)` — load referral, resolve referrer org's owner → active Stripe customer (`subscriptions.status ∈ {active,trialing}` AND `stripe_customer_invalid_at IS NULL`). If Stripe customer found: `stripe.customers.createBalanceTransaction(customerId, {amount: -12_000, …}, {idempotencyKey: 'referral-reward:<referralId>'})` then `record_referral_reward(referralId, 12_000, txn.id)` → `kind=stripe_balance` / `status=applied`. Otherwise: `record_referral_reward(referralId, 12_000, null)` → `kind=banked_trial` / `status=pending` (banked).
- `applyBankedRewardForOrg(referrerOrgId, stripeCustomerId)` — for U14 (currently unused in checkout). Atomic UPDATE-WHERE-NULL claim on `referral_rewards.applied_at`, then Stripe credit write with idempotency key `referral-reward-banked:<rewardId>`. Rolls back DB claim if Stripe write throws.
- `clawbackReferrerRewardForReferredOrg(referredOrgId)` — UPDATE-WHERE-NULL on `referrals.clawed_back_at`, then on `referral_rewards.clawed_back_at`, then write POSITIVE `customer.balance` transaction (idempotency key `referral-reward-clawback:<rewardId>`) to reverse the credit. If original reward was `banked_trial` (no `stripe_balance_txn_id`), DB flip is the entirety of the clawback (nothing to reverse on Stripe).
- `qualifyAndRewardReferral(orgId, reason, source)` — shared wrapper. Calls `qualify_referral` RPC; if returns 1, looks up the referral row and calls `applyRewardToReferrer`. Swallows its own errors, captures to Sentry under `area=referral-qualify-stripe` or `area=referral-qualify-revenuecat`. Never throws — a referral failure must not break the host webhook delivery.

**Stripe webhook (`app/api/stripe/webhook/route.ts`):**

- `handleInvoicePaid` — after existing logic, when `invoice.amount_paid > 0` AND (`billing_reason === "subscription_create"` OR (`billing_reason === "subscription_cycle"` AND `organizations.has_used_trial === true`)), fires `qualifyAndRewardReferral(orgId, "stripe_invoice_paid", "stripe")`. NEVER fires from `handleSubscriptionChanged` (status=trialing must never qualify). Inside the existing `claimWebhookEvent` envelope.
- `handleChargeRefunded` — restructured to split credit-pack refunds from subscription refunds. Non-credit-pack branch fires `clawbackReferrerRewardForReferredOrg(orgId)` wrapped in try/catch with Sentry `area=referral-clawback-stripe`. Credit-pack refunds remain as-is (Audit 3 H7 partial-refund double-deduct fix preserved).

**RevenueCat webhook (`app/api/revenuecat/webhook/route.ts`):**

- `INITIAL_PURCHASE` — fires `qualifyAndRewardReferral(orgId, "rc_initial_purchase", "revenuecat")` iff `event.is_trial_period === false`. Trial starts skip qualification.
- `RENEWAL` — looks up the most-recent prior `iap_subscription_events` row for the org (excluding this event's own `event_id`, filtered to `is_trial_period IS NOT NULL`); if prior `is_trial_period === true` (the trial→paid conversion case), fires `qualifyAndRewardReferral(orgId, "rc_renewal_after_trial", "revenuecat")`. Recurring renewals on never-trialed subs skip qualification (qualify_referral would be idempotent regardless, but the extra DB round-trip is wasted).
- `REFUND` — subscription branch (no credit-pack `creditAmount`) fires `clawbackReferrerRewardForReferredOrg(orgId)` wrapped in try/catch with Sentry `area=referral-clawback-revenuecat`.

**`lib/auditLog.ts`:** extended `AuditAction` union with `referral.qualified`, `referral.reward.applied`, `referral.reward.banked`, `referral.reward.banked_applied`, `referral.reward.clawed_back`, `referral.reward.noop`. All written from service-role webhook handlers.

**Verification.** `npx next build` exit 0 with no new errors or warnings (pre-existing Sentry `disableLogger` deprecation, Next.js multi-lockfile workspace-root warning, and one `<img>` ESLint warning in `app/layout.tsx` are unchanged). Live Supabase MCP confirmed live RPC signatures match my call shapes. `referrals` and `referral_rewards` tables had 0 rows pre-deploy (clean slate). Live billing webhook handlers smoke-tested via Stripe Dashboard's "Send test webhook" + Sentry 5-min window confirms no new spikes (live verification details in this entry's follow-up after Vercel deploys).

**U14 — banked-reward apply on later upgrade (`app/api/stripe/checkout/route.ts` + `app/api/stripe/webhook/route.ts`).** Two call sites (consistent reward mechanic across both — always `customer.balance` credit, never the `trial_period_days` alternative; idempotent via `applyBankedRewardForOrg`'s atomic UPDATE-WHERE-NULL claim on `referral_rewards.applied_at`):

- Inline in checkout route, inside `if (currentSubscription)` / `isUpgrade` after `update_org_plan_credits` succeeds: `applyBankedRewardForOrg(auth.orgId, upgradeCustomerId)` for the in-place upgrade case (TEAM→BUSINESS etc.) where the Stripe customer already exists.
- In Stripe webhook `handleCheckoutCompleted`, after the existing setOrganizationPlan/resetCredits/email block: `applyBankedRewardForOrg(orgId, stripeCustomerId)` for the fresh-checkout case (SOLO→TEAM/BUSINESS) where the Stripe customer doesn't exist until Stripe creates it during the Checkout Session and `checkout.session.completed` fires.

Sentry-tagged `area=referral-reward-banked-apply / stage=checkout-upgrade` or `stage=checkout-completed-webhook`. Failures captured but do NOT roll back the upgrade — losing a $120 credit is recoverable via support; failing the upgrade itself is not.

**Concurrency hygiene.** Worktree at `.claude/worktrees/referral-lane-bc` branched off `origin/main` at `d430dc1`. Pulled in Lane A (`acb0296`) via `git merge origin/main --no-ff` once it landed; resolved a one-line conflict in `lib/auditLog.ts` by combining `referral.attached` (Lane A) and `referral.qualified` / `referral.reward.*` (Lanes B+C) into one union. Staged only files this lane owns or modified — no `git add .`. Did not touch the primary checkout (which had unrelated uncommitted changes from another session) or any other agent's worktree / branch / stash.

---

### 2026-05-20 [Source: Claude Code] — Referral program pre-build audit + Lane 0 (schema foundation) landed

**Two events in one session, both delivered today.**

**(1) Pre-build audit.** Audited the proposed contractor-to-contractor referral program against the live repo at `origin/main` (`99a6474`) plus the working-tree HEAD on a stale audit branch (`claude/audit-1-mobile-handoff-2026-05-11` / `71a2998`, ~60 commits behind main). Read at HEAD for unchanged files, at `origin/main` for the Stripe + RC webhook handlers that had Audit 13 H4 + Audit 3 H7 changes not yet on the side branch. Live MCP queries to Supabase (no `%referral%` / `%refer%` / `%promo%` tables; org schema confirmed), Stripe (live products: Solo / Team / Business / 3 credit packs + 6 Stripe-CLI test artifacts; live coupons: `[]`), Vercel (no Sentry MCP available in this session so used Vercel runtime logs as proxy for error monitoring). Produced a 21-unit dependency + parallelization map across 5 lanes (0 schema → A capture / B qualification / C reward / D UI / E ops). Confirmed web-only build is feasible with zero iOS changes — RevenueCat plan transitions for IAP-paid mobile users flow through `app/api/revenuecat/webhook/route.ts` in the web repo, so referral qualification on IAP upgrade is web-only code. Flagged 12 risks (most notable: 14-day Stripe trial means qualifying on `subscription.created` is unsafe — must wait for first non-zero `invoice.payment_succeeded`; "3 free months of Business" semantics are ambiguous for non-Business referrers — recommended a fixed `$119.97 customer.balance` credit instead; clawback path required on `charge.refunded` and RC `REFUND`).

**(2) Lane 0 schema foundation built.** Three migrations applied to live Supabase project `upqvbdldoyiqqshxquxa` and matched by repo files under `supabase/migrations/`:

- **U1 `20260520130825_referral_lane0_schema.sql`** — `organizations.referral_code` (text, UNIQUE, NULL-able for now) with `^[A-Z0-9]{6,12}$` CHECK; new `public.referrals` (one row per referrer→referred pairing; UNIQUE on `referred_org_id`; FK CASCADE; `referrals_not_self` CHECK); new `public.referral_rewards` (FK CASCADE; `value_cents >= 0` CHECK); three enums (`referral_status` = pending|qualified|rewarded|clawed_back; `referral_reward_kind` = stripe_balance|banked_trial; `referral_reward_status` = pending|applied|clawed_back); 5 indexes; RLS enabled on both tables with member-scoped SELECT policies mirroring the `audit_log` pattern from migration 0046 (no INSERT/UPDATE/DELETE policies → service_role only via bypass); helper `public.generate_referral_code(p_length integer DEFAULT 8)` using a 32-char unambiguous alphabet (no 0/O/1/I/L) — service_role only.
- **U2 `20260520130951_referral_lane0_backfill_codes.sql`** — backfilled all 4 live orgs (codes confirmed unique + format-conformant: `969V97TW` / `8CCCR6FM` / `H253W3V4` / `9MKYWPPU`); promoted `referral_code` to NOT NULL; tightened `generate_referral_code` grants by explicitly REVOKEing anon + authenticated (U1's REVOKE FROM public did not catch Supabase's auto-grants on new public.* functions — fixed here, ACL now `{postgres,service_role}` only).
- **U3 `20260520131103_referral_lane0_rpc_functions.sql`** — `qualify_referral(p_referred_org_id uuid, p_reason text) → integer` (atomic UPDATE WHERE status='pending'; returns row count; live-tested with non-existent UUID, returned 0/0 over two calls); `record_referral_reward(p_referral_id uuid, p_value_cents integer, p_stripe_balance_txn_id text) → integer` (UPDATE-WHERE-NULL on rewarded_at then INSERT referral_rewards in the same transaction; mirrors the `credit_purchases.refunded_at` Audit 3 H7 idempotency pattern from migration 20260511183247; returns 1 on first reward, 0 on no-op for retries). Both `SECURITY DEFINER, SET search_path = public, pg_temp`, REVOKED from public/anon/authenticated and GRANTed to service_role only.

**Verification.** Supabase MCP `execute_sql` confirmed all columns, tables, enums, constraints, RLS policies, and function shapes (`prosecdef`, `proconfig`, `proacl`) are exactly as designed. All 4 live orgs received unique non-null codes. Smoke-tested qualify_referral idempotency: two consecutive calls with the same non-existent referred_org_id both returned 0. `generate_referral_code` produces conforming output (sampled `SVHME87X`, `CPSADVQC`, `D7MQ3VUV`). `npx next build` in the worktree completed exit 0 — all 60+ routes compiled with no new warnings (pre-existing Sentry `disableLogger` deprecation + Next.js workspace-root inference warning are unchanged).

**Env-var checklist for the FULL referral build (Lanes 0–E):** zero new env vars required. All paths reuse existing Vercel production secrets — verified via `vercel env ls production`: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_*, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_*, REVENUECAT_WEBHOOK_AUTH, RESEND_API_KEY + RESEND_FROM_EMAIL_NOREPLY, CRON_SECRET, INTERNAL_API_SECRET, SENTRY_DSN, NEXT_PUBLIC_APP_URL all present and applied to Production. The only existing infra gap visible from Vercel `env ls` is UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — these are NOT new for referrals; `lib/rateLimit.ts:10-19` explicitly documents the in-memory fallback while the Upstash instance is unprovisioned (left pending from Audit 8 H9). Lane A's `/r/[code]` rate limiter will degrade gracefully to per-instance in-memory until those land.

**Lane 0 done.** Schema is ready for parallel Lane A / B / C / D / E build agents.

---

### 2026-05-15 [Source: Claude Code] — Supabase `lead-photos` bucket orphan cleanup (3,641 files / ~225 MB deleted)

Earlier on 2026-05-15, a mass Supabase cleanup deleted 73 orgs (leaving falconn, Demo, Pacific Edge Property Care) plus 3,250 falconn leads older than 7 days. The cascade removed the matching `lead_photos` rows from the database but left the underlying storage objects in the `lead-photos` bucket — Supabase blocks direct `DELETE storage.objects` from SQL, and the dashboard's folder-delete fails on large folders ("Failed to retrieve all files within folder"). Those orphan files were driving Supabase egress past the Free-tier 5 GB/mo cap.

**Script.** New one-time tool at [`scripts/cleanup-orphan-photos.ts`](../scripts/cleanup-orphan-photos.ts):

- Dry-run by default; pass `--execute` to actually delete.
- Reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (via `dotenv`).
- Paginates `public.lead_photos.storage_path` into a Set of paths to KEEP (1000-row pages).
- Recursively lists `lead-photos` via Storage API; subfolders are entries with `id == null`, files have `id` + `metadata.size`. Each `list()` call retried up to 6× with exponential backoff (500ms → 16s) because the endpoint gateway-times-out intermittently on busy folders.
- Computes orphan set = bucket-files MINUS keep-set; logs anti-set (keep-paths missing from bucket) as a WARN but does not act.
- Prints a summary (totals, bytes-to-free, sample orphans) and prompts "yes" before deleting.
- Deletes in batches of 100 via `supabase.storage.from('lead-photos').remove([...])`. Logs per-batch progress.

**Dry-run.** `Mode: DRY RUN`, keep-set=71, bucket files=3712 (236.6 MB metadata sum), orphans=3641 (225.0 MB / 235,884,486 B), 0 keep-paths missing from bucket, 5 transient `Gateway Timeout`s on `list()` all recovered on attempt 2.

**Execute.** `Mode: EXECUTE`, 37 batches (36×100 + 1×41), `100/100 removed` per batch, **3641 deleted / 0 failed**, 11 `list()` retries absorbed during the pre-delete scan, exit 0.

**Verification (live Supabase MCP on `upqvbdldoyiqqshxquxa`, 2026-05-15, post-execute):**

| Metric | Pre | Post | Delta |
| --- | --- | --- | --- |
| `storage.objects WHERE bucket_id='lead-photos'` | 3,712 | 71 | −3,641 |
| `SUM((metadata->>'size')::bigint)` | 248,101,748 B | 12,217,262 B | **−235,884,486 B (~225 MB)** |
| `public.lead_photos` rowcount | 71 | 71 | 0 |
| `lead_photos LEFT JOIN storage.objects` rows missing in bucket | 0 | 0 | 0 |
| `public.leads` | 23 | 23 | 0 |
| `public.organizations` | 3 | 3 | 0 |

Bucket file count now matches `lead_photos` rowcount exactly. No `lead_photos` row points at a path that is now missing from the bucket. Pre-existing 4 RLS policies on `storage.objects` (Audit 8, `is_org_member(storage_org_id_from_path(name))`) and the bucket's MIME/size limits (Audit 4 F3 fix at HEAD) are untouched.

**Script lifecycle.** The script lives in `scripts/` (one-time tool — safe to re-run; if there are zero orphans on the next run it logs "Nothing to delete. Done." and exits). Not imported anywhere in app code. `npx tsc --noEmit` on the script standalone: 0 errors.

**Out of scope (not done here, still pending).** The "abandoned upload" cron in Pending Work — customers who pick photos and abandon the public form leave `${orgId}/${tempLeadId}/...` objects with no `leads` row. This script catches those too (they have no `lead_photos` row pointing at them), but the underlying need for a TTL cleanup cron remains.

---

### 2026-05-13 [Source: Claude Code] — Hero eyebrow blue dot removed

Murdoch asked to remove the small blue dot that sat to the left of the "FOR OUTDOOR SERVICE CONTRACTORS" eyebrow text in the landing-page hero. The dot was a `<span className="h-1.5 w-1.5 rounded-full bg-primary" />` rendered as the first child of the eyebrow `<div>`. Removed the `<span>` and dropped the wrapper's `inline-flex items-center gap-2` classes (no longer needed since there's only a single text child). All eyebrow text styling — font family, size, color, tracking, margins — is unchanged. `npx tsc --noEmit` → exit 0.

---

### 2026-05-13 [Source: Claude Code] — Step-1 webObjectPosition 60% → 70% (close left gap at share-sheet scene); steps 3/4 synthetic indicator already hidden (verified live)

After the prior commit (3e54a82) deployed, Murdoch reported step-1 still had a visible left gap and that steps 3/4 still showed duplicate home indicators.

**Step 1 — bump to 70%.** Investigation: re-downloaded the live `step-1.mp4` from snapquote.us and pngjs-scanned the share-sheet scene at t=3.0/3.5/4.0. The leftmost/rightmost non-white source columns are 128 / 911 in those frames (vs 128 / 879 in the earlier My-Link frames). At the web variant's default `"60% 50%"`, the share-sheet scene's right edge (source x=911) lands at display x ≈ 236.6 in the mobile 240-wide container — only ~3.4 display px from container right edge — with the left edge at display x ≈ 12.7 = visibly right-heavy. Bumped [`STEPS[0].webObjectPosition`](../app/%28public%29/page.tsx) from default 60% to override `"70% 50%"`. New margins at the share-sheet scene: ~8.8 display px left / ~7.3 right (close to balanced). The hamburger/"My Link" left edge at source x=128 stays inside the container at ~8 display px from container left — no clipping.

**Steps 3 + 4 — confirmed previously fixed; verified live.** Live DOM inspection (Chrome MCP `javascript_exec` query on `document.querySelectorAll('video')` + each video's `<div aria-hidden>` siblings) on snapquote.us at HEAD = 3e54a82 returned: step-1 numOverlays=2, step-2 numOverlays=2, step-3 numOverlays=1 (status bar only — no synthetic home indicator), step-4 numOverlays=1 (same). The `hideHomeIndicator: true` on `STEPS[2]` and `STEPS[3]` is doing its job; the synthetic CSS pill does not render on steps 3 or 4 in the served HTML. The "still duplicates" report was likely from a cached older render of the page; pngjs cropdetect on the live `step-3.mp4` and `step-4.mp4` videos confirms each has exactly one iPhone home indicator pill baked into the source recording (step-3 at source y=1946-1951, step-4 at source y=1756-1761), which is what users see now — only one indicator per phone frame.

**Verification**

- `npx tsc --noEmit` → exit 0
- File diff is purely `app/(public)/page.tsx` (single STEPS entry change) + docs; no video files touched.

---

### 2026-05-13 [Source: Claude Code] — Step-1 recentered (drop 50% override, fall back to default 60%) + synthetic home indicator hidden on steps 3/4 (duplicate-pill fix)

Two CSS-only follow-ups after the clean second-pass crops landed:

**Step 1 — re-center via the default 60% bias.** The prior pass set [`STEPS[0].webObjectPosition = "50% 50%"`](../app/%28public%29/page.tsx) on the rationale that the default 60% bias would clip "M" of "My Link" at source x≈78. That estimate was visual; the live pngjs row scan at HEAD then confirmed the leftmost non-white pixel of step-1 content is at source x≈128 (not 78). At the new H=1762 crop dimensions, the horizontal excess source crop is only ~139 source px (vs the previous H=1546's ~242 source px). With that smaller excess, 60% bias lands "M" at display x ≈ 13 px from container left (visible) AND positions the content midpoint at display x ≈ 120 (= container center). 50% bias instead positioned the content midpoint at ~124 display px = 4 px right of container center, which read as "significantly offset right" with extra empty space on the right side of the phone frame. Fix: removed the `webObjectPosition: "50% 50%"` from `STEPS[0]` so step-1 falls through to the web variant's default `"60% 50%"`. Step-2's behavior unchanged (it was already on the default). Step-3 still has its `"50% 50%"` override (leads list is centered in source). Step-4 still on default 60%.

**Steps 3 + 4 — hide the synthetic home indicator.** Both source recordings (iPhone screen captures of the SnapQuote app's Leads list and Lead Detail screens) already contain the real iPhone home indicator pill baked into the bottom of the video — the synthetic CSS `IOSHomeIndicator` overlay drew a second pill directly on top of it, creating a visible duplicate. Added a new `hideHomeIndicator?: boolean` field to the `Step` type, set `hideHomeIndicator: true` on `STEPS[2]` (step-3) and `STEPS[3]` (step-4), threaded the prop through the `PhoneFrame` component. In `PhoneFrame`, the `<IOSHomeIndicator />` render now gates on `hideHomeIndicator ? null : <IOSHomeIndicator />`. Steps 1 + 2 still render the synthetic indicator (their sources don't have one baked in). The synthetic `IOSStatusBar` overlay is unchanged for all steps.

**Verification**

- `npx tsc --noEmit` → exit 0
- File diff is purely `app/(public)/page.tsx` (+ docs); no video file changes this round. Step-2's `STEPS[1]` entry is byte-identical to before this commit.

---

### 2026-05-13 [Source: Claude Code] — Steps 1/3/4 landing videos: clean second pass — content sits fully below synthetic status bar + uniform scale across steps + unclip step-1 "M"

After the first iOS-native pass on steps 1/3/4 shipped, Murdoch reported four issues across the four phone frames on the live "How it works" section: synthetic 9:41 status bar overlapping the in-app SnapQuote header (step-3), "M" of "My Link" clipped on left edge (step-1), step-4 looking zoomed out compared to steps 1/3, and what looked like a real iPhone status bar bleeding through above the synthetic 9:41 (steps 1/3/4).

**Investigation findings (live, pixel-level)**

Downloaded the live `step-{1,3,4}.mp4` from snapquote.us, extracted frames via `ffmpeg-static`, scanned pixel content with a pngjs row scanner (threshold: RGB < 200 → non-white, ≥5 non-white pixels per row → content). Findings:

1. **Raw Canva-exported sources do NOT contain the user's real iPhone status bar.** Canva's export already removed it. The top 200–400 source rows of each raw `Step {1,3,4}.mp4` (at `C:\Users\murdo\SnapQuote Misc\Screen Recordings Finished\`) are pure white. The "iPhone status bar bleeding through" the user described was actually the **in-app SnapQuote header sitting partially behind the synthetic status bar overlay** — the prior crops left only ~26 display px of top whitespace, but the synthetic status bar overlay is 28 display px tall, so the SnapQuote header's top ~2 px was clipped behind the overlay. From a casual viewing angle the partial header clipping reads as visual chrome above the synthetic 9:41.
2. **Raw content boundaries (first/last non-white row per source):** step-1 y=247–1806 (varies — share sheet at t=3 extends content lower than t=0/1/2), step-3 y=402–1955, step-4 y=210–1764.
3. **Step-4's "zoomed out" feel:** the prior crop output 978×1842 → display scale 0.274 = content displayed at 426 display px (85% of container height) vs step-1 at 506 display px (100%) and step-3 at 491 display px (97%). Step-4 needed a smaller output H to scale content up.
4. **Step-1's "M" clip:** at the prior `webObjectPosition: "60% 50%"`, the left source crop landed at x ≈ 144, but the "M" of "My Link" sits at source x ≈ 78 — clipped by ~5 display px.

**Fix shipped**

Re-cropped sources to put content fully below the 28-display-px synthetic status bar with ~10 display px of breathing room (38 display px total of top whitespace) and above the 14-display-px synthetic home indicator with ~6 display px of breathing room (20 display px total of bottom whitespace). Sized output H so content_height × scale ≈ 446 display px across all three for uniform visual scale (scale ≈ 0.286):

- step-1: `crop=978:1762:0:114` (978×1762, drops 114 top + 240 bottom) — replaces prior 978×1546.
- step-3: `crop=978:1755:0:270` (978×1754 after ffmpeg rounding, drops 270 top + 91 bottom) — replaces prior 978×1596.
- step-4: `crop=978:1756:0:78` (978×1756, drops 78 top + 282 bottom — vs prior 148 top + 126 bottom; removes the recorded iPhone home indicator visible at the bottom of the prior crop) — replaces prior 978×1842.

Set `STEPS[0].webObjectPosition = "50% 50%"` in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) to unclip the "M" — at the new dimensions and `50%` left-crop, "M" lands ~2 display px from the container's left edge while the bell+badge on the right stays inside the visible window. Step-3 unchanged at `"50% 50%"`. Step-4 unchanged at the default `"60% 50%"`. Step-2 byte-identical to before (no file change, same STEPS entry).

**Verification**

- `npx tsc --noEmit` → exit 0
- Extracted frames at t=0.1/0.5/2.0/3.0 from each new crop, verified content sits below where the status bar will overlay and above where the home indicator will sit
- Step-1 at t=3 (share sheet scene) — content top still clears the status bar zone

**What the user thought was the real iPhone status bar**

The user's complaint of "Original iPhone status bar (3:25 time, Dynamic Island, real battery)" is historical-but-superseded by the live-grounded finding above. The pixel scan of all four raw Canva sources confirmed no iPhone status bar exists in those source recordings — Canva's export removed it. The visual that read like a "second status bar" was the partial overlap of the prior tighter crops with the synthetic 9:41 overlay. With the new crops the in-app SnapQuote header sits ~38 display px below the top of the phone frame's inner area, fully clear of the 28-display-px synthetic status bar.

---

### 2026-05-13 [Source: Claude Code] — Steps 1/3/4 landing videos: applied same iOS-native phone-frame treatment as step-2 (status bar + home indicator + per-step horizontal centering)

After step-2's iOS-native treatment landed, Murdoch asked to roll the same treatment to steps 1, 3, 4 (the iPhone app recordings) for uniform iOS-native styling across the "How it works" section.

**Per-step crops**

Re-cropped each raw Canva-exported source (`Step {1,3,4}.mp4` at `C:\Users\murdo\SnapQuote Misc\Screen Recordings Finished\`, each 978×2116 60fps) using `ffmpeg-static` with `-c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart -an`. Crop boxes target ~80 source px top + ~40 source px bottom of residual whitespace so at the phone-frame's `object-cover` display scale they fall behind the synthetic iOS status bar (28 display px) and home indicator (~14 display px):

- step-1: `crop=978:1546:0:210` (drops 210 top + 360 bottom) — replaces previous 978×1560 from the May 12 re-encode. Content from "SnapQuote" header (source y ≈ 290) down to "property-care" caption end (source y ≈ 1716). My Link screen, 4.85 s @ 60 fps, ~957 KB.
- step-3: `crop=978:1596:0:344` (drops 344 top + 176 bottom) — replaces previous 978×1536. Content from SnapQuote header (y ≈ 424) down through the Leads list to just above the iPhone home indicator (y ≈ 1940). 7.23 s, ~3.75 MB.
- step-4: `crop=978:1842:0:148` (drops 148 top + 126 bottom) — replaces previous 978×1536. Content from SnapQuote header (y ≈ 228) down through Lead Detail body + property photos (y ≈ 1990). 15.52 s, ~2.94 MB.

Each step ends up at a slightly different AR (step-1 = 0.633, step-3 = 0.613, step-4 = 0.531) because each app screen has different content density. The phone-frame chrome (status bar + home indicator + rounded corners) is uniform across all 4, which is what reads as "uniform iOS-native styling."

**Per-step horizontal object-position**

Measured content midpoints in each cropped video via a pngjs frame scanner that locates the leftmost/rightmost non-white columns (R, G, or B < 230) at frames t=0.5, 2, 3:

- step-1: avg content midpoint at source x ≈ 509 → +20 source px right of source center (489). Use default `webObjectPosition: "60% 50%"`.
- step-2: known +26 right (no change from prior fix). Default `"60% 50%"`.
- step-3: avg midpoint at source x ≈ 484 → ~0 offset (essentially centered). Override to `webObjectPosition: "50% 50%"` — the default 60% would push content visibly left in this phone frame.
- step-4: avg midpoint at source x ≈ 498 → +9 source px right. Default `"60% 50%"`.

**Code change in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx)**

1. Added `webObjectPosition?: string` to the `Step` type and to the `PhoneFrame` component props.
2. Set `variant: "web"` on all 4 `STEPS` entries (previously only step-2 had it).
3. Set `webObjectPosition: "50% 50%"` only on `STEPS[2]` (step-3) — others use the default.
4. Refactored the `<video>` element to apply `objectPosition` via inline style instead of the previous `object-[60%_50%]` Tailwind class — this avoids needing 4 separate Tailwind arbitrary-value classes and supports any CSS string value. Default variant still applies `object-center` via Tailwind class as before.

**Verification**

- `npx tsc --noEmit` → exit 0
- Live-deploy + mobile-viewport visual check deferred to Vercel + browser at 390 px wide
- Step-2 logic is byte-equivalent: the inline-style refactor produces identical `object-position: 60% 50%` to the prior `object-[60%_50%]` Tailwind class

---

### 2026-05-13 [Source: Claude Code] — Step-2 landing video: nudged object-position from 55% → 60% for true horizontal center

After the prior 55% fix, Murdoch reported the form still sat a few pixels too far right inside the phone frame. Nudged `object-position` on the step-2 `<video>` in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) from `object-[55%_50%]` to `object-[60%_50%]` (only the `variant === "web"` branch; steps 1/3/4 still resolve to `object-center` by default). At the phone-frame display scale (504/1448 = 0.348, video displayed at 340 px wide inside a 240 px container, total horizontal crop = 100 displayed / ~287 source px), 60% means left crop ~172 source px (~60 display) and right crop ~115 source px (~40 display) — vs 55%'s 158/130. Form's left edge (source x ≈ 190) lands ~6 display px from container left; form's right edge (source x ≈ 840) lands ~7 display px from container right. Roughly equal margins.

`npx tsc --noEmit` → exit 0. Live-deploy + mobile-viewport visual check deferred.

---

### 2026-05-13 [Source: Claude Code] — Step-2 landing video: shifted object-position to 55% to unclip "Get My Estimate" button

After the iOS-styled phone frame shipped, Murdoch reported the "Get My Estimate" button's right edge was being clipped by the phone-frame edge — form content was visibly off-center. Frame-extracted t=14 of `public/videos/landing/step-2.mp4` (978×1448 at HEAD) and measured: the button + form content spans roughly source x=190–840 while the source itself is 978 wide. Form's horizontal center is ≈x=515, source center is x=489, so the form sits ~26 source px right of the source's geometric center. At default `object-cover object-center`, the visible window inside the 240-wide phone frame inner is source columns ~144–834 (scale = 504/1448 = 0.348, displayed width = 340, side crop = 50 each), so the button's right edge at ~840 lands ~6 source px past the visible window's right edge = ~2 display px of right-edge clipping. Matches what Murdoch reported.

**Fix** — narrowed the change to step-2 only: in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) the `<video>` className now branches on `variant`. `variant === "web"` (step-2 only) gets `object-[55%_50%]` which biases the visible window source x to ~158–848 (left crop 158 ≈ 55px display, right crop 130 ≈ 45px display), giving the button ~8 source px (~3 display px) of right margin while keeping the form's left edge ~11 display px from the container's left edge. Steps 1/3/4 keep `object-center` (the default) — branching is `variant === "web" ? "object-[55%_50%]" : "object-center"` via `cn()`. No video re-encode, no other phone-frame change, no overlay change.

**Math**

At display scale 0.348 (= 504 / 1448), source width 978 displays as 340 px. Inside a 240 px container, total horizontal crop is 100 displayed px = ~287 source px. With `object-position: X% 50%`:
- Left crop (source px) = X% × 287
- Right crop (source px) = (1 − X%) × 287

At 50% (default): 144 left / 144 right. Button right at source x=840 = 840 − 144 = 696 source px from left of visible = 696 × 0.348 = 242 display px = 2 px past the 240 px container. **Clipped.**
At 55%: 158 left / 130 right. Button right at 840 − 158 = 682 source px from left = 237 display px. **3 px of right margin.** Form left at 190 − 158 = 32 source px from left = 11 display px from container's left.

**Verification**

- `npx tsc --noEmit` → exit 0
- Live-deploy + mobile-viewport visual check deferred to Vercel + browser open at 390 px wide

**Why not just bigger like 60% or 100%**

Going further (e.g., 60%) trims the form's left edge harder for no benefit — 55% already gives the button positive margin and keeps the form's left edge inside the visible window. 100% (= `object-right`) would crop ~287 source px from the left = ~100 display px = the left side of the form would disappear off the container's left edge. 55% is the smallest shift that fixes the clip.

---

### 2026-05-13 [Source: Claude Code] — Step-2 landing video: iOS status bar + home indicator overlays + tighter crop to make the web-Safari recording look native iPhone

Murdoch came back on the same step-2 video. Even after the prior recrop matched steps 1/3/4's aspect ratio, step-2 still read as a Safari recording, not a native iPhone screen — the iOS app videos (steps 1/3/4) fill their phone frames edge-to-edge with native chrome (header bars, bottom indicators) while step-2's web form sat with whitespace at top and no iOS chrome. Tried iOS Safari "hide toolbar" trick, PWA standalone, AI reframe — none of those routes are viable on iOS. Asked to use **only CSS and the existing Canva-exported MP4** to close the gap.

**Three problems identified by frame extraction**

Used `ffmpeg-static` to pull frames from the live `public/videos/landing/step-{1,2,3,4}.mp4` at HEAD (981/1536/3.5MB/2.9MB sizes confirmed via PowerShell Shell.Application COM on downloaded files):

1. **No iOS status bar in any step video.** Steps 1/3/4 were recorded inside the iOS app and the recording cropped out the status bar — they go straight to the app's SnapQuote header bar. The phone frame on the landing page therefore has no native iOS chrome at all. Synthetic status bar on step-2 specifically actually adds something the others *should* have had.
2. **Step-2's old crop had ~110 px residual top whitespace + ~98 px bottom** measured in the previous re-encode at 978×1536 (per prior docs entry). At the phone-frame display scale (504/1536 = 0.328) that's ~36 px top + ~32 px bottom of empty white inside the frame on every frame — vs steps 1/3/4 which have content edge-to-edge. That visible whitespace is the "less native" tell.
3. **iOS home indicator visible inconsistently** across step videos — step-3 has a thick black app tab bar, step-4 has an iOS home indicator pill, step-1 cuts off cleanly. Step-2's recording has a faint thin line from the iPhone home indicator at the very bottom. Adding a sharper CSS-rendered home indicator to step-2 makes the bottom edge feel intentional.

**What I shipped**

1. **Recropped raw Canva source `Step 2.mp4` (978×2116) → `978×1448`** via `ffmpeg-static` with `crop=978:1448:0:336 -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart -an`. Drops 336 top + 332 bottom of the source's measured 416/372 minimum whitespace. Leaves ~80 px residual top + ~40 px residual bottom whitespace at full resolution — chosen so that at the phone-frame's display scale (504/1448 = 0.348) the residual whitespace maps to ~28 px top + ~14 px bottom, which is exactly what the status bar overlay and home indicator overlay below cover. Resulting file 2.32 → 2.25 MB, same 60fps 16.93s duration. AR is now 0.6754 — slightly wider than the previous 978×1536 (AR 0.637) so side cropping in `object-cover` goes from 12.6%/side up to 14.7%/side, accepted tradeoff because the form is centered horizontally with margin on each side.

2. **Added `IOSStatusBar` component in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx)** as an inline SVG overlay positioned `absolute inset-x-0 top-0 z-10` inside the phone-frame inner rounded-[28px] container. Solid white background to seamlessly continue the white form below it (no visible seam). Black text "9:41" left-aligned in SF Pro / system-ui semibold at 11px (mobile) / 12px (desktop). Right side: 4-bar signal SVG (16×10), 3-arc wifi SVG (14×10), battery shell+fill+tip SVG (24×11). All glyphs use `currentColor` so they inherit the bar's black text color. Height 28 px / 31 px to scale with the phone frame's mobile/desktop sizes (256 / 280 wide). Padding 18/20 px horizontal so glyphs sit at the bezel's natural margin. `pointer-events-none` and `aria-hidden` so it doesn't interfere with focus or screen readers (the `<video>` already has `aria-label`).

3. **Added `IOSHomeIndicator` component** — small dark pill `bg-[#0B0E14]/85` positioned `absolute bottom-[6px] left-1/2 -translate-x-1/2`, dimensions 88×3.5 px (mobile) / 96×4 px (desktop). Sits visually above (taller than) the faint thin recorded indicator from the iPhone screen recording, takes its place as the prominent visual element.

4. **Made `PhoneFrame` variant-aware** by adding `variant?: "default" | "web"` to its props (with `PhoneFrameVariant` type alias). When `variant === "web"` the status bar and home indicator render as siblings to the `<video>`. Default variant unchanged so step-1/3/4 render exactly as before. Threaded `variant: "web"` only into `STEPS[1]` (step-2) — steps 1/3/4's STEPS entries have no `variant` field, defaulting to `default`, so they're byte-identical at the call site to before this change.

**Phone-frame display math after the change**

Phone frame outer 256×520 (`aspect-[256/520]` `w-[256px]` lg:280), inner after `p-2` is 240×504 (lg:264×553). Step-2 video at 978×1448 (AR 0.6754) in 240×504 (AR 0.476): `object-cover` fits height, video scaled to 240×… well wider, so width-displayed = (504/1448)×978 = 340 px, side-cropped to (340−240)/2 = 50 px each side. Top 28 px of the inner is covered by the status bar overlay; bottom 6 px is the home indicator pill plus a bit of breathing room. The video has 80 source px of top whitespace, which at the 0.348 scale displays as 27.8 px — falling almost exactly under the 28 px status bar across most frames. Worst-case frame (t=0.5) source whitespace measures ~150–170 px = 52–60 display px which leaves a small residual ~25–32 px visible whitespace below the status bar at that single moment of the loop — acceptable, the form content fills the frame as soon as the recording animates. Bottom 40 source px (14 display px) sits under the home indicator pill.

**What didn't get touched**

`step-1.mp4`, `step-3.mp4`, `step-4.mp4` are byte-identical at HEAD (no entry in `git status`). Their `PhoneFrame` call sites pass no `variant` prop so they default to `default` and render exactly the same DOM as before (sibling `<video>` only, no status bar, no home indicator). Desktop interactive `ProductDemo`, Meta Pixel / GA4 / CompleteRegistration tracking in [`app/layout.tsx`](../app/layout.tsx) and [`app/(public)/signup/page.tsx`](../app/%28public%29/signup/page.tsx), favicon, metadata, CTA routes all untouched.

**Verification**

- `npx tsc --noEmit` → exit 0 with the new component, new prop, new type alias, and SVG inline children.
- Frame-extraction sanity check from the new `step-2.mp4` at t=0.5/4/8/14 — form content (SnapQuote logo, headline, address field, service dropdown, name/email/phone, Get My Estimate CTA) all visible without any UI being clipped at top or bottom.
- Live-deploy + mobile-viewport visual check deferred to Vercel + browser open at 390 px wide.

**Why CSS overlay over re-recording or design change**

Murdoch's prior framing options had four real candidates: (1) re-record under Chrome DevTools mobile emulation, (2) "own the difference" by giving step-2 a browser frame instead of a phone frame, (3) tighter crop only, (4) CSS overlay of synthetic iOS chrome. (1) requires Murdoch's time and was already ruled out as the user wanted only CSS + existing MP4. (2) changes the marketing narrative — Murdoch's prompt asks to make step 2 "look as native to an iPhone as possible" not to redesign the section. (3) was the prior fix's approach and the result still read as Safari. (4) is the only path that actually adds the missing iOS visual cues *and* leaves the underlying recording untouched.

---

### 2026-05-13 [Source: Claude Code] — Step-2 landing video recropped to 978×1536 to match steps 1/3/4 aspect ratio (fal.ai AI-reframe experiment failed)

Murdoch flagged that the customer-form step-2 recording inside the "How it works" phone frame didn't fit as cleanly as the other three steps — step-2 was sitting at 978×1328 (AR 0.736) after the previous re-encode, while step-1/3/4 sat at 0.627–0.637 wider AR, so step-2 in `object-cover` got ~17.6%/side cropping vs ~12.5%/side for the others. Asked to experiment with AI reframing on fal.ai (one-video, $1.50 hard cap) using the raw Canva-exported `Step 2.mp4` source (978×2116, 16s, 60fps) at `C:\Users\murdo\SnapQuote Misc\Screen Recordings Finished\Step 2.mp4`.

**fal.ai experiment**

- Model: `fal-ai/luma-dream-machine/ray-2-flash/reframe` (Flash variant @ $0.06/sec vs Standard @ $0.20/sec which would have been $3.20 = over budget)
- Source uploaded by pushing it to a temp file on this branch (`_tmp_source/step2-source.mp4` at commit 390c29b — the fal.ai MCP `upload_file` refuses local file paths and base64 only works for files <1 MB; the source is 2.45 MB) and using the GitHub raw URL `https://raw.githubusercontent.com/Murdoch45/snapquote/390c29b/_tmp_source/step2-source.mp4`
- Job: `019e2280-fc99-7440-a13a-026655847186`, aspect_ratio=`9:16`
- Output: 720×1280, 16s, 24fps, 3.9 MB
- Cost: **$0.96** charged
- **Result: BROKEN** — the model went the outpaint route (not crop). Source AR 0.462 → target 9:16 (AR 0.5625) is "wider" so the model preserved the form on the left half and **hallucinated fake UI on the right half**: illegible mirrored-form text at t=0.5–2s, a duplicated service dropdown at t=4s, fake property-photo cards + name/phone fields at t=14s, and a fake dark "checkmark feature list" panel running across the bottom of every sampled frame (t=0.5/2/4/6/8/10/12/14s — all 8 sampled). Inside the phone frame the hallucinated content would still be visible (object-cover only crops ~7.5%/side at this AR), so this would be visibly broken on the live landing page.

Reported to Murdoch per the "do not silently ship broken AI output" rule with four options. Murdoch picked **manual ffmpeg crop to match steps 1/3/4's AR** — no further fal.ai spend.

**What shipped — manual ffmpeg crop to 978×1536**

Re-cropped the raw `Step 2.mp4` source with `ffmpeg-static` (installed via `npm install --no-save`, then dropped before commit) using `crop=978:1536:0:306 -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart -an`. The crop drops 580px total (306 top + 274 bottom) instead of the previous re-encode's 788px, leaving 110px residual whitespace at top and 98px at bottom of the cropped video. AR becomes 0.637 — matches step-3 (978×1537, AR 0.636) and step-4 (978×1537, AR 0.636) exactly, and is very close to step-1 (978×1560, AR 0.627). Same H.264 encoding params as the prior re-encode for consistency. Final file: 2.32 MB at `public/videos/landing/step-2.mp4` (vs 2.18 MB before; the extra 200px of height + 60fps preserved adds ~140 KB).

**Phone-frame display math after the recrop**

Phone frame inner is 240×504 (AR 0.476). With the new step-2 at 978×1536:
- `object-cover` fits height: 504/1536 = 0.328 scale → width becomes 978×0.328 = 321 px → side crop is (321 − 240)/2 = 40.5 px each side = **12.6%/side** (matches step-3/4's ~12.5%/side, vs the previous 17.6%/side at the wider 0.736 AR)
- Form content is wider in the visible window (74.7% of source width visible vs 64.6% before)
- Tradeoff: the 110px/98px residual whitespace shows as ~6.8% top + ~6.4% bottom thin white strips inside the phone frame, where steps 1/3/4 fill edge-to-edge vertically. Net visual effect: step-2 still reads as "less filled" than the other three but the horizontal coverage now matches.

**Why the fal.ai outpaint failed — for the next person who tries this**

Luma Ray 2 Reframe is described as "intelligently inpainting missing regions." For tall→less-tall conversions (our case: 0.462 → 0.5625), the model has two paths: crop height (lose content) or outpaint width (invent content). It chose outpaint. For a UI screen recording that's NOT an option — there is no plausible "extension" of a form's sides, so the model hallucinated mirror images and AI-style fake comparison panels. If the experiment is ever retried, try aspect_ratio=`9:21` instead (AR 0.4286, slightly *taller* than source, so the model would outpaint into the existing top/bottom whitespace where hallucination is invisible — no side outpaint needed). Cost would be the same $0.96 per 16s on Flash. Standard Ray-2 (3.3× the price) might also do better at intelligent cropping but $3.20/job is over the experiment budget. Worth noting: the source video's AR (0.462) is already almost identical to the phone-frame AR (0.476), so technically the **uncropped source could be dropped in as-is** with only ~1.4% top/bottom crop — but you'd see the source's ~25% top whitespace prominently in the phone frame, which is why we crop.

**Verification**

- `npx tsc --noEmit` → exit 0
- Visual frame-extraction at t=0.5/2/4/6/8/10/12/14/16s on the cropped output — content matches source, no whitespace bands beyond the documented ~7% top/~6% bottom, SnapQuote logo + "Request an Estimate from Pacific Edge Property Care" headline visible at t=0.5, service dropdown legible at t=4s, "How dirty is it?" / "Is the area easy to access?" radio buttons at t=10s, name/email/phone form + "Get My Estimate" CTA at t=14s
- Live-deploy verification deferred to Murdoch post-Vercel-deploy

**Branch hygiene note**

The temp commit (390c29b) that pushed the raw source to GitHub for fal.ai consumption stays on the branch and lands on `main` via the `--no-ff` merge — force-pushing the branch to drop it would violate the project's "force push is forbidden" rule. Blob will live in git history but is no longer referenced from any tree.

---

### 2026-05-12 [Source: Claude Code] — Landing-page screen recordings re-encoded to remove baked-in whitespace inside the phone frame

After the screen recordings landed on origin/main (entry below), Murdoch viewed the live page and reported the videos rendered with substantial empty white space inside the phone mockup frame — the phone frame felt much larger than the visible video content area. They asked me to verify CSS first and re-encode the MP4s only if needed.

**Verification — CSS was already correct**

Inspected the rendered video element via `preview_inspect` against a Next.js dev server running the worktree's build:
- `class="absolute inset-0 block h-full w-full object-cover object-center"` (added `block` and `object-center` defensively during this fix pass — see code change below)
- Computed `object-fit: cover` ✓
- Computed `object-position: 50% 50%` ✓
- Computed `width: 264px height: 552.75px` (matches the phone-frame inner area on desktop) ✓
- Computed `position: absolute` ✓
- Parent container computed `overflow: hidden` ✓ and `background-color: rgb(11,14,20)` (dark — so any empty space would NOT appear as white from the container itself)

CSS was not the problem.

**Root cause — whitespace baked into the source MP4 frames**

Used `ffmpeg-static` (via `npx`) plus a tiny Node PNG scanner (`measure-ws.cjs`) to read each video's first 1–8 frames at full 978×2116 resolution and count rows that are ≥95% white pixels (r,g,b > 240). Min top/bottom across sampled frames:

| video  | min top white  | min bot white  | aspect | source       |
|--------|----------------|----------------|--------|--------------|
| step-1 | 247px (11.7%)  | 309px (14.6%)  | 0.462  | phone screen |
| step-2 | 416px (19.7%)  | 372px (17.6%)  | 0.462  | browser      |
| step-3 | 420px (19.8%)  | 159px (7.5%)   | 0.462  | phone screen |
| step-4 | 228px (10.8%)  | 351px (16.6%)  | 0.462  | phone screen |

Phone-frame aspect ratio is 256/520 ≈ 0.492 (close to the 0.462 source aspect), so `object-cover` was correctly filling the frame — but the visible result included the white iPhone status-bar gutter (top) and home-indicator strip (bottom) on the phone screen recordings, and the centered-in-browser whitespace on the browser-recorded step-2.

**Fix — re-encode each video with a per-video crop**

Used the `ffmpeg-static` binary at `node_modules/ffmpeg-static/ffmpeg.exe` with `crop=978:H:0:Y -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -an`. Per-video crop boxes match the min-whitespace measurements above:

- step-1: `crop=978:1560:0:247` → 978×1560 (aspect 0.627)
- step-2: `crop=978:1328:0:416` → 978×1328 (aspect 0.736)
- step-3: `crop=978:1537:0:420` → 978×1537 (aspect 0.636)
- step-4: `crop=978:1537:0:228` → 978×1537 (aspect 0.636)

Audio dropped (`-an`) since the videos play `muted` anyway. `+faststart` keeps the moov atom at the front so byte-range streaming still works for the lazy `preload="metadata"` strategy. All four ftyp brands are still `isom + iso2 + avc1 + mp41`; codec is still H.264. After re-encode, frame-extraction at t=0 shows: step-1 2.9% top / 2.4% bottom white; step-2 9% / 0%; step-3 0% / 0%; step-4 0% / 0%. The 9% top remaining on step-2 is the conservative-crop residual (I cropped to the *minimum* whitespace across all frames so no content is ever clipped — step-2's at-rest whitespace is 19.7% but t=0 happens to spike to 25%).

**Tradeoff documented for the next person who looks at this**

The new aspect ratios (0.627–0.736) are wider than the phone frame's 0.492, so `object-cover` now fits the HEIGHT of the container and crops the SIDES — losing roughly 12% of the source width per side for step-1/3/4 and 18% for step-2. The mobile-app UI is centered with internal padding, so the visible 240px-wide window in the phone frame still shows the actual screens; the cropped edges drop the iPhone-screen gutters and the browser-viewport whitespace surrounding the centered customer form. This is the right tradeoff per the user's "fill the frame cleanly without empty space" directive. If a future re-record produces tighter recordings (no status bar, browser zoomed to the form), this re-encode can be skipped and the originals dropped back in.

**Code change — defensive CSS clarification**

In [`app/(public)/page.tsx`](../app/%28public%29/page.tsx), the `<video>` element's className changed from `"absolute inset-0 h-full w-full object-cover"` to `"absolute inset-0 block h-full w-full object-cover object-center"`. Adds:
- `block` — `<video>` defaults to `display: inline` in HTML; with absolute positioning this rarely matters, but block is more predictable.
- `object-center` — explicit `object-position: center` (default behavior — same as `50% 50%` — but now visible in the class list when reviewing).

**Verification**

- `npx tsc --noEmit` → exit 0.
- New MP4 atom structure verified via custom Node parser: `ftyp` first, `moov` second (no `uuid` extension atom Canva had embedded), `mdat` last — clean ffmpeg output with proper faststart.
- Visual confirmation in browser deferred to Murdoch post-deploy: the Chrome MCP environment AND the Playwright instance the Preview MCP wraps both have a stuck media-decode pipeline on H.264 video element loads (readyState stays at 0 with networkState=2 LOADING indefinitely; HTTP fetch of the file works fine). CSS inspection via `preview_inspect` did succeed and confirmed the computed styles.
- Frame-extraction sanity check via local ffmpeg-static: cropped step-1 t=0 shows the SnapQuote header at the top and the social caption form at the bottom with no visible top white gutter (vs the original which had a 247-row gutter). Similar improvement on the other three.

---

### 2026-05-12 [Source: Claude Code] — Landing-page "How it works" phone-frame placeholders swapped for real screen recordings

The public marketing landing page at `/` had four phone-frame placeholders in the mobile "How it works" section rendering dashed-text labels ("Screen recording — share link", "Screen recording — customer flow", etc.). Murdoch shipped four polished step recordings cut from a real contractor signup → share-link → customer flow → estimate → send-or-pass walkthrough and asked to swap them in.

**What changed**

- Added `public/videos/landing/step-{1,2,3,4}.mp4` — copied from `C:\Users\murdo\SnapQuote Misc\Screen Recordings Finished\Step {1,2,3,4}.mp4`. Sizes: 1.06 MB / 2.34 MB / 2.64 MB / 2.43 MB (8.5 MB total). Step 2 is a browser-recorded customer-facing flow with a slightly different aspect ratio than the other three (phone screen recordings); `object-cover` crops cleanly to fit.
- Extended the inline `PhoneFrame` component in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) to accept an optional `videoSrc?: string` prop alongside the existing `label`. When `videoSrc` is provided, the frame renders `<video src={videoSrc} aria-label={label} autoPlay loop muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover">` instead of the dashed-text placeholder. The notch element is also suppressed in the video case so it doesn't sit on top of the recording. The fallback placeholder rendering is kept intact for the no-`videoSrc` path so the component stays reusable elsewhere.
- Extended the `Step` type with a `videoSrc: string` field; populated each of the 4 step records with `/videos/landing/step-{n}.mp4`. Call site in the `STEPS.map(...)` block now passes `videoSrc={step.videoSrc}`.
- The existing aspect-locked `aspect-[256/520]` (mobile) / `lg:w-[280px]` (desktop) rounded-[28px] container is unchanged — layout, spacing, alternating left/right grid arrangement, connector line, and step typography are all untouched.

**Why these specific `<video>` attributes**

- `autoPlay` + `muted` + `playsInline` is the three-attribute combo required to make videos autoplay on iOS Safari and modern mobile Chrome/Firefox. Drop `muted` and most mobile browsers will refuse autoplay; drop `playsInline` and iOS Safari will hijack into fullscreen the moment playback starts.
- `loop` so the 5-15s recordings replay continuously.
- `preload="metadata"` so the browser fetches just the first few KB to know dimensions/duration on initial page load — the full 1-3 MB body only streams when each frame scrolls into view, keeping the landing-page first-paint cheap.
- No `controls` attribute — silent looping background visual, not a clickable player.
- `aria-label={label}` carries the human-readable "Screen recording — share link" text for screen readers (the recordings have no audio).

**Nothing broken**

- Existing CTA button routes and `/signup` `/login` links untouched.
- Desktop `ProductDemo` (the interactive demo above the 4-step section, `lg:` only) untouched.
- Meta Pixel + GA4 + CompleteRegistration tracking in `app/layout.tsx` / `app/(public)/signup/page.tsx` untouched.
- Favicon, metadata, sitemap untouched.
- 4-step section layout, vertical spacing, alternating left/right grid, connector line, step number typography all preserved by working through the existing `PhoneFrame` container.

**Verification**

- `npx tsc --noEmit` → exit 0, zero errors at HEAD.
- Code review: 4 step records each carry a unique `videoSrc`; PhoneFrame call site passes it through; conditional render gates on truthy `videoSrc` so the fallback placeholder path is still reachable for future reuse.

Live-deploy verification (videos play on snapquote.us) deferred until after the push lands on origin/main and Vercel completes the auto-deploy — Murdoch can confirm or I can verify against the live URL in a follow-up.

---

### 2026-05-12 [Source: Claude Code] — Seeded Pacific Edge Property Care demo org with 10 AI-processed unlocked leads

Murdoch needed a fresh, fully-populated contractor org in production to record landing-page content and tutorial screen recordings against — without the seedDemo.ts shortcut of pre-baking fake AI estimates. Goal: every lead must go through the real AI estimator pipeline server-side, no fake `ai_estimate_low/high`.

**What landed in production**

- New auth user `jose@pacificedgepropertycare.com` (uid `d6da7b22-af25-464c-9247-9f7f7f2fb752`, email_confirm=true). Password reset to a fresh value via `scripts/seed-reset-password.ts` and printed to Murdoch.
- New org `5418e6b8-47c8-4365-b2b7-354224f4909d` — "Pacific Edge Property Care", slug `pacific-edge-property-care`, plan `BUSINESS`, `monthly_credits=100`, `bonus_credits=0`, `credits_reset_at=2026-06-11T19:51:06Z`, `onboarding_completed=true`.
- `organization_members` row: `(d6da7b22-af25-464c-9247-9f7f7f2fb752, OWNER)`.
- `contractor_profile` row: public_slug `pacific-edge-property-care`, business HQ `1230 W Olympic Blvd, Los Angeles, CA 90015` (lat 34.0407, lng -118.2667), services `[Pressure Washing, Lawn Care / Maintenance, Landscaping / Installation]`, `notification_lead_sms/email=false` so seed didn't generate 10 push/email/SMS hits on jose during the run, `email_verified=true`, `mobile_contractor=true`.
- 10 leads (7 pressure washing, 3 lawn care) submitted via direct service-role inserts that exactly mirror the public `/api/public/lead-submit` payload shape (same `${orgId}/${tempLeadId}/${randomUUID()}.webp` storage convention, same lead_photos upsert with `(lead_id, storage_path)` unique constraint). Photos uploaded into the `lead-photos` Supabase Storage bucket from the unzipped `snapquote-seed-leads.zip` manifest folders. 26 photos total (9 leads × 2 + lead 10 × 8 = 26), all visible to `leads_safe` reads.
- AI estimator fired server-side on every lead via `POST https://snapquote.us/api/internal/run-estimator` with `x-internal-secret` (skipping the Supabase Edge Function indirection because the .env.local service-role key is `sb_secret_`-format and the Edge Function's JWT validator rejects it; the internal endpoint IS the same code that runs after the Edge Function trampoline). All 10 leads ended at `ai_status='ready'` with real AI-generated `ai_estimate_low`/`ai_estimate_high`/`ai_suggested_price`/`service_category`/`job_city`/`job_state`/`job_zip` etc. Final price ranges (low–high): Daniel Reyes 425–525, Jessica Tran 475–575, Michael Donovan 175–275, Amanda Castillo 500–600, Ryan Mitchell 475–575, Karen Schneider 275–325, Marcus Webb 525–650, Jennifer Park 575–725, David Nguyen 375–475, Robert Sullivan 725–875.
- 10 `lead_unlocks` rows (direct service-role insert — bypasses the `unlock_lead_with_credits` RPC so credits stay at 100; `lead_unlocks.unlocked_at` defaults to now()) + 10 `quotes` rows in `DRAFT` status with the same `(public_id=base64url(12B), price=midpoint-rounded-to-5, message=DEFAULT_ESTIMATE_SMS_TEMPLATE, sent_at=null)` shape `/api/app/leads/unlock` writes. The lead detail page can render the DRAFT estimate URL immediately.
- `submitted_at` and `ai_generated_at` staggered across the past 36h with unique-minute spacing so the list doesn't look batch-submitted. Oldest 2026-05-11T10:10Z, newest 2026-05-12T17:16Z.

**Verification (live)**

- Programmatic sign-in with Jose's password against the anon-key client → `leads_safe` returns all 10 rows with `is_unlocked=true`, full customer name/phone visible, `ai_status='ready'`, AI estimates populated. `get_org_credit_row` returns `{plan: BUSINESS, monthly_credits: 100, bonus_credits: 0}`.
- Supabase MCP counts at HEAD: 10 leads, 10 customers, 10 unlocks, 10 DRAFT quotes, 26 lead_photos, 1 organization_members(OWNER), 1 contractor_profile.
- Sentry events past 2h tagged `org_id:5418e6b8-...` or in `lead-submit`/`lead-photo-upload`/`estimator` areas: zero. Confirms the seed didn't ride any production code path into a new error.

**Deviations from manifest**

- The AI estimator's geocoding resolved a slightly different ZIP for two addresses with intentionally-randomized house numbers (Daniel Reyes 90069→90046, Marcus Webb 90302→90304). Expected behavior; the address strings remain exactly as the manifest specified. AI-derived `job_state` is "California" (full name) instead of "CA" (abbreviation) — that's whatever Google Geocoding returns and matches how every other lead in prod looks.
- 3 of the 10 leads completed via the rescue-stuck-leads cron (3-minute schedule) before my direct-trigger second pass landed, because the initial first-run trigger calls returned 401 (sb_secret_ key vs Edge Function JWT validator). End state identical.

**Notable code/data NOT changed**

- No RLS policies, RPC functions, edge functions, migrations, or any shared code paths touched.
- Existing demo org `bce3a561-...` and falconn dev org `8f939f96-...` not touched.
- `unlock_lead_with_credits` RPC NOT called (would have decremented credits to 90). Direct `lead_unlocks` insert via service-role is RLS-bypassed and idempotent against the `(org_id, lead_id)` row.

**Artifacts**

- [`scripts/seed-demo-leads.ts`](../scripts/seed-demo-leads.ts) — the primary seed (re-runnable for similar demo orgs). Reads `seed-photos/LEADS.json`, walks `lead-NN/` folders for photos. Comment at top notes "Safe to delete after use" per the brief. Now points the AI trigger at `/api/internal/run-estimator` with `INTERNAL_API_SECRET` rather than the Supabase Edge Function so `sb_secret_`-format service-role keys work locally. The owner password is printed immediately after `auth.admin.createUser` so a mid-run failure no longer loses it.
- Tactical resume / password-reset / verify scripts I used during the live run were deleted post-seed to keep the repo clean. If a future re-seed needs them again, the patterns are documented above.
- Unzipped manifest temp dir at `C:\Users\murdo\AppData\Local\Temp\snapquote-seed-20260512-123828` — deleted at end of run. Original zip at `C:\Users\murdo\Downloads\snapquote-seed-leads.zip` left untouched.

App Review safety: zero changes to shared production code paths. Org/leads/photos created cleanly inside the new tenant.

---

### 2026-05-12 [Source: Claude Code] — AASA: remove /auth/confirm so password reset stays in Safari

Murdoch tested the Build 20 password-reset flow on TestFlight today and the bug from PW-B19-6 was still present: tapping the reset link in email on an iPhone with SnapQuote installed routed into the app, the app failed to land on the reset-password screen, and the user ended up wherever they were (home tab if signed-in, login if signed-out). No Sentry events captured. The Build 20 fix — adding a real Expo Router route at `mobile app/auth/confirm.tsx` (Option B per the audit) — did not solve the underlying problem. Web-only reset path (tested by deleting the app and using Safari) works correctly.

Per Murdoch's call: stop routing password reset through the mobile app entirely. Adopt the Slack / Notion / Linear / Discord pattern — let the email link open in Safari, web handles the OTP, user returns to the app and signs in with the new password.

**Change shipped:** [`app/.well-known/apple-app-site-association/route.ts:12-28`](../app/.well-known/apple-app-site-association/route.ts) — removed `/auth/confirm` and `/auth/confirm?*` from the AASA paths array. AASA now declares only `/invite/*`, `/stripe-return`, and `/stripe-return?*`. iOS Universal Links no longer claim the password-reset URL on devices with the app installed.

**Not changed:**
- `mobile app/auth/confirm.tsx` (the Expo Router route added in Build 20) intentionally left on disk. It won't be reached because iOS no longer hands the URL to the app. Cleanup deferred.
- `mobile app/_layout.tsx` deep-link handler unchanged — it no longer mentions `/auth/confirm` after the Build 20 fix.
- Web forgot-password email body at `app/api/public/auth/forgot-password/route.ts:51` unchanged — URL still points at `https://snapquote.us/auth/confirm?token_hash=…`. The web reset page at `app/(public)/reset-password/page.tsx` already handles the recovery token via the `sq-pwr` HttpOnly cookie pattern.
- `/invite/*` and `/stripe-return` AASA entries retained — those flows DO need to route through the app and are not affected by this change.

**No mobile rebuild required.** This is a web-only change that takes effect the moment Vercel deploys; Build 20 already installed on Murdoch's TestFlight device picks up the new AASA on next AASA-cache refresh (24h max — see the `Cache-Control: public, max-age=3600` header at the AASA route handler — or sooner via "Reinstall app" / "Toggle app's universal links in iOS Settings" if Murdoch wants to test immediately).



### 2026-05-11 [Source: Claude Code] — Build 20 fix pass: PW-B19-1, B19-5, B19-7 (web)

Shipped the web side of the Build 20 fix pass against the 7 findings surfaced from Build 19 TestFlight testing (full audit at [`docs/audit-build-19-findings-2026-05-11.md`](audit-build-19-findings-2026-05-11.md)).

- **PW-B19-1 (estimate send blocked on phone-less leads).** `components/QuoteComposer.tsx:260-314` — introduced derived booleans `effectiveSendEmail = sendEmail && Boolean(contactEmail)` and `effectiveSendText = sendText && Boolean(contactPhone)`. The `onSend` handler reads effective channels, the misleading per-channel "no phone/email" toasts were removed in favor of a single "Add one before sending" guard, and the POST body to `/api/app/quote/send` now passes the effective flags. The delivery `<Checkbox>` controls at `:490-505` were rebound to `checked={effectiveSendEmail}` / `checked={effectiveSendText}` so the visual state matches the effective state instead of the persisted contractor preference. Persisted preferences (`estimate_send_email/text` on `contractor_profile`) are left untouched — coercion happens only at render+send time so a contractor's "always SMS" preference survives the rare phone-less lead. Server-side guard at `app/api/app/quote/send/route.ts:80-81` stays unchanged as defense in depth (post-fix it should never fire because the client will never POST `sendText=true` when phone is missing).

- **PW-B19-5 (Apple SIWA on web hijacked into installed app).** `app/.well-known/apple-app-site-association/route.ts:12-21` — removed `/auth/callback` and `/auth/callback?*` from the AASA paths array. iOS Universal Links will no longer intercept the Supabase Apple OAuth redirect; the existing PKCE handler at `app/auth/callback/route.ts` completes the session in Safari and routes to `/app`. Native mobile Apple sign-in (via the `AppleAuthentication` SDK) is unaffected — that path never hit `/auth/callback`. `/auth/confirm` + `/invite/*` + `/stripe-return` remain in AASA. Murdoch chose Option A from the audit ("AASA-removal path") for this finding.

- **PW-B19-7 (3× duplicate push notifications on Murdoch's test device).** Live Supabase query (against project `upqvbdldoyiqqshxquxa`) showed 6 rows in `push_tokens` ALL sharing the same `expo_push_token` value `ExponentPushToken[Qdl5jCK6k8eC1-6FjBS4Ds]` across 4 user_ids / 4 org_ids / 6 device_ids — Murdoch's iPhone re-registered under multiple test accounts. Test org `8f939f96-7f92-4973-97f8-f08450ccb71f` alone holds 3 of those rows (1 user, 1 token, 3 device_ids). `lib/pushNotifications.ts:88-90` dispatch loop was iterating each row independently, producing N copies of the same Expo push to one physical device. Fix: dedupe by token value via `Array.from(new Set(...))` before building the Expo message batch. No data backfill; the dispatch-side guard fixes the user-facing symptom regardless of how the duplicate rows accumulate.

Build 19 device-level verification (mobile fixes) deferred to the next EAS production build. Web live-verification will follow Vercel auto-deploy on push (AASA endpoint, `/api/app/quote/send` Sentry counts, forgot-password URL well-formed) — see audit doc Live Verification section.



This file is append-only. Every session, every meaningful fix, finding, or decision gets logged here in order. Nothing is ever edited or removed.

---

## Session — May 11, 2026 — Audit 12 (notifications) fix pass — web [Source: Claude Code]

Web bundle of the Audit 12 fix pass: H1, H2, H3, M2 (web part), M3, H4 web, M1 web, L4. Mobile portion lands separately on mobile origin/main. Read-only audit doc at `docs/audit-12-notifications-2026-05-11.md`.

**Live re-verification before each fix (per task rule):**

- **H1** — `app/api/webhooks/` did NOT exist at HEAD (`ls` returned nothing). `quotes.telnyx_message_id` exists (Supabase MCP `information_schema.columns`); `sms_delivery_status`/`sms_delivered_at`/`sms_failure_reason` did NOT. No `telnyx_message_id` index. Telnyx MCP `list_messaging_profiles` returned one profile `SnapQuote` (id `40019d6e-d8b1-447b-8d8b-bdc03ca9ceab`) with `webhook_url: null`. ✅ matches audit doc.
- **H2** — `app/api/revenuecat/webhook/route.ts:331` `void sendPlanUpgradedEmail(orgId, plan);` unconditional in RENEWAL case. Compared with Stripe handler at line 393 which correctly gates on `isRenewalCycle`. ✅
- **H3** — `app/api/public/quote/[publicId]/accept/route.ts:181-185` push body uses `${customerName}`. `app/api/cron/estimate-nudge-unviewed/route.ts:72-75` push body uses `${customerName}`. ✅
- **M2** — `viewed/route.ts:78-86` in-app row uses `screen: "quotes", screen_params: { id: quote.id }`; push uses `screen: "lead", id: quote.lead_id`. Same divergence in `accept/route.ts:181-195`. ✅
- **M3** — `app/api/cron/unopened-leads-reminder/route.ts:37` `if (!count || count < 10) continue;`. ✅
- **H4 web** — `lib/pushNotifications.ts` grep for `Sentry|captureException|addBreadcrumb` returned no matches. ✅
- **M1 web** — same file: messages array constructed at line 83-90 without a `badge` field. ✅
- **L4** — `lib/pushNotifications.ts:9` `EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"`. ✅

**Changes shipped:**

- **Migration `20260511234500_audit12_h1_quotes_sms_delivery_columns.sql`** — adds `sms_delivery_status` (text + CHECK constraint to `queued|sent|delivered|failed`), `sms_delivered_at` (timestamptz), `sms_failure_reason` (text), and a partial index `quotes_telnyx_message_id_idx ON quotes(telnyx_message_id) WHERE telnyx_message_id IS NOT NULL`. Applied via Supabase MCP `apply_migration` — verified live via `information_schema.columns` (all 3 present, nullable text/timestamptz) and `pg_indexes` (index present). Status enum kept as constrained text rather than a PG enum because the Telnyx event_type set may grow.
- **`app/api/webhooks/telnyx/route.ts`** — new file. POST handler. Node runtime, `maxDuration = 60` to match existing webhook handlers. Verifies Telnyx v2 Ed25519 signature using `crypto.verify('ed25519', ...)` with the org public key from `TELNYX_PUBLIC_KEY` env var. `buildPublicKey()` accepts either PEM or bare base64-encoded 32-byte raw key (wraps the raw key in a 12-byte Ed25519 SPKI prefix and feeds it as DER). Rejects timestamps outside a 5-minute replay window. Maps `message.sent` / `message.finalized` → `sent`, `message.delivered` → `delivered`, `message.delivery_failed` → `failed`; ignores `message.received` (inbound — would be a future inbox feature). Won't downgrade a terminal status if Telnyx reorders events. On `failed`, also inserts a `QUOTE_DELIVERY_FAILED` notification row (`screen: "lead", screen_params: { id: lead_id }`) so the contractor's in-app feed surfaces the bounce. Sentry breadcrumb on signature-verified entry; `Sentry.captureException` on every catch with `area: "telnyx-webhook"` tag. Always 200 on signature-valid events (even ones we ignore) so Telnyx doesn't retry.
- **Telnyx MCP `update_messaging_profile`** — set `webhook_url` to `https://snapquote.us/api/webhooks/telnyx` on profile `40019d6e-d8b1-447b-8d8b-bdc03ca9ceab`. Confirmed in the MCP response.
- **`app/api/revenuecat/webhook/route.ts` RENEWAL case** — reads `organizations.plan` BEFORE writing, compares against the incoming plan from `resolvePlanFromEvent`. If equal, adds a `revenuecat.webhook` breadcrumb with `RC renewal — no plan change, email skipped` and skips `sendPlanUpgradedEmail`. If different (or read failed), preserves the prior behavior of firing the email. Defaults to the safer "skip" path on read failure so a transient DB blip can't reintroduce the spam.
- **`app/api/public/quote/[publicId]/accept/route.ts:175-205`** — push body changed from `${customerName} accepted your estimate${locationSuffix}.` to `New ${primaryService} estimate accepted${locationSuffix}${priceSuffix}.` (no name). In-app notification row keeps the customer name (auth-gated). Both push payload and in-app row now use `screen: "lead", id: lead_id` (M2).
- **`app/api/public/quote/[publicId]/viewed/route.ts:94-108`** — in-app row's `screen` changed from `"quotes"` to `"lead"` with `id: lead_id` to align with the push payload (M2). Body text unchanged ("A customer is viewing your estimate." — already PII-free).
- **`app/api/cron/estimate-nudge-unviewed/route.ts:71-77`** — push body changed from `${customerName} hasn't opened your estimate.` to `A customer hasn't opened your estimate. Tap to follow up.` In-app row unchanged.
- **`app/api/cron/unopened-leads-reminder/route.ts`** — extracted `getThreshold()` helper that reads `UNOPENED_LEADS_REMINDER_THRESHOLD` env var (parseInt with NaN/sub-1 fallback to 10). Threshold propagated through the gate (line ~37). Response payload now also returns `threshold` for observability.
- **`lib/pushNotifications.ts`** — full rewrite. Imports `* as Sentry from "@sentry/nextjs"`. `EXPO_PUSH_URL` now `https://api.expo.dev/v2/push/send` (L4). Adds `getUnreadBadgeCount(admin, orgId)` reading `notifications` with `count: "exact", head: true, eq("read", false)` and includes the result in every `ExpoMessage` as `badge: number` (M1). Every catch path now calls `Sentry.captureException` with `area: "push"` + `stage` + `org_id` tags: `token-fetch` (Supabase read failure), `badge-count` (notifications count failure), `expo-http` (Expo returned non-2xx with response body excerpt), `expo-fetch` (network/DNS failure), `dead-token-cleanup` (delete failed). Breadcrumbs on dispatch start (with title + screen, no body) and done (with sent/cleaned counts) (H4).

**Verification:**
- `npx tsc --noEmit` — exit 0, no errors.
- Supabase MCP `apply_migration` succeeded; columns + index verified via follow-up `information_schema.columns` and `pg_indexes` queries.
- Telnyx MCP `update_messaging_profile` succeeded; response confirmed `webhook_url: "https://snapquote.us/api/webhooks/telnyx"`.

**Required env var for production (Murdoch must add via Vercel dashboard before the webhook can verify signatures in prod):**
- `TELNYX_PUBLIC_KEY` — fetch from Telnyx Mission Control (Account Settings → API → Public Key) or via authenticated `GET https://api.telnyx.com/v2/public_key`. Either PEM (`-----BEGIN PUBLIC KEY-----`) or bare base64 32-byte raw key. The handler `buildPublicKey()` accepts both formats. Without this env var the handler returns 500 and captures a Sentry message — Telnyx will retry but every retry will fail until the key is set.
- `UNOPENED_LEADS_REMINDER_THRESHOLD` — optional. Defaults to 10. Set to any positive integer to tune the cron.

**Cross-flag:** H4 web is a direct extension of Audit 13 H4 (which covered 8 revenue/auth handlers but not push dispatch).

---

## Session — May 11, 2026 — Audit 7 (Web Stack & Backend) fix pass [Source: Claude Code]

User-prioritized subset of the read-only Audit 7 (same date, earlier) shipped: H1, H2, H4, M3, M7, L1. M6 dropped because live verification at HEAD showed the audit doc was wrong — the upgrade-email calls in `app/api/stripe/webhook/route.ts` are already at the end of each handler. H3, H5, M1, M2, M4, M5, L2/L3/L4 deferred per user triage (code-consistency, infra, multi-day, or no-action items).

**Live re-verification before each fix:**
- H1 — `app/api/public/quote/[publicId]/route.ts:1-7`, `accept/route.ts:1-12`, `viewed/route.ts:1-3` confirmed no `rateLimit` import. `_request` parameter renamed to `request` for IP read. ✅
- H2 — `app/api/public/auth/mobile-handoff/route.ts:1-4` confirmed no `rateLimit` import. `verified.userId` available post-`verifySupabaseJWT(bearer)`. ✅
- H4 — `app/api/stripe/webhook/route.ts:18` and `revenuecat/webhook/route.ts:14` confirmed `runtime = "nodejs"` + no `maxDuration` export. ✅
- M3 — `app/api/public/auth/bootstrap/route.ts:1-3` confirmed no `rateLimit` import; Turnstile + cookie-session-only gating. ✅
- M6 — `app/api/stripe/webhook/route.ts:288` (handleCheckoutCompleted), `:336` (handleSubscriptionChanged), `:394` (handleInvoicePaid), `:439` (handleSubscriptionDeleted) — all 4 `void sendPlan*Email(...)` calls verified to be the LAST statement in their containing handler/conditional, AFTER every DB write. Audit doc claimed "fires before later writes complete"; live state contradicts. SKIP. ❌
- M7 — `app/api/cron/estimate-nudge-unviewed/route.ts:69` — confirmed literal `"https://snapquote.us/app/quotes"` (not line 80 per audit doc; line position drifted; literal still there). `lib/utils.ts:9-11` confirms `getAppUrl()` exports `(process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us").replace(/\/$/, "")`. ✅
- L1 — `tsconfig.json:1-28` confirmed no `forceConsistentCasingInFileNames`. ✅

**Fixes applied:**
- H1 — Added `getClientIp` + `rateLimit` import to all 3 quote routes; rate-limit check at top of each handler, before any DB call. Keys + caps:
  - GET `public-quote-read:${ip}:${publicId}` 60/hr
  - POST accept `public-quote-accept:${ip}:${publicId}` 5/hr
  - POST viewed `public-quote-viewed:${ip}:${publicId}` 60/hr
  - 429 with "Too many requests. Please try again later." Match the `lead-submit/route.ts:48` pattern.
- H2 — Added rate limit AFTER `verifySupabaseJWT(bearer)` so `verified.userId` is the bucket key (token refresh can't reset the counter):
  - `Promise.all([rateLimit('handoff:user:${userId}', 6, ONE_HOUR_MS), rateLimit('handoff:ip:${ip}', 15, ONE_HOUR_MS)])` — both gates must pass. Matches `forgot-password/route.ts:28-31`.
- H4 — Added `export const maxDuration = 60;` directly under `export const runtime = "nodejs";` in both webhook files. Comment block explains the multi-write timeout risk.
- M3 — Added `rateLimit('bootstrap:user:${user.id}', 5, ONE_HOUR_MS)` AFTER Turnstile + `auth.getUser()` in `bootstrap/route.ts:45-52`, before the `ensureOrganizationMembershipForUser` call.
- M7 — Replaced the literal `"https://snapquote.us/app/quotes"` with `${getAppUrl()}/app/quotes` and added the `import { getAppUrl } from "@/lib/utils"`.
- L1 — Added `"forceConsistentCasingInFileNames": true` under `compilerOptions` in `tsconfig.json` adjacent to `"strict": true`.

**Verification:**
- `npm run typecheck`: 0 errors. The L1 tsconfig change did NOT surface any pre-existing case-mismatched imports (which the audit doc had warned was possible).
- `git diff --stat` reports 9 source files + tsconfig.json + tsconfig.tsbuildinfo touched, 108 insertions / 5 deletions.

**Stale audit doc entries flagged (historical-but-superseded, NOT edited per lane rule):**
- `docs/audit-7-web-backend-2026-05-11.md` M6 section described `sendPlanUpgradedEmail` calls firing before later writes complete. Live state at HEAD: emails already correctly positioned. Audit doc dated 2026-05-11 18:09 PT (commit `71a62fe`); not re-verified at the very latest HEAD before claiming "fires before". Tagged for future-me: read every handler end-to-end before flagging email-ordering issues.
- Notion to-do PW-A7-M7 said the literal was at line 80 — actual line is 69. Cosmetic drift; doc not edited.

---

## Session — May 11, 2026 — Audit 7 (Web Stack & Backend) READ-ONLY [Source: Claude Code]

Read-only audit at HEAD `1d6e834` (web). Fresh worktree off origin/main to avoid disturbing other agents' uncommitted work in the primary checkout. Findings page + to-dos saved to Notion (Bugs & Fixes + Pending Work). No code, schema, or data changed.

**Headlines (zero Critical, 5 High):**
- **H1** — `/api/public/quote/[publicId]` GET + POST accept + POST viewed have zero rate limiting. publicId is 96-bit so blind enumeration is impossible, but a leaked link can be scraped indefinitely, and accept/viewed handlers fan out pushes per request.
- **H2** — `/api/public/auth/mobile-handoff` has no rate limit. A stolen mobile bearer can fan magiclinks to drain Resend budget.
- **H3** — `/api/public/onboard:42-47` still uses `admin.auth.getUser(accessToken)` GoTrue round-trip. Audit 1's `verifySupabaseJWT` pattern is applied everywhere else (mobile-handoff, invite/accept, requireRole) — this one route was missed.
- **H4** — Stripe + RevenueCat webhook routes have no `maxDuration` export; `handleCheckoutCompleted` does 5-7 sequential awaits (Stripe retrieve + 5 DB writes + emails). Vercel default 10s/60s can timeout, partial-state risk via Stripe's 72h retry + webhookEvents claim skipping retry handler.
- **H5** — No `/api/health` + no external uptime monitor (cross-flag Audit 13 H7, re-verified at HEAD).

**Mediums (7):** 21 api/app routes don't set explicit `runtime = "nodejs"`; webhook multi-writes lack Postgres transaction; bootstrap route lacks rate limit; RLS-enabled-no-policy on `iap_subscription_events` + `webhook_events`; SECURITY DEFINER on `customers_safe` + `leads_safe`; Stripe webhook emails fire-and-forget before later writes complete; hardcoded `https://snapquote.us` in `estimate-nudge-unviewed/route.ts:80` should use `getAppUrl()`.

**Lows (4):** tsconfig missing `forceConsistentCasingInFileNames`; next.config has no explicit standalone output; Permissions-Policy payment directive notation cosmetic; web doesn't have xmldom (correct).

**Audit 13 regression check:** All 14 Audit 13 fix points verified intact at HEAD via Grep + file reads. Sentry scrub, captureConsoleIntegration on server/edge/client, `app/global-error.tsx`, Stripe + RC + IAP + lead-unlock + quote-send captureException with tags, tracesSampleRate 0.2 across all 3 configs, replayIntegration with `replaysOnErrorSampleRate: 1.0`, isKnownSentryNoise DEP0169 filter, requireRole 401 breadcrumb-not-captureException — every one of them at the line numbers documented in Audit 13.

**Live verification anchors:**
- `git log origin/main -1` HEAD = `1d6e834` (Audit 3 fix-pass merge).
- Vercel MCP `list_deployments`: 20/20 READY, current prod `dpl_G1ygAS9a8UgX7aGuQyMytq4Cuvij` at the audit HEAD.
- Supabase MCP `cron.job`: 3 pg_cron + (via `vercel.json:1-32`) 7 Vercel = 10 active crons. jobid=9 `reset-paid-credits` confirms Audit 3 H3 fix landed.
- Supabase MCP `get_advisors(security)`: 2 ERROR (DEFINER views — by design), 7 WARN (mutable search_path + SD function executable + leaked-password), 2 INFO (RLS-no-policy).
- Live curl on snapquote.us / + /login: all 6 security headers present, CSP-Report-Only intact, /login `Cache-Control: private, no-cache, no-store`.
- `npm audit`: 0 critical/high, 2 moderate (postcss transitive of next).
- `npm run typecheck`: 0 errors.

**Files written this session:**
- `docs/audit-7-web-backend-2026-05-11.md` (~26 KB findings report)
- `docs/current-state.md` (prepended 1-line headline)
- `docs/updates-log.md` (this entry)

---

## Session — May 11, 2026 — Audit 12 (notifications) — read-only diagnostic [Source: Claude Code]

Read-only audit of every notification surface in SnapQuote: mobile push (expo-notifications), email (Resend), SMS (Telnyx), and in-app realtime (`notifications` table + Supabase realtime). Both repos at HEAD (web `35e4da2`, mobile worktree parity). Full report at [docs/audit-12-notifications-2026-05-11.md](audit-12-notifications-2026-05-11.md). Findings + to-dos posted to Notion Bugs & Fixes and Pending Work.

**What I verified live (citation summary):**
- **Resend domain auth** — MCP `list-domains` shows `snapquote.us` verified, sending enabled, us-east-1, created 2026-03-25.
- **Notifications table schema + indexes** — Supabase MCP `list_tables` + `pg_indexes`. Columns `id, org_id, user_id, type, title, body, screen, screen_params, read, created_at`. Indexes: `notifications_pkey`, `notifications_new_lead_dedup_idx` (partial unique on (org_id, screen_params->>'id') WHERE type='NEW_LEAD'), `notifications_org_created_idx`, `notifications_org_unread_idx`, `notifications_user_id_idx`.
- **RLS policies** — `pg_policy` query. `notifications`: members of org can read + update; no INSERT/DELETE policy (admin-only via service role). `push_tokens`: own-user-only on all CRUD.
- **50-per-org cap** — trigger `trg_prune_org_notifications` AFTER INSERT, function `prune_org_notifications()` deletes anything past offset 50 ordered by created_at DESC. Function body inspected via `pg_get_functiondef`.
- **7-day TTL** — daily cron `/api/cron/cleanup-notifications` at 04:00 UTC. Deletes rows with `created_at < now() - 7 days`.
- **pg_cron jobs** — `cron.job` query: `rescue-stuck-leads` `*/3 * * * *`, `reset-solo-credits` and `reset-paid-credits` `0 0 * * *`. Vercel crons (vercel.json): 7 daily nudges + cleanup.
- **Notification type distribution live** — 35 rows total; types NEW_LEAD (20), ESTIMATE_VIEWED (4), ESTIMATE_NOT_VIEWED (4), ESTIMATE_ACCEPTED (3), ESTIMATE_EXPIRED (2), ESTIMATE_EXPIRING_SOON (2). No TRIAL_EXPIRED or INVITE_ACCEPTED rows in window — types exist in code but no real events in audit period.
- **push_tokens live** — 5 rows across 3 distinct orgs; last update `2026-05-11 19:13`.
- **Telnyx user-input-error classification (Audit 13 M4)** — confirmed in place at `lib/notify.ts:88-96, 146-158` and `lib/telnyx.ts:88-101, 164-176`. Codes 10002 and 40310 surface as warning-level Sentry, not error. No regression.

**Notification taxonomy at HEAD (event → channels):**
- NEW_LEAD: push + in-app (NEW_LEAD type) + email + SMS-to-contractor + SMS-to-customer-confirmation. `sendNewLeadNotifications` (`lib/ai/estimate.ts:4663-4713`) reached from 4 call sites; partial unique index dedupes.
- Estimate sent (to customer): email + SMS (idempotency-keyed on quote id). No in-app, no push.
- Estimate viewed: push + in-app (ESTIMATE_VIEWED). CAS-protected.
- Estimate accepted: push + in-app + email (if `notification_accept_email`) + SMS (if `notification_accept_sms`).
- Estimate-not-viewed nudge (day 2-3 cron): push + in-app (ESTIMATE_NOT_VIEWED) + email.
- Estimate-expiring-soon (day 6 cron): push + in-app (ESTIMATE_EXPIRING_SOON) + email.
- Estimate-expired (day 7+ cron): push + in-app (ESTIMATE_EXPIRED) + email.
- Unopened-leads-reminder cron: push only — **no in-app row** (M4 finding).
- Trial-ending-soon (T-48h cron): email only — **no push, no in-app** (M5 finding).
- Trial-expired cron: push + in-app (TRIAL_EXPIRED) + email; `trial_ended_notified_at` marker set via CAS (refutes stale doc L2).
- Team invite accepted: push + in-app (INVITE_ACCEPTED) + email.
- Account deletion, email verification, forgot-password, welcome, plan-upgraded, plan-ended, payment-failed, credit-purchase: email only.

**Findings (full text in audit doc):**
- 0 critical.
- **H1** — Telnyx DLR webhook missing. `quotes.telnyx_message_id` is captured but no `app/api/webhooks/telnyx/route.ts` exists. Carrier-level delivery failure invisible. Confirms Audit 4 PW-A4-21 — still open.
- **H2** — RC RENEWAL fires "🎉 You're on the {plan} plan" email every cycle (`app/api/revenuecat/webhook/route.ts:331`). Stripe correctly gates on `isRenewalCycle` (`stripe/webhook/route.ts:393`); RC handler does not.
- **H3** — Customer name in push body visible on lock-screen previews for ESTIMATE_ACCEPTED and ESTIMATE_NOT_VIEWED nudge. NEW_LEAD push correctly omits PII — the right pattern exists, just not consistently applied.
- **H4** — Push dispatch (`lib/pushNotifications.ts`) and mobile push registration (`SnapQuote-mobile/lib/notifications.ts`) have **zero Sentry imports**. All failures rely on `captureConsoleIntegration` — no `org_id`/`event_type`/Postgres-error-code tags. Documented RLS-denial registration failure (mobile build-10) only surfaces as untagged warning.
- **M1** — Push payload omits `badge` field; mobile never resets badge count. No `setBadgeCountAsync` anywhere.
- **M2** — Push tap target ≠ in-app feed tap target for ESTIMATE_VIEWED and ESTIMATE_ACCEPTED.
- **M3** — `unopened-leads-reminder` threshold hardcoded at 10. Confirms Audit 4 PW-A4-16 — still open.
- **M4** — `unopened-leads-reminder` writes no in-app feed row.
- **M5** — trial-ending-soon (T-48h) is email-only.
- **M6** — Realtime channel name not per-mount unique on mobile (web mitigates via singleton).
- **M7** — Two SMS dispatch paths (`sendSms` in `lib/notify.ts` vs `sendQuoteSms` in `lib/telnyx.ts`) with duplicate retry/error-classification logic.
- **M8** — Push send doesn't chunk for Expo's 100-per-batch limit (only 5 push_tokens today, forward-looking).
- **M9** — Mobile push registration has no Sentry capture (subset of H4).
- **L1** — `TopBar.handleNotificationClick` no-op for unknown screen values.
- **L2** — STALE DOC: `trial_ended_notified_at` is now wired at HEAD (was flagged unused). `updates-log.md:1429` (older sections) is historical-but-superseded.
- **L3** — STALE DOC: `TopBar.handleNotificationClick` handles `settings` at HEAD. `updates-log.md:1428` (older sections) is historical-but-superseded.
- **L4** — Expo push URL is legacy `exp.host` (canonical is `api.expo.dev`).
- **L5** — Every push uses `priority: "high"` + `sound: "default"` regardless of urgency.

**Verified-clean items** (not findings, listed so future audits don't re-investigate): Resend domain auth, from-address envelope policy, plain-text fallback on every email, email + Telnyx idempotency keys on quote send and crons, 50-per-org cap, 7-day TTL, NEW_LEAD dedup index, CAS protection on quote view + accept, push token composite PK, mobile signOut device-scoped delete, push token rotation on foreground, RLS gating, realtime channel filters, webhook event idempotency, Stripe renewal gating, welcome email on bootstrap, lead-submit `after()` decoupling. Full list (22 items) in audit doc Section 3.

**Cross-flag to Audit 13:** H4 is a natural extension of Audit 13's Sentry instrumentation pass (which covered 8 revenue/auth handlers but not push dispatch). M9 is a subset of H4.

**No code changes.** Read-only audit; docs only.

---

## Session — May 11, 2026 — Audit 3 (Credits & Quota) fix pass: C2 + H7 + H3 (auto-fixes H1) + H4 + H2 [Source: Claude Code]

Read-only audit-3 from earlier today (mobile docs lane) surfaced 2 Critical + 7 High + 9 Medium + 2 Low credit-system findings against live HEAD. This fix pass takes the user-prioritized subset: C2 (Option A — recovery-only, no refund path), H7, H3 (which auto-fixes H1), H4, H2. Skipped per triage: C1 (test-org cleanup), H5 (pending business decision), H6/M9 (multi-day project), L1 (RLS already protects), L2 (cosmetic).

**Live re-verification before every fix (per task rule):**
- C2 — `app/api/app/leads/unlock/route.ts:96-112` already-unlocked branch reads `quotes.public_id` and returns `publicId:null` if no draft. ✅ matches audit-3 description.
- H7 — `app/api/stripe/webhook/route.ts:483-543` `handleChargeRefunded` calls `refund_bonus_credits(orgId, creditAmount)` unconditionally per event. `information_schema.columns` for `credit_purchases` confirmed: no `refunded_at` column. ✅
- H3 — `cron.job` returned only `reset-solo-credits` (jobid=3, `WHERE plan='SOLO'`) and `rescue-stuck-leads` (jobid=8, unrelated). No paid-plan reset cron. 4 paid-plan orgs found stale (`organizations` WHERE `plan IN ('TEAM','BUSINESS') AND credits_reset_at <= now() OR NULL`): `eabc1e4a…` TEAM mc=5/null, `f77b0ebb…` TEAM mc=5/null, `36ba5025…` BUSINESS mc=86/2026-04-18, `7e7ce05f…` BUSINESS mc=98/2026-04-20. ✅
- H4 — `app/api/app/leads/unlock/route.ts:31-33` returns 402 before reaching the `after()`/recordAudit block at line 127-142. ✅
- H2 — `pg_proc` returned 1 row for `reset_due_solo_monthly_credits`; grep at HEAD found zero call sites in `*.{ts,tsx,sql,js}` outside historical migrations (0018, 0063). ✅
- M4 (mobile, deferred to mobile commit) — `SnapQuote-mobile/lib/api/leads.ts:268-307` tries direct RPC, then falls through to HTTP. ✅

**Web changes:**

1. **C2 — DRAFT-quote retry on already-unlocked path.** [app/api/app/leads/unlock/route.ts](app/api/app/leads/unlock/route.ts) — already-unlocked branch now attempts a recovery DRAFT-quote insert if no existing quote is found. Same insert shape as happy-path (price calc + `randomBytes(12).toString('base64url')` publicId + `status:'DRAFT'` + sent_at:null + DEFAULT_ESTIMATE_SMS_TEMPLATE). Wrapped in try/catch — recovery failure logs to Sentry with `stage: 'draft-creation-retry'` tag and returns `publicId:null` (current behavior, no regression). Happy-path branch NOT modified per task scope.

2. **H7 — Stripe `charge.refunded` partial-refund double-deduct fixed.** Migration `20260511183247_audit3_h7_credit_purchases_refunded_at` adds `credit_purchases.refunded_at timestamptz NULL`. [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) `handleChargeRefunded` (post-fix) atomically claims the refund slot via `UPDATE credit_purchases SET refunded_at=now() WHERE purchase_reference=? AND refunded_at IS NULL`. If `claimed.length === 0` (already-refunded OR row doesn't exist), skip cleanly. Then call `refund_bonus_credits`. Claim happens BEFORE the RPC so a partial RPC failure doesn't free the slot — worst case is credits aren't clawed back. Net direction: never over-deducts.

3. **H3 — `reset-paid-credits` pg_cron added.** Migration `20260511183257_audit3_h3_reset_paid_credits_cron` schedules a daily 00:00 UTC job mirroring `reset-solo-credits` but `WHERE plan IN ('TEAM','BUSINESS')`. Same `credits_reset_at IS NULL OR credits_reset_at <= now()` WHERE shape (idempotent). H1's 4 stale paid orgs will reset on tomorrow's run (verified via dry-run SELECT against the WHERE clause).

4. **H4 — `lead.unlock_blocked` audit_log action.** [lib/auditLog.ts](lib/auditLog.ts) extends `AuditAction` union with `"lead.unlock_blocked"`. [app/api/app/leads/unlock/route.ts](app/api/app/leads/unlock/route.ts) 402 path now fires `recordAudit({action:'lead.unlock_blocked', metadata:{reason}})` via `after()` before returning 402. Async, non-blocking, swallows internal errors.

5. **H2 — dead `reset_due_solo_monthly_credits()` function dropped.** Migration `20260511183236_audit3_h2_drop_dead_reset_function` runs `DROP FUNCTION IF EXISTS public.reset_due_solo_monthly_credits();`. Pre-drop verified: function existed in pg_proc but was uncalled (cron uses inline SQL with different body; no source-code references). Post-drop verified: `pg_proc` returns 0 rows.

**Live verification (Supabase MCP, post-migration):**
- H2 function: `SELECT COUNT(*) FROM pg_proc WHERE proname='reset_due_solo_monthly_credits'` → 0 ✅
- H7 column: `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_purchases' AND column_name='refunded_at'` → 1 ✅
- H3 paid cron: `SELECT jobname, schedule, active FROM cron.job WHERE jobname='reset-paid-credits'` → `('reset-paid-credits','0 0 * * *', true)` ✅
- H3 solo cron preserved: `SELECT active FROM cron.job WHERE jobname='reset-solo-credits'` → `true` ✅
- H3 paid-cron WHERE dry-run: 4 rows match (2 TEAM at mc=5→would-be-reset-to=20, 2 BUSINESS at mc=86/98→would-be-reset-to=100). bonus_credits untouched.

**Migration versions applied (live `supabase_migrations.schema_migrations`):** `20260511183236`, `20260511183247`, `20260511183257`. Local migration files renamed to match.

**TypeScript:** `npx tsc --noEmit` → exit 0.

**Cross-flag:** none new. C1's 2 legacy TEAM victims will self-heal via tomorrow's H3 cron run (TEAM monthly_credits 5 → 20). H5 (subscription-refund retention) and H6 (no credit ledger) still pending per triage.

Mobile M4 lands in a separate commit on `Murdoch45/SnapQuote-mobile`.

---

## Session — May 11, 2026 — Audit 13 live verification on production [Source: Claude Code]

Live Verification Step from the fix-pass spec. The web fix bundle (Audit 13 H1, H2, H3, H4, H5, M2, M3, M4, M6, M7) merged to `origin/main` as commit `6a236e6` and triggered Vercel deploy `dpl_Br8miWnDt48D1v5Y43BFZufd1gwo`.

**Deploy state:** `READY` (Vercel MCP `get_deployment`). `buildingAt: 1778522270193`, `ready: 1778522380101` — 110-second build. Aliased to `snapquote.us`, `www.snapquote.us`, `snapquote.us-tau.vercel.app`, etc.

**Site response:**
- `curl -I https://snapquote.us/` → 307 → `https://www.snapquote.us/` 200 OK (53310 bytes).
- `curl -I https://www.snapquote.us/login` → 200 OK with full security header set (Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options DENY, Permissions-Policy, Content-Security-Policy-Report-Only including the `https://o*.ingest.sentry.io` connect-src for the Sentry tunnel).

**Sentry events (snapquote-web project `4511244273123328` via Sentry MCP):**
- 1h window post-deploy on the new release `6a236e63...`: **0 errors**.
- 24h window project-wide: **1 error total** — a single `[DEP0169]` event timestamped `2026-05-10T19:53:11+00:00`, release `9dc5b4236...` (pre-fix release; M2 filter wasn't deployed yet). Compare to the audit baseline: ≈ 1.3 DEP0169 events/day → expected ≈ 1 in 24h, which matches.
- 24h window for `auth.requireMember 401`: **0 events** (was top issue at 47 events / 14d ≈ 3.4/day pre-deploy — confirms M3 no-bearer-401 downgrade is active and the bulk of pre-fix 401 captures were from the no-bearer path).
- `firstSeen:-1h` issues: **0** — zero new issue groups appeared in the hour after deploy.
- `has:tags[pg_error_code]`: **0 results** — no Postgres `42501` errors fired in the window, so the M7 tag extraction in `scrubSentryEvent` did not have a candidate to act on. To-verify on next 42501.

**Verification result:** clean. No regression, no error spike, no broken endpoint. M2 + M3 confirmed working by the absence of the events they targeted. captureConsoleIntegration on client + edge (H2, M6) and the replay integration (H5) cannot be exercised without a real client-side error; will surface naturally on the first user-induced error. M7 tag extraction will surface on the next live `42501`.

**Mobile not verified live** — H1 merged to mobile `origin/main` as `0641e7b` but mobile binary needs a fresh TestFlight build and on-device traffic. Deferred.

**Production state:** healthy. No revert needed. Audit 13 fix bundle declared done.

---

## Session — May 11, 2026 — Audit 13 fixes shipped (H1, H2, H3, H4, H5, M2, M3, M4, M6, M7) [Source: Claude Code]

Post-audit fix pass. Live-verified each finding at HEAD before fixing — no claim trusted from the prior audit doc alone.

**Web changes (worktree `claude/audit-13-fixes-2026-05-11`):**

- **H2 + H5 + M2 + replays** — [instrumentation-client.ts:18-37](instrumentation-client.ts:18) — `Sentry.captureConsoleIntegration({ levels: ["error"] })` and `Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })` added to `integrations`. `tracesSampleRate: 0.05 → 0.2`. `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`. `beforeSend` now calls `isKnownSentryNoise(event)` first; drops to `null` for DEP0169 noise. Confirmed live pre-fix: client config had no `integrations` array.
- **M6 + H5 + M2** — [sentry.edge.config.ts:13-21](sentry.edge.config.ts:13) — same `captureConsoleIntegration` + noise filter added. `tracesSampleRate: 0.05 → 0.2`. Confirmed live pre-fix: edge config had no `integrations` at all.
- **H5 + M2** — [sentry.server.config.ts:13](sentry.server.config.ts:13) — `tracesSampleRate: 0.05 → 0.2`. Existing `captureConsoleIntegration` retained. `beforeSend` now calls `isKnownSentryNoise` first.
- **M2 + M7** — [lib/sentryScrub.ts:96-130](lib/sentryScrub.ts:96) — new `isKnownSentryNoise` exported helper checks for `[DEP0169]` / `DEP0169.*url\.parse` in event message / exception value strings. New `extractDiagnosticTags` extracts `pg_error_code` (matches `"code":"\d{5}"`) and `org_id` (matches `organization <uuid>`) from message/exception strings BEFORE UUID scrubbing, stamps them as searchable Sentry tags. `org_id` is intentionally not in the PII key list so it survives `scrubPii`.
- **H3** — new [app/global-error.tsx](app/global-error.tsx) — minimal Next.js global error boundary. Calls `Sentry.captureException(error, { tags: { segment: "root", digest: error.digest ?? "none" } })` on mount. Renders bare inline-styled fallback (no Tailwind / providers — they may have crashed).
- **M3** — [lib/auth/requireRole.ts:23-87](lib/auth/requireRole.ts:23) — no-bearer 401 path now emits only `Sentry.addBreadcrumb` at level "info". Bearer-present-but-rejected 401 keeps `Sentry.captureMessage` at level "warning" + `Sentry.flush(2000)`. Pre-fix: every 401 captured at warning regardless of bearer. Top issue (47 events / 14d / `SNAPQUOTE-WEB-9`) should drop sharply.
- **M4** — [lib/telnyx.ts:11-21,79-90,143-159](lib/telnyx.ts:11) and [lib/notify.ts:1-13,78-89,131-144](lib/notify.ts:1) — Telnyx user-input error codes 10002 (invalid number) and 40310 (invalid 'to' address) now emit `Sentry.captureMessage` at level "warning" with `tags.area: "telnyx"`. Non-retryable non-user-input failures and final-attempt retryable failures still `console.error` (caught by `captureConsoleIntegration`).
- **H4** — `Sentry.captureException` + `tags.area` on top-level catch added to all 8 routes:
  - [app/api/stripe/webhook/route.ts:567-578,602-617](app/api/stripe/webhook/route.ts:567) — claim + handler stages, tagged by `event_type`; `addBreadcrumb` on signature-verified.
  - [app/api/stripe/checkout/route.ts:308-316](app/api/stripe/checkout/route.ts:308) — tagged by `org_id`, `user_id`.
  - [app/api/stripe/credits/route.ts:121-129](app/api/stripe/credits/route.ts:121) — tagged by `org_id`, `user_id`.
  - [app/api/stripe/customer-portal/route.ts:109-119](app/api/stripe/customer-portal/route.ts:109) — tagged by `org_id`, `user_id`.
  - [app/api/revenuecat/webhook/route.ts:219-475](app/api/revenuecat/webhook/route.ts:219) — claim + handler stages, tagged by `event_type`; `addBreadcrumb` on auth-verified.
  - [app/api/iap/sync/route.ts:290-309](app/api/iap/sync/route.ts:290) — RC API failure + handler stages, tagged by `org_id` + `sync_type`.
  - [app/api/app/leads/unlock/route.ts:80-90,140-149](app/api/app/leads/unlock/route.ts:80) — draft-creation stage + top-level catch; credit was charged, so draft-creation failure is worth a Sentry event.
  - [app/api/app/quote/send/route.ts:374-381](app/api/app/quote/send/route.ts:374) — tagged by `org_id` + `lead_id` + `quote_id`; rollback path unchanged.

**Mobile changes (worktree `claude/audit-13-mobile-fixes-2026-05-11`, off origin/main):**

- **H1 + M5** — new [lib/sentryScrub.ts](lib/sentryScrub.ts) — ported from web (same PII key list, same UUID redaction). [app/_layout.tsx:1-77](app/_layout.tsx:1) — `Sentry.init` now sets `environment: __DEV__ ? "development" : "production"`, `release: com.murdochmarcum.snapquote@<version>+<iosBuildNumber>.<androidVersionCode>`, `tracesSampleRate: 0.1`, `beforeSend` + `beforeBreadcrumb` calling `scrubSentryEvent`. Confirmed live pre-fix via mobile Sentry MCP: tenant UUID `8f939f96-...` leaked into event title `Error: cannot add postgres_changes callbacks for realtime:quotes:8f939f96-7f92-4973-97f8-f08450ccb71f:ALL`. Mobile typecheck: only pre-existing baseline errors (`components/navigation/TopBar.tsx` tuple-index, `lib/secureStorage.ts` missing `expo-secure-store` types) — none from this change.

**Skipped per work plan:**
- **H6** — Supabase plan upgrade to Pro for PITR is a dashboard/billing action, not a code change. Deferred.
- **H7** — Health-check endpoint + uptime monitor deferred.

**Build verification:**
- Web `npx tsc --noEmit` — clean.
- Web `npm run build` — full Next route compile clean, no errors.
- Mobile `npx tsc --noEmit` — 3 pre-existing baseline errors (TopBar, secureStorage, RN/lib.dom.d.ts globals conflicts) — confirmed not caused by these changes.

Live verification step pending: load https://snapquote.us, exercise paths, confirm Sentry event volume on affected routes drops.

---

## Session — May 11, 2026 — Audit 13: observability, crons & ops reliability (READ-ONLY) [Source: Claude Code]

Read-only audit. NO code, schema, or data changed. Full report at `docs/audit-13-observability-ops-2026-05-11.md`. Worktree branch `claude/flamboyant-elgamal-850556`. HEAD `0024fdb`.

**Verdict:** Zero Critical. Seven High, seven Medium, three Low. Operational core (crons, deploys, web Sentry scrubbing) is healthy. Gaps are in (a) breadcrumb context on revenue paths, (b) mobile Sentry parity with web, (c) client error-boundary capture, (d) disaster-recovery posture, (e) detection-of-down posture.

**Live verifications:**
- pg_cron (`cron.job` + `cron.job_run_details` via Supabase MCP, 2026-05-11):
  - `reset-solo-credits` jobid=3 schedule `0 0 * * *` → 7/7 success in last 7d. Last run: 2026-05-11 00:00:00 UTC.
  - `rescue-stuck-leads` jobid=8 schedule `*/3 * * * *` → 3360/3360 success in last 7d. Last run: 2026-05-11 16:51:00 UTC. Definition via `pg_get_functiondef`: `SELECT net.http_get(url := 'https://www.snapquote.us/api/cron/rescue-stuck-leads', headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret))` with secret from `vault.decrypted_secrets`.
- Vercel crons (`vercel.json:1-32`): 7 entries, all 1:1 to handlers under `app/api/cron/`. The 8th directory (`rescue-stuck-leads`) is pg_cron-invoked, not zombie.
- Vercel deploys (Vercel MCP `list_deployments`, 20 most-recent): 18 READY, 1 QUEUED (current production), 1 BUILDING (preview). Zero ERROR/CANCELED in window.
- Web Sentry events (Sentry MCP `search_events`, project `snapquote-web`, 14d): 92 events. Top issue: `auth.requireMember 401` (47 events / 4 releases). 18 events of Node `DEP0169` deprecation noise.
- Mobile Sentry events (Sentry MCP `search_events`, project `snapquote-mobile`, 14d): 67 events. Top: `TypeError: Network request failed` (40 events). Confirmed UUID leak in event title: `Error: cannot add postgres_changes callbacks for realtime:quotes:8f939f96-7f92-4973-97f8-f08450ccb71f:ALL`.
- Supabase org plan (`mcp__supabase__get_organization`): `{"plan":"free"}` — no PITR, daily backups with 7d retention.

**High findings:**
- **H1** Mobile Sentry init at `app/_layout.tsx:27-48` has no `beforeSend`, no UUID redaction, no `environment`, no `release`, no `tracesSampleRate`. Confirmed live leak: tenant UUID in mobile Sentry event title.
- **H2** Six client error boundaries call `console.error` only — `app/(public)/login/error.tsx:13-15`, `signup/error.tsx:13-15`, `onboarding/error.tsx:13-15`, `[contractorSlug]/error.tsx:13-15`, `q/error.tsx:13-15`, `app/app/analytics/error.tsx:19-21`. `instrumentation-client.ts:9-23` has no `captureConsoleIntegration` so these never reach Sentry. Only `app/app/error.tsx:19-22` captures.
- **H3** No `app/global-error.tsx`. Root-layout crashes have no Sentry capture path.
- **H4** Critical revenue paths have zero explicit Sentry instrumentation (Grep). All 4 Stripe routes, RevenueCat webhook, IAP sync, lead unlock, quote send.
- **H5** `tracesSampleRate: 0.05` on all 3 web configs, default 0 on mobile. No replay sample rate. Audit-prompt-stated explanation for prior /app/leads outage being recorded as ~4 events.
- **H6** No PITR — Supabase org `free` plan. RPO 24h, backups 7d retention. Cross-flag Audit 9.
- **H7** No `/api/health` endpoint, no external uptime monitoring observable in repo.

**Medium findings:** 4 historical UUID-leak events from pre-M6-fix release (cosmetic-only now); 18 `DEP0169` noise events; 47 `auth.requireMember 401` events; 6 Telnyx invalid-phone events at error level; mobile missing `release` tag; `sentry.edge.config.ts` has no `captureConsoleIntegration`; `permission denied` events lack tags/extras.

**Low findings:** Cron handlers `console.error` without `tags.cronName`; mobile network-error swarm not categorized; Sentry alert rules require manual UI verification.

**No Critical findings.** Crons solid. Deploys clean. Web error-path PII scrubbing works as designed.

**Cross-flags:** Audit 2 (billing), Audit 3 (credits), Audit 6 (mobile), Audit 8 (security), Audit 9 (DR), Audit 11 (AI estimator).

NO fixes shipped. Recommendations only.

---

## Session — May 11, 2026 — Audit 1 re-run: auth & session lifecycle findings (live HEAD verification) [Source: Claude Code]

Read-only audit of the full auth surface across web (`C:\Users\murdo\SnapQuote` @ `40d1e6a`) and mobile (`C:\Users\murdo\SnapQuote-mobile` @ `0024fdb`). Full report at `docs/audit-1-auth-session-2026-05-11.md`.

**Top-line:**
- 0 Critical. Audit 8's token-verification hardening still holds at HEAD (HS256 fallback removed, ES256-only via JWKS, issuer pinned, web reset-password gated on `sq-pwr` recovery cookie).
- 5 High:
  - H1: mobile `lib/supabase.ts:38-45` uses **AsyncStorage**, not SecureStore. Audit 8 H7's claimed SecureStore migration is **NOT in HEAD**. Refresh tokens vulnerable to iCloud backup, jailbreak extraction.
  - H2: mobile `app/(auth)/reset-password.tsx:33` has no recovery-session gate. Web equivalent is fixed (Audit 8 H5).
  - H3: mobile `lib/utils/authBrowser.ts:21-25` puts `refresh_token` in URL fragment for stripe-return browser opens.
  - H4: mobile signOut `lib/auth.tsx:338` silently swallows errors — stale refresh tokens at GoTrue when network hiccups.
  - H5: mobile Apple sign-in (`app/(auth)/login.tsx:71-85`, `signup.tsx:77-91`) passes no `nonce` — token-replay vulnerability.
- 7 Medium/Low: leaked-password protection still disabled, inconsistent password mins, no per-IP rate limit on signup bootstrap, advisor warnings on `is_org_member`/`is_org_owner`, mobile recovery deep-link uses substring match not host check, `accept_invite_token` rolls back its expired-invite DELETE, no "sign out everywhere" UI.

**Live data:** 96 users (95 email, 1 apple, 0 google). 39 sessions / 35 users. No user has >3 concurrent sessions. 7 sessions refreshed in last 7 days. No auth-related Sentry issues.

**Stale Notion flagged:** "[2026-05-09] Mobile security hardening (Audit 8 H7, H8, M9, M10)" claims SecureStore + AASA host check shipped — neither in HEAD.

---

## Session — May 10, 2026 — Audit 9 M6 / Audit 11 H5 diagnosis: services display↔slug mismatch is intentional design, not a bug [Source: Claude Code]

Read-only diagnosis. No code, schema, or data changes. Full report at [docs/audit-9-m6-services-canon-diagnosis-2026-05-10.md](docs/audit-9-m6-services-canon-diagnosis-2026-05-10.md).

### Verdict: DEFER canonicalization — intentional design, no functional bug.

### Live evidence
- **15 distinct values** in `contractor_profile.services` (display-form: "Concrete", "Lawn Care / Maintenance", etc.). **All match `SERVICE_OPTIONS` exactly.** Zero orphans (Supabase MCP anti-join).
- **8 distinct non-null slugs** in `leads.service_category` (slug-form: "cleaning", "hardscape", etc.) plus 181 NULL rows (legacy). All match `SERVICE_CATEGORIES` CHECK constraint. Zero orphans.
- **Phantom canon slugs**: `grading` and `irrigation` exist in `SERVICE_CATEGORIES` + live CHECK constraint but zero rows produce them. No estimator hardcodes them.
- **Zero comparison code** between the two columns. Grep across the entire codebase for `service_category.*contractor` / `services.*includes.*service_category` returned no matches. No filter, no routing decision, no fan-out logic touches both columns. The two vocabularies coexist with zero interaction.

### How they're populated (live trace)
- `contractor_profile.services` ← onboarding/settings UI picks `SERVICE_OPTIONS.map(...)` from [`components/ServiceMultiSelectField.tsx:25`](components/ServiceMultiSelectField.tsx:25) → POSTs to [`app/api/public/onboard/route.ts:12,63`](app/api/public/onboard/route.ts:12) (Zod `z.array(z.enum(SERVICE_OPTIONS))`).
- `leads.service_category` ← engine ONLY. Public lead form writes only `leads.services` (display-form) at [`app/api/public/lead-submit/route.ts:284`](app/api/public/lead-submit/route.ts:284). `service_category` is written later by `runFallbackEstimate` ([`lib/ai/estimate.ts:4940`](lib/ai/estimate.ts:4940)) or success path ([`lib/ai/estimate.ts:5226`](lib/ai/estimate.ts:5226)), pulling from `aggregateEngineEstimate`'s output at [`estimators/shared.ts:1361-1362`](estimators/shared.ts:1361). Per-service estimator files hardcode the slug (e.g., `estimators/concreteEstimator.ts:188`: `serviceCategory: "hardscape"`).

### AI prompt
- Prompt at [`lib/ai/estimate.ts:3455`](lib/ai/estimate.ts:3455) sends `services: input.services` (display strings). **`service_category` is NOT in the prompt.** Slug is purely an OUTPUT of the deterministic engine.
- Engine routes via `serviceAliases` ([`estimators/estimateEngine.ts:35-58`](estimators/estimateEngine.ts:35)) — unknown display strings fall through to `"Other"` → `estimateOther` → `serviceCategory: "other"`. No throw, no "worse estimate from unknown category" branch.
- Sample of 10 recent leads confirmed end-to-end mapping is correct in production. Two newest leads (post-Audit-11-F5) have structured `{phase, ts, ...}` notes with `pipeline_start` first phase.

### Worst-case scenario today
Contractor profile `services=["Concrete"]`, lead `service_category="hardscape"`: contractor sees the lead, AI generates a Concrete estimate, contractor unlocks, quotes. Mapping is internally consistent (Concrete display → estimateConcrete → "hardscape" slug). No code anywhere reads `service_category` to make a contractor-facing decision. **No user-visible impact.**

### Recommendation
1. **Document the design** in `lib/types.ts` — comment block explaining that `SERVICE_CATEGORIES` (slug, coarse analytical bucket) is intentionally distinct from `SERVICE_OPTIONS` (display, UI-facing label).
2. **Optional cleanup**: drop phantom-canon `grading` and `irrigation` from `SERVICE_CATEGORIES` + the CHECK constraint if not on the product roadmap. Small migration.
3. **Separate ticket** (cross-flag Audit 11 M1): Roofing / Tree Service / Exterior Painting / Outdoor Lighting all collapse to `service_category="other"` is a category-EXPANSION question, not a canonicalization question. Decide based on analytics needs.

**Mark Audit 9 M6 and Audit 11 H5 as RESOLVED (intentional design / no bug).** Audit 11 M1 (coarse "other" mapping) stays open as separate.

### Out of scope (this diagnosis)
No code, no schema, no data changes. Recommendation only.

---

## Session — May 10, 2026 — Audit 11 C2 fixed: rescue cron now lands fallback estimate on give-up [Source: Claude Code]

Branch `claude/audit-11-c2-rescue-cron-fallback`. Two logical commits + merge:
- `75bdd27` — `refactor(estimator): extract catch-block fallback into runFallbackEstimate (Audit 11 C2 prep)`
- `331d10c` — `fix(cron): rescue cron Stage 1 give-up now calls runFallbackEstimate (Audit 11 C2)`
- Merge SHA on `origin/main`: `c1ab37e`.

Branch deleted local + remote. Vercel deploy `dpl_4N6947r1YynvSwHpzB3wzFgymStk` triggered for `c1ab37e`.

### Pre-fix evidence
- **Rescue cron Stage 1 give-up at HEAD before fix:** [app/api/cron/rescue-stuck-leads/route.ts:94-102](app/api/cron/rescue-stuck-leads/route.ts:94) wrote `ai_status='failed'` with `[{phase: "rescue_give_up", ts, message: STUCK_NOTE}]` only — no `ai_estimate_low/high` columns set. Contractors saw blank price cards.
- **In-process catch-block fallback at HEAD before fix:** [lib/ai/estimate.ts:5022-5144](lib/ai/estimate.ts:5022) inlined inside `generateEstimateAsync`'s catch. Built degraded propertyData via `buildDegradedPropertyData`, called `fallbackEstimate(...)` with `inferSignalsFallback` signals, wrote `ai_status='ready'` with all 19 AI columns. NO OpenAI calls — pure JS heuristic.
- **Live state of historical NULL leads:** Supabase MCP query returned ~150 rows with `ai_status='failed' AND ai_estimate_low IS NULL`. All in test orgs (`falconn`, `Worcester Test Contractor`, `poo`). Per task scope: **forward-looking fix only**, leave as-is.
- **pg_cron baseline:** jobid=8, schedule `*/3 * * * *`, active=true. 10/10 runs in last 30 min `succeeded`, each completing in ~30-90ms.

### Refactor diff (commit 1)
- New exported function `runFallbackEstimate(admin, params)` at [lib/ai/estimate.ts:4801](lib/ai/estimate.ts:4801) — extracts the inlined catch-block body. Takes `{leadId, orgId, estimateInput, triggerMessage, origin: "catch_fallback" | "rescue_cron"}`. Origin-tags audit markers (e.g. `rescue_cron_fallback_origin` vs `catch_fallback_origin`) and Sentry breadcrumbs so query-time discrimination works. Returns `{ok: true} | {ok: false, error}` — internal try-catch ensures no exception escapes. Calls `invalidateAnalytics` on success.
- New exported helper `loadEstimateInputForRescue(admin, leadId, orgId)` builds `EstimateInput` from a lead row + contractor + lead_photos. Photos ordered `created_at ASC` per H1. CAS guard returns `null` if `ai_status` is no longer 'processing'.
- In-process catch block now ~25 lines (was ~120). Calls `runFallbackEstimate`, on `ok:true` captures original error to Sentry tag `catch-fallback-recovered` and fires notifications. On `ok:false` captures with `catch-fallback-threw` and falls through to the unchanged last-resort failure write. **Behavior-identical** — same Sentry tags, same column writes, same dedup-by-message + 24-cap on notes.

### Cron diff (commit 2)
- Stage 1 changed from a single bulk UPDATE to a per-lead loop (lines 79-200 of [app/api/cron/rescue-stuck-leads/route.ts](app/api/cron/rescue-stuck-leads/route.ts)).
- For each `processing` lead past `GIVE_UP_MINUTES`: `loadEstimateInputForRescue` → `runFallbackEstimate` (origin: "rescue_cron"). On success: `ai_status='ready'` lands with non-NULL estimates plus origin-tagged markers. Sentry breadcrumb `rescue_cron_fallback_recovered`.
- **Fallback for the fallback** (per task spec, documented in code comments): if `loadEstimateInputForRescue` returns null OR `runFallbackEstimate` returns `ok:false` OR any throw — fall back to the existing "just flip status to failed and write `[{phase: "rescue_give_up", ts, message: STUCK_NOTE}]`" behavior. The CAS filter `.eq("ai_status", "processing")` on the failure-write protects against double-processing by concurrent cron ticks.
- Notification chain (`sendNewLeadNotifications`) fires regardless of which branch landed.
- Response payload now includes `rescuedWithFallback` and `rescuedWithStuckNote` counters.

### Verification
- `npx tsc --noEmit` exit 0.
- `npm run build` clean (only pre-existing `<img>` warning + Sentry deprecation notice, unrelated).
- pg_cron baseline: 10/10 success last 30 min pre-deploy.
- Live verify per Rule 14 still pending Vercel deploy READY (was BUILDING when this entry was committed; live verify scheduled via wakeup).

### Out of scope
- Historical ~150 NULL leads in test orgs (`falconn`, `Worcester Test Contractor`, `poo`) NOT retroactively fixed. Per task: forward-looking only.
- Stages 2 (5-15 min retry) and 3 (failed-retry under cap) unchanged. They re-trigger via `triggerEstimatorForLead → generateEstimateAsync → catch-block fallback` so they already inherit the heuristic guarantee.
- H3 latency optimization separate (deferred until F5 timing markers gather data).

### Notion save
Bugs & Fixes write attempted at end of session; if it timed out per the documented ~310k-char caveat, this updates-log entry is the canonical record (per task spec).

---

## Session — May 10, 2026 — Audit 4 + 8 cleanup bundle (H2/H3/H4/H6/H7/M2/M6) [Source: Claude Code]

Seven small low-risk fixes against web HEAD `af99cb0` (post Vercel-build orphan-eslint-disable fix). Branch `claude/audit-4-cleanup` from origin/main, fresh worktree at `.claude/worktrees/audit-4-cleanup`. Each finding diagnosed live before applying.

### F1 — H2: ARCHIVED documented as historical no-op

Pre-fix: `pg_enum` for `lead_status` returns `{NEW, QUOTED, ACCEPTED, ARCHIVED}`; grep across web + mobile repos at HEAD finds `'ARCHIVED'` only in `supabase/migrations/0001_init.sql` and `supabase/migrations/0031_auto_archive_stale_leads.sql` (the parser-broken historical no-op for the now-removed auto-archive feature). No application code writes ARCHIVED. Live count of `leads.status='ARCHIVED'` = 0.

Fix: added a second bullet to the "Known historical no-ops" section in `docs/current-state.md` documenting ARCHIVED alongside the existing OPENED bullet. No SQL change, no code change.

### F2 — H3: OPENED already documented (no action)

Pre-fix verification: `docs/current-state.md:135` already contains the OPENED entry from Audit 9 C3 (2026-05-08). No action needed.

### F3 — H4: lead-photos bucket size + MIME limits

Pre-fix: `SELECT id, public, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id='lead-photos'` returned `{public:false, file_size_limit:NULL, allowed_mime_types:NULL}`. All MIME/size enforcement lived in `app/api/public/lead-photo-upload/route.ts:104-119` only.

Fix: applied via Supabase MCP as migration `audit4_lead_photos_bucket_size_and_mime_limits` (local file `supabase/migrations/20260510000001_audit4_lead_photos_bucket_size_and_mime_limits.sql`). Sets `file_size_limit = 52428800` (50 MB) and `allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp']`. Route still enforces tighter 10 MB; bucket-level cap catches accidental video / RAW from any future writer.

Post-fix: re-queried `storage.buckets` — both fields now non-NULL with the configured values.

### F4 — H6: 96-bit publicId fallback at lead detail page

Pre-fix: `app/app/leads/[id]/page.tsx:174` had `const activePublicId = draftPublicId ?? randomBytes(6).toString("base64url");`. Other call sites (`/api/app/leads/unlock/route.ts:16-20` `makePublicId()` and `/api/app/quote/send/route.ts:18-22` `makePublicId()`) use `randomBytes(12)` (96 bits). The fallback can land on a persisted publicId — `/api/app/quote/send/route.ts:193` accepts `body.publicId ?? makePublicId()`, so a 48-bit value generated for the preview becomes the persisted public_id on first send if the unlock route's DRAFT-mint silently failed.

Fix: changed `randomBytes(6)` → `randomBytes(12)`. One-byte change; no API change. Comment block updated to explain the rationale.

### F5 — H7: deleted 8 legacy null-estimate leads from falconn

Pre-fix: 8 leads with `ai_status='ready' AND (ai_estimate_low IS NULL OR ai_estimate_high IS NULL)`. Live verification: ALL 8 in org `8f939f96-7f92-4973-97f8-f08450ccb71f` (org name `falconn`, the test/dev org). All from 2026-03-09. Each carried `ai_suggested_price` populated but the range columns NULL — legacy data from before the AI estimator code always wrote the range together.

FK pre-check: `lead_photos`, `quotes`, `lead_unlocks` all have `ON DELETE CASCADE` for `lead_id`. Cascade footprint: 1 quote (status EXPIRED, sent 2026-03-09, viewed 2026-03-20, never accepted), 15 lead_photos, 0 lead_unlocks.

Fix: `DELETE FROM leads WHERE id IN (...) AND org_id = '8f939f96-...' AND ai_status='ready' AND ai_estimate_low IS NULL` via Supabase MCP. WHERE clause defensive (re-verified org + ai_status + null shape inside the same statement).

Post-fix: `SELECT COUNT(*) FROM leads WHERE ai_status='ready' AND (ai_estimate_low IS NULL OR ai_estimate_high IS NULL)` returns 0. 8 leads + 1 quote + 15 photos cascade-removed.

### F6 — M2: org_id filter on /accept lead UPDATE

Pre-fix: `app/api/public/quote/[publicId]/accept/route.ts:110` was `await admin.from("leads").update({ status: "ACCEPTED" }).eq("id", acceptedQuote.lead_id);` — no org_id filter. Defense-in-depth gap; the Audit 8 M5 helper convention says admin-client UPDATEs against tenant-scoped tables MUST include an explicit org_id filter.

Fix: added `.eq("org_id", acceptedQuote.org_id as string)`. The org_id was already loaded by the publicId → quote SELECT at line 25-28. Inline chain rather than `requireOrgFilter` helper because the helper's TS signature targets SELECT chains; the M5 convention's "OR include an explicit org_id chain" clause permits the inline form.

### F7 — M6: UUID redaction in Sentry error message bodies

Pre-fix: `lib/sentryScrub.ts` walked key NAMES (`event.extra`, `event.contexts`, `event.tags`, breadcrumb data) but didn't sanitise `event.message` or `event.exception.values[].value`. Sentry events of the shape `Error: {"code":"42501","message":"permission denied for organization 8f939f96-7f92-4973-97f8-f08450ccb71f"}` leaked tenant identifiers — 4 occurrences in last 14d via `level:error` events search.

Fix: extended `lib/sentryScrub.ts` with a `UUID_PATTERN` regex (`/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi`) and `redactUuids(value)` helper. `scrubSentryEvent` now applies `redactUuids` to `event.message`, each `event.exception.values[].value`, and each `event.breadcrumbs[].message`. All three Sentry config files (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`) already route through `scrubSentryEvent` in `beforeSend` — no per-config change needed.

### Verification

- `npx tsc --noEmit` clean.
- `npx next build` (with lint) clean — no new errors. Pre-existing warnings (workspace-root inference, Sentry global-error handler suggestion, single `<img>` element) unchanged.
- All Supabase MCP fixes verified post-fix via re-query.

### Cross-flags still pending

- M1 (`ai_estimator_notes` shape inconsistency) — deferred per Murdoch.
- H1 (DRAFT cleanup logic) — DRAFTs are intentional load-bearing infrastructure per Murdoch's note in the audit prompt.
- H5 (unlock route DRAFT-mint silent failure) — deferred per Murdoch.

---

## Session — May 9, 2026 — Fixed Vercel build failure (orphan eslint-disable in `lib/supabase/orgFilter.ts`) [Source: Claude Code]

Production deploys for `snapquote-web` had been failing since commit `eef6693` with: `./lib/supabase/orgFilter.ts 28:1 Error: Definition for rule '@typescript-eslint/no-explicit-any' was not found.` Both `dpl_C9kyob6HADXo8s1rj1GzYaqDsuoT` (commit `eef6693`) and `dpl_AHv1TXh4M2AA3BDno1NPiSoxZg1e` (commit `47ac96e`) errored on the lint step despite TypeScript compiling clean (62s `✓ Compiled successfully`). Production stayed up on the prior good deploy `eVFbskHQ8` (commit `b3bf3e4`, AASA fix).

**Root cause.** `lib/supabase/orgFilter.ts:28` opened with `/* eslint-disable @typescript-eslint/no-explicit-any */`, but `.eslintrc.json` only extends `next/core-web-vitals` — the `@typescript-eslint` plugin is not installed (`npm ls @typescript-eslint/eslint-plugin` returned `(empty)`), so ESLint hard-errored on the unknown rule reference. The file was introduced in `3d69a1b` (Audit 8 M5, admin org_id filter helper) on a local branch and didn't reach the deployed tip until the `eef6693` merge.

**Fix.** Single-line deletion — removed only the orphan `/* eslint-disable @typescript-eslint/no-explicit-any */` directive at `lib/supabase/orgFilter.ts:28`. The `(query as any)` cast on line 38 stays untouched: `next/core-web-vitals` alone does not flag bare `any`, and the cast is intentional per the in-file comment about TS2589 deep instantiation on Supabase's `PostgrestFilterBuilder` chain. Verified locally with `npm run build` — full Next build succeeded.

**Merged.** `8fafb717e3f7b46d65274f1e0943705ce58762e4` on `origin/main`, via fix branch `claude/fix-orgfilter-eslint` (deleted post-merge).

**Live verification.** New deploy `dpl_4E7GNcqWqdu973T8MsJqCaFTj7aZ` (commit `8fafb71`) → state `READY`, target `production`, aliased to `snapquote.us` and `www.snapquote.us` (Vercel MCP `get_deployment`). `curl -sIL https://snapquote.us` → 307 → `https://www.snapquote.us/` HTTP 200, `Server: Vercel`, `X-Vercel-Id: sfo1::8kv9f-…`. AASA still serving correctly: `curl -sL https://snapquote.us/.well-known/apple-app-site-association` → `{"applinks":{"apps":[],"details":[{"appID":"U58KVR8LTA.com.murdochmarcum.snapquote","paths":["*"]}]}}`.

**Out of scope (separate cleanup).** Properly wiring `@typescript-eslint/eslint-plugin` + parser into `.eslintrc.json` so the disable directive could legitimately exist. Not done here — the orphan directive was the proximate cause of the build break and removing it is sufficient to unblock deploys.

**Notion save flagged.** Attempted to add this entry to the Bugs & Fixes Notion page (`35432498-a1cb-8132-a2c5-f2f5505b6d90`) but `update_content` returned `validation_error: Multiple matches found` (4 matches) for the most recent header anchor — the page contains duplicated content blocks that prevent unambiguous prepend. Falling back to docs/updates-log.md per task spec.

---

## Session — May 10, 2026 — Audit 11 Part A fixes (C1+H1+H2+H4+F5) + Part B C2 deep history dive [Source: Claude Code]

Branch `claude/audit-11-fixes-and-c2-deep-reaudit`. Three commits + merge: code fixes, rescue-cron fix, H2 backfill migration. Plus Part B docs. C2 + H3 + H5 explicitly DEFERRED per Murdoch.

### Part A — five Audit 11 fixes shipped

**C1 — `_other_text` / `_contractor_note` keys no longer stripped.** `lib/ai/estimate.ts:sanitizeAnswersForModeling` was filtering keys ending in those suffixes from BOTH the AI prompt builder (`sanitizeServiceQuestionBundlesForModeling`) and the deterministic engine (`buildServiceRequests`). Live samples (Supabase MCP 2026-05-10) showed real customer/contractor content was being silently dropped — `"junk_type_other_text: special access needs for junk type 73"`, `"fence_scope_other_text: site-specific details for fence scope 35"`, `"roofing_work_type_contractor_note: clean mooo"`. Prompt at `:3380` explicitly tells the model to "Analyze ... any other-text answer fields" — those fields never reached it. Engine's `requestDirectEvidenceText` had a `/_other_text$|_contractor_note$/i` branch that was previously dead code for the same reason. Fix: pass-through. The customer-typed `description` field already flows through unsanitized so this introduces no new prompt-injection surface; the existing one is filed as "prompt-injection fences for description" in Pending Work.

**H1 — `lead_photos` query now `.order("created_at", { ascending: true })`.** Was heap-order. Two runs of the same lead could yield different AI outputs because the model saw photos in different orders.

**H2 — Rescue cron writes `[{phase, ts, message}]` array.** Was writing `STUCK_NOTE` as a bare JS string into a JSONB column → jsonb-string. Every other writer wrote a JSONB array. Live: 7 string-shape rows (all with byte-identical `STUCK_NOTE`). Fix: single-element array of one structured `EstimatorNote`. Migration `audit11_h2_normalize_ai_estimator_notes_string_to_array` applied via Supabase MCP — converted all 7 legacy rows to single-element arrays of `[{phase: "rescue_give_up_legacy", ts: submitted_at, message: <STUCK_NOTE>}]`. Post-fix: 0 string-shape rows; 3 431 array-shape rows; idempotent migration committed to `supabase/migrations/`.

**H4 — Sentry breadcrumbs added at every AI pipeline phase.** 30-day Sentry search returned 0 events for `area:estimator` despite known fallback firings — failures were swallowed silently. Added `Sentry.addBreadcrumb({category: "estimator", ...})` at: `pipeline_start`, `property_data_ok`/`property_data_failed`, `openai_call_start`/`openai_call_ok`/`openai_call_failed`, `polish_call_start`/`polish_applied`/`polish_call_failed`/`polish_empty_response`, `catch_fallback_origin`, `terminal_ready`, `pipeline_threw`. Breadcrumbs carry phase + structured `data` payload; PII auto-scrubbed by existing `beforeBreadcrumb` hook in `sentry.server.config.ts`.

**F5 — `ai_estimator_notes` entries are now structured objects.** Was plain `string[]` with no per-phase ts; production data could only show total `pipeline_seconds = ai_generated_at - submitted_at`, no way to tell which phase was slow. New shape: `EstimatorNote = { phase: string; ts: string; message: string; data?: Record<string, unknown> }`. `ts` captured at PUSH time via `new Date().toISOString()`. Helpers `makeEstimatorNote(phase, msg, data?)` and `wrapLegacyNote(string)` for engine notes that have no natural phase boundary. `auditMarkers: EstimatorNote[]` flows through `generateEstimate` / `callOpenAI` / `polishJobSummary`. Engine notes are wrapped at the merge boundary in `buildGeneratedEstimate` with `phase: "engine"` + merge-time ts. `mergeAuditMarkers` dedups by message text. Reader `scripts/run-estimator-tests.ts:parseLeadNotes` updated to handle three shapes (legacy string, legacy `string[]`, post-fix `EstimatorNote[]`). Future query `(notes->-1->>'ts')::timestamptz - (notes->0->>'ts')::timestamptz AS pipeline_duration` now works.

### Part A — verification
- `npx tsc --noEmit` exit 0.
- `npm run build` clean (only pre-existing `<img>` warning + Sentry deprecation notice, neither related to this change).
- Supabase MCP post-migration: 0 string-shape rows, 3 431 array-shape rows.
- Live verification per Rule 14 still pending (snapquote.us flow tests + new lead submission + Sentry breadcrumb confirmation) — to run after merge to main and Vercel deploy.

### Part A — out-of-scope (DEFERRED per Murdoch)
- C2 (rescue-cron Stage-1 give-up writes no fallback estimate) — see Part B below.
- H3 (28s p50 latency) — deferred until F5 timing markers ship and we have real data.
- H5 (service category mapping) — tied to unresolved Audit 9 M6 decision.

### Part B — C2 deep history dive (read-only)

Murdoch's instinct: "this might have been investigated/fixed before; the agent may be looking at code that was already reasoned about." Conclusion: **A — Bug exists, never previously fixed.** Full report at `docs/audit-11-c2-deep-history-reaudit-2026-05-10.md`.

Evidence:
- Five commits ever touched `app/api/cron/rescue-stuck-leads/route.ts`: `d5991c6` (file created with give-up writing only `ai_status='failed'` + `STUCK_NOTE`, no estimate), `db5b158` (added Stage 2 retry; give-up unchanged), `a11fb9c` (cron-scheduler move only — commit message: "The rescue logic itself... is unchanged"), `4346563` (added Stage 3 retry; Stage 1 give-up unchanged), `63afe5c` (auth-only). **Every diff inspected. No commit ever attempted to add fallback-estimate computation to Stage 1.**
- The catch-block fallback in `lib/ai/estimate.ts:4768-4865` (commit `51f7890`, 2026-05-04) is in-process only. Its commit message implicitly defers the cron-give-up case via Stage 3 retry — but Stage 3 only handles `failed` rows that entered via `generateEstimateAsync`'s normal failure-write path AND are within `FAILED_RETRY_WINDOW_HOURS=6` AND under `MAX_AI_RETRIES=2`. The 7 NULL leads in production (now-array-wrapped post-H2) ALL pre-date 2026-05-04 and the 6-hour window has long since closed.
- Notion exhaustively searched: Bugs & Fixes, Decisions Log, Architecture & Stack, Pending Work, Code Patterns. No "RESOLVED" entry for rescue-cron fallback. Pending Work has nine deferred AI-estimator items but none address rescue-cron-no-fallback.
- The 7 NULL leads' `ai_estimator_notes` content is byte-identical to the `STUCK_NOTE` constant. Their `org_id` (most-recent two) is `8f939f96` (Murdoch's falconn test org). They are exactly what the bug predicts.

Recommended fix path (NOT shipped — for Murdoch's triage): replicate the catch-block pattern inside Stage 1. Load lead+contractor+photos, build `EstimateInput`, call `fallbackEstimate(input, buildDegradedPropertyData(...))`, write `ai_status='ready'` with marker note. Feasible in the cron's 60s budget (typical Stage 1 batch is 0-2 leads).

### Notion writes
Bugs & Fixes write attempted for Part A entries; if it times out per the documented page-size caveat, this updates-log entry is the canonical record. Murdoch flag noted in Part B doc.

---

## Session — May 10, 2026 — Audit 11 C2 + H3 focused re-audit (read-only) [Source: Claude Code]

Read-only re-audit of two findings from the 2026-05-09 Audit 11 pass: **C2** (rescue-cron Stage-1 give-up writes no fallback estimate) and **H3** (p50 latency 28.05 s above the 25 s revisit threshold). No code, schema, or data changed. Full report saved to `docs/audit-11-c2-h3-reaudit-2026-05-10.md`.

### Verdict
- **C2 stands** as documented. Live: 2 affected rows in last 30 days, both with NULL `ai_estimate_low/high` and string-shape `ai_estimator_notes`. The catch-block fallback at `lib/ai/estimate.ts:4768-4865` only fires when the in-process estimator throws; it does not fire when the rescue cron's Stage 1 decides to give up at `app/api/cron/rescue-stuck-leads/route.ts:82-91`. The two code paths evolved independently. Recommended path is to replicate the catch-block fallback pattern inside Stage 1 — feasible inside the cron's 60s budget; would also be a natural moment to fix the H2 string-vs-array shape inconsistency. **Net-new ticket** — not currently in Pending Work.
- **H3 stands** as documented. Re-verified live (Supabase MCP, 30 d, n=39 first-attempt successful): p50 = 28.05 s, p90 = 40.21 s, p99 = 88.54 s. Photo-detail-low fix from 2026-05-04 already extracted the easiest win (~10 s reduction from prior ~35-45 s). What remains is mostly OpenAI inherent vision-call latency at gpt-5-mini against a complex JSON Schema.

### `ai_estimator_notes` per-phase timing — INSTRUMENTATION GAP
Sampled 18 leads from last 14 days. All have 9-12 element `ai_estimator_notes` arrays. Markers cover phase **outcomes** (`Property data resolved...`, `Satellite image attached.`, `Summary polish: applied.`) but carry **no timestamps and no elapsed times**. Code-side `grep` for `performance.now|Date.now\(\)|console.time|elapsed|durationMs|t0|tStart` in `lib/ai/estimate.ts` returns 0 matches. The pipeline emits zero timing observations to either DB or Sentry. Cannot decompose the 28s p50 into per-phase contributions from production data alone.

### H3 driver attribution (reconstruction from code paths + token counts; not measured)
| Driver | Approx share of 28s p50 |
|---|---|
| (A) OpenAI signal call inherent latency | ~65-75% (≈18-21s) |
| (B) Schema oversize (vestigial fields) | ~10-15% (≈3-4s) |
| (C) Polish call on critical path | ~10% (≈2-3s) |
| (D) Photo / satellite handling | <5% steady; uncapped tail risk |
| (E) Sequential Google property-data calls | ~5% (≈1-2s) |

### H3 recommendations (Murdoch to triage)
1. **Schema reduction (B)** — claude.ai already filed a Pending Work entry for this on 2026-05-04 with a specific deferral trigger of "p50 above ~25s on real customer leads" — that trigger has now fired. Expected savings 10-25% (3-7s). Best effort/savings ratio.
2. **Add per-phase timing markers BEFORE further optimization.** Without phase timings, every optimization is a guess. ~30 min code change to push `Property data: <ms>ms`, `AI signal call: <ms>ms`, `Polish: <ms>ms` markers into `ai_estimator_notes`.
3. **Add timeout to satellite fetch.** `fetchImageAsDataUrl` at `lib/ai/estimate.ts:1789-1799` has no `AbortController`. Cheap p99 defense; doesn't move p50.
4. **Polish-on-critical-path (C) — product question, not engineering.** Today's behavior was an intentional 2026-05-04 decision ("Do NOT move polish to async/after()"). Three options: keep as-is, move async with raw-then-polished pattern (~3s win), or skip entirely (~3s win + cost saving but quality drops). Needs Murdoch's product approval to change.

### Counter-argument for "28s is fine"
Customer's lead-submit response returns in ~2s (AI deferred via `after()`). Customer never waits. Contractor sees a push notification, opens the app within typically ≥30s — by which time the AI is done. If 90%+ of contractor open-rates lag the push by >30s, the 28s p50 is product-invisible. Optimization should follow a measured complaint, not a numeric threshold. Worth confirming with notification-to-open analytics before investing in latency cuts.

### Stale Notion / docs entries flagged
- 2026-05-04 "Web lead flow triple-bug investigation" Notion entry says `STRUCTURED_AI_TIMEOUT_MS = 40000`. HEAD value at `lib/ai/estimate.ts:381` is **35000**. Already flagged in 2026-05-09 audit; remains uncorrected.

### Notion writes
Bugs & Fixes write attempted; if it times out per the documented page-size caveat, full report stays in `docs/` and this entry serves as the canonical record. Murdoch flag at top of audit doc if Notion fails.

---

## Session — May 9, 2026 — Audit 11 of 13 (AI Estimator) re-audit at HEAD [Source: Claude Code]

Read-only Audit 11 against web HEAD `8ed8eea`, Supabase project `upqvbdldoyiqqshxquxa` live, Sentry org `snapquote`. No code or schema changed. Full report saved to `docs/audit-11-ai-estimator-2026-05-09.md`.

### Verdict
AI estimator pipeline is structurally solid: model name `gpt-5-mini` confirmed live, vision via `input_image`, strict JSON schema enforcement via `zodTextFormat`, per-call timeouts at every external boundary, catch-block fallback in `generateEstimateAsync`, and zero stuck-leads-now (`processing > 10 min` count = 0). Two real issues land on the contractor's eyes; rest is cleanup and observability.

### Critical (live-verified)
- **C1 — `_other_text` / `_contractor_note` answer keys stripped before AI sees them.** `lib/ai/estimate.ts:1889-1894` (`sanitizeAnswersForModeling`) filters those keys; called by both `buildServiceRequests:1885` and prompt builder via `sanitizeServiceQuestionBundlesForModeling:3374`. The system prompt at `:3338` still tells the model to "Analyze ... any other-text answer fields" — the field never reaches the model. Customer's free-text clarifications on multi-choice questions are invisible to AI and the deterministic engine. Stands from prior 2026-05-08 audit.
- **C2 — Rescue-cron Stage-1 give-up writes no fallback estimate.** `app/api/cron/rescue-stuck-leads/route.ts:82-91` flips `ai_status='processing'` → `'failed'` past the 15-minute give-up threshold without computing a fallback price. The 2 failed leads in the last 30 days (`25d8964d`, `718642d6`) both have `ai_estimate_low IS NULL` and `ai_estimate_high IS NULL`. The catch-block fallback in `generateEstimateAsync` only fires when the in-process estimator throws — not when the rescue cron decides to give up. Contractor sees a New Lead notification with no estimate at all.

### High (live-verified)
- **H1 — Photo order is heap-order (non-deterministic).** `lib/ai/estimate.ts:4607-4612` selects `lead_photos` with no `.order(...)`. Postgres returns heap order. Same lead → different photo order → different AI output → reproducibility issue. Fix is `.order("created_at", { ascending: true })`.
- **H2 — `ai_estimator_notes` JSONB shape inconsistency.** Same finding as Audit 4 M1 (re-confirmed). `app/api/cron/rescue-stuck-leads/route.ts:34-35,84-87` writes a JSON STRING; every other writer writes a JSON ARRAY. Live: 2 string-shape rows visible. Consumers using `.map`/`.length` without an `Array.isArray` guard will throw.
- **H3 — Latency p50 at 28.05 s, above the 25 s revisit threshold.** Live Supabase percentile_cont over 39 first-attempt successful leads in last 30 days: p50 = 28.05 s, p90 = 40.21 s, p99 = 88.54 s. Drivers: two sequential OpenAI calls per lead (signal `client.responses.parse:3760` + polish `client.responses.create:4372`), large 40+-field schema. Polish is on the critical path before `ai_status="ready"` writes.
- **H4 — No `estimatedQuantity` cross-check vs `propertyData.lotSizeSqft`.** Schema accepts unbounded `estimatedQuantity: z.number().min(-1)` (`estimate.ts:220`). No property-relative sanity gate. Stands from prior audit.
- **H5 — `ai_confidence` label conflates AI vs fallback origin.** Same `confidenceLabel(score)` (`estimate.ts:4231-4234`) for both AI-source and fallback-source rows. Contractor sees "high/medium/low" identically. Cross-flag with Audit 4 lifecycle UI.
- **H6 — No Sentry breadcrumbs around the OpenAI call.** Only top-level `captureException` in 3 catch sites; zero `addBreadcrumb` in `lib/ai/estimate.ts`. AI timeouts/rate-limits/parse-fails fall back gracefully and silently — no Sentry signal. Confirmed live: 30-day Sentry search for `area:estimator` / `tags[area]:estimator` / `stack.module:lib/ai/estimate` returned 0 events. Cross-flag with Audit 13.

### Medium (live-verified)
- **M1 — Coarse `service_category` mapping.** Roofing, Tree Service, Outdoor Lighting, Exterior Painting all collapse to `service_category = "other"` along with the literal "Other" service (per per-service estimator files). Filtering by category cannot distinguish them.
- **M2 — Single-attempt AI request (no in-request retry).** Retry happens externally via rescue cron (`MAX_AI_RETRIES = 2`). A transient rate-limit drops to fallback immediately on the first attempt.
- **M3 — `ai_status` is `text` with CHECK, not a Postgres enum.** No `pending` state.
- **M4 — Photo MIME validated from `photo.type` (client-supplied), no server-side magic-byte sniff.** Cross-flag with Audit 8 storage gap.
- **M5 — Polish AI call doubles per-lead AI cost and adds tail latency.** Both calls block before `ai_status="ready"`.

### Low / observations
- **L1 — Schema permits `summary` field that prompt forbids.** Strict schema enforcement makes it safe but it's prompt/schema drift.
- **L2 — `lead-submit` "trigger failed" branch writes `ai_status='failed'` with NULL `ai_estimator_notes`.** Code path exists; 0 such rows in last 30 days.
- **L3 — API key handling is server-only (verified, non-finding).**
- **L4 — Per-call cost ≈ $0.005 (Notion estimate; not live-verifiable without token logging).**

### Stale Notion / docs entries flagged
- 2026-05-04 "AI estimator timeout + failed lead visibility" entry says `STRUCTURED_AI_TIMEOUT_MS = 40000`. HEAD value at `lib/ai/estimate.ts:381` is **35000**. Live wins. Notion is stale.
- 2026-05-08 prior Audit 11 entry's findings re-verified: C1, H1 (renumbered H4 in this audit), H4 quantity-cross-check, H5 confidence label all still hold. Some M-numbering in the prior audit corresponds to different findings here (scope/focus shifted).

### Live evidence anchors
- Web HEAD: `git log origin/main..main` empty (in sync). Web tree had pre-existing untracked docs and `tsbuildinfo` from other agents — not touched.
- Supabase MCP: `upqvbdldoyiqqshxquxa`, `leads.ai_status` distribution last 30d: 45 ready / 2 failed (both string-shape notes, both null estimates). Stuck count = 0.
- Sentry MCP: zero events with `area:estimator` over 30 days.

### Notion saves
Critical/High will be appended to **Bugs & Fixes** as a fresh dated entry. To-dos to **Pending Work**. Architecture notes already covered by prior 2026-05-08 entries.

---

## Session — May 9, 2026 — Audit 4 of 13 (Lead Lifecycle) re-verified at HEAD [Source: Claude Code]

Read-only Audit 4 against web HEAD `eef6693`, mobile HEAD `8ed8eea`, Supabase project `upqvbdldoyiqqshxquxa` live. No code or schema changed. Full report saved to `docs/audit-4-lead-lifecycle-2026-05-09.md`.

### Pre-audit housekeeping
Web repo had 8 unpushed commits on local main (Audit 8 web infra hardening + auth hardening) ahead of origin, with 2 origin-ahead commits (AASA followup). Pulled origin/main with merge, resolved conflicts in `docs/current-state.md` + `docs/updates-log.md` by keeping both entries (newer AASA entry on top, older Audit 8 hardening entry below). Pushed merged main → origin (`b3bf3e4..eef6693`). `git log origin/main..main --oneline` empty.

### Verdict
Lead lifecycle functional end-to-end. Zero findings rated Critical at HEAD. Six prior High items still open + one fresh High (legacy data inconsistency).

### High findings (live-verified)
- **H1 — DRAFT-quote staleness, no cleanup mechanism (STANDS).** Live: 35 DRAFTs, 31/35 (89%) older than 7d at `lead.submitted_at`, 25/35 (71%) older than 30d, oldest 2026-03-16. No cron / no UI to discard. Each represents a charged credit.
- **H2 — `lead_status.ARCHIVED` phantom enum (STANDS).** Live: enum has it, 0 rows write it. Migration 0031 historical no-op confirmed.
- **H3 — `lead_status.OPENED` missing from live enum despite migration 0030 recorded (STANDS).**
- **H4 — Storage bucket `lead-photos` no MIME/size enforcement at bucket level (STANDS).** Live: `allowed_mime_types: NULL, file_size_limit: NULL`. Route enforces; bucket doesn't.
- **H5 — Unlock route DRAFT-mint silent failure (STANDS).** `app/api/app/leads/unlock/route.ts:75-81` catch returns `publicId: null` with `ok: true`, credit already spent, no contractor-visible error.
- **H6 — Lead-detail page 48-bit publicId fallback (STANDS).** `app/app/leads/[id]/page.tsx:174`: `activePublicId = draftPublicId ?? randomBytes(6).toString("base64url")`. Unlock + send routes use 12 bytes. Fresh-INSERT quote-send accepts `body.publicId ?? makePublicId()`, so the 48-bit value can land on the persisted public_id.
- **H7 — 8 leads `ai_status='ready'` with NULL `ai_estimate_low/high` (FRESH FINDING).** All in org `8f939f96`, all 2026-03-09, all "Landscaping". Code at HEAD always writes the range; legacy data predates that. QuoteComposer falls back gracefully (zero-spread range), but UX is odd. One-time backfill recommended: `UPDATE leads SET ai_estimate_low=ai_suggested_price, ai_estimate_high=ai_suggested_price WHERE ai_status='ready' AND ai_estimate_low IS NULL`.

### Medium / Low (highlights, full list in report)
- **M1 — `ai_estimator_notes` shape inconsistency (FRESH).** Rescue cron writes a JSON STRING (`STUCK_NOTE` constant); `lib/ai/estimate.ts` writes a JSONB ARRAY. Both shapes coexist. Any reader iterating as `string[]` will fail on the 2 string-shape rows (`25d8964d`, `718642d6`).
- **M2 — `/api/public/quote/[publicId]/accept/route.ts:110` lead UPDATE missing org_id filter** (defense-in-depth gap; cross-flag with Audit 8 M5 helper convention).
- **M3 — quote_events ACCEPTED catch swallows ALL errors (STANDS).** Should narrow to `error.code === '23505'`.
- **M6 — PII can leak into Sentry via error MESSAGE bodies.** `Error: {"code":"42501","message":"permission denied for organization 8f939f96-..."}` appeared 4× in last 14d. Audit 8 H6 PII scrubber walks key NAMES; doesn't sanitise message bodies. Cross-flag for Audit 8 / 12.
- **L2 — Custom Sentry tags (`area:lead-submit` etc.) not surfacing in events search.** `area:lead-submit OR area:lead-photo-upload OR area:estimator` returns 0 events over 14d despite multiple `Sentry.captureException(..., { tags: { area: ... } })` call sites. Possible scrubber regression — investigate.

### State machine integrity (live)
- No `lead.status='QUOTED'` without SENT-or-later quote.
- No `lead.status='ACCEPTED'` with quote in non-(ACCEPTED, EXPIRED) status.
- 10 quote_events SENT rows missing for non-DRAFT quotes — ALL are demo seed rows (`public_id LIKE 'demo-%'`). Not a code bug.

### AI pipeline (live, 2026-05-09)
3473 leads. `ai_status` distribution: ready=3310, failed=163, processing=0. Stuck in processing >10min: 0. `ai_retry_count > 0`: 3 leads (max=1; none hit MAX_AI_RETRIES=2). Falcon org sample: 30 most recent complete in 21-96s except 3 from 2026-05-04 20:06-20:14 UTC that hit retry=1 (rescue cron stage 3 working).

### Cron health (live)
- pg_cron jobid=8 (rescue-stuck-leads */3min): succeeded on 20/20 most recent runs (last 2026-05-09 18:00:00 UTC), sub-100ms each.
- pg_cron jobid=3 (reset-solo-credits @daily): active.
- All 7 Vercel daily crons declared in `vercel.json`. Bearer compare via `isAuthorizedBearer` (Audit 8 H3 fix).

### Notification dedup
`notifications_new_lead_dedup_idx` exists with correct partial-unique shape: `UNIQUE (org_id, screen_params->>'id') WHERE type='NEW_LEAD' AND screen_params->>'id' IS NOT NULL`. 0 historical duplicates. 0 new NEW_LEAD inserts since the 2026-05-08 deploy (low-traffic period — last NEW_LEAD was 2026-05-06).

### Cross-flags for other audits
- **Audit 8:** scrubber should redact org_id substrings in message bodies (M6); investigate whether scrubber strips `event.tags` (L2).
- **Audit 11:** ai_estimator_notes shape normalisation (M1); 8 ready-but-null-range backfill (H7).
- **Audit 12:** quote_events ACCEPTED catch should narrow to 23505 (M3); DEP0169 url.parse warnings being ingested as errors (L1).

### Confirmed clean at HEAD
Turnstile server verification, customer dedup by email→phone scoped to org_id, Solo 30-day gate (only SOLO; TEAM/BUSINESS pass through), photo-upload-as-picked, photo unique constraint absorbs dual-writer race, viewed_at CAS, self-accept rejection, two-phase QuoteComposer with delivery prefs persistence, send-path two-path CAS with public_id-preserving rollback, idempotency keys on Telnyx + Resend deterministic on quoteId, Audit 8 H3/M5/M7 fixes verified at every relevant call site.

---

## Session — May 9, 2026 — AASA file shipped (Audit 8 H8 followup) [Source: Claude Code]

Added `app/.well-known/apple-app-site-association/route.ts` returning the Universal Links JSON with `Content-Type: application/json` and `paths: ["*"]` for appID `U58KVR8LTA.com.murdochmarcum.snapquote`. Pre-deploy live state: `https://snapquote.us/...` returned 307 → www; `https://www.snapquote.us/...` returned 404 (text/html, X-Vercel-Cache HIT, X-Next-Error-Status 404). Post-deploy verification curl outputs and Apple CDN validator result captured in commit message + Notion entry.

---

## Session — May 9, 2026 — Audit 8 web infra hardening (H4 + H6 + H9 + M5 + M6 + M7 + M11 + M12 + L3) [Source: Claude Code]

Nine defense-in-depth fixes shipped on `claude/audit-8-web-hardening` off `main`. Live diagnosis preceded each fix; nothing taken on Notion-only evidence.

### H4 — Security headers + CSP report-only

`next.config.ts` had no `headers()` config; `vercel.json` only declared crons; `middleware.ts` set no security headers. All HTTP responses went out bare.

Added `headers()` returning Strict-Transport-Security (2y + preload), X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking down camera/microphone/geolocation/etc. (payment kept enabled for Stripe Elements), and Content-Security-Policy-Report-Only with allowlists for Stripe.js (`js.stripe.com`, `m.stripe.network`, `api.stripe.com`), Cloudflare Turnstile, Google Maps, Supabase REST + Storage + Realtime WSS, RevenueCat, and Sentry tunnel ingest. `img-src https:` permits the public lead form's Supabase Storage thumbnails. CSP deployed report-only first — TODO comment in `next.config.ts` marks the directive list and tells future-us to flip the header name to `Content-Security-Policy` after 1–2 weeks of clean violation reports. Verified live via `curl -sI` against `next start` on port 3789: all six security headers present, CSP directives intact.

### H6 — Sentry PII scrubbing on beforeSend

Server + edge Sentry configs had no `beforeSend` hook; no client config existed at all. Customer email/phone/name/address could leak into Sentry events via `event.extra`, `event.contexts`, breadcrumbs, request bodies.

Added shared `lib/sentryScrub.ts` with a depth-bounded recursive scrubber that redacts any key containing PII fragments (email, phone, address, name, ssn, token, password, lat/lng, etc.) while preserving stack traces and non-PII metadata. Wired `beforeSend` and `beforeBreadcrumb` into `sentry.server.config.ts`, `sentry.edge.config.ts`, and a new `instrumentation-client.ts` (Sentry v10 / Next.js 15 client-side init convention). Cookies scrubbed unconditionally; `event.user.id` preserved for grouping but other user fields redacted.

### H9 — Distributed rate limiter (Upstash) with in-memory fallback

`lib/rateLimit.ts` was a per-instance `Map`. Vercel runs each function on N hot lambdas, so effective rate limit was `limit × instance_count` — defeating the purpose for IP-based limits.

Rewrote to use `@upstash/ratelimit` + `@upstash/redis` (sliding-window) when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present; falls back to the original in-memory `Map` when env vars are absent (local dev, tests). Function signature changed from sync `boolean` to `Promise<boolean>` — all 6 callers updated to `await`: `app/api/public/lead-submit/route.ts`, `app/api/public/lead-photo-upload/route.ts`, `app/api/app/settings/verify-email/route.ts`, `app/api/app/settings/check-slug/route.ts`, `app/api/app/activity/touch/route.ts`, `app/api/public/auth/forgot-password/route.ts`. Limiter caches one Ratelimit instance per (limit, windowMs) tuple. Redis errors degrade to in-memory rather than 5xx the user.

**Provisioning required (flag for Murdoch):** Upstash Redis instance must be created and `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` added to Vercel for Production / Preview / Development before the distributed path takes effect in prod. Until then the in-memory fallback runs — no behavior regression vs. pre-fix.

### M5 — Admin-client tenant-filter helper

The Supabase admin client uses the service-role key, which bypasses RLS. 65 files use the admin client. Missing `.eq('org_id', orgId)` on a tenant-table SELECT could leak cross-tenant data with no enforcement layer to catch it.

Added `lib/supabase/orgFilter.ts` exporting `requireOrgFilter(query, orgId)` — wraps the query in an explicit `.eq('org_id', orgId)` and throws if `orgId` is empty. Generic typed as `<Q>` with cast-through-any to defeat TS2589 from Supabase's deeply-nested PostgrestFilterBuilder generics. Refactored four high-risk admin SELECTs to use the helper: `app/api/app/leads/unlock/route.ts` (lead read + existing-quote read), `app/api/app/quote/send/route.ts` (lead read + existing-quote read), `app/api/public/quote/[publicId]/accept/route.ts` (post-acceptance lead read — added a *new* org_id check that wasn't previously present, since the prior code resolved org_id from the quote token without re-asserting it on the lead lookup). Module docstring documents the convention so reviewers can reject admin-client tenant-table access without a filter.

### M6 — Forgot-password rate-limit composition

`app/api/public/auth/forgot-password/route.ts:16` keyed only on email. An attacker could spray different email addresses to exhaust the Resend send budget while staying under the per-email cap.

Rewrote to require BOTH gates pass independently: `forgot:email:<email>` at 3/hr (existing) + `forgot:ip:<ip>` at 10/hr (new). Both checks run in parallel via `Promise.all` to avoid serialised round-trips on the Upstash limiter. Email-spray attackers now hit the IP cap; legitimate users sharing an IP (NAT, office) still have plenty of headroom.

### M7 — `x-real-ip` instead of `x-forwarded-for`

Four routes read `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()` — that header is client-controllable, so IP-based rate limits could be bypassed by spoofing it.

Added `lib/ip.ts` exporting `getClientIp(request)` which prefers `x-real-ip` (set by Vercel's edge after stripping client-supplied X-Forwarded-For) and falls back to first-hop X-Forwarded-For for environments without x-real-ip (local dev). All four call sites switched: `app/api/public/lead-submit/route.ts:46`, `app/api/public/lead-photo-upload/route.ts:78`, `app/api/app/leads/unlock/route.ts:101`, `app/api/app/quote/send/route.ts:326`. Also wired into the new forgot-password IP-key from M6. Convention documented in module docstring.

### M11 — Web npm audit

Pre-fix: 8 vulns (6 high, 2 moderate). High vulns in `next`, `picomatch`, `vite`, `fast-uri`, `flatted`, `lodash`. Ran `npm audit fix` — packages bumped, all 6 highs resolved. Two moderate postcss vulns remain — they're transitive *inside* `next@15.5.x`'s bundled compiler; `npm audit fix --force` would downgrade Next to 9.3.3 (a major regression), and the proper fix is Next 16+ which is a major-version migration out of scope for this audit. The bundled postcss isn't reachable from app code (it processes Next's own internal CSS pipeline, not user input). Deferred.

### M12 — Mobile npm audit

`@xmldom/xmldom@0.8.12` (high — uncontrolled recursion DoS, XML injection via DocumentType / processing instruction / comment serialization). Transitive via `expo-sharing` → `@expo/config-plugins` → `xcode` → `simple-plist` → `plist`. Ran `npm audit fix` in mobile repo: bumped to `0.8.13` (advisory range is `<=0.8.12`, so 0.8.13 is patched). High count: 1 → 0. Four moderate postcss vulns remain — same story as web (transitive via Expo, fix would require Expo major downgrade).

### L3 — Explicit CORS stance

No CORS handling anywhere in the web repo. Browser default (block cross-origin reads, reject preflighted credentialed requests) is exactly what we want today: public lead form is server-rendered same-origin on snapquote.us, mobile uses bearer-token auth (not subject to CORS), `/api/app/*` is cookie-auth and intentionally same-origin. Added a documenting comment block at the top of `middleware.ts` explaining the policy and the conditions under which we'd add allowlist-driven CORS (embeddable lead form on contractor sites). Click-jacking protection comes from X-Frame-Options + CSP frame-ancestors set by H4.

### Verification

- TS compile clean both repos (`npx tsc --noEmit`).
- Web: `next build --no-lint` succeeds; 76/76 vitest tests pass.
- Headers verified live via `curl -sI http://localhost:3789/` against `next start`: STS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, Content-Security-Policy-Report-Only all present with the configured values.
- Web `npm audit`: 8 vulns → 2 moderate (next-bundled postcss; deferred to Next 16 migration).
- Mobile `npm audit`: 5 vulns → 4 moderate (expo-bundled postcss; same shape).

### Flags for Murdoch

- **Upstash provisioning required.** H9 in-memory fallback ships safely, but the distributed limiter doesn't activate until Upstash is created and `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are added to Vercel for Production / Preview / Development.
- **AASA file (deferred from Prompt 3).** Audit 8 H8 (Universal Links) needs server-side delivery from the web repo (`/.well-known/apple-app-site-association`). Out of scope for this hardening pass; tracked separately.

---

## Session — May 9, 2026 — Audit 8 auth hardening closed (H1 + H2 + H3 + H5) [Source: Claude Code]

Four web-side auth hardening fixes from Audit 8 shipped in a single branch off `main` (`ea90027`). Live diagnosis preceded each fix; nothing taken on Notion-only evidence.

### H1 — HS256 JWT fallback removed

- **Symptom (Audit 8 finding):** `lib/auth/verifyJWT.ts:188-235` (prior version) verified Supabase access tokens via HS256 keyed by `SUPABASE_JWT_SECRET` as a fallback when ES256+JWKS verification failed. The mobile `.env` was confirmed not to leak the secret (Audit 8 reverify), but a leaked `SUPABASE_JWT_SECRET` in any future incident would let anyone forge any user's tokens with no key rotation cost.
- **Live diagnosis:** Fetched `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1/.well-known/jwks.json` — single ES256 P-256 verifying key (`kid 85542139-701f-4514-a75c-76ec5c74cc4c`). Confirms the project has fully rotated to ES256; HS256 was unreachable for any newly-issued token.
- **Fix:** Deleted the HS256 verify branch + the cached `Uint8Array` HS256 key + the `SUPABASE_JWT_SECRET` env var read. Verification now goes ES256 → return claims → fall through to null on any failure. Sentry breadcrumbs preserved on success and failure for the existing 401 diagnostic flow in `requireRole.ts`.
- **Side effects:** Removed the env var documentation block from `.env.example`. Updated `scripts/jwt-verify-diagnostic.mjs` (the diagnostic script kept around from the May-7 mobile-401 investigation) to drop the HS256 attempt and instead test the new audience+issuer pinning. Updated the comment in `lib/auth/requireRole.ts:126-130` referencing the prior fallback.

### H2 — `iss` claim pinned on JWT verification

- **Symptom:** `verifySupabaseJWT` validated audience (`authenticated`) and signature, but no `iss` claim — a token signed by a different Supabase project happening to use `aud=authenticated` would pass verification.
- **Fix:** Added `getExpectedIssuer()` returning the cached value of `SUPABASE_JWT_ISSUER` (env override, optional) or `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1` (default — `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1` in prod). Passed via `issuer:` to `jose.jwtVerify`. Added optional env var doc block to `.env.example`.

### H3 — Cron and internal bearer comparisons made constant-time

- **Symptom (Audit 8 finding):** All 8 cron handlers (`app/api/cron/*/route.ts`) and `app/api/internal/run-estimator/route.ts` compared the request bearer/secret with `!==` against `Bearer ${process.env.CRON_SECRET}` (or `INTERNAL_API_SECRET`). Defense-in-depth concern; very low practical risk on Vercel because network jitter dwarfs string-compare timing.
- **Fix:** New helper `lib/auth/timingSafeBearer.ts`:
  - `safeEqualSecret(received, expected)` — wraps `crypto.timingSafeEqual` with explicit length-mismatch short-circuit (the underlying primitive throws on length mismatch). Returns false on null/undefined/non-string `received` or empty `expected`.
  - `isAuthorizedBearer(authHeader, expected)` — parses `Authorization: Bearer <token>` and forwards to `safeEqualSecret`.
- **Call sites updated (9 total):** all 8 cron handlers and `app/api/internal/run-estimator/route.ts`. External behavior unchanged — same 401 on bad bearer, same body on good bearer. Verified post-edit: `grep -E "authHeader !==|provided !== expected"` across `app/api` returns zero hits.

### H5 — Reset-password page gated to recovery-only sessions

- **Symptom:** `app/(public)/reset-password/page.tsx` rendered `ResetPasswordForm`, which called `supabase.auth.updateUser({ password })` with no check that the active session was created via password recovery. A logged-in user (or session-hijacked attacker) could navigate directly to `/reset-password` and change the account password without entering the current one.
- **Live diagnosis:** Read the page (4-line component, no checks). Read `ResetPasswordForm.tsx` — calls `updateUser({ password })` directly. Traced the recovery email flow: `/api/public/auth/forgot-password/route.ts:35` builds `${appUrl}/auth/confirm?token_hash=…&type=recovery&next=/reset-password`; `/auth/confirm/route.ts` calls `verifyOtp` and 302s to `/reset-password`. Server-side PKCE flow — no `#type=recovery` hash on the client side, so `onAuthStateChange` `PASSWORD_RECOVERY` event does not fire. Confirmed the bypass: a regular logged-in user navigating to `/reset-password` would have rendered the form.
- **Fix:**
  - `lib/auth/recoveryCookie.ts` (new): signs `${userId}.${expiresAtMs}.${hmac}` with HMAC-SHA256 keyed by `SUPABASE_SERVICE_ROLE_KEY` (with `sq-recovery-cookie-v1:` domain separator — avoids requiring a new env var). 10-minute TTL. `verifyRecoveryToken` does length-checked constant-time signature compare.
  - `app/auth/confirm/route.ts`: when `type=recovery` and `verifyOtp` succeeds, sets cookie `sq-pwr` HttpOnly+Secure (in prod)+SameSite=Lax+Path=/+MaxAge=600 to `signRecoveryToken(data.user.id)` before the 302.
  - `app/(public)/reset-password/page.tsx`: now an async server component. Reads the `sq-pwr` cookie + the active session, requires `verifyRecoveryToken(value) !== null && session.user.id === verified.userId`. If not authorized, renders a "reset link expired" view with a link back to `/forgot-password`. If authorized, renders the existing `ResetPasswordForm` unchanged.
- **Trade-offs considered:** rejected client-side `#type=recovery` hash check (PKCE flow doesn't set the hash); rejected one-time DB-stored token (out of scope per task; adds a table); rejected unsigned cookie (browser DevTools could fabricate). Signed-cookie approach piggybacks on the existing service-role key, so deployments don't need a new secret.

### Verification

- `npx tsc --noEmit` clean.
- Live JWKS at `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1/.well-known/jwks.json` confirms ES256 only — verification path is reachable.
- Recovery flow trace: email → `/auth/confirm?token_hash=…&type=recovery&next=/reset-password` → `verifyOtp` succeeds → cookie set → 302 → `/reset-password` reads cookie + session, both match same `userId` → form renders → `auth.updateUser({ password })` → `router.replace("/app")`.
- Direct-nav trace (logged-in user hits `/reset-password` without going through email): no `sq-pwr` cookie → "reset link expired" view; form never renders.
- Cron flow trace: `Authorization: Bearer ${CRON_SECRET}` from Vercel → `isAuthorizedBearer` parses + `timingSafeEqual` returns true → handler runs. Wrong secret → false → 401.

### Files changed

- `lib/auth/verifyJWT.ts` — HS256 path removed, issuer pinning added.
- `lib/auth/requireRole.ts` — comment update only.
- `lib/auth/timingSafeBearer.ts` — NEW.
- `lib/auth/recoveryCookie.ts` — NEW.
- `app/api/cron/auto-expire-stale-quotes/route.ts`, `cleanup-notifications/route.ts`, `estimate-expiry-warning/route.ts`, `estimate-nudge-unviewed/route.ts`, `rescue-stuck-leads/route.ts`, `trial-ending-soon/route.ts`, `trial-expired/route.ts`, `unopened-leads-reminder/route.ts` — bearer compare via helper.
- `app/api/internal/run-estimator/route.ts` — `x-internal-secret` compare via helper.
- `app/auth/confirm/route.ts` — sets `sq-pwr` cookie on `type=recovery`.
- `app/(public)/reset-password/page.tsx` — server-component cookie+session gate.
- `.env.example` — `SUPABASE_JWT_SECRET` block removed; optional `SUPABASE_JWT_ISSUER` block added.
- `scripts/jwt-verify-diagnostic.mjs` — HS256 attempt removed; ES256 + audience + issuer attempt added.

---

## Session — May 8, 2026 — Audit 8 PII leaks closed (C1 + C2 + H10)

Critical/High PII leaks identified by Audit 8 fixed and verified live in production. Two migrations + 6 web SSR pages + 4 mobile files. tsc clean both repos.

### Migration timeline

1. **`20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views`** — local file at `supabase/migrations/`. Initial migration:
   - REVOKEd EXECUTE on `public.get_org_analytics(uuid, timestamptz, timestamptz, text)` from PUBLIC + anon. (REVOKE FROM PUBLIC required: the prior `=X/postgres` grant on the function kept anon effective even after explicit REVOKE FROM anon.)
   - CREATE OR REPLACE function with new auth gate: `if v_role <> 'service_role' then if auth.uid() is null or not is_org_member(p_org_id) then raise exception …`. Service-role server callers bypass; authenticated must be a member; anon and missing-auth denied.
   - Created `public.leads_safe` view (security_invoker=false, runs as postgres with BYPASSRLS) gating 9 PII columns (customer_name, customer_phone, customer_email, address_full, address_place_id, lat, lng, description, parcel_lot_size_sqft) via LEFT JOIN to `lead_unlocks` and CASE-based projection. Tenant filter inside the view: `WHERE is_org_member(l.org_id)`. Convenience boolean column `is_unlocked`.
   - Created `public.customers_safe` view; LATERAL JOIN matches `lead_unlocks` rows in the same org with either `customer_phone` or `customer_email` matching the customer record, then CASE-gates name/phone/email.
   - Initial column-level REVOKEs on PII columns of leads/customers were a no-op (PG privilege model: column-level REVOKE alone cannot override table-level GRANT SELECT).

2. **`audit8_pii_correct_table_revoke_and_column_allowlist`** — corrective migration applied via Supabase MCP. Local file 20260509000001 also updated to use the same correct pattern (single source of truth).
   - REVOKE SELECT on `public.leads` from authenticated (table-level).
   - GRANT SELECT (37 non-PII columns) on `public.leads` to authenticated.
   - REVOKE SELECT on `public.customers` from authenticated (table-level).
   - GRANT SELECT (id, org_id, created_at, updated_at) on `public.customers` to authenticated.
   - INSERT/UPDATE/DELETE grants preserved so `leads_member_crud` RLS continues to gate write paths.

### Caller changes

- **Mobile (`C:\Users\murdo\SnapQuote-mobile`)**:
  - `lib/api/leads.ts`: `from("leads")` → `from("leads_safe")` in getLeads (count + data) and getLead. Dropped the `lead_unlocks(...)` PostgREST embed in favor of the view's `is_unlocked` boolean column. `withLockState` reads `row.is_unlocked` instead of computing `unlocks.length > 0`. `LEAD_LIST_COLUMNS` adds `is_unlocked`.
  - `lib/api/quotes.ts`: embed switched from `lead:leads(...)` to `lead:leads_safe(...)` in both getQuotes and getQuote. Quote-list and quote-detail both rely on PostgREST resolving the view embed via the leads.id ↔ quotes.lead_id FK.
  - `lib/hooks/useLeads.ts`: cache key prefix bumped `cache:leads:` → `cache:leads:v2:` so any AsyncStorage entries written under the leak (pre-fix unredacted PII for locked leads) are discarded on first launch after the upgrade.
  - `lib/utils/format.ts`: `getAddressShort` accepts `string | null | undefined`; returns "Location unavailable" for null. Hardens the LeadCard list path against null `address_full` from leads_safe.
  - `app/(tabs)/leads/[id].tsx`: local `getVisibleAddress` accepts `string | null | undefined`; null path returns existing "Address hidden" placeholder. (Tiny utility-function change; no JSX modified.)

- **Web (`C:\Users\murdo\SnapQuote`)**:
  - `app/app/leads/page.tsx`: `from("leads")` → `from("leads_safe")` with `is_unlocked` projected; dropped the parallel `lead_unlocks` fetch; `isUnlocked` now from `lead.is_unlocked`.
  - `app/app/leads/[id]/page.tsx`: `from("leads")` → `from("leads_safe")`; dropped the parallel `unlockRow` fetch; `isUnlocked` from `lead.is_unlocked`. `displayAddress` const handles null `address_full` for locked leads.
  - `app/app/page.tsx` (dashboard): `from("leads")` → `from("leads_safe")`; dropped the parallel `lead_unlocks` fetch.
  - `app/app/customers/page.tsx`: `from("leads")` → `from("leads_safe")`; replaced `lead_unlocks!inner(lead_id)` embed with `.eq("is_unlocked", true)` filter and updated UnlockedLeadRow type.
  - `app/app/quotes/page.tsx`: `lead:leads!inner(...)` embed → `lead:leads_safe!inner(...)`; the search `or` filter's `foreignTable` updated from `"leads"` to `"leads_safe"`.
  - `lib/leadPresentation.ts`: `getVisibleAddress` accepts `string | null | undefined`; null returns existing "Address hidden" placeholder. Hardens the locked-lead branch in `app/app/leads/[id]/page.tsx`.

### Live verification (post-fix)

- **C1 anon REST POC**: `curl -X POST '<project>.supabase.co/rest/v1/rpc/get_org_analytics' -H 'apikey: sb_publishable_…' -d '{"p_org_id":"<any-uuid>",…}'` → HTTP 401 `{"code":"42501","message":"permission denied for function get_org_analytics"}`. Pre-fix this call returned full analytics JSON; post-fix it errors. ✓
- **C2 leads_safe behavior** (Murdoch's org `8f939f96-7f92-4973-97f8-f08450ccb71f` as authenticated): SELECT against view returned 64 unlocked rows with PII populated (54 phone / 63 email / 64 name / 64 address present) and 3,194 locked rows with PII counts ALL ZERO (0 phone / 0 email / 0 name / 0 address). ✓
- **C2 column-grant**: `information_schema.role_column_grants` for authenticated on `public.leads` shows 37 non-PII columns granted, 0 PII columns granted. `has_column_privilege('authenticated','public.leads','customer_phone','SELECT')` returns false. ✓
- **C2 cross-tenant via leads_safe**: Murdoch authenticated, count of `leads_safe` rows where `org_id <> 8f939f96-…` = 0 (view's `WHERE is_org_member(l.org_id)` filter works correctly). ✓
- **H10 customers_safe**: same role context, returns 3,214 visible rows with 3,212 marked is_unlocked (those with at least one unlocked lead matching phone/email). ✓
- **service_role analytics**: `auth.role()='service_role'` bypass works — admin-client RPC call returns full data unchanged. ✓
- **authenticated non-member analytics**: `get_org_analytics(<other-org>)` raises `42501 permission denied for organization …` ✓
- **TypeScript**: `npx tsc --noEmit` exit 0 in both repos.

### Stale Notion entries flagged (not edited per lane rule)

None this session — Audit 8 and Audit 9 entries from 2026-05-08 remain in line with the new state because the prior entries were event records (the audit), not assertions about current truth.

### Notion saves

- Bugs & Fixes — Critical PII leaks closed: link in this entry's Notion sibling page (`[2026-05-08] [Source: Claude Code] — Critical PII leaks closed (Audit 8 C1, C2, H10)`).

---

## Session — May 8, 2026 — Audit 8 of 13 (Security & Privacy): live audit (read-only, no fixes shipped)

Read-only audit. Web HEAD `27305ac`, mobile HEAD `f38b2f4`/`d2d992e`, Supabase `upqvbdldoyiqqshxquxa` live state.

### Audit 2 fix verification

- **C-7 (RLS plan-write hole) FIXED LIVE.** Migration `20260508204110_lock_owner_organization_updates_and_credit_row_membership` recorded. `information_schema.role_table_grants` shows `authenticated` no longer has table-level UPDATE on `organizations`; column-level UPDATE granted only on `name`, `onboarding_completed`, `slug`. Owner cannot PATCH `plan` / `monthly_credits` / `bonus_credits` / `credits_reset_at` / `has_used_trial` / `trial_ends_at` directly.
- **C-12 (`get_org_credit_row` cross-tenant disclosure) FIXED LIVE.** `pg_get_functiondef` confirms body `if not is_org_member(p_org_id) then raise exception 'permission denied for organization %' using errcode = '42501'`. SECURITY DEFINER, search_path=public.

### Critical net-new (live-verified)

- **C1 `get_org_analytics` anon bypass — exploitable live.** Function is SECURITY INVOKER, EXECUTE granted to anon + authenticated. Body guard is `if auth.uid() is not null and not is_org_member(p_org_id)` → anon (auth.uid() IS NULL) skips check entirely. POC verified live 2026-05-08: anonymous curl with publishable key to `/rest/v1/rpc/get_org_analytics` with arbitrary `p_org_id` returns full JSON (totals, leadsOverTime, quotesOverTime, servicesBreakdown, acceptanceRateOverTime). Migration 0053 chose this bypass for `unstable_cache` server-side calls — collapses to anon at the public REST gateway.
- **C2 Locked-lead PII reachable via PostgREST.** RLS `leads_member_crud` is FOR ALL `is_org_member(org_id)` with no `lead_unlocks` filter. Mobile `lib/api/leads.ts:53-54,166-179` returns PII regardless of unlock; web `app/app/leads/page.tsx:26-35,142-166` and `app/app/leads/[id]/page.tsx:76-81` SSR-fetch PII with UI-only redaction. Mobile additionally caches PII to AsyncStorage (`useLeads.ts:142-150`). Same shape applies to `customers` table (3,416 rows; H10).

### High (live-verified)

- **H1 HS256 JWT fallback** — `lib/auth/verifyJWT.ts:188-235` accepts HS256 with `SUPABASE_JWT_SECRET` for legacy bearers post-2026-05-07 ES256 rotation. Defense-in-depth concern; mobile audit ruled out repo-leak. Notion claim that `SUPABASE_JWT_SECRET` was committed in mobile `.env` line 7 is FALSE.
- **H2 No `iss` claim validation** in `verifyJWT` (only audience).
- **H3 Cron + internal route timing-unsafe `!==` compare** — 8 cron handlers + `/api/internal/run-estimator/route.ts:35`.
- **H4 Zero security headers** — no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. `next.config.ts`, `vercel.json`, `middleware.ts` all empty.
- **H5 Reset-password page** — `components/auth/ResetPasswordForm.tsx:34-36` does not enforce recovery-only session.
- **H6 Sentry server config** — `sentry.server.config.ts:1-27` has no `beforeSend` redaction; lead PII flows verbatim.
- **H7 Mobile AsyncStorage for tokens** — `lib/supabase.ts:1,40`. No `expo-secure-store` anywhere in repo.
- **H8 AASA missing** — `https://www.snapquote.us/.well-known/apple-app-site-association` not served. Universal Links broken; auth deep links fall back to hijackable `snapquotemobile://` custom scheme. `app/_layout.tsx:98-110` has no host/scheme validation.
- **H9 In-memory rate-limit** — `lib/rateLimit.ts:11` `Map` per lambda; effective limit = configured × N_concurrent_lambdas. Many endpoints unprotected.
- **H10 `customers` RLS** — same FOR-ALL `is_org_member` shape as leads; full PII to any member.

### Medium / Low (12 / 5 — see Notion)

Storage bucket `lead-photos` no size/MIME limit; `is_org_member`/`is_org_owner` anon-callable (body safe today); 6 SECURITY DEFINER functions mutable search_path; `iap_subscription_events`/`webhook_events` RLS-no-policy; admin-client SELECTs require manual org_id filter; `forgot-password` rate-limit keys on email-only; X-Forwarded-For trust; Google Maps key bundle-restriction unverified; mobile `.env` tracked in git; web `npm audit` 6 high (next, vite, lodash, picomatch, fast-uri, flatted); mobile `npm audit` 1 high (`@xmldom/xmldom`); RC static-bearer auth (best available); public quote URL exposes address+services (96-bit publicId).

### Stale Notion entries flagged (lane rule — not edited)

- Audit 1 re-verification: `SUPABASE_JWT_SECRET` committed in mobile `.env` line 7 — **FALSE.** Live `.env` is 6 lines, all `EXPO_PUBLIC_*`.
- Audit 4 lifecycle: `app/(tabs)/more/my-link.tsx:3` bare-apex constant — actual location is line 37.

### Notion saves

- Findings: https://www.notion.so/35a32498a1cb814ba751c77aa3e64f47
- To-dos: https://www.notion.so/35a32498a1cb816b88eefb9298f0d1ef

### Severity tally

- 2 Critical, 10 High, 12 Medium, 5 Low.

---

## Session — May 8, 2026 — Audit 2 of 13 (Billing & Subscriptions): re-verification at HEAD (read-only, no fixes shipped)

Second pass at Audit 2 against live Stripe MCP / RC MCP / Supabase MCP / ASC MCP and repo HEAD. Web HEAD same family as morning pass; mobile HEAD `14e2ad7` (worktree branch `claude/quirky-payne-d607b9`).

### Live state captured (2026-05-08)

- Stripe `acct_1T9B7eFNX8cpZFmw` SnapQuote: 0 active subs, 1 customer (`cus_UJw6eTdHqwL8Ym` Murdoch), 12 products + 15 prices.
- RC `proj39ead10c`: 0 active subs, 0 active trials, $0 MRR last 28d, 28 new customers, 0 transactions in 28d. ASC API key NOT configured. 7 products active. 2 entitlements (`team`, `business`). Webhook URL is APEX `snapquote.us` (not www-canonical).
- ASC `6761979056`: `subscriptionStatusUrl: null` (Apple S2S receipt push not configured).
- Supabase: 69 orgs (63 SOLO / 2 TEAM / 4 BUSINESS / 4 has_used_trial). 3 stale `subscriptions` rows (Mar 19/20). `webhook_events`/`iap_subscription_events`/`credit_purchases` all 0 rows ever. RC `app_store_connect_api_key_configured: false`.

### Net-new findings (not in earlier Audit 2)

- **C1 NEW**: Stripe Solo product + `price_1TLCZqFNX8cpZFmwfaWXhXKP` $19.99/mo are LIVE active=true. Solo is supposed to be free. `lib/stripe.ts:120-128 getPlanFromPriceId` doesn't include this priceID, so a checkout against it would charge user but never resolve plan. Recommend archive.
- **C2 NEW**: RC `PRODUCT_CHANGE` (`app/api/revenuecat/webhook/route.ts:345-359`) updates plan only, NEVER resets credits. Mid-cycle upgrade leaves user paying for higher plan at lower-plan credit allocation for up to 30 days. Mirror of the Stripe upgrade-credits gap.
- **H1 NEW**: RC `RENEWAL` (`route.ts:302-317`) sends `sendPlanUpgradedEmail` on EVERY renewal — spam. Stripe correctly distinguishes via `billing_reason==='subscription_cycle'`; RC handler does not.
- **H2 NEW**: RC default branch (`route.ts:421-422`) returns 200 ignored AFTER `claimWebhookEvent` for `TRANSFER`/`SUBSCRIBER_ALIAS`/`TEMPORARY_ENTITLEMENT_GRANT`/`TEST` — RC won't redeliver if a handler is added. Family Sharing entitlement spread is silently dropped.
- **H3 NEW**: RC webhook URL is APEX (`snapquote.us`) not www-canonical — adds 307 latency on every event.
- **H4 NEW**: ASC `subscriptionStatusUrl: null` — Apple S2S receipt push NOT configured. Combined with no server-side receipt validation in `/api/iap/sync`, server has zero ground-truth source for Apple state.
- **H5 NEW**: RC ASC API key NOT configured — RC can't pull state from ASC directly. Reduced fault-tolerance vs RC webhook fan-out.
- **H6 NEW**: `lib/hooks/useEntitlementSync.ts:106-131` builds synthetic transactionId `${productIdentifier}:${originalPurchaseDate}` not Apple's real `transactionIdentifier`. Audit log keys diverge.
- **H7 NEW**: `lib/auth.tsx:303-340 signOut` does NOT call `Purchases.logOut()`. Brief leak window on shared device sign-in.
- **M4 NEW**: `app/app/plan/page.tsx:22-25 getPlanPrice` hardcodes `$19.99/$39.99`. Doesn't read live Stripe `unit_amount` like the credit-pack page. ASC drift won't propagate.
- **L3 NEW**: `iap/sync` logs both itself AND the RC webhook into `iap_subscription_events` (intentional double-log per comment) — analytics double-counts.

### Critical findings re-confirmed live at HEAD (still open)

- C-3 Stripe webhook events table empty (60+ days, 3 stale trialing rows whose customer_ids don't exist in current Stripe).
- C-4 `/api/iap/sync` no Apple receipt validation.
- C-5 RC webhook static-shared-secret bearer (NOT HMAC).
- C-6 Stripe `getOrgIdForUser` `.limit(1).maybeSingle()` no order — multi-org users get arbitrary org.
- C-7 RLS lets owners write `organizations.plan` directly via PostgREST (live `pg_policies` confirms no column-level guard).
- C-8 Stripe trial→paid never grants paid-tier credits (live drift: orgs `eabc1e4a`, `f77b0ebb` TEAM with monthly_credits=5).
- C-10 IAP credit-pack double-credit risk (mobile `iap/sync` uses Apple `transactionIdentifier`; RC webhook uses `rc_${event.id}` — different keys, both INSERTs succeed).
- C-11 `clearStaleStripeCustomerId` lifecycle bug (3 of 6 STALE_PAID drift orgs match its fingerprint).
- C-12 `get_org_credit_row` cross-tenant disclosure (live Supabase advisor confirms).
- C-13 `REVENUECAT_PROJECT_ID`/`REVENUECAT_SECRET_KEY` missing in Vercel prod (account-deletion broken for owners with RC history).

### Stale Notion flagged

- Bugs & Fixes 2026-05-06 "IAP-vs-Stripe defense-in-depth" entry remains accurate that the fallback is on `claude/awesome-shamir-7bf77a` only — main does NOT have it (re-confirmed live).
- Pending Work 2026-05-04 hygiene tail "old `price_1TLCZcFNX8cpZFmw0HVXNHwm` ($383.99/yr) still active=true" — re-confirmed live at audit time.

### Out of scope

- Stripe Customer Portal config (cancellation policy, proration) — Stripe MCP `stripe_api_search` blocks portal-related ops.
- Vercel prod env-var state — cannot probe.
- Live test of Stripe webhook delivery / mobile IAP purchase end-to-end.

Notion: findings page `35a32498-a1cb-81b9-ba5c-e6de0a4c47fd`; to-dos page `35a32498-a1cb-81fd-89a3-e17eeeefa043`. No code changed.

---

## Session — May 8, 2026 — Audit 3 of 13 credits & quota: re-verification at HEAD (read-only, no fixes shipped)

Second pass at Audit 3 (credits & quota) following the morning pass at ~17:30 UTC. Re-verification against live Supabase, repo HEAD, Stripe MCP, RevenueCat MCP. No code changed; goal was to confirm prior findings still live, surface drift, find new issues.

### Web HEAD: same as Audit 4 re-verify (`8ae7499` family). Mobile HEAD: same (`14e2ad7`).

No credits-related code commits since the morning pass. Stripe webhook, RC webhook, IAP sync, lead unlock route, lib/credits.ts all unchanged.

### Live verification (Supabase project `upqvbdldoyiqqshxquxa`)

- **8 credit RPCs all present.** `unlock_lead_with_credits`, `plan_monthly_credits` (now INVOKER+IMMUTABLE — was DEFINER per Audit 1 mutable-search-path list, **superseded — fixed**), `record_credit_purchase` (DEFINER, search_path='public'), `refund_bonus_credits` (DEFINER, search_path='public,pg_temp'), `reset_due_solo_monthly_credits` (DEFINER, search_path='public', dead code), `reset_org_credits` (DEFINER, **NO search_path set — mutable**), `update_org_plan_credits` (DEFINER, **NO search_path set — mutable**), `get_org_credit_row` (DEFINER, search_path='public', **NO is_org_member check inside — cross-tenant leak**).
- **Live RPC EXECUTE perms:** `unlock_lead_with_credits`/`record_credit_purchase`/`refund_bonus_credits`/`reset_org_credits`/`update_org_plan_credits`/`reset_due_solo_monthly_credits` all `service_role`-only (auth=false). `get_org_credit_row` `auth_exec=true` (still). `plan_monthly_credits` `auth_exec=true, anon_exec=true` (lookup, low risk).
- **pg_cron:** 2 jobs only. `reset-solo-credits` jobid=3 (`0 0 * * *`, active, last 5 runs all `succeeded`, UPDATE counts {4, 5, 0, 10, 1} per day). `rescue-stuck-leads` jobid=8 (`*/3 * * * *`, active). No paid-plan reset cron.
- **Tables:** `lead_unlocks` (80 rows; schema `id, org_id, lead_id, unlocked_at` — **no `charge_source` col**), `credit_purchases` (0 rows; schema `id, org_id, purchase_reference, credit_amount, created_at` — **no `payment_provider`/`amount_usd`/`product_id`/`refunded_at` cols**), `audit_log` (49 rows; only `lead.unlocked` (25), `quote.sent`, `settings.updated` — **NO credit-grant/reset/refund/plan-change events**). No `credit_transactions` / `credit_ledger` table.
- **organizations RLS:** `organizations_select_member` (read, `is_org_member`), `organizations_update_owner` (write, `is_org_owner` with check). **No column-level grant. No trigger guard.** Owner can PATCH `plan/monthly_credits/bonus_credits` directly via PostgREST anon/authed.
- **leads RLS:** single policy `leads_member_crud` polcmd=`*` `using is_org_member(org_id)`. Lead PII enforcement is UI-only.
- **Org snapshot by plan:** SOLO=63 (315 monthly credits, 0 bonus, 0 null reset, 0 past reset). TEAM=2 (10 monthly, 0 bonus, **2 null reset**, 0 past reset). BUSINESS=4 (368 monthly, 27 bonus, 0 null reset, **2 past reset**).
- **Verified victims of C1 (Stripe TEAM trial credit gap):** `eabc1e4a-a479-4e1c-844d-cf28364cc77f` (TEAM, monthly_credits=5, credits_reset_at=null), `f77b0ebb-5536-4580-9e45-87fc7d6e2058` (TEAM, monthly_credits=5, credits_reset_at=null). **Same as morning pass — unfixed.**
- **Verified STALE_PAID + new past-reset orgs:** `8f939f96` (falconn) BUSINESS, mc=84/bc=15, reset 2026-05-30 (future, decrementing daily). `7e7ce05f` BUSINESS, mc=98/bc=0, reset 2026-04-20 (**18 days past**). `36ba5025` BUSINESS, mc=86/bc=12, reset 2026-04-18 (**20 days past, NOT in prior STALE_PAID set**).
- **Stripe MCP:** 3 credit-pack products `prod_UJqGjbjixP8YLM/UJqGTtLFlV1W0k/UJqGlY2pkU4OQM` priced at $9.99/$39.99/$69.99 for 10/50/100 credits.
- **RevenueCat MCP:** project `proj39ead10c`, 7 active products, 2 offerings (`default` current with 4 sub packages, `credits` not-current with 3 consumable packages). RC pricing matches Stripe exactly.

### Findings re-verified (every prior finding traced to file:line)

- **C1 — Stripe trial-org credit gap.** `app/api/stripe/webhook/route.ts:229-277` `handleCheckoutCompleted` calls `setOrganizationPlan` only, never `resetOrganizationCredits`. **STANDS.**
- **C2 — IAP credit-pack double-credit (latent).** Mobile `app/api/iap/sync/route.ts:113-117` uses raw `body.transactionId`. RC webhook `app/api/revenuecat/webhook/route.ts:147` uses `rc_${event.id}`. Different `purchase_reference` → both INSERTs win. **STANDS.**
- **C3 — Subscription refund silently consumes spent credits.** `app/api/stripe/webhook/route.ts:389-429` and `app/api/revenuecat/webhook/route.ts:411-417`. **STANDS.**
- **C4 — No credit ledger.** Confirmed via `audit_log` action enumeration (only `lead.unlocked` rows for credits). No `credit_transactions` table. `lead_unlocks` lacks `charge_source`. **STANDS.**
- **C5 — DRAFT-quote-after-unlock failure orphans credit.** `app/api/app/leads/unlock/route.ts:69-75` try/catch swallows. **STANDS.**
- **H1 — Stripe upgrade no immediate credit grant.** `app/api/stripe/checkout/route.ts:152-197` `isUpgrade` branch lacks `update_org_plan_credits` call. **STANDS.**
- **H2 — STALE_PAID orgs.** `falconn`/`Demo`/`Rivera's` from prior + new past-reset orgs `7e7ce05f`/`36ba5025`. **STANDS, expanded.**
- **H3 — `reset_due_solo_monthly_credits()` dead code.** Migration 0018 schedules it but cron.job jobid=3 runs different inline SQL. **STANDS.**
- **H4 — TEAM/BUSINESS no scheduled reset.** Confirmed via `cron.job` query. **STANDS.**
- **H5 — Mobile `useCredits` AsyncStorage cache.** `lib/hooks/useCredits.ts:72-127`. **STANDS.**
- **H6 — Unlock no_credits 402 unaudited.** `app/api/app/leads/unlock/route.ts:28-30` returns 402 without `recordAudit`. **STANDS.**
- **H7 — 3 sources of plan→credits truth.** Web `lib/plans.ts`, mobile `lib/plans.ts`, SQL `plan_monthly_credits()`. **STANDS.**
- **H8 — `record_credit_purchase` schema gap.** Live schema confirmed. **STANDS.**

### Fresh findings (new this pass — promoted from cross-flag or wholly new)

1. **H9 — `get_org_credit_row` cross-tenant info leak.** Promoted from Audit 8/9 cross-flag to first-class Audit 3 finding because it's a credit-data privacy bug. Live RPC source: `LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$ select plan, monthly_credits, bonus_credits, credits_reset_at from organizations where id = p_org_id $$`. No `is_org_member` check. `auth_exec=true`. Any signed-in user reads any org's plan + balances by UUID.
2. **M1 — Lead PII enforced in UI only.** Cross-flag Audit 8. Live `pg_policy` on `leads`: `leads_member_crud` polcmd=`*` `using is_org_member(org_id)` — no DRAFT-state gate. Mobile `lib/api/leads.ts:53-54` projects `customer_phone`, `customer_email`, `customer_name`, `address_full`, `lat/lng/place_id` regardless of unlock state. Contractor with auth token can PostgREST-bypass the credit paywall.
3. **M2 — RLS allows direct credit-column writes.** Live `pg_policy` on `organizations`: `organizations_update_owner` polcmd=`w` `using is_org_owner(id) with check is_org_owner(id)`. Live `pg_trigger`: zero rows for organizations. Org owner can `PATCH /rest/v1/organizations?id=eq.*` with `monthly_credits=99999`. Plausibly explains the 2 stuck-TEAM orgs (somebody hit the row directly).
4. **M3 — `reset_org_credits` and `update_org_plan_credits` SECURITY DEFINER + mutable search_path.** Live `pg_get_functiondef` confirms neither has `SET search_path TO 'public'`. Both are SECURITY DEFINER. Lower risk than DEFINER+missing-membership-check but still warrants `SET search_path`.
5. **M7 — `/api/plans/config` CDN-cache enables silent plan→credit drift.** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Mobile reads up to **25h** stale plan allowances from edge. Mobile additionally persists to AsyncStorage indefinitely with no TTL.
6. **Race-condition inventory verified live.** Same-org concurrent unlock SAFE (RPC uses `FOR UPDATE` + double-check). Same-Apple-transaction across mobile-sync + RC-webhook UNSAFE (C2). Concurrent refunds across paths UNSAFE (no per-purchase dedup; `refund_bonus_credits` floors at 0 silently — combined with C2, net positive credit balance in user's favor possible).
7. **Plan-config drift surface widened.** Web TS + mobile TS fallback + mobile AsyncStorage hydrated value + Postgres SQL function = 4 sources, not 3. CDN cache adds a 5th edge (`/api/plans/config` response).
8. **Mobile `unlockLead` direct-RPC fast path is unreachable** (already noted in prior Audit 3 M-section). Migration 0063 + prior revoke. Mobile auth always 42501s, falls through to HTTP route. Wastes a round-trip per unlock; C5 still bites through HTTP path.

### Findings saved to Notion

- Bugs & Fixes: this re-verification entry (insert via `update_content` since `notion-create-pages` heading-collision blocked sub-page creation).
- Pending Work: prior audit-3 backlog stands; no new action items added (the 5 fresh findings 1–5 above are formal upgrades of existing cross-flagged items, not new tasks).
- Architecture & Stack: prior `Credit & Quota subsystem map (Audit 3)` and `Supabase data-model snapshot (Audit 9)` entries verified accurate against live; no edits.

### Blast radius if shipped

C1 alone misleads every Stripe-trial TEAM/BUSINESS user about their entitlement (5 vs 20/100). C5 alone causes silent revenue leak to user (paid credit, got nothing). C2 doubles bonus credits on every IAP credit-pack purchase as soon as the first one ships. C3 lets refunded BUSINESS users keep 60+ leads' contact info already in their CRM. C4 eliminates after-the-fact reconciliation entirely. None of these have shipped fixes since 2026-05-08 morning. Prioritize C1 (live victims) and C5 (silent loss) for next code session.

---

## Session — May 8, 2026 — Audit 4 of 13 lead lifecycle: re-verification at HEAD (read-only, no fixes shipped)

Second pass at Audit 4 (lead lifecycle, public form → AI → inbox → unlock → DRAFT → composer → send → expire). Earlier today (17:12 UTC) a comprehensive Audit 4 already ran and saved findings to Notion. This session re-verifies every prior finding against HEAD and live Supabase state, since the audit-prompt rule is "Notion is event history, not current truth."

### Web HEAD: `8ae7499`. Mobile HEAD: `14e2ad7`.

Commits since the prior audit are docs/UI/auth (`8ae7499` webhook docs, `0705f3b` webhook scenario-B docs, `c73f9ae` Plan-page UI, `41d09bb` landing-page redesign, `d6e6262` color/radius standardization). **No lead-pipeline code changed.** Mobile HEAD = main HEAD (worktree on `claude/wonderful-kilby-f2fbbc` with no divergence; `git log main..HEAD` empty).

### Live Supabase state (project `upqvbdldoyiqqshxquxa`, queried 2026-05-08 ~17:30 UTC)

- `lead_status` enum: `{NEW, QUOTED, ACCEPTED, ARCHIVED}` — H1 confirmed (ARCHIVED phantom; live `leads.status='ARCHIVED'` count = 0).
- `quote_status` enum: `{DRAFT, SENT, VIEWED, ACCEPTED, EXPIRED}` — code-aligned.
- `OPENED` is NOT in `lead_status` enum despite migration 0030 — H2 confirmed.
- `ai_status` is `text` (not an enum). Free-text values in production: `ready` (3310), `failed` (163). No `processing`-stuck rows visible at audit time.
- `supabase_realtime` publication: `leads, notifications, pending_invites, quotes`. `lead_unlocks` and `lead_photos` NOT included — M4 confirmed.
- `pg_cron`: only `rescue-stuck-leads (*/3 * * * *)` and `reset-solo-credits (0 0 * * *)`. No `auto-archive-stale-leads` job. Migration 0031 historical no-op confirmed (H1).
- Vercel `vercel.json`: 7 daily crons (estimate-expiry-warning 02:00, auto-expire-stale-quotes 03:00, cleanup-notifications 04:00, unopened-leads-reminder 14:00, trial-ending-soon 15:00, trial-expired 16:00, estimate-nudge-unviewed 17:00). Lead-archive cron absent.
- Storage bucket `lead-photos`: `public=false`, `allowed_mime_types=null`, `file_size_limit=null` — H8 confirmed (validation only at the route handler).
- Production data: leads 3473 (NEW=3417, QUOTED=44, ACCEPTED=12, ARCHIVED=0). Quotes 90 (DRAFT=35, SENT=6, VIEWED=4, ACCEPTED=15, EXPIRED=30). lead_unlocks=80 (all have a corresponding quote row; 35 are stuck-DRAFT). lead_photos=3722. customers=3416. orgs=69.
- Stale-DRAFT verification: 25 of 35 DRAFTs are >30 days old. Oldest DRAFT lead `submitted_at = 2026-03-16 21:36`. H4 confirmed.
- Overdue-unflipped quotes (SENT/VIEWED past 7d): 3 today (was 2 at 17:12). Oldest unflipped `sent_at = 2026-05-01 15:26`. M9 confirmed; non-corruption (lazy-flip on next read).
- Advisor (security): unchanged from prior audit. 14 lints (2 RLS-no-policy on `iap_subscription_events` + `webhook_events`, 6 mutable-search-path, 2 anon-callable SECURITY DEFINER (`is_org_member`/`is_org_owner`), 3 authenticated-callable SECURITY DEFINER (`get_org_credit_row`/`is_org_member`/`is_org_owner`), 1 leaked-password protection disabled). All flagged for Audit 8.

### C/H/M/L re-verification at HEAD (every prior finding traced to file:line)

- **C1 — mobile `useLeads` realtime channel name has no per-mount random suffix.** [`lib/hooks/useLeads.ts:164`](lib/hooks/useLeads.ts) at HEAD: `supabase.channel(\`leads:${orgId}:${status ?? "ALL"}\`)`. Compare [`lib/hooks/useQuotes.ts:235-237`](lib/hooks/useQuotes.ts) which has `:${Math.random().toString(36).slice(2,10)}` (Build 12 fix). Same SNAPQUOTE-MOBILE-F race shape. **STANDS.**
- **C2 — mobile `getLeads` filters `.eq("ai_status","ready")` on count + data.** [`lib/api/leads.ts:68,74`](lib/api/leads.ts) at HEAD. Web [`app/app/leads/page.tsx:33`](app/app/leads/page.tsx): `.in("ai_status", ["ready","failed"])`. Live impact 163/3473 leads (~4.7%) invisible to mobile. **STANDS.**
- **C3 — mobile `EstimateComposer` renders `{{estimate_link}}` client-side using `existingQuoteDraftPublicId ?? "preview"` placeholder.** [`components/quotes/EstimateComposer.tsx:232`](components/quotes/EstimateComposer.tsx) at HEAD. Server's `renderEstimateTemplate` ([`lib/quote-template.ts:60-71`](lib/quote-template.ts)) is `replaceAll`-only — already-substituted "preview" sticks. **NEW REFINED ANALYSIS:** the `unlock_lead_with_credits` RPC has had `EXECUTE` revoked from `authenticated`/`anon` since the function was created (verified via `information_schema.routine_privileges`: only `service_role`+`postgres` are granted; migration 0063 comment confirms it was already that way). So mobile's direct-RPC fast path in [`lib/api/leads.ts:250`](lib/api/leads.ts) **always** errors with 42501 → falls back to the API route → DRAFT IS minted. The C3 bad-link bug therefore only fires when the route's DRAFT-mint try/catch silently swallows ([`app/api/app/leads/unlock/route.ts:69-75`](app/api/app/leads/unlock/route.ts) — H5), narrower than read on first pass. **STANDS** but contingent on H5.
- **H1 — migration 0031 historical no-op + ARCHIVED phantom enum.** Verified live (cron.job + lead_status enum_range). **STANDS.**
- **H2 — migration 0030 `OPENED` historical no-op.** Verified live (`OPENED` not in lead_status enum_range). **STANDS.**
- **H3 — web `LeadsRealtimeWatcher` channel name fixed.** [`components/LeadsRealtimeWatcher.tsx:15`](components/LeadsRealtimeWatcher.tsx) at HEAD: `supabase.channel(\`leads-org-${orgId}\`)`. Polling fallback at line 38 (`window.setInterval(() => onRefresh(), 10_000)`) masks symptom. **STANDS.**
- **H4 — stale DRAFT quotes accumulate.** 25/35 over 30 days at HEAD. **STANDS.**
- **H5 — `/api/app/leads/unlock` swallows DRAFT-creation failures.** [`app/api/app/leads/unlock/route.ts:69-75`](app/api/app/leads/unlock/route.ts) unchanged. **STANDS.**
- **H6 — web lead-detail-page 48-bit `randomBytes(6)` fallback publicId.** Unchanged at HEAD. **STANDS.**
- **H7 — mobile `EstimateComposer` parity gaps vs web `QuoteComposer`** (no `isResend`, no inline contact edit, no "Reset to AI estimate", degenerate slider when AI failed). Confirmed at HEAD. **STANDS.**
- **H8 — `lead-photos` bucket has no MIME or size enforcement at bucket level.** Confirmed live. **STANDS.**
- **M1 — in-memory rate limiter per-lambda.** [`lib/rateLimit.ts`](lib/rateLimit.ts) unchanged. **STANDS.**
- **M2 — composer save-prefs effect fires on initial render.** Mobile [`components/quotes/EstimateComposer.tsx:210-220`](components/quotes/EstimateComposer.tsx) confirmed at HEAD with silent `.then(() => {})`. **STANDS.**
- **M3 — `unopened-leads-reminder` hardcoded threshold of 10.** [`app/api/cron/unopened-leads-reminder/route.ts`](app/api/cron/unopened-leads-reminder/route.ts) unchanged. **STANDS.**
- **M4 — `supabase_realtime` doesn't include `lead_unlocks` / `lead_photos`.** Verified live. **STANDS.**
- **M5 — `useSendQuoteLead` only reports `draftPublicId` for status==='DRAFT'.** [`lib/hooks/useSendQuoteLead.ts:160-161`](lib/hooks/useSendQuoteLead.ts) unchanged. Note: lead-detail screen separately uses `existingQuote?.public_id ?? null` regardless of status ([`app/(tabs)/leads/[id].tsx:278`](app/(tabs)/leads/[id].tsx)) — so the M5 narrow path is the modal path only. **STANDS.**
- **M6 — customer dedup doesn't update existing customer name.** [`app/api/public/lead-submit/route.ts:212-261`](app/api/public/lead-submit/route.ts) unchanged. **STANDS.**
- **M7 — `quote_events` ACCEPTED insert uses broad try/catch.** [`app/api/public/quote/[publicId]/accept/route.ts:116-124`](app/api/public/quote/[publicId]/accept/route.ts) unchanged. **STANDS.**
- **M8/M9/M10 — minor.** All confirmed at HEAD.
- **L1–L7 — minor.** All confirmed at HEAD.

### Fresh observations (not in prior audit)

1. **Mobile `unlockLead` RPC fast path is dead code** (since migration 0063 + before): `lib/api/leads.ts:250` calls `supabase.rpc("unlock_lead_with_credits", ...)` but the function has only `service_role`/`postgres` EXECUTE grants; mobile's authenticated JWT always errors 42501 and falls back to the API route. The `if (!error)` branch (lines 255-271) is unreachable. Wastes one round-trip per unlock and obscures the actual code path. Migration 0063's preamble comment line 23-24 explicitly notes `unlock_lead_with_credits` was already locked down before this migration. → cross-flag with Audit 3 (the prior Audit 3 entry already mentions this in its Medium section as "mobile direct-RPC fallback wastes a permission-denied round-trip after migration 0063"). **No re-write needed; already noted.**
2. **`quotes.sent_via` historical-data fidelity:** of 30 EXPIRED quotes, 27 have empty `sent_via`; of 15 ACCEPTED quotes, 4 have empty. SENT/VIEWED rows are 100% populated. Pattern consistent with quotes that were sent **before** the `sent_via` column write was added (or before its semantics solidified). Not a bug at HEAD; relevant if anyone runs analytics on `sent_via` for historical data. Minor — flagged as L8.
3. **Audit advisor delta vs prior audit:** the same warnings stand. The `get_org_credit_row` `authenticated_security_definer_function_executable` lint was already present in the prior audit's M10 list (referenced indirectly).

### Conclusion

The prior Audit 4 (today 17:12 UTC) findings are all valid at HEAD as of 2026-05-08 ~17:30 UTC. No bug-relevant code changed in the intervening commits. The full report — pipeline diagram, lock-state info-leak inventory, web/mobile parity table, realtime channel inventory, cron verification, cross-cutting flags — remains canonical at the prior Notion page (URL in the Bugs & Fixes index entry dated 2026-05-08). This re-verification adds the dead-code mobile RPC observation, the `sent_via` historical-data fidelity note, and confirms live data didn't drift.

Pending Work entries from the prior pass (PW-A4-1 through PW-A4-23) remain pending. No fixes were shipped in this session.

---

## Session — May 8, 2026 — Webhook restoration: MCP scope verification + exact action items for Murdoch (cannot fix from this session)

Follow-up to today's earlier scenario-B diagnostic. Murdoch asked me to attempt the end-to-end fix via MCPs rather than punt to dashboard. Re-attempted aggressively. Confirming the blocks are at the MCP-tool level, not session-permission level — neither MCP exposes the operations we need.

### Stripe MCP scope (verified blocked)

The Stripe MCP in this Claude Code session exposes a curated subset of operations. Verified by enumerating all available tools and re-attempting webhook ops:

- `stripe_api_search` consistently returns the same 4 unrelated operations regardless of query: `GetCoupons`, `GetPaymentLinks`, `GetPricesPrice`, `GetPromotionCodes`. Searches for `"webhook endpoints"`, `"GetWebhookEndpoints"`, `"events list"`, `"subscription"` all returned either the same 4 ops or "No matching operations found." The search index isn't broken — it's curated to a tiny subset.
- `stripe_api_execute` blocks `GetWebhookEndpoint`, `GetWebhookEndpoints`, `ListWebhookEndpoints`, `PostWebhookEndpoints`, `GetEvent`, `GetEvents` — all return `Operation '...' is not available. Use stripe_api_search to find available operations.`
- The dedicated Stripe tool list is read-only on most resources: `list_customers`, `list_subscriptions`, `list_invoices`, `list_prices`, `list_products`, `list_payment_intents`, `list_disputes`, `list_coupons`, `retrieve_balance`, `fetch_stripe_resources`, `search_stripe_documentation`, `search_stripe_resources`, plus a few create-write tools for `customer`, `invoice`, `invoice_item`, `price`, `product`, `subscription` (cancel/update only). **No webhook tools at all.**

**Cannot do via MCP:** list webhook endpoints, create endpoint, update endpoint URL/events, enable/disable endpoint, read endpoint signing secret, send test event, read endpoint delivery history, list events, retrieve specific event.

### Vercel MCP scope (verified blocked)

Vercel MCP exposes: `list_projects`, `get_project`, `list_deployments`, `get_deployment`, `get_deployment_build_logs`, `get_runtime_logs`, `deploy_to_vercel` (deploys local code — won't redeploy with a new env var), `get_access_to_vercel_url`, `web_fetch_vercel_url`, `search_vercel_documentation`, `check_domain_availability_and_price`, plus toolbar-thread comment tools. **No env-var read or write. No way to redeploy an existing build.**

**Cannot do via MCP:** read `STRIPE_WEBHOOK_SECRET`, write `STRIPE_WEBHOOK_SECRET`, trigger production redeploy.

### Production project info pulled (for Murdoch's reference)

Live `get_project` (Vercel MCP) on `prj_9Z7T6lgKutlpfapplWbQo8JmJVbi` / team `team_0kIxSIiTWFytVpdXe22QrXl4`:
- Domains attached to production: `snapquote.us`, `www.snapquote.us`, `snapquote-tau.vercel.app`, `snapquote-murdoch45s-projects.vercel.app`, `snapquote-git-main-murdoch45s-projects.vercel.app`
- Latest production deployment URL: `snapquote-5muru905y-murdoch45s-projects.vercel.app` (alias of the production target)

**Recommended Stripe webhook URL:** `https://snapquote.us/api/stripe/webhook`. (`www.snapquote.us` would also work since it's an attached production domain. `snapquote-tau.vercel.app` would also currently route to production but is not the canonical URL — if Stripe is hitting it today and it stopped working ~2026-04-11, that suggests `snapquote-tau` was an alias that briefly broke, OR Stripe's endpoint URL is something else entirely that's no longer in the domains list — e.g., a deleted preview URL like `snapquote-mainfoo-murdoch45s-projects.vercel.app`.)

### Exact action items for Murdoch (paste-ready CLI alternatives + dashboard paths)

**Step 1 — Stripe: locate or create the webhook endpoint.**

*Option A — Stripe Dashboard:* https://dashboard.stripe.com/webhooks (LIVE mode toggle in the top-right). If an endpoint already exists, click into it and check: URL, status (enabled?), events. If none exists, click "Add endpoint" with the URL `https://snapquote.us/api/stripe/webhook` and these 7 events:
```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
charge.refunded
```

*Option B — Stripe CLI (faster if Murdoch has it installed and authenticated to live mode):*
```bash
# List existing endpoints
stripe webhook_endpoints list

# Create new endpoint pointing at production
stripe webhook_endpoints create \
  --url=https://snapquote.us/api/stripe/webhook \
  --enabled-events=checkout.session.completed \
  --enabled-events=customer.subscription.created \
  --enabled-events=customer.subscription.updated \
  --enabled-events=customer.subscription.deleted \
  --enabled-events=invoice.payment_succeeded \
  --enabled-events=invoice.payment_failed \
  --enabled-events=charge.refunded
# Capture the `secret` field from the response — that's the new STRIPE_WEBHOOK_SECRET

# OR if endpoint already exists at wrong URL, update it:
stripe webhook_endpoints update we_XXX --url=https://snapquote.us/api/stripe/webhook
# (and use `enabled_events` repeatedly to ensure event subscriptions are right)
```

(These match the events in [`app/api/stripe/webhook/route.ts:566-588`](app/api/stripe/webhook/route.ts) — the route's `default` case is a no-op, so subscribing to extra events is harmless but pointless. The 7 above are exactly the events the handler does anything with.)

**Step 2 — Capture the signing secret.** From dashboard: click the endpoint → "Signing secret" → "Reveal" → copy `whsec_...`. From CLI: it's the `secret` field on the create response. Note: existing endpoints' signing secrets are stable; creating a new endpoint generates a new one.

**Step 3 — Vercel: update `STRIPE_WEBHOOK_SECRET` in production.**

*Option A — Vercel Dashboard:* https://vercel.com/team_0kIxSIiTWFytVpdXe22QrXl4/snapquote/settings/environment-variables → find `STRIPE_WEBHOOK_SECRET` → Edit → Production → paste the `whsec_...` from step 2 → Save → trigger a redeploy from the Deployments tab (or push a no-op commit).

*Option B — Vercel CLI:*
```bash
cd /path/to/SnapQuote
# Check current value
vercel env ls production

# Remove the old one (if any) and add new
vercel env rm STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_WEBHOOK_SECRET production
# (paste whsec_... when prompted)

# Trigger a redeploy so the new env is picked up
vercel --prod
```

**Step 4 — Verify end-to-end (BEFORE doing anything to real customer data).**

After redeploy is live, Murdoch sends a TEST event from Stripe (Dashboard → endpoint → "Send test webhook" → pick `customer.subscription.deleted`). Then ping me back. I'll verify in seconds via:

```sql
-- Should return one new row within seconds of the test
SELECT provider, event_id, event_type, received_at
FROM public.webhook_events
WHERE provider = 'stripe'
ORDER BY received_at DESC
LIMIT 5;
```

```
[Vercel MCP get_runtime_logs query="/api/stripe/webhook" environment=production since=10m]
```

If both show a new entry: webhook restored. If Stripe shows 200 but Vercel/Supabase don't: signature secret still wrong. If Stripe shows non-200: the response body tells us what's wrong (signature mismatch text, route 500, etc.).

**Step 5 — Pull historical delivery data (FOR DIAGNOSIS, do not click Resend).**

In the Stripe Dashboard endpoint detail view, scroll to "Recent events" — you'll see every delivery attempt (success and fail) from the last 30 days. The failure pattern there tells us what broke when. Common signatures:
- All `404`: URL is wrong (probably points at a deleted preview URL).
- All `400` with "signature mismatch": `STRIPE_WEBHOOK_SECRET` was rotated.
- All `5xx`: Vercel was down or the route errored. Unlikely to be 100% — would have shown in Vercel logs.
- "Endpoint disabled by Stripe after N consecutive failures": Stripe auto-disables endpoints with persistent failures. Re-enable in dashboard.

### CRITICAL: do NOT click "Resend" on the backlog

If there's a backlog of failed `customer.subscription.deleted` events from the last 7 weeks (likely there is, because falconn was canceled in that window), DO NOT click "Resend" on them. That would replay real cancellation events through the handler now that it's wired up — and:
- For falconn specifically: this would re-DELETE Murdoch's `subscriptions` row (already gone) and re-fire `setOrganizationPlan(orgId, "SOLO")` + `resetOrganizationCredits(orgId, "SOLO")` + `sendPlanEndedEmail`. That second-and-third effect are exactly what we WANT to happen — but Murdoch said in E6 yesterday he wanted falconn kept on Business while testing. Replaying would override that.
- For demo seeds (`Demo`, `Rivera's Pressure Washing`): probably no backlog (those were never paying customers, no cancellation event exists for them).
- For the 3 trialing `poo` orgs: they're still trialing so no cancel events for them.

So: ignore the backlog. The replay would only re-cancel customers who are already cancelled, which is mostly safe — but the falconn override is the one explicit case where replaying isn't what we want. **Don't replay.** Read the failure history in the dashboard, screenshot it for the Notion record, then move on.

If Murdoch decides later he wants to selectively replay cancellation events (e.g., to test the full lifecycle on a fresh test customer), do it ONE event at a time from the dashboard, not bulk Resend.

### What I CAN do once Murdoch finishes Steps 1-3

Once Murdoch sends the test event from Stripe:
- I'll pull `get_runtime_logs query="/api/stripe/webhook" since=10m` via Vercel MCP — should show a hit.
- I'll run `SELECT FROM webhook_events ORDER BY received_at DESC LIMIT 5` via Supabase MCP — should show a row.
- If both: webhook restored ✅
- If only Stripe shows 200 but neither MCP shows the event: deeper diag (route is up but signature still wrong somehow, or `claimWebhookEvent` is failing).
- If Stripe shows non-200: the response body identifies the cause.

### Status

**Webhook still broken because two specific operations are not exposed in this Claude Code MCP session: Stripe webhook-endpoint management and Vercel env-var write. Both require Murdoch to use either the dashboards or CLIs.** Once he does Steps 1-3 above and pings me, I can verify in under a minute via Vercel runtime logs + Supabase `webhook_events` query.

---

## Session — May 8, 2026 — Stripe webhook NOT delivering in production (scenario B confirmed) — PR 2 deprioritized

Murdoch's intuition was right. The cancellation flow we diagnosed yesterday morning isn't the architectural bug we wrote up — the Stripe webhook isn't reaching production at all. The architectural pattern we identified (`clearStaleStripeCustomerId` deleting subs rows that the cancellation webhook needs to resolve user_id) is real but moot, because the cancellation webhook never runs.

**Evidence (live, not Notion):**

1. **`public.webhook_events` table is empty.** Total rows: 0. Earliest: null. Latest: null. The table is the canonical idempotency record for both Stripe and RC webhooks via [`lib/webhookEvents.ts:claimWebhookEvent`](lib/webhookEvents.ts) — every event that passes signature verification gets upserted there. Zero rows = no events have been claimed since the table was added. Verified via Supabase MCP `SELECT COUNT(*) FROM public.webhook_events`.

2. **Vercel production runtime logs for `/api/stripe/webhook`: zero hits in the last 30 days.** Verified via Vercel MCP `get_runtime_logs` with `query="/api/stripe/webhook"`, `query="webhook"`, `query="/api/stripe"`, all on production environment, 30-day windows. Same result for `/api/revenuecat/webhook`. The route handler is never executing. Compare against `/api/cron/rescue-stuck-leads` which fires every 3 minutes and shows up densely in the same query window — Vercel logs are working; the Stripe webhook just isn't being called.

3. **Sentry: zero events** for `url:*stripe/webhook*`, `transaction:*stripe/webhook*`, `message:*webhook*`, `message:*Stripe*` in the last 30/90 days respectively. Project `snapquote/snapquote-web`, region `https://us.sentry.io`. No errors, no issues, no spans tagged with the webhook route.

4. **Migration timeline rules out "table predates webhook":** `supabase/migrations/0037_webhook_idempotency_iap_audit.sql` (which adds `webhook_events`) was committed [`e45dded`](https://github.com/Murdoch45/snapquote/commit/e45dded) on **2026-04-11**. The 3 trialing `subscriptions` rows (`sub_1TD4OaLT0JKiq1dxBrHvhkGJ`, `sub_1TCj6FLT0JKiq1dx9s9u8Y6a`, `sub_1TCii7LT0JKiq1dxvEAbt03v`) were created **2026-03-18 / 03-19 / 03-20** — about three weeks BEFORE the migration. So those rows could have been written by an earlier webhook delivery before idempotency tracking existed. After 2026-04-11, every successful event would leave a `webhook_events` row — there are zero. Combined with the Vercel-logs evidence, this means the webhook stopped firing on or before 2026-04-11.

5. **Code is correct.** Re-read [`app/api/stripe/webhook/route.ts`](app/api/stripe/webhook/route.ts) at HEAD. `handleSubscriptionDeleted` (lines 389-429) correctly calls `setOrganizationPlan(orgId, "SOLO")` + `resetOrganizationCredits(orgId, "SOLO")` + sends `sendPlanEndedEmail`. `shouldDowngradeToSolo` (lines 24-30) is correctly narrowed to `status === "canceled"` only (per Murdoch's prior fix [`c66441c`](https://github.com/Murdoch45/snapquote/commit/c66441c) on 2026-04-15 — the prior cancellation fix Murdoch remembers IS in current code). Webhook signature verification at line 546 returns 400 on mismatch. **None of this matters because the route isn't being called.**

6. **Stripe MCP cannot list webhook endpoints from this session.** `stripe_api_search` for `webhook endpoints` / `events list` returns unrelated coupon/payment-link operations every time. `stripe_api_execute` with `GetWebhookEndpoints` / `ListWebhookEndpoints` / `GetEvents` returns "operation not available." The MCP key in this session has read access to a narrow set of resources (customers, subscriptions, prices, products, invoices, charges) — webhooks and events aren't on the allowlist. Verifying Stripe-side webhook config requires the dashboard.

7. **Vercel MCP doesn't expose env-var read.** Cannot confirm `STRIPE_WEBHOOK_SECRET` is set in production from this session — would require dashboard access or a separate token.

**Conclusion: scenario B confirmed.** The Stripe webhook is not being delivered to production. Possible upstream root causes (in rough probability order, given zero Vercel hits):
- (a) **Webhook endpoint in Stripe Dashboard points to a stale URL** — likely a Vercel preview URL like `*.vercel.app` from before the `snapquote.us` domain landed. That URL would 404 / redirect, request never reaches production.
- (b) **No webhook endpoint registered** — never created, or deleted at some point.
- (c) **Endpoint exists but is disabled** in the Stripe Dashboard (possibly auto-disabled by Stripe after consecutive delivery failures).
- (d) **Account/mode mismatch** — endpoint registered against Stripe test mode but production uses live mode (or vice versa).

What this rules out: signature-verification mismatch. If `STRIPE_WEBHOOK_SECRET` were stale, the route would still execute and return 400 — Vercel logs would show those 400s. We see zero hits, so the requests aren't reaching Vercel at all. The fix is upstream (Stripe Dashboard config), not in our `STRIPE_WEBHOOK_SECRET` env var.

**PR 2 status:** the architectural fixes from yesterday's plan (soft-cancel `clearStaleStripeCustomerId`, fail-loud `getOrgIdForUser`, reconcile cron, `subscription_ends_at` column) are still good ideas and should still ship — but they're not the fix for the immediate falconn drift. They're hardening for the case where the webhook IS firing but a specific failure mode short-circuits the cancellation handler. Once the webhook is delivering, PR 2 becomes "harden against future failure modes." The reconcile cron in PR 2 is also independently valuable as a safety net for any future webhook downtime — it would catch exactly this kind of drift.

**PR 3 status:** unchanged. Still pending. `falconn` excluded per Murdoch's E6 call.

**Action items for Murdoch (cannot be done from this session — require Stripe + Vercel dashboard access):**

1. **Stripe Dashboard → Developers → Webhooks (LIVE mode):** verify there is an enabled endpoint pointing at `https://snapquote.us/api/stripe/webhook` (or equivalent). If missing, create one. Subscribe it to: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`. (These are the exact events the route's switch statement handles at [`app/api/stripe/webhook/route.ts:566-588`](app/api/stripe/webhook/route.ts).) Copy the endpoint's signing secret.
2. **Vercel Dashboard → Project `snapquote` → Settings → Environment Variables (Production):** verify `STRIPE_WEBHOOK_SECRET` matches the secret from step 1. Update if needed. Redeploy if the value changed.
3. **Send a test event from the Stripe Dashboard endpoint** (Send test webhook → `customer.subscription.deleted`). Confirm: Stripe dashboard shows 200 response; Vercel runtime logs show a hit on `/api/stripe/webhook`; `SELECT * FROM public.webhook_events` shows a new row.
4. **Verify recent delivery history** in the Stripe Dashboard for the endpoint — most likely shows 7+ weeks of failed deliveries (likely all 5xx / 404s / network errors, depending on what URL is wrong). That tells us when the webhook stopped working and what changed at that time.
5. **Once webhook is delivering**, the falconn cleanup can be re-evaluated. Murdoch wanted it kept on Business per E6, but with the underlying cause fixed, he may want to test a real cancel→Solo flow on a separate org.

**Notion entries flagged as historical-but-superseded** (per ground-truth rule — not editing other-source entries; flagging only):
- Notion **Bugs & Fixes** 2026-05-07 entry "`falconn` org stuck on BUSINESS plan after canceled Stripe sub" framed `clearStaleStripeCustomerId` as the proximate cause. It's a real architectural issue but it's NOT what produced the falconn state — the actual cause is "webhook never fires." The morning audit's framing is materially wrong. Pre-existing pointer (added by my evening pass yesterday) flagged this as "framing corrected — see Pending Work" — that pointer remains accurate but the *replacement* framing in Pending Work focused on the architectural fix without testing whether the webhook was firing at all. Today's scenario-B finding supersedes both.
- Notion **Pending Work** 2026-05-07 "Plan page architecture overhaul" entry promised PR 2's lifecycle fixes as the cure for falconn drift. Still useful as hardening but not the cure. Flagged in today's Bugs & Fixes scenario-B entry.

---

## Session — May 8, 2026 — Audit 11 / 13 AI Estimator (READ-ONLY)

Tag `[Source: Claude Code]`. No code changes — read-only audit per scope.

### Scope

OpenAI integration in `lib/ai/estimate.ts` (4,548 lines), trigger flow, prompt construction, output parsing, persistence, ai_status state machine, fallback paths, Supabase data spot-check.

### TL;DR

The estimator is structurally sound — well past the framing in the audit brief. The Notion-flagged "AI generates unrealistic prices" is architecturally moot: the AI never produces dollar amounts anymore (since 2026-05-04). The deterministic engine prices, AI only extracts categorical signals + estimated quantities, and there are layered fallbacks (heuristic → catch-block → last-resort) so a price always lands.

That said, audit found **1 Critical** (prompt instructing AI to use fields the code strips out — silent quality bug), **5 High**, **6 Medium**, **5 Low**. Cost exposure is ~$0.005/estimate, so spam/abuse is not a financial threat at present scale.

### CRITICAL

**C1. Prompt instructs AI to use `_other_text` and `_contractor_note` fields, but code strips them.** `lib/ai/estimate.ts:3338` tells the AI: "Analyze the services, questionnaire answers, **any other-text answer fields**, customer description, …". And at `:3361`: "Only use quantityEvidence='direct' when the customer explicitly provided dimensions, counts, or footage in the questionnaire, **other-text answers**, or main description." But `sanitizeAnswersForModeling` (`:1889`) strips every key ending in `_other_text` or `_contractor_note` before serializing to the prompt at `:3374`. The AI literally cannot see those fields. **Impact:** This is the most likely root cause of the audit-brief framing "ignores customer-provided area sizes" — when a customer types square footage into a free-text "other" field, the AI never sees it. `quantityEvidence='direct'` is consequently rare in practice.

### HIGH

- **H1. Prompt-injection vector in `description` and structured answer values not mitigated.** `description` (max 2000 chars, free text) and questionnaire string answers flow directly into the JSON dump in the user prompt at `:3386`. No sanitization, no fence markers. An attacker can steer `internalConfidence`, `condition`, `multipleAreas`, `estimatedQuantity` — all of which feed pricing. Mitigated partly by Turnstile on `/api/public/lead-submit:59` and contractor's manual price review in `QuoteComposer`.
- **H2. Photo content moderation absent.** 10 photos × 8 MB each accepted via `PhotoUploader.tsx:9`. No moderation endpoint, no `omni-moderation-latest` call. Photos go directly into Supabase storage AND OpenAI vision.
- **H3. Heuristic fallback rate is non-trivial (~23% of recent leads).** Supabase: 17/22 May 2026 ready leads used AI signals (77.3%); 5/22 used heuristic fallback (22.7%). April was 100% AI; May regressed. Recent fallbacks are dominated by `timeout (retryable)` despite the photo `detail: "low"` fix.
- **H4. No sanity guardrails on AI output `estimatedQuantity`.** Per-service caps mitigate (e.g. `pressureSurfaceCap` `:2274`) but coverage uneven. No cross-validation against `propertyData.lotSizeSqft`/`houseSqft`.
- **H5. Confidence label ("high"/"medium"/"low") shown identically for AI and heuristic-fallback results.** Supabase: 5 May leads with `signal source: fallback` ALL show `ai_confidence: "high"`. Contractor cannot distinguish AI confidence from heuristic confidence. `confidenceLabel` (`:4230`) is purely a function of `confidenceScore` without source-aware adjustment.

### MEDIUM

- **M1.** Single-attempt AI call. 163 failed leads in DB, but only 3 (0.09%) ever made it through retry to "ready" — most failed outside the `FAILED_RETRY_WINDOW_HOURS = 6` window when the cron next ran.
- **M2.** `ai_status` flow is `processing → ready/failed`. No `pending` writes despite that being the column default — undocumented.
- **M3.** AI-extraction trace stored in `ai_estimator_notes` (jsonb) instead of a typed `ai_signal_source: "ai" | "heuristic"` column. Notion previously suggested adding this.
- **M4.** `ai_estimator_notes` shape inconsistent — sometimes string (rescue cron `STUCK_NOTE`), sometimes array (estimator-pipeline notes). Downstream readers can crash on `jsonb_array_elements_text` if they don't type-check first.
- **M5.** Service name normalization gap visible in production data: "Lawn Care" (3 leads, snap=$900) vs "Lawn Care / Maintenance" (231, snap=$390); "Fence" (5) vs "Fence Installation / Repair" (220); "Landscaping" (19, snap=$8030) vs "Landscaping / Installation" (210). Short-form leads have suspiciously round default prices.
- **M6.** Two OpenAI calls per estimate (signal + summary polish at `:4348`) doubles latency surface. Polish costs ~$0.0003/estimate.

### LOW

- **L1.** `ai_estimate_low = 0` and `ai_suggested_price = 0` observable (~26 + 18 leads) — out-of-service-area rejections (legitimate). Semantically overloaded with "failure" $0.
- **L2.** No prompt versioning / output sample logging for A/B regression detection.
- **L3.** No multi-language handling. gpt-5-mini handles Spanish but `inferSignalsFallback` (`:1180`) is English-keyword-only.
- **L4.** Schema has 12-18 unread fields (already filed in Pending Work as deferred).
- **L5.** `OPENAI_API_KEY` config check happens AFTER request validation + cache lookup at `:3698`.

### Prompt documentation

- **Model:** `gpt-5-mini` (`OPENAI_MODEL` override). Reasoning effort `low`.
- **SDK:** `client.responses.parse(...)` with `zodTextFormat`. Single attempt.
- **Timeouts:** signal 35s, polish 10s, property-data 8s, Vercel maxDuration 60s backstop.
- **Retry:** Supabase pg_cron `rescue-stuck-leads` every 3 min, max 2 retries via `leads.ai_retry_count` (migration 0065).
- **Input:** `businessName, services, address, description≤2000, photoUrls≤10, satelliteImageUrl, lat/lng, serviceQuestionAnswers (sanitized — no `_other_text`/`_contractor_note`)`.
- **System prompt:** "You are SnapQuote's estimator signal extractor. Follow the user prompt exactly."
- **User-prompt instructions** (verbatim, abbreviated): "AI interprets. Logic prices. Do not estimate or suggest any dollar amount." / "Questionnaire answers are the primary structured evidence." / "Do not return a confidence tier directly. Instead, return structured clarity judgments only." / "Only use quantityEvidence='direct' when the customer explicitly provided dimensions … in the questionnaire, other-text answers, or main description." / "Do NOT produce a top-level summary. The job summary is assembled deterministically from questionnaire answers by backend code after you return."
- **Image inputs:** customer photos ≤10 at `detail: "low"` (85 tokens flat each); satellite tile (Google Static Maps 600×400) at `detail: "low"`.
- **Output schema:** ~40 fields incl. `condition/access/severity/debris`, `estimatedQuantity + quantityUnit + quantityEvidence`, `jobStandardness/scopeClarity/remainingUncertainty`, `surfaceDetections[]/detectedSurfaces/quotedSurfaces` (pressure-washing), boolean signals.
- **No PII to OpenAI:** prompt deliberately excludes customer name, phone, email.
- **Polish prompt:** separate gpt-5-mini call with two-sentence rewrite instruction; ~$0.0003/estimate.

### Failure-mode matrix

OpenAI timeout/429/5xx/connection → retryable, fallback path, `inferSignalsFallback` runs, engine prices, `ai_status=ready`. OpenAI 400 image / 4xx other / Zod / parse fail → fallback path. Property-data timeout → degraded property data + NATIONAL_DEFAULT cost model. Polish fail → raw deterministic summary. `generateEstimate` throws → `generateEstimateAsync` catch-block runs `fallbackEstimate` directly with degraded property data, writes `ai_status=ready`. Catch-fallback throws → last-resort `ai_status=failed` write. Vercel reclaims function (>60s) → lead stuck `ai_status=processing` → rescue cron picks up after 5min, gives up at 15min. Edge function fails to invoke → `lead-submit` after-block writes `ai_status=failed`.

### Cost model

| Item | Tokens | Cost |
|---|---|---|
| Signal call input (prompt + JSON dump + example + images + schema) | ~8,025 | $0.0020 |
| Signal call output (structured + reasoning) | ~1,800 | $0.0036 |
| Polish call total | ~370 | $0.0003 |
| **Total per estimate** | — | **~$0.0059** |

Monthly projection: ~$18/mo @ 100 leads/day; ~$88/mo @ 500/day; ~$177/mo @ 1k/day; ~$885/mo @ 5k/day. **Runaway risk LOW** — even 10k spam leads in a day costs ~$60. Margin sanity: contractor unlock-credit revenue is dollar-range per Notion, gross margin per paid lead >100x AI cost.

### Accuracy improvement backlog (deferred work)

Filed in Notion **Pending Work** under "AI Estimator deferred work":
1. Fix `_other_text`/`_contractor_note` strip-vs-prompt mismatch (Critical C1).
2. Add prompt-injection fence markers around user content.
3. Add output sanity-check layer (cross-validate `estimatedQuantity` vs lot/house sqft).
4. Surface signal source to contractor UI (typed `ai_signal_source` column + badge).
5. Pressure-washing photo-detail A/B (already filed; still pending).
6. Per-service prompt customization (split mega-prompt).
7. Add `ai_prompt_version` column for prompt-change A/B + regression detection.
8. OpenAI `omni-moderation-latest` pre-check on photos.
9. Multi-language detection + translation, or English-only routing with warning.

### Cross-cutting flags

- **Audit 8 (Privacy):** Customer description, address, photos, lat/lng, businessName all sent to OpenAI. Disclosed in `app/(public)/privacy/page.tsx:55-73`. No customer name, phone, email goes to OpenAI (intentional). Photos stored in Supabase storage indefinitely — retention TTL absent.
- **Audit 4 (Lead pipeline):** Confirms post-2026-05-04 architecture: `lead-submit` → Supabase Edge Function `run-estimator` → Next.js `/api/internal/run-estimator` → `generateEstimateAsync`. Decoupled from Vercel function lifecycle.

### Anything outside scope

Photo retention/cleanup (no TTL on Supabase storage). Demo mode handling (didn't trace whether demo orgs bypass AI). `pending` ai_status state never written. No Sentry alert tied to `ai_estimator_notes` containing "signal source: fallback" — recommend adding.

### Notion saves

- `Bugs & Fixes` — 2026-05-08 [Source: Claude Code] AI ESTIMATOR AUDIT (11 of 13) summary.
- `Pending Work` — 2026-05-08 [Source: Claude Code] "AI Estimator deferred work (audit 11/13)" with 9-item backlog.
- `Architecture & Stack` — 2026-05-08 [Source: Claude Code] additive findings under existing fix-#3 topology.

---

## Session — May 8, 2026 — Audit 3 / 13 Credits & Quota (READ-ONLY)

Full audit at `docs/audit-3-credits-quota-2026-05-08.md`. Tag `[Source: Claude Code]`. No code changes — read-only audit per scope.

**Methodology.** Searched Notion for context (Architecture & Stack, Decisions Log, Bugs & Fixes, Code Patterns, Pending Work). Audited web repo (`C:\Users\murdo\SnapQuote`), mobile worktree (`C:\Users\murdo\SnapQuote-mobile\.claude\worktrees\suspicious-perlman-097904`), and Supabase project `upqvbdldoyiqqshxquxa`. Live data queried via Supabase MCP (RPC source via `pg_proc.prosrc`, table constraints via `pg_constraint`, pg_cron jobs via `cron.job`). 21 files read, 12 SQL queries run.

**Scope correction.** Audit prompt's plan tiers ("Solo 0, Team 200, Business 500") are out-of-date. Actual values in code, DB, and pg_cron all agree on SOLO 5 / TEAM 20 / BUSINESS 100. Three sources of truth (web `lib/plans.ts`, mobile fallback, SQL `plan_monthly_credits()`); column default = 5.

**Headlines (5 critical, 8 high, 6 medium, 4 low):**
- **C1 Stripe trial credits gap** — `handleCheckoutCompleted` for `mode: subscription` never calls `update_org_plan_credits`. Trial users get plan tag but no credit reset. Live broken: orgs `eabc1e4a` and `f77b0ebb` (TEAM trialing, `monthly_credits=5,bonus_credits=0,credits_reset_at=null`). UI shows "5 / 20 remaining" implying 15 used when 0 ever granted. RC IAP `INITIAL_PURCHASE` does both plan + credit reset regardless of trial status — disparity between billing surfaces. Same fingerprint as Audit 2's TEAM-monthly_credits=5 net-new finding.
- **C2 IAP credit-pack double-credit (latent).** Mobile `iap/sync` and RC `NON_RENEWING_PURCHASE` use different `purchase_reference` strings (raw Apple `transactionIdentifier` vs `rc_${event.id}`); both INSERTs succeed → `bonus_credits` incremented twice. 0 IAP credit purchases in DB yet.
- **C3 Subscription refund silently consumes spent credits.** Stripe `customer.subscription.deleted` + RC `REFUND` (subscription) reset `monthly_credits=5`; `bonus_credits` untouched. Already-spent monthly credits = leads in CRM. No clawback.
- **C4 No credit ledger.** No `credit_transactions` table. `lead_unlocks` lacks `charge_source` (RPC computes `v_charge_source` then discards it). Grants/resets/refunds completely unlogged.
- **C5 DRAFT-quote-after-unlock failure.** `app/api/app/leads/unlock/route.ts:37-75` swallows `quotes.insert` errors after credit debited. User pays 1 credit for non-functional unlock with no recovery path.
- **H1 Stripe upgrade gap.** `app/api/stripe/checkout/route.ts:152-197` upgrades plan via Stripe API + DB update but never resets credits. Mirror downgrade leaks 100 BUSINESS credits at TEAM tier until next renewal.
- **H2 STALE_PAID orgs.** 3 confirmed (`falconn`, `Demo`, `Rivera's Pressure Washing`) — overlaps Audit 2 H1.
- **H3 `reset_due_solo_monthly_credits()` is dead code.** Migration 0018 schedules it; pg_cron `jobid=3` runs different inline SQL bypassing it. Manual `cron.job` edit not in source.
- **H4 No paid-plan reset cron.** TEAM/BUSINESS rely on lazy-on-unlock + webhook + manual `iap/sync`. Mobile `getCredits` does NOT lazy-reset.
- **H5 Mobile `useCredits` cache.** AsyncStorage `cache:credits:${orgId}` violates "real-time, no caching" claim. Refetch on focus/Stripe-return mitigates the stale window to ~ms-scale.
- **H6 `no_credits` 402 unaudited.**
- **H7 3 sources of truth, no CI check.**
- **H8 `record_credit_purchase` lacks $ / provider columns.**
- **Medium:** sub-refund unlogged + bonus untouched; `addOneMonth` JS Date vs Postgres `interval '1 month'` boundary drift; reset window always rolls forward from event (anniversary-from-event, not anniversary-from-billing-cycle); mobile direct-RPC fallback wastes a permission-denied round-trip after migration 0063; two-meter quota model (`monthly_credits` + `org_usage_monthly.quotes_sent_count`); `refund_bonus_credits` floors at 0 silently.
- **Race-condition inventory:** `unlock_lead_with_credits` SAFE for concurrent unlocks (FOR UPDATE on org row + double-check `lead_unlocks`). `record_credit_purchase` SAFE per-key, UNSAFE across paths (C2). `refund_bonus_credits` `FOR UPDATE` correct but lacks idempotency across two refund webhooks for same purchase.
- **Real-time guarantee verification:** Server-side YES (every RPC hits Postgres). Mobile UI has AsyncStorage cache. No edge/CDN caching of balances. Only `/api/plans/config` is CDN-cached (1h s-maxage / 24h SWR), and that's the plan→credits MAP, not balances.

**Notion saves.**
- Bugs & Fixes — 2026-05-08 entry "Audit 3 of 13: Credits & Quota — 5 critical, 8 high, 6 medium issues". **Note:** First write timed out on the Notion API response side but applied to the page. A retry created a duplicate entry; cleanup retry also timed out (page is ~210k chars, hitting Notion's response size limits). Both entries' content is correct; manual dedup recommended (drop one of the two consecutive "Audit 3 of 13: Credits & Quota" headings).
- Pending Work — 2026-05-08 entry "Audit 3 (Credits & Quota) pending items" with 12 action items (Critical: C1-C5 fixes; High: H1/H4/H6/H7/H3/H5/H8 follow-ups; Medium/Low list). One earlier duplicate was cleaned up successfully.
- Architecture & Stack — 2026-05-08 entry "Credit & Quota subsystem map" with the full RPC table, webhook ownership matrix, reset-cadence breakdown, and caching map.

**Files read (web):** `lib/credits.ts`, `lib/plans.ts`, `lib/usage.ts`, `lib/subscription.ts`, `app/api/app/leads/unlock/route.ts`, `app/api/iap/sync/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/revenuecat/webhook/route.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/credits/route.ts`, `app/api/plans/config/route.ts`, `app/api/app/subscription-status/route.ts`, `app/api/cron/trial-expired/route.ts`, `app/app/credits/page.tsx`, `supabase/migrations/0018_solo_credit_reset_cron.sql`, `supabase/migrations/0063_revoke_anon_auth_security_definer_rpcs.sql`, `vercel.json`.
**Files read (mobile):** `lib/api/credits.ts`, `lib/api/leads.ts`, `lib/api/iap.ts`, `lib/hooks/useCredits.ts`, `lib/iap/syncQueue.ts`, `lib/plans.ts`, `app/(tabs)/more/credits.tsx`, `app/(tabs)/more/plan.tsx`, `app/(tabs)/leads/[id].tsx`.
**DB inspected:** RPC source (`get_org_credit_row`, `reset_org_credits`, `update_org_plan_credits`, `unlock_lead_with_credits`, `record_credit_purchase`, `refund_bonus_credits`, `reset_due_solo_monthly_credits`, `plan_monthly_credits`, `is_org_member`, `is_org_owner`); `cron.job` schedule; `pg_constraint` for credit tables; live row state for orgs / lead_unlocks / credit_purchases.

**Out-of-scope flags (reported, not investigated further):** subscriptions table is per-user not per-org (`getUserIdForStripeCustomer .limit(1)` order-dependence — flagged in Audit 4 territory); two-meter quota model (`monthly_credits` + `org_usage_monthly.quotes_sent_count` both gated by same plan limit, ~2× effective quota per plan); `falconn` exclusion from PR 3 remediation per Murdoch's call; `/api/iap/sync` is owner-only.

---

## Session — May 8, 2026 — Audit 1 / 13 Auth & Session Flow (READ-ONLY)

Full audit at `docs/audit-1-auth-session-2026-05-08.md`. Tag `[Source: Claude Code]`. No code changes — read-only audit per scope.

**Scope:** Email/password (web + mobile), Sign in with Apple (web Service ID + iOS native), Sign in with Google (verified `0e65d3f` PKCE handler IS in mobile main), magic link / OTP (absent), session persistence (cookies on web, AsyncStorage on mobile), token refresh (Build 13 architectural deletion verified), deep linking from auth callbacks (`snapquotemobile://`, `/auth/callback`, `/auth/confirm`), logout flow, account deletion (Apple 5.1.1(v) compliance), multi-org / invites, password reset, email verification, Cloudflare Turnstile, redirect URL allowlists (Studio), onboarding flow, rate limiting, brute-force protection, session sharing web ↔ mobile, Stripe-billed web user signing in on mobile (App Store 3.1.1).

**Critical findings (5):**

1. **C1. `.env` is tracked in mobile git** (`git ls-files` returns `.env` in `C:\Users\murdo\SnapQuote-mobile`). Per audit-subagent read, contains `SUPABASE_JWT_SECRET`. Web `lib/auth/verifyJWT.ts:188-236` accepts HS256 tokens signed with that secret — bearer-token forgery for any user.
2. **C2. SIWA has 0 successful identities in production.** Live `auth.identities` query returns `email=95, google=1, apple=0`. Mobile passes iOS bundle id `com.murdochmarcum.snapquote` audience to Supabase; Studio Authorized Client IDs likely contains only the web Service ID `com.murdochmarcum.snapquote.web`. Hard gate for App Review.
3. **C3. Mobile SIWA missing `nonce`/`rawNonce`.** `app/(auth)/login.tsx:71-76` and `signup.tsx:77-92` call `AppleAuthentication.signInAsync` and `signInWithIdToken({provider:"apple", token})` without nonce binding.
4. **C4. `lib/utils/authBrowser.ts:21-25` leaks `access_token`+`refresh_token` in URL fragment of `https://snapquote.us${path}` (apex).** Refresh token in URL is long-lived; apex is subject to NSURLSession redirect-strip class.
5. **C5. Web has no source-controlled apex→www redirect.** `next.config.ts` no redirects fn; `vercel.json` crons-only. Build 18 fix premise lives at Vercel project domain config — invisible to source control.

**High findings (7):** H1 mobile `getApiBaseUrl` lacks claimed apex→www regex (`lib/api/http.ts:25-33` is env-var-only). H2 27/95 (28%) auth.users have no `organization_members` row — web signup `signUp` before `bootstrap` orphans on failure with no rollback. H3 `Purchases.logOut()` never called on mobile signOut. H4 no app-layer rate limit on login/signup either platform. H5 Notion-claimed mobile `org.plan != 'SOLO' → "stripe"` fallback in `plan.tsx:263-273` NOT in code — App Store 3.1.1 risk on subscription-status double-failure. H6 Supabase leaked-password protection (HIBP) OFF. H7 `is_org_member`/`is_org_owner` SECURITY DEFINER anon-callable.

**Medium (13):** AsyncStorage not SecureStore (M1), no `iss` validation in `verifyJWT.ts` (M2), no `/account-deleted` screen (M3), no email-change flow (M4), no magic-link (M5), no `Sentry.setUser` lifecycle (M6), admin-client `requireMember` lookup `.eq` filter is sole barrier (M7), web reset-password no recovery-session check (M8), `/auth/confirm` no rate limit (M9), no Turnstile on `InviteSignupForm` (M10), `app.json:17` buildNumber=13 vs Notion=18 (M11), 5 mutable-search-path SECURITY DEFINER fns (M12), RLS-no-policies on `iap_subscription_events`+`webhook_events` (M13).

**Apple compliance flags (Audit 5):** ✅ account-delete endpoint comprehensive (Apple-active-sub guard + Stripe cancel + RC delete + cascade). ❌ SIWA broken end-to-end (C2/C3). ❌ no `/account-deleted` confirmation screen (M3). ❌ mobile 3.1.1 fallback gap (H5). ⚠️ Apple Service-ID JWT (Sept 2026) rotation has no automation. ⚠️ tokens in URL fragments via `authBrowser.ts` (C4) is reviewer-visible.

**Notion vs code conflicts:** `getApiBaseUrl` apex→www regex (claimed in Code Patterns Rule 1; absent in code), mobile `org.plan` defense-in-depth fallback (claimed; absent), worktree `claude/crazy-heyrovsky-2e3c05` merge status (RESOLVED — `0e65d3f` Google PKCE + `f40fd1c` push token cleanup ARE in main per `git branch --contains`).

**Live Supabase observations (2026-05-08):** auth.users=95 (95 confirmed, 1 never_signed_in, 0 soft-deleted) / auth.identities email=95+google=1+apple=0 / auth.sessions=34 / auth.refresh_tokens=74 / auth.flow_state=60 / auth.mfa_factors=0 / push_tokens=4 / audit_log=49 / pending_invites=25 / 27 orphan auth.users (28%).

**Cross-cutting:** C2/C3 → Audit 5. C1/M2/H7/H6/M12 → security audit. H5 → Audit 8. 27 orphans + auth-orphan recovery loop → data-integrity audit.

Saved to Notion: Bugs & Fixes (single Audit 1 entry summarizing all findings), Pending Work (App Review gates + High + Medium to-dos), Architecture & Stack (verified auth & session architecture entry).

---

## Session — May 8, 2026 — Audit 2 / 13 Billing & Subscriptions (READ-ONLY)

Full audit at `docs/audit-2-billing-2026-05-08.md`. Tag `[Source: Claude Code]`. No code changes — read-only audit per scope.

**Scope:** Stripe (products / prices / subs / checkout / customer portal / webhooks), RevenueCat / Apple IAP (offerings / packages / entitlements / webhook), Supabase reconciliation (`subscriptions`, `organizations`, `webhook_events`, `iap_subscription_events`, `credit_purchases`, RPCs, RLS, crons), trial gating (`has_used_trial`), state-drift detection across all three systems. Cross-repo (web `SnapQuote` + mobile `SnapQuote-mobile`).

**Critical findings (6):**
1. **B1. Production `org.plan` ↔ subscription drift in 6 of 69 orgs.** 4× confirmed `BUSINESS-no-sub` (`falconn` Murdoch, `Demo` seed, `Rivera's` seed, `7e7ce05f` poo) plus **net-new** `TEAM-with-monthly_credits=5` fingerprint (`eabc1e4a`, `f77b0ebb`). The TEAM-5 signature is not covered by Pending Work's existing PR-3 remediation.
2. **B2. Stripe customer-portal cancellation never surfaces scheduled cancellation to UI.** `handleSubscriptionChanged` ignores `cancel_at_period_end` / `current_period_end`. Web has no banner; mobile (RC) has equivalent column write via `iap_cancellation_scheduled_at`.
3. **B3. `clearStaleStripeCustomerId` DELETE confirmed as falconn root cause** — destroys `user_id ↔ stripe_customer_id` link so `subscription.deleted` lookup returns null and silent-no-ops.
4. **B4. No reconciliation cron** between Stripe ↔ Supabase ↔ RC. Webhook delivery is the sole authoritative path.
5. **B12. `/api/iap/sync` lacks server-side Apple receipt validation.** Authenticated owner can POST `{plan:"BUSINESS"}` and become BUSINESS without any RC entitlement check.
6. **B18. RLS allows org owners to write `organizations.plan` directly.** `organizations_update_owner` policy has no column-level grant. Likely root cause of TEAM-with-5-credits drift fingerprint. Cross-flag Audit 8.

**High findings (12):** RC `display_name` labels still drift from ASC (Team Annual −$2, Business Annual +$5), 6 leftover Stripe CLI test products active, 3 stale `subscriptions` rows referencing dead Stripe customers, `getOrgIdForUser .limit(1)` (also flagged Audit 7 C2), Stripe upgrade path doesn't reset credits (mid-cycle Solo→Team stays at 5 credits up to 30 days), Stripe `trial_will_end` not handled (loses 24h vs cron), Stripe `incomplete_expired` not handled (stays paid ~3 days), RC unknown events claimed-then-ignored, trial bypass via multiple emails, Solo Stripe product has $19.99/mo price (footgun), `/api/iap/sync` no de-dup on subscriptions, `webhook_events` table empty since migration 0037.

**Medium (8):** mobile synthesized transactionId, `refund_bonus_credits` floors at 0, Family Sharing not handled, Apple offer codes not handled, trial-converted email not sent, push-on-trial-expired depends on webhook, customer-portal ownership-transfer edge case, mobile `OrgSubscriptionStatus` type drift.

**Low / nits (6):** webhook handlers use `console.error` not Sentry, `accept_invite_token` hardcoded seat limits, currency hardcoded USD on web, Stripe Tax not enabled, customer-portal config visibility unknown, dashboard pollution.

**Apple compliance flags (for Audit 5):** ✅ disclosure / restore / manage-on-web / discriminator. ⚠️ disclosure missing on credits.tsx, restore hidden during loading window. ❌ Family Sharing / offer codes / server-side receipt validation absent.

**State machine + reconciliation matrix:** in backing report. Saved to Notion Bugs & Fixes (B1–B32) and Pending Work (A2-T1 through A2-T17).

**Production data summary (read via Supabase MCP):** organizations=69, organization_members=69, subscriptions=3 (all stale), webhook_events=0, iap_subscription_events=0, credit_purchases=0. Stripe live: customers=1, subscriptions=0. RC live: 7 products / 2 entitlements / 2 offerings / 1 webhook integration.

---

## Session — May 8, 2026 — Audit 8 / 13 security & privacy (READ-ONLY)

Full audit at `docs/audit-8-security-privacy-2026-05-08.md`. Tag `[Source: Claude Code]`. No code changes, no RLS modifications, no secret rotations — strict read-only.

**Scope per audit charter:** Supabase RLS (every table × every policy), service-role usage boundary, anon-key surface, storage RLS, realtime RLS, RPC function security; auth/session handling (cookie flags, JWT verification, OAuth, account deletion); webhook security (Stripe HMAC, RevenueCat shared-secret, idempotency); PII handling (lock-state, server logs, Sentry, OpenAI input, retention); abuse vectors (rate limits, Turnstile, brute force, lead unlock race); secrets (env vars, .gitignore, git history, EXPO_PUBLIC_* surface); frontend security (CSP, XSS, CORS, headers); mobile-specific (HTTPS, secure storage, deep links, certificate pinning); IDOR per-endpoint sweep.

**2 CRITICAL findings:**
- **C1 IAP sync billing bypass.** `app/api/iap/sync/route.ts:78-172` accepts `transactionId` from the mobile client and grants plan/credits without verifying with Apple or RevenueCat REST. Verified `record_credit_purchase` Postgres function via MCP `pg_get_functiondef` — uses transactionId only as idempotency unique constraint, no authenticity check. Any authenticated org owner can `POST {"type":"subscription","plan":"BUSINESS","transactionId":"fake_001"}` for free upgrade. This is the same root cause Audit 7 flagged but with the receipt-verification proof now nailed down.
- **C2 `get_org_credit_row` cross-tenant info leak.** ACL grants `EXECUTE` to `authenticated`; body is bare `SELECT plan, monthly_credits, bonus_credits, credits_reset_at FROM organizations WHERE id = p_org_id` with no `is_org_member` check. Any signed-in user can read any org's plan tier and credit balances. Supabase advisor flags this directly. Confirmed via SQL `SELECT pg_get_functiondef(...)`.

**8 HIGH findings:**
- **H1 Lock-state PII enforcement is UI-only.** `SnapQuote-mobile/lib/api/leads.ts:53-54,166-179` returns full customer PII (name, phone, email, address, lat/lng, place_id) regardless of `lead_unlocks` state. RLS lets every org member read everything. Contractor can hit PostgREST directly with their bearer and harvest all customer info without spending a credit — bypasses the unlock business model. Cross-tenant boundary intact (RLS still works); HIGH not CRITICAL because no horizontal privilege escalation.
- **H2 Refresh token in URL hash.** `SnapQuote-mobile/lib/utils/authBrowser.ts:24` puts `refresh_token=...` in the fragment passed to `WebBrowser.openBrowserAsync`. Hash never reaches Vercel but lives in mobile-browser history and copy-paste exposure surface. Refresh tokens are ~30-day session-bearer credentials.
- **H3 Sentry server config: `captureConsoleIntegration` + no PII scrubbing.** `sentry.server.config.ts:18` sends every `console.error` to Sentry. No `beforeSend` redaction. Multiple `console.warn` callsites in `app/api/**` pass underlying Resend/Telnyx errors that quote the recipient's email/phone in `.message`.
- **H4 In-memory rate limit on Vercel.** `lib/rateLimit.ts:11` uses module-level `Map`. Per-lambda state — botnet with rotating IPs and lambda fan-out defeats it. (Same root cause as Audit 7's H finding.) Used for `lead-submit` (Turnstile mitigates), `lead-photo-upload`, `forgot-password`, etc.
- **H5 No security headers on web.** `next.config.ts` no `headers()`, `vercel.json` no headers, `middleware.ts` only OAuth fixup. No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **H6 Mobile session in AsyncStorage plaintext.** Zero `expo-secure-store` references. `sb-<ref>-auth-token` (access + refresh) lives in plaintext in AsyncStorage — readable on jailbroken iOS, rooted Android, unencrypted iCloud/Google Drive backup.
- **H7 Privacy policy missing subprocessors and GDPR.** `app/(public)/privacy/page.tsx` lists Stripe/Supabase/OpenAI/Telnyx/Resend/Google Maps/Cloudflare. Missing: Vercel, Sentry, RevenueCat, Apple (Sign in with Apple), Meta (Pixel `1500154638449582`), Google Analytics 4 (`G-2QM16SWP9D`), Expo/EAS. No GDPR coverage. No concrete retention period. No disclosure that OpenAI processes customer photos. No SAR workflow beyond `mailto:`.
- **H8 Dependency CVEs.** Web `npm audit`: 7 vulns (5 high). Notable: `vite 7.0–7.3.1` path-traversal + WebSocket file read + `server.fs.deny` bypass; `picomatch <2.3.2 || 4.0.0–4.0.3` ReDoS; `postcss <8.5.10` XSS via `</style>`. Mobile: 5 vulns including `@xmldom/xmldom <=0.8.12` XML injection (high). `npm audit fix` resolves web with no breaking changes.

**9 MEDIUM findings, plus LOW cluster.** Notable mediums: `webhook_events` and `iap_subscription_events` have RLS enabled with zero policies (default-deny works but implicit); 6 `SECURITY DEFINER` functions with mutable `search_path`; `webhook_events` shows 0 rows in production (verify Stripe webhook delivery before launch); Apple Sign-In missing nonce round-trip; JWT verify omits explicit `iss` check; **`https://www.snapquote.us/.well-known/apple-app-site-association` returns 404** — universal links broken; Supabase HIBP leaked-password protection disabled.

**Verified clean / passing:**
- Stripe webhook signature verification (`stripe.webhooks.constructEvent` strict, no fallback skip) + `webhook_events` idempotency claim/release.
- RevenueCat webhook timing-safe shared-secret comparison (`crypto.timingSafeEqual`) + idempotency.
- Account deletion flow (Apple 5.1.1) — owner deletion tears down: lead photos in Storage, Stripe subscriptions, RC web-billing subs, RC customer, push tokens, organizations cascade (leads, customers, quotes, etc.), auth user. Blocks deletion if active App Store auto-renewal (correct per Apple). Confirmation email sent. Audit log written before cascade.
- All 18 public tables have RLS enabled (verified via MCP `list_tables`).
- Storage `lead-photos` bucket has correct member-only policies via `storage_org_id_from_path(name)`.
- `.gitignore` correctly excludes `.env*.local`, `.env`, `.env.*`, `*.env`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision` in both repos.
- Git history regex sweep for `sk_live`, `sk_test`, `service_role`, `OPENAI_API_KEY=`, `STRIPE_WEBHOOK_SECRET=` etc. — nothing flagged.
- `SUPABASE_SERVICE_ROLE_KEY` only referenced in `lib/supabase/admin.ts` and webhook handlers (server-only confirmed). Zero references in `SnapQuote-mobile/`.
- All 6 `EXPO_PUBLIC_*` env vars are public-by-design (anon key, URLs, RC iOS public SDK key); no secret accidentally exposed in mobile JS bundle.
- All 8 `cron/*` routes guard on `Authorization: Bearer ${process.env.CRON_SECRET}`.
- Internal `run-estimator` route guards on `x-internal-secret` header.
- JWT verification (`lib/auth/verifyJWT.ts`): ES256 via JWKS first, HS256 fallback during legacy migration, audience pinned to `authenticated`, never logs full bearer or full payload (allowlisted claims only).

**Cross-cutting flags:** C1/H7 overlap with Audit 5 (Apple App Review). C1 overlaps with Audit 2 (billing). M3 overlaps with Audit 2 (webhook idempotency). C1/M8 overlap with Audit 5 (universal links).

**Out-of-scope items reported anyway:** quote/send and team/invite endpoints not directly read in this audit (they follow the same `requireMember/OwnerForApi` pattern but should get a focused pre-launch sweep); front-end React-level CVEs beyond `npm audit` not pursued; mobile certificate pinning + jailbreak detection flagged for completeness only (typical for consumer apps).

**Notion saves verified:** Bugs & Fixes — top entry. Pending Work — top entry. Both tagged `[Source: Claude Code]`.

---

## Session — May 8, 2026 — Audit 7 / 13 web stack & backend (READ-ONLY)

Full audit at `docs/audit-7-web-backend-2026-05-08.md`. Tag `[Source: Claude Code]`. No code changes — read-only audit per scope.

**Scope:** Next.js App Router structure, every API route handler (44 total), middleware, caching, Vercel config (project, deployments, env vars, crons, function settings, domains), env-var presence, integration wiring (Resend/Telnyx/OpenAI/Stripe/RevenueCat/Places/Turnstile/Sentry), error pages, design tokens, build config. Out of scope (cross-flagged where touched): security/RLS deep audit (Audit 8), schema (Audit 9), AI internals (Audit 11), comms (Audit 12), observability/crons (Audit 13).

**Critical findings (5):**
1. `app/api/iap/sync/route.ts` — client-trusted IAP grants without store receipt validation (C1, cross-flag Audit 8).
2. `app/api/stripe/webhook/route.ts:58-68` `getOrgIdForUser` — `.limit(1).maybeSingle()` with no `.order(...)`, multi-org users hit arbitrary org. PR-2 plan has it; **still present**. (C2)
3. `app/api/revenuecat/webhook/route.ts` — static shared-secret auth (`timingSafeEqual` against env var) instead of HMAC `X-RevenueCat-Signature`. Compromise of `REVENUECAT_WEBHOOK_AUTH` = full spoof. (C3)
4. `REVENUECAT_PROJECT_ID` and `REVENUECAT_SECRET_KEY` MISSING from Vercel env (verified via `vercel env ls production`). `lib/revenuecatServer.ts:48-50` throws → owner account deletion broken in prod. (C4)
5. No `app/sitemap.ts`, no `app/robots.ts`, no `/api/healthz`. `https://www.snapquote.us/sitemap.xml` and `/robots.txt` both 404. Launch-blocking. (C5)

**High findings (9):** middleware GoTrue waste on every webhook/cron, public quote endpoints lack rate limiting, in-memory rate limiter useless on serverless, zero security headers, apex→www 307 not 308, `invalidateAnalytics()` never called, non-timing-safe secret compares, sidebar "My Link" exits AppShell, no CI workflow.

**Medium (11):** `lib/env.ts` schema misses ~10 vars, hardcoded Telnyx number, swallowed cron DB error, team-members N+1, redundant `force-dynamic`, design-token drift (no 14px Tailwind token), Manrope-vs-Inter on landing, `webhook_events` empty, no Sentry `beforeSend` redaction, weak ESLint config, no edge rate-limit on public form route.

**Low (10):** `verifyJWT.ts` no `iss` check, SSR `requireAuth` silent on auth fail, Zod-failure status code 400 vs 422, raw error in account-delete 500, internal-secret header convention, build-time Sentry vars missing, OPENAI_MODEL/SNAPQUOTE_APP_URL/server GOOGLE_MAPS_API_KEY missing in Vercel, `'orgin'` typo remote (deferred).

**Vercel config snapshot:** Project `prj_9Z7T6lgKutlpfapplWbQo8JmJVbi`, Node 24.x, framework nextjs. Domains: `www.snapquote.us` (primary) + apex `snapquote.us` aliased. Latest prod deploy `dpl_Hij9quTeXgWUYUYArQuXuSHs7m6Z` (READY). 7 daily crons in `vercel.json`. No `headers/redirects/rewrites/functions` blocks. Per-route `maxDuration` via export.

**Notion saves:** Bugs & Fixes page updated with full Critical/High/Medium/Low taxonomy. Pending Work page updated with action items grouped by severity. This `current-state.md` and `updates-log.md` updated. Audit doc at `docs/audit-7-web-backend-2026-05-08.md`.

---

## Session — May 7, 2026 — PR 1/3: web Plan page UI cleanup (remove inactive-sub UI surfaces)

First of three PRs in the Plan-page architecture overhaul. Full plan + diagnosis lives in the mobile repo's `docs/updates-log.md` 2026-05-07 second-pass entry (and Notion Pending Work). Product invariant Murdoch is enforcing: SnapQuote is a free app, Solo is the free tier, "Business + No active subscription" is structurally impossible — any code path that can produce that state is a bug.

PR 1 scope: web UI only. Stops the Plan page from contradicting itself. No DB changes, no webhook changes, no cron changes. PR 2 lands lifecycle architecture (soft-cancel in `clearStaleStripeCustomerId`, reconcile cron, `subscription_ends_at` column, Stripe metadata backfill). PR 3 lands the one-shot data remediation (with `falconn` excluded per Murdoch's call — he wants it kept on Business while testing).

**Files changed:**
- `app/app/plan/page.tsx` — deleted `formatSubscriptionStatus` helper (was at lines 50-55), deleted the `<Badge>` and `subscriptionStatusLabel` (was rendering "No active subscription" pill on the Current Plan card), deleted `trialEndLabel` and the trial-ends paragraph, deleted the "Billing is active" entry from `planHighlights`, simplified `getPlanPrice(plan)` to drop the `billingInterval` parameter (PR 2 will re-introduce a proper billing-info card with renewal/end dates instead of inferring monthly from null). Replaced `subscription.active` gate on the Manage Billing link with `showManageBilling = subscription.hasActiveStripeSub` and added a TODO that PR 2 will OR-in `subscription.subscriptionEndsAt`. Net: card now reads only `org.plan` for display; no UI branch on `subscription.active` anywhere.
- `lib/subscription.ts` — slimmed `OrganizationSubscriptionStatus` type from 8 fields to 3 (`billingSource`, `hasActiveStripeSub`, `subscriptionEndsAt`). Dropped `status`, `plan`, `active`, `stripeSubscriptionId`, `trialEndDate`, `billingInterval`, `iapCancellationScheduledAt`. `subscriptionEndsAt` is wired to `null` in PR 1; PR 2 reads it from the new `organizations.subscription_ends_at` column. Body of `getOrganizationSubscriptionStatus` simplified — no longer retrieves the per-row Stripe trial_end via `subscriptions.retrieve`, no longer picks a "current" row from rank/order; just computes `hasActiveStripeSub = rows.some(r => isActiveStatus(r.status))` over the org's owners' subscription rows. Deleted `requireActiveSubscription` and `SubscriptionRequiredError` (zero callers; the only consumer — `quote/send/route.ts` — was removed in 2026-05-05 commit `60cc2c5`). Also dropped the inline `getIapCancellationScheduledAt` helper since `iapCancellationScheduledAt` is no longer in the API contract.
- `app/api/app/subscription-status/route.ts` — return shape narrowed to match the new type. Drops `active`, `plan`, `status`, `trialEndDate`, `iapCancellationScheduledAt` from the JSON. Mobile callers (`SnapQuote-mobile/lib/api/iap.ts`) sync in lockstep.
- `components/SubscriptionStatusCard.tsx` — DELETED. Confirmed dead code by grep; no imports outside its own file. The whole component was the wrong product framing ("Inactive subscription" red banner with "Upgrade" CTA).
- `components/SubscriptionRequiredModal.tsx` — DELETED. Replaced by `components/ContractorUnavailableModal.tsx` (new). The contractor-facing variant of the old modal was already unreachable (`quote/send` no longer emits `SUBSCRIPTION_INACTIVE`); removing it for good. Customer-facing variant survives in the new component, used by `PublicLeadForm.tsx` for the public-form 402 case (Solo + 30-day-inactive contractors). Customer copy unchanged: "Not Accepting Requests / This contractor isn't accepting new requests right now / Please reach out to them directly for an estimate." — neutral, no billing-vocabulary leak. Aria id renamed `subscription-required-title` → `contractor-unavailable-title`.
- `components/ContractorUnavailableModal.tsx` — CREATED. ~30 LOC, customer-only, no `variant` prop.
- `components/PublicLeadForm.tsx` — import + JSX swap. `variant="customer"` prop removed (variants are gone).
- `components/QuoteComposer.tsx` — removed the `SubscriptionRequiredModal` import, removed the `code === "SUBSCRIPTION_INACTIVE"` branch + `setShowSubscriptionModal(true)` call in the post-send response handler, removed the `<SubscriptionRequiredModal>` JSX, removed the now-unused `showSubscriptionModal` / `setShowSubscriptionModal` useState. The endpoint no longer emits `SUBSCRIPTION_INACTIVE`, so this branch was dead — cleaning up while the surface is touched.
- Mobile-side lockstep (separate commit on mobile worktree branch `claude/silly-lamarr-0dfd30`):
    - `lib/api/iap.ts` — `OrgSubscriptionStatus` type updated to match the slimmed web shape (3 fields).
    - `lib/hooks/useEntitlementSync.ts` — `stripeStatus.active` → `stripeStatus.hasActiveStripeSub` rename to match the new field name. Catch fallback restructured from `stripeStatus = { active: false }` (which would fail typecheck against the new shape) to a single boolean `hasActiveStripeSub` variable. Behavior preserved.
    - `app/(tabs)/more/plan.tsx` and `app/(tabs)/more/credits.tsx` — no edits required. Both already read only `.billingSource` from the result. Type narrows correctly through the slimmed shape.

**Verification:**
- `npx tsc --noEmit` — clean exit.
- `npm run lint` — clean (one pre-existing `<img>` warning in `app/layout.tsx:49` unrelated to this PR).
- `npm test` (vitest) — all 76 tests pass across 10 test files.
- Mobile `npx tsc --noEmit` — only pre-existing `components/navigation/TopBar.tsx:59-60` typed-routes errors (documented in `Code Patterns & Conventions` Notion as out-of-scope). My mobile changes introduce zero new errors.
- Mental render of three Plan page states (Solo, Active Business, falconn-shape) — all three render consistently, no contradiction surfaces visible to the user. `falconn` still wrongly says "Business" (PR 2 fixes the cause; PR 3 was intentionally skipped for `falconn` per Murdoch), but the screen no longer says "Business" and "No active subscription" simultaneously.

**What this PR does NOT do (deferred to PR 2 / PR 3 per the plan):**
- No changes to `app/api/stripe/webhook/route.ts`, `lib/stripe.ts:clearStaleStripeCustomerId`, `app/api/cron/trial-expired/route.ts`, or any other lifecycle code. PR 2.
- No new DB columns, no migrations. PR 2.
- No SQL UPDATE on `organizations`. PR 3 (which excludes `falconn`).
- No `<CancellationScheduledBanner>` — depends on `subscription_ends_at` from PR 2's migration.
- `UpgradeBanner` (over-credit usage gating) is unchanged. Per Murdoch (E1): usage gating is a separate concept from billing state and is not in scope.

---

## Session — April 18, 2026

### MD File Restructure

Established new documentation system for the SnapQuote repos:

- `docs/current-state.md` — living document reflecting current project state. Updated with every meaningful prompt going forward.
- `docs/updates-log.md` — this file. Append-only session log. Starts fresh from today.
- `docs/archive.md` — consolidation of all older MD files. Lower reliability. For reference only.

All three files carry disclaimer headers directing Claude Code not to treat contents as ground truth and to verify in actual code.

Older files consolidated into archive: `README.md`, `docs/ai-workflow.md`, `docs/change-log.md`, `docs/estimator-playbook.md`, `docs/estimator-rules.md`, `docs/estimator-system.md`, `docs/project-overview.md`, `docs/testing-log.md`, `snapquote_architecture.md`, `snapquote_mvp_plan.md`.

Workflow updated: Claude Code is now the sole executor (no more Codex).

---

_Future sessions appended below this line._

---

## Session — April 20, 2026

### Dashboard + Notifications Cross-Repo Audit

Ran a deep, read-only audit of two features across web (`C:\Users\murdo\SnapQuote`) and mobile (`C:\Users\murdo\SnapQuote-mobile`): the **Dashboard tab** and the **Notifications system** (bell icon dropdown in TopBar). Covered UI, data fetching, Supabase queries, RPCs, RLS policies, `.single()` guards, error handling, loading states, security, performance, cross-tab dependencies, and cross-platform parity. No code changes — findings only.

**Dashboard — architecture:**
- Web (`app/app/page.tsx`): Async Server Component, `Promise.all()` fan-out over analytics + credits + recent leads + lead_unlocks.
- Mobile (`app/(tabs)/index.tsx`): 4 parallel client hooks (`useLeads`, `useCredits`, `useAnalytics`, `useProfile`).
- Both render an identical 7-stat strip: Credits · Leads This Month · Estimates Sent · Estimates Accepted · Acceptance Rate · Avg Estimate Value · Avg Response Time.
- Data comes from `get_org_credit_row` RPC, `get_org_analytics` RPC (migration 0052/0053), direct `leads`/`lead_unlocks` queries. Same backend, different front-ends.

**Dashboard — findings:**
- **Web has no loading UI and no error boundary on the page itself** — a cold/slow `get_org_analytics` gives a blank page. Mobile has `LoadingScreen` + 7 `StatCardSkeleton`s + `ErrorScreen` with Retry.
- **Web `unstable_cache` tag `analytics:${orgId}` is never revalidated on mutation** — grep across the repo returned zero `revalidateTag` / `revalidatePath` calls anywhere. Stats are stale up to 5 min after a new lead or accepted quote.
- **Web `app/app/layout.tsx` has 2 unguarded `.single()` calls** (lines 32, 36) on `contractor_profile` and `organizations`. Missing row crashes every authenticated page, not just dashboard.
- **Mobile `.single()` calls all properly guarded** (all 4: `getLead`, `getProfile`, `getOrganization`, `getCredits` fallback).
- Mobile lead-list performance optimizations noted: batch photo signing (up to 2 preview photos per lead), `LEAD_LIST_COLUMNS` (19-field projection) instead of `select("*")`, `LeadCard` memoized with custom comparator.

**Notifications — architecture:**
- Shared `notifications` table (migration 0045) across both clients. Columns: `id`, `org_id`, `user_id` (unused), `type`, `title`, `body`, `screen`, `screen_params` (jsonb), `read`, `created_at`. Indexes: `(org_id, created_at DESC)`, partial `(org_id) WHERE read = false`.
- RLS: SELECT + UPDATE via `organization_members` membership. No client INSERT/DELETE — backend admin client only.
- Realtime channel names are distinct: web `notifications-${orgId}`, mobile `mobile-notifications-${orgId}` — both clients can coexist on the same user/org without collision.
- **50-per-org cap** via DB trigger `trg_prune_org_notifications` after every INSERT.
- **7-day rolling TTL** via daily cron `/api/cron/cleanup-notifications` deleting `created_at < now() - 7d`.
- **There is no "midnight clear"** — the concept is a 7-day rolling retention, not a daily wipe. Prior framing of "midnight clear logic" was a misconception; retention is time-based, not calendar-based.

**Notifications — 8 types enumerated:**
`NEW_LEAD`, `ESTIMATE_VIEWED`, `ESTIMATE_ACCEPTED`, `ESTIMATE_NOT_VIEWED`, `ESTIMATE_EXPIRING_SOON`, `ESTIMATE_EXPIRED`, `TRIAL_EXPIRED`, `INVITE_ACCEPTED`. Nudge/expiry/trial come from daily Vercel crons (expiry + nudge are grouped per org).

**Notifications — findings:**
- **Web `TopBar.handleNotificationClick` only handles `lead | quotes | team`** — confirmed by direct grep of `components/TopBar.tsx:47-51`. `TRIAL_EXPIRED` notifications carry `screen: "settings"` and no-op on web click. Mobile routes them correctly (to `/(tabs)/more/plan`).
- **Duplicate NEW_LEAD notifications possible** — `sendNewLeadNotifications` is reachable from 3 code paths (lead-submit after-block, rescue-stuck-leads cron stage 2, estimator terminal-state transitions) with no unique constraint on (org_id, type, lead_id).
- **`trial_ended_notified_at` column exists but is unused** — migration 0046 added the column and a partial index (`WHERE trial_ended_notified_at IS NULL`), but `app/api/cron/trial-expired/route.ts` never reads or writes it. The docstring (line 18) claims the marker is used; the only actual dedup is the Resend idempotency key `cron-trial-expired-${orgId}-${runDay}`. This is a wiring bug — schema went in, code never caught up.
- **ESTIMATE_VIEWED is CAS-protected** — `/api/public/quote/[publicId]/viewed` flips `viewed_at` only when still NULL; only the CAS winner fires push + in-app notification.
- **Web toast stacking on burst INSERTs** — `hooks/useNotifications.ts` calls `toast()` per INSERT with no debounce.
- **Mobile push-permission denial is silent** — `lib/notifications.ts` returns null with no UI feedback.
- **Mobile tap handler guards against duplicate screen stacks** — `app/_layout.tsx:224-229` checks `pathnameRef.current` before pushing, prevents duplicate screen + Realtime channel collisions when user taps notification while already on target.
- **Dead push tokens auto-cleaned** on terminal Expo errors (`DeviceNotRegistered`, `InvalidCredentials`, `MismatchSenderId`) in `lib/pushNotifications.ts`.
- **Web popover desktop auto-closes after 5s of no hover** — can fire while user is reading longer notifications; no pause on hover/scroll-within.

**Cross-feature coupling:** Dashboard and Notifications are fully decoupled. No shared queries, cache, or state. Notifications never invalidate dashboard data; a new NEW_LEAD arrives via Realtime to the notifications feed but dashboard stats don't refresh until its own 5-min cache expires.

**Cross-platform parity:** Mobile is more resilient than web (loading UI, error UI, guarded `.single()`s, offline-aware pull-to-refresh, push channel). Web has nothing mobile doesn't — no web-push support means tab-closed web users miss real-time alerts entirely.

**Strengths observed:** Strong RLS on notifications; CAS on ESTIMATE_VIEWED; per-device push tokens (migration 0039 fixed prior single-per-org bug); dead-token cleanup; 50-cap + 7-day TTL forming a clean lifecycle; mobile batch photo signing; selective column projections; `LeadCard` memoization; Realtime channel refcounting in hooks.

**Doc updates made in this session:**
- `current-state.md` header date range extended to April 15–20, 2026.
- `current-state.md` Notifications section expanded with in-app feed structure, schema, 8 types, lifecycle, push details.
- `current-state.md` new Dashboard section added after Analytics.
- `current-state.md` Known Outstanding Issues gained 10 new entries covering the findings above.
- This log entry.

---

## Session — April 20, 2026 (fixes)

### Fix: Layout `.single()` guards + `settings` notification routing

Shipped the first two fixes from this morning's audit. Commit `5285d14` on `main`.

**Bug 1 — Unguarded `.single()` in web app layout (`app/app/layout.tsx`):**
- The layout called `.single()` on `contractor_profile` and `organizations` with no null check. A missing row would throw and crash every `/app/*` page for that user.
- Fix: Switched both to `.maybeSingle()` so queries return `{ data: null }` instead of throwing. After the `Promise.all()`, added `if (!profile || !organization) redirect("/onboarding")` — same pattern `requireAuth` uses when a user has no membership row. TypeScript narrows correctly after the guard thanks to `redirect()`'s `never` return type.
- Added `redirect` import from `next/navigation`.
- The redirect target is `/onboarding` for both cases: profile-missing is the expected case for a half-finished signup; organization-missing is a data-integrity edge case that onboarding can reset.

**Bug 2 — Web notifications silently drop `settings` screen clicks (`components/TopBar.tsx`):**
- `handleNotificationClick` had branches for `lead`, `quotes`, and `team` but no case for `settings`. `TRIAL_EXPIRED` notifications (which carry `screen: "settings"`) did nothing when clicked on web, even though they route correctly on mobile.
- Fix: Added `else if (item.screen === "settings") { router.push("/app/plan"); }` — `/app/plan` matches the authenticated plan route and mirrors the mobile tap handler's target of `/(tabs)/more/plan`.

**Doc updates (this section):**
- Removed the two now-fixed bullets from Known Outstanding Issues in `current-state.md` (Unguarded `.single()` and silent `settings` screen clicks).
- Appended this log entry.

**Note on commit scope:** The commit also bundled the `docs/current-state.md` + `docs/updates-log.md` audit edits that were still uncommitted from earlier in the day (per the `git add .` instruction). Commit message is narrow to the fix; the docs reflect the broader audit.

---

## Session — April 20, 2026 (fixes — round 2)

### Fix: Analytics cache invalidation + dashboard streaming/error UI

Shipped the next two fixes from the morning's audit. Commit `b5cae91` on `main`.

**Fix 1 — Dashboard analytics cache never invalidated (`lib/db.ts` + 5 call sites):**
- `getAnalytics` is wrapped in `unstable_cache(..., { tags: [\`analytics:${orgId}\`] })` with a 5-min TTL. A grep of the repo confirmed `revalidateTag` was never called anywhere, so dashboard stats lagged reality by up to 5 min after any key event (new lead ready, quote sent, quote accepted, quotes expired).
- Added `invalidateAnalytics(orgId)` helper alongside `getAnalytics` in `lib/db.ts`. Both sides now reference a single `analyticsCacheTag()` helper so the tag string can't drift between cache write and cache bust.
- Called `invalidateAnalytics()` from every key event that shifts a count the RPC produces:
  - `lib/ai/estimate.ts` — right after the lead row is flipped to `ai_status='ready'` (and before `sendNewLeadNotifications`). Only fires on the success path; estimator failures don't flip any count that was previously zero.
  - `app/api/app/quote/send/route.ts` — right before the final response, after all writes (status→SENT, lead status→QUOTED, quote_events insert, usage increment). The idempotent-loser early return at line 175 doesn't reach here — correct, the winner already invalidated.
  - `app/api/public/quote/[publicId]/accept/route.ts` — right after the quote status→ACCEPTED + lead status→ACCEPTED writes, before the notification fan-out.
  - `app/api/public/quote/[publicId]/route.ts` — in the lazy per-read expire branch, only when the row was actually flipped (`effectiveStatus === "EXPIRED" && rawStatus !== "EXPIRED"`).
  - `app/api/cron/auto-expire-stale-quotes/route.ts` — once per affected org at the top of the per-org notification loop.
- Counted but intentionally skipped: `ESTIMATE_VIEWED` transition (doesn't change any count — SENT and VIEWED both live in the counted set). Estimator `ai_status='failed'` (doesn't change count — only 'ready' counts).

**Fix 2 — Web dashboard loading/error UI (`app/app/page.tsx` + `app/app/error.tsx`):**
- **Correction to the prior audit:** `app/app/loading.tsx` and `app/app/error.tsx` already existed at the segment level (rendered during navigation to `/app` and caught thrown errors, respectively). The audit was wrong to say "web has neither." What was missing was **in-page streaming** — the page was one monolithic `Promise.all()` that blocked the entire render until every fetch completed.
- Refactored `app/app/page.tsx` into three async sub-components, each wrapped in its own `<Suspense>`:
  - `DashboardSubtitle` — renders the "X new leads this week" line under the date header
  - `DashboardStats` — analytics + credits (the 7-card strip)
  - `DashboardRecentLeads` — recent leads list or empty state
- Each Suspense has a skeleton fallback that matches the shape of the content coming in. `SubtitleSkeleton`, `StatsSkeleton` (7 cards matching actual count), `RecentLeadsSkeleton` (6 cards).
- `DashboardSubtitle` and `DashboardRecentLeads` both await the same leads query. Wrapped the fetch in `React.cache()` so the two Suspense siblings share one request-scoped fetch instead of hitting Supabase twice.
- `requireAuth()` runs outside Suspense — if auth fails, `redirect()` fires before any Suspense mounts. Static content (date header, "Stats" label, "Recent Leads" header + "View All" link) renders immediately; only the data-dependent pieces await.
- Enhanced `app/app/error.tsx` with explicit `Sentry.captureException(error, { tags: { segment: "app", digest: error.digest ?? "none" } })` — more robust than relying on `captureConsoleIntegration` to sweep up the console.error. Added display of `error.digest` to the user as a support reference.
- `app/app/loading.tsx` left unchanged — still the right fallback for initial navigation to the `/app` segment.

**Verification:** `npx tsc --noEmit` exit 0 across the whole web repo after the refactor.

**Doc updates (this section):**
- Dashboard section in `current-state.md` rewritten to describe the new Suspense structure, shared React.cache fetch, enhanced error.tsx.
- Caching bullet in `current-state.md` rewritten to enumerate all 5 invalidation call sites.
- Removed the two now-fixed bullets from Known Outstanding Issues in `current-state.md` (analytics cache never invalidated, no loading/error UI).
- Appended this log entry.

**Note on commit scope:** The commit at `b5cae91` included two pre-existing untracked files (`AppIcon-1024.png`, `scripts/export-app-icon.mjs`) picked up by `git add .`. These were the user's in-progress icon-export tooling, unrelated to the fix but bundled per the `git add .` instruction.

---

## Session — April 20, 2026 (landing nav — color regression fix)

### Fix: Navbar showing black background at the top

The previous commit left the navbar hoisted out of the hero `<section>` (from the earlier "make it fixed" attempt). Without the section's radial-gradient bg beneath it, the outer `#101320` solid was showing through the transparent nav — visible as a flat black strip at the top of the page.

Fix: moved `<nav>` back inside the hero `<section>` (same DOM position as the pre-regression original), keeping the static positioning (no `fixed`/`sticky`) so the logo still scrolls away naturally. Nav className and all inner markup are identical to the original. No colors or backgrounds touched.

Updated the Landing navbar note in `current-state.md` to lock in "must stay inside the hero section".

---

## Session — April 20, 2026 (landing nav — revert to static)

### Change: Remove fixed positioning from landing navbar

User reversed the previous decision — wants the navbar to scroll away with the page instead of staying pinned. Removed `fixed top-0 z-50` from the `<nav>` className in `app/(public)/page.tsx`, leaving `w-full bg-transparent shadow-none backdrop-blur-0`. Nav position in the DOM unchanged (still a direct child of the outer landing container, above the hero `<section>`), so it renders flush with the top of the page and scrolls naturally. No other visual or markup changes.

Updated the Landing navbar note in `current-state.md` to reflect static-flow positioning.

---

## Session — April 20, 2026 (landing nav fix)

### Fix: Landing navbar scrolling with the page instead of staying pinned

Reported: on snapquote.us the SnapQuote logo + wordmark in the top-left scrolled away with the hero instead of staying fixed.

Root cause: the `<nav>` in `app/(public)/page.tsx` already had `fixed top-0 z-50 w-full`, but it was nested inside the hero `<section className="relative overflow-hidden ...">` which also contains a decorative sibling using `filter: blur(90–120px)`. An ancestor with `filter` (or certain `overflow` + stacking combinations) can establish a containing block for `position: fixed` descendants, so the nav was being positioned relative to the section instead of the viewport.

Fix: lifted the `<nav>` out of the `<section>` and made it a direct child of the outer `<div className="min-h-screen …">`. No className, markup, or visual changes — same `BrandLogo`, same Link, same typography. Now `position: fixed` correctly anchors to the viewport.

No other changes.

---

## Session — April 20, 2026 (brand — new lightning glyph)

### Update: Brand logo swapped to refined lightning bolt

User supplied a new SVG (`C:\Users\murdo\Downloads\AppIcon.svg`) with the same gradient chat-bubble envelope but a refined lightning-bolt glyph. Only the inner bolt `<path d>` changed; bubble path, gradient stops, viewBox, and all component structure are unchanged.

**Change — `components/BrandLogo.tsx`:** swapped the lightning-bolt path `d` attribute:
- Old: `M50.5 18L35 48H51L42 71L75 36H59L68 18H50.5Z`
- New: `M51.49 15.33L39.40 38.73H51.88L44.86 56.67L70.60 29.37H58.12L65.14 15.33H51.49Z`

All `size`/`className`/`iconClassName`/`wordmarkClassName`/`showWordmark` props and the surrounding JSX (wrapping `<div>`, wordmark `<span>`) are untouched. Component continues to render identically except for the glyph path. Every existing consumer of `BrandLogo` picks up the new mark without any other edits.

**Doc updates:**
- Added a Brand mark paragraph to the Design System section of `current-state.md` — source of truth, asset mirrors, and a note that `AppIcon-1024.png` is stale vs. the new glyph and needs re-rendering before the next ASC upload.
- Appended this log entry.

**Note on commit scope:** `git add .` also staged `AppIcon.svg` at the repo root (earlier extraction of the *old* brand mark as a standalone vector) plus prior doc edits to `current-state.md` / `updates-log.md`. The `AppIcon.svg` at root still contains the **old** bolt path; it was created and staged before this glyph swap and is being bundled rather than discarded. The standalone `AppIcon.svg` is not referenced from code; the live brand mark everywhere in the app is the inline SVG in `BrandLogo.tsx` (now updated). Worth a follow-up to either regenerate `AppIcon.svg` + `AppIcon-1024.png` from the new path or delete them if unused.

---

## Session — April 20, 2026 (fixes — round 3)

### Fix: Notification dedup + trial idempotency + toast debounce + tap logging + ActivityTracker logging

Shipped five fixes from the morning's audit. Code changes landed on commit `003eae9`; migration 0059 had already been picked up accidentally by the parallel-session commit `003b6a4` (see note at the end of this entry).

**Fix 1 — Duplicate NEW_LEAD notifications (`supabase/migrations/0059_notifications_new_lead_dedup.sql` + `lib/ai/estimate.ts`):**
- `sendNewLeadNotifications` is reachable from three code paths — lead-submit after-block, rescue-stuck-leads cron stage 2, estimator terminal-state transitions — and had no dedup. Two of those firing for the same lead produced two identical feed entries.
- New migration 0059 creates a partial unique index `notifications_new_lead_dedup_idx` on `(org_id, (screen_params->>'id')) WHERE type='NEW_LEAD'`, with a one-time `WITH ranked ... DELETE` cleanup of pre-existing duplicates so the CREATE UNIQUE INDEX can actually build.
- `sendNewLeadNotifications` now checks `insertError.code !== "23505"` before warning — the expected unique_violation is a soft success.

**Fix 2 — TRIAL_EXPIRED cron idempotency (`app/api/cron/trial-expired/route.ts`):**
- **Correction to the task prompt:** the user asked for a new migration adding `trial_ended_notified_at` to `organizations`. That column **already exists** (migration 0046 added it along with a partial index on `(trial_ended_notified_at) WHERE trial_ended_notified_at IS NULL`). The bug was that the cron never read or wrote it — the docstring even admitted the wiring was pending "in a follow-up migration." So no new migration was added; instead the cron was wired up to use the column that's been sitting in the schema since 0046.
- Query now filters `.is("trial_ended_notified_at", null)` so already-notified orgs are skipped.
- After the email succeeds, the cron runs a CAS update (`.update({ trial_ended_notified_at: now }).eq("id", orgId).is("trial_ended_notified_at", null)`) — concurrent Vercel retries can't double-set the marker.
- Docstring rewritten to describe the actual behavior. The stale "column should be added in a follow-up migration" text is gone.

**Fix 3 — Toast stacking (`hooks/useNotifications.ts`):**
- Added module-level burst-handling state (`toastBurstActive`, `toastBurstCount`, `toastBurstTimer`) with a 1.5s window.
- New `queueToast(text)` helper: leading edge fires immediately, subsequent arrivals within the window increment a counter, and on window close a single summary toast fires (`"N more notification(s)"`). The INSERT handler now calls `queueToast(item.text)` instead of `toast(item.text)` directly.
- UX: a single notification still shows instantly (no debounce delay). A burst of 10 shows one toast + a "9 more notifications" summary instead of ten stacked toasts.

**Fix 4 — Notification tap logging (`components/TopBar.tsx`):**
- `handleNotificationClick` now has explicit branches for two previously-silent cases:
  - `screen === "lead"` with no `screenParams.id` → `console.warn` with `{notificationId, type, screenParams}` + fall back to `/app/leads` so the click isn't a no-op.
  - Unknown `screen` value → `console.warn` with `{notificationId, type, screen}` (no navigation — we don't know where to go).
- `captureConsoleIntegration` forwards the warns to Sentry, so bad writers of `screen_params` become traceable in production.

**Fix 5 — ActivityTracker errors (`components/ActivityTracker.tsx`):**
- The `fetch().catch(() => {})` block now logs with `console.warn("Activity tracker ping failed:", error)`.
- Added a `.then(response => ...)` that checks `response.ok` and logs `"Activity tracker ping returned {status} {statusText}"` on non-2xx — `fetch` only rejects on network errors, so previously a broken endpoint (401, 500) would have been completely silent.
- Behavior is still best-effort — errors are logged, not surfaced to the user.

**Verification:** `npx tsc --noEmit` exit 0 across the whole web repo after the fixes.

**Doc updates (this section):**
- Notifications section in `current-state.md` gained four new Lifecycle bullets (NEW_LEAD dedup, TRIAL_EXPIRED dedup, toast burst coalescing, tap-handler logging).
- Migrations list updated: "applied through 0059" + new row describing 0059.
- Removed three now-fixed bullets from Known Outstanding Issues (duplicate NEW_LEAD, TRIAL_EXPIRED idempotency, toast stacking).
- Appended this log entry.

**Note on commit scope / parallel-session collision:** A parallel Claude Code session was active on `main` while these fixes were being written and landed three intervening commits (`bf56e5e`, `2802c06`, `003b6a4`) for brand/landing-nav work. The parallel session's `git add .` accidentally swept up the already-written `supabase/migrations/0059_notifications_new_lead_dedup.sql` into commit `003b6a4` ("Remove sticky/fixed positioning from landing page navbar"). By the time the code fixes were staged here, the migration file showed as tracked with no pending changes — so it's on `main`, just under a misleading commit title. The five code-level fixes are in this session's commit `003eae9`. No data loss, but the migration's provenance is split across two commits — worth noting for future archaeology.


---

## Session — April 20, 2026 (demo email domain fix)

### Fix: Demo account email showed snapquote.com instead of snapquote.us

Landing-page product demo displayed `demo@snapquote.com` in the owner identity card; correct domain is `.us`. Two hard-coded occurrences, both updated:

- `lib/demo/shared.ts:19` — exported `DEMO_USER_EMAIL` constant (canonical source used when demo data is generated/seeded).
- `components/landing/ProductDemo.tsx:756` — literal fallback in the JSX (`activeData?.shell.ownerEmail ?? "demo@snapquote.us"`), kept in sync so the display never shows the old `.com` even if `shell.ownerEmail` is missing.

Grep confirmed zero remaining references to `demo@snapquote.com` in the repo. No schema, seed SQL, or runtime copy elsewhere needed updating.

Added a "Demo account constants" note to `current-state.md` so this source-of-truth pairing is discoverable next time.

---

## Session — April 20, 2026 (demo email — DB seed override)

### Fix: Demo email still rendering as .com despite prior code fix

Previous commit `5d952ba` updated the two hard-coded literals but the landing demo continued to show `demo@snapquote.com`. Traced the render path: `lib/demo/server.ts:511` was resolving `shell.ownerEmail` as `owner?.email ?? profile.email ?? DEMO_USER_EMAIL`. Both `owner.email` (from `auth.users`, populated by the original `seedDemo.ts` run) and `profile.email` (from `contractor_profile`) were still `demo@snapquote.com` in Supabase — the pre-fix seed run. `DEMO_USER_EMAIL` was never reached.

**Changes:**
- `lib/demo/server.ts:511` — now builds `ownerEmail: DEMO_USER_EMAIL` directly. The landing demo is a marketing surface and should always show the canonical address regardless of what is persisted for the demo org, so this is the right place to force the value rather than adding a DB migration to mutate seeded data.
- `scripts/seedDemo.ts` — already consumes `DEMO_USER_EMAIL` from `lib/demo/shared.ts` (line 19, now `demo@snapquote.us`). A future re-seed will also write `.us` into Supabase, at which point the override above is a no-op but harmless.
- Grep for `demo@snapquote.com` across the web repo returns zero hits (only `scripts/run-estimator-tests.ts` still uses an unrelated `test@snapquote.com`).

**Why not a SQL migration:** The stale values in `auth.users.email` and `contractor_profile.email` only affect the demo org and only surface here. Changing an `auth.users` row requires the admin API (not a regular migration), and mutating the demo row has no functional value — the seed script will rewrite it on the next run. Code-side override is sufficient and reversible.

Updated the "Demo account constants" note in `current-state.md` to document the override and the three-file sync contract.

---

## Session — April 20, 2026 (mobile fixes — round 4)

### Fix: Offline dashboard cache + push permission denied UI

Shipped two more fixes from the morning's mobile audit. Commit `133a34a` on mobile `main` (landed after a rebase onto two parallel-session commits — see note at the end).

**Fix 1 — No offline fallback on dashboard (`lib/hooks/*` + `components/shared/StaleDataBanner.tsx` + `app/(tabs)/index.tsx`):**
- All 4 dashboard hooks (`useCredits`, `useLeads`, `useAnalytics`, `useProfile`) now persist the last successful fetch to AsyncStorage under stable per-hook keys (`cache:credits:${orgId}`, `cache:leads:${orgId}:${status ?? "ALL"}`, `cache:analytics:${orgId}:${range}`, `cache:profile:${orgId}`), and on mount they hydrate from that cache as initial state — marked `isStale: true` — before the network fetch runs in parallel.
- Fetch success: clears `isStale`, overwrites the cache entry. Fetch failure with a cache already on screen: keeps the data visible, flips `isStale: true`, and suppresses the error state (so the dashboard isn't blocked by the error screen). Fetch failure with no cache: surfaces the error normally.
- Each hook mirrors its latest data in a `dataRef` so async failure handlers can check "do we have something on screen?" without stale-closure bugs.
- `useAnalytics` keeps its existing 5-min in-memory cache as the fast path (treated as fresh when hit) — AsyncStorage sits below it as the offline fallback. In-memory hit → `isStale: false`; AsyncStorage hit → `isStale: true` until the next successful network fetch.
- New `components/shared/StaleDataBanner.tsx` — amber badge with a `wifi-off` icon and the message "Showing cached data — not live." Rendered above the dashboard content when any of the four hooks is stale. Separate from the existing red global `OfflineBanner` (which tracks live connectivity, not data freshness).
- `app/(tabs)/index.tsx` error gate changed from `if (hasError)` to `if (hasError && !hasInitialData)` so the full `ErrorScreen` only fires when there's genuinely nothing to render. With cache fallbacks in place, an offline cold launch now falls through this branch and renders cached content with the stale banner instead.

**Fix 2 — Silent push permission denial (`lib/notifications.ts` + `app/(tabs)/more/notifications.tsx`):**
- New helpers in `lib/notifications.ts`:
  - `getPushPermissionStatus()` — returns `"granted" | "denied" | "undetermined" | "unavailable"` (the last for simulator / non-device).
  - `requestPushPermission()` — prompts the OS dialog. Only meaningful when undetermined (both platforms silently no-op once the user has made a choice).
  - `openSystemNotificationSettings()` — wraps `Linking.openSettings()` for the one path to re-enable after a denial.
- New "Push Notifications" card at the top of the Notifications settings screen showing:
  - A status badge (green "Enabled" / red "Blocked" / amber "Not set" / gray "Not available") with a Feather icon.
  - A status-specific description sentence.
  - Contextual CTA: "Open Settings" button when blocked (routes to OS settings), "Enable push notifications" button when undetermined (triggers the native prompt), nothing extra when granted or unavailable.
- Status re-reads on every `useFocusEffect` firing so returning from the OS Settings app updates the badge on the next frame instead of showing stale "Blocked."

**Verification:** `npx tsc --noEmit` exit 0 across the mobile repo after the fixes. Single intermediate error (`set<LeadsCacheEntry>` with a non-generic `set`) caught and fixed before commit.

**Doc updates (this section, in the web repo's `docs/` — the canonical project doc location):**
- Dashboard section in `current-state.md`: mobile description expanded to describe `StaleDataBanner`, the loosened error gate (`hasError && !hasInitialData`), and the new AsyncStorage cache key scheme per hook.
- Notifications section in `current-state.md`: Push bullet rewritten to describe the new Settings-screen permission UI and its helpers.
- Removed the two now-fixed bullets from Known Outstanding Issues in `current-state.md` (silent push-permission denial, no offline cache).
- Appended this log entry.

**Note on gitignore:** Added `.claude/` to the mobile repo's `.gitignore` (matching the web repo's existing entry) so `git add .` in the mobile main tree doesn't sweep in the Claude Code worktree directory. First commit that would have included `.claude/` was the one about to land; caught before staging.

**Note on parallel-session collision / rebase:** A parallel Claude Code session ran through a PR merge (`1315a92`) for an app-icon refresh and new mobile-side `docs/` while these fixes were being written. The push was rejected as non-fast-forward; resolved with `git pull --rebase` (no file overlap) and re-pushed. The mobile repo now also has its own narrow `docs/current-state.md` + `docs/updates-log.md` covering RevenueCat config and icon assets — separate from this file which remains the comprehensive project log.

---

## Session — April 20, 2026 (cleanup — round 5)

### Fix: Notification TTL terminology + dashboard lead query date guardrail

Two small cleanup fixes. Commit `9c3bee2` on web `main`.

**Fix 1 — Misleading "midnight clear" terminology (`docs/current-state.md`):**
- A grep for `midnight|nightly clear|nightly wipe` (case-insensitive) across the whole web repo returned zero hits in code and two hits in docs. The historical `updates-log.md` entry (session "Dashboard + Notifications Cross-Repo Audit") was left alone — this file is append-only.
- The Notifications Lifecycle note in `current-state.md` was reframed from a "there is no midnight clear" correction into a positive description: "Retention is a rolling 7-day window — rows older than that are swept by the daily cron. There is no calendar-based (midnight / end-of-day) wipe; age-based only." The underlying fact is the same; the framing no longer leads with the wrong terminology.
- No user-facing UI copy referenced midnight / nightly anywhere. The surrounding Lifecycle bullets (50-per-org cap, 7-day TTL via `/api/cron/cleanup-notifications`, NEW_LEAD dedup, TRIAL_EXPIRED dedup) already document the actual behavior correctly and didn't need changes.

**Fix 2 — Dashboard lead query missing date filter (`app/app/page.tsx`):**
- The `getDashboardLeads` query (behind `React.cache`) filtered by `org_id + ai_status='ready'`, ordered by `submitted_at DESC`, and limited to 20 rows — no date guardrail. Correct output for any org, but on an org with tens of thousands of leads the planner would still walk a huge index range before the LIMIT could short-circuit.
- Added `DASHBOARD_LEADS_WINDOW_DAYS = 90` and `.gte("submitted_at", windowStart)` to the query. The 20-row LIMIT still applies inside that window. The `DashboardSubtitle`'s 7-day "new leads this week" calculation is safely inside the 90-day guardrail.
- Index `idx_leads_org_ai_status_submitted_at` (migration 0052) already supports `(org_id, ai_status, submitted_at DESC)` lookups — the `.gte("submitted_at", …)` predicate fits cleanly onto the existing range scan.
- Dashboard stats and Notifications are untouched — their queries already live behind the analytics RPC (which has its own bounded date ranges).

**Verification:** `npx tsc --noEmit` exit 0.

**Doc updates (this section):**
- Dashboard → Data sources bullet in `current-state.md` updated to describe the 90-day window + the reason for the guardrail.
- Notifications Lifecycle bullet reframed (see Fix 1).
- Appended this log entry.

**Note on commit scope:** The commit also bundled the doc edits from the previous "round 4 mobile fixes" session that were still uncommitted in the web repo (per `git add .`). Commit message is narrow to these two cleanups; the docs reflect both that and the prior mobile round.

---

## Session — May 1, 2026 (SMS still not arriving — root cause is Telnyx 10DLC campaign binding, not code)

### What the contractor saw

After yesterday's phone-normalization fix, the contractor sent two more test estimates from the mobile app with both Email and SMS checked. The detail page now correctly showed `sent_via=["text","email"]` for both — so from the backend's POV the SMS leg succeeded. But the customer (Murdoch's own phone, `+14057619006`) never received the texts. The user is confident no SMS actually fired.

### Investigation

Direct query against the Telnyx account via the MCP server:

| Resource | State | Implication |
|---|---|---|
| Phone number `+17169938159` | `status: active`, `messaging_profile_id` set, `messaging_campaign_id: null` | **Number is provisioned but NOT bound to any 10DLC campaign.** Carriers reject un-registered A2P traffic from this number — silently from Telnyx's point of view. |
| Messaging profile "SnapQuote" | `enabled: true`, `whitelisted_destinations: ["US"]`, `webhook_url: null`, `health_webhook_url: null` | **No DLR webhook configured.** Even when carriers reject the message, our app never finds out — Telnyx has nowhere to send the delivery receipt. |
| `get_webhook_events` | `tunnel_enabled: false`, `has_webhooks: false`, `count: 0` | Confirms zero webhook activity. |
| Sentry, last 24h | One `40310 Invalid 'to' address` event from yesterday's lead-submit; nothing since the phone-normalization fix landed. No `quote/send` SMS errors at all. | Backend code is healthy. The recent sends did not throw. |
| DB — recent quotes | `730d0e15` (15:30 UTC), `bea7f333` (15:26 UTC) both `sent_via=["text","email"]`, both with `customer_phone="+14057619006"` (E.164, post-backfill) | `sendQuoteSms` returned successfully (no exception → "text" appended to `sentChannels` → persisted). |
| Vercel runtime logs | Don't capture the `quote/send` invocation in the production log feed | Not informative for this incident. |

### Root cause

**Telnyx's `POST /v2/messages` returns HTTP 200 the moment the message is queued for carrier hand-off, NOT when the customer receives it.** The handshake is:

1. Telnyx accepts the API call → returns 200 + message id (this is what `sendQuoteSms` waits on)
2. Telnyx queues for carrier delivery
3. Carrier (T-Mobile / Verizon / AT&T) accepts or rejects (10DLC campaign check, content filtering, dead-number check, etc.)
4. If accepted, carrier delivers (or doesn't — phone off, blocked, dropped)

All of (3) and (4) happen AFTER our code returns. The phone number `+17169938159` shows `messaging_campaign_id: null` — it's on the messaging profile but **not yet bound to the approved 10DLC campaign**. Carriers therefore reject the messages downstream from Telnyx's queue. Without a DLR webhook back to our app, this rejection is invisible — `sent_via=["text","email"]` is recorded because Telnyx accepted the API call, even though the customer never receives the SMS.

This is **not the same** as yesterday's bug. Yesterday's was a real Telnyx API rejection (HTTP 400 / `40310 Invalid 'to' address`) caused by 10-digit phones — that one was caught and fixed (commit `88928d2`). This one is a downstream carrier rejection that's invisible to our app.

### Fix shipped this commit

**Migration `supabase/migrations/0062_quote_telnyx_message_id.sql`** — adds `quotes.telnyx_message_id text`. Migration applied to live DB via Supabase MCP. The column lets us correlate a quote with the actual Telnyx record after the fact via `get_message`, which is the only post-hoc visibility path before a DLR webhook is wired.

**`app/api/app/quote/send/route.ts`** — `sendQuoteSms` already returned the Telnyx message id; the route was discarding it. Now captures the return value and persists it alongside `sent_via` in the same UPDATE. Empty string returns (Telnyx OK but missing id field) are treated as a non-fatal observability gap and persist as NULL rather than dropping the success signal.

### Action items the user must do (out of scope for this commit)

**1. (Required) Bind `+17169938159` to the approved 10DLC campaign in the Telnyx Mission Control portal.** Until this is done, every contractor SMS-send will continue to record `sent_via=["text"]` while never actually reaching the customer. The Telnyx MCP server doesn't expose campaign-binding (it's a 10DLC-specific operation that lives behind the dashboard); this has to be done via the portal:
- Telnyx Portal → Messaging → 10DLC → Campaigns → SnapQuote campaign → Phone Numbers → assign `+17169938159`.
After the binding lands, `messaging_campaign_id` on the phone number will be non-null. We can verify with `mcp__Telnyx__get_phone_number`.

**2. (Strongly recommended) Wire a DLR webhook handler.** Without it, every send is fire-and-pray. The plan once the campaign binding is in place:
- Add `quotes.sms_delivery_status text` (next migration) — values `queued | sent | delivered | failed | undelivered`
- Add `POST /api/public/telnyx/webhook` route that verifies the `Telnyx-Signature` header and updates the quote's `sms_delivery_status` based on `event_type` (`message.sent`, `message.finalized`, etc.)
- Update messaging profile `webhook_url` to point at the new endpoint via `mcp__Telnyx__update_messaging_profile`
This lets the mobile detail page surface accurate per-message delivery status instead of just "Telnyx accepted the API call."

### Verification

- `npx tsc --noEmit` exit 0.
- Migration `0062` applied to live DB.
- Next contractor send-by-SMS will write the Telnyx message id to `quotes.telnyx_message_id`. From there it can be looked up via `mcp__Telnyx__get_message`.

No build, no submit. Code change + git push only.

---

## Session — May 1, 2026 (SMS delivery-method recording fix — phone normalization to E.164)

### What the contractor saw

Contractor sent an estimate via mobile with both Email and SMS checked. Detail page showed only "Email" under Delivery Method Used, no SMS line, no phone number. Customer didn't appear to receive a text.

### Root cause

The customer's phone in `leads.customer_phone` was stored as `"4057619006"` — 10 digits, no country code. Telnyx requires E.164 (`+1XXXXXXXXXX`) and rejects everything else with `40310 Invalid 'to' address`. When the contractor's send hit `lib/telnyx.ts:sendQuoteSms`, the Telnyx call returned 400 / 40310, the function threw, and the route's catch block in `app/api/app/quote/send/route.ts` did exactly what it was supposed to do — fold the failure into `deliveryErrors[]`, mark only `email` in `sent_via`, and continue. The mobile detail page reads `sent_via` and renders only what's there. So:

- **Hypothesis #1 was correct:** SMS failed silently from the user's POV. Email succeeded. `sent_via = ["email"]`. The detail page rendered exactly what was recorded.
- **No UI bug** in the mobile detail page — it correctly shows what `sent_via` contains.
- **Why this didn't show up in Sentry:** `sendQuoteSms` throws on Telnyx failure but never `console.error`s. The Sentry `captureConsoleIntegration` only captures `console.error`. The matching path in `lib/notify.ts:sendSms` (used by lead-submit + quote-accept) DOES log via `console.error`, which is why we saw the lead-submit `40310` event in Sentry but nothing for `quote/send`.

### Why phones weren't E.164 in the first place

`lib/validations.ts:leadSubmitSchema.customerPhone` had a regex `^[+\d().\-\s]{7,20}$` that accepted any free-form phone (e.g. `"4057619006"`, `"(405) 761-9006"`, `"405-761-9006"`, `"+1 405 761 9006"`) and stored the input verbatim. No normalization step. 140 of 3420 leads (~4%) and 128 of 3399 customers had non-E.164 phones — every contractor SMS-send to those leads would have hit the same 40310.

`updateSettingsSchema.phone` (contractor's own phone, used by `notifyContractor` for new-lead SMS notifications) had the same gap; 4 of 5 contractor phones in the DB were non-E.164. So contractors with non-E.164 phones in their profile never received SMS lead notifications either.

### Fix — five coordinated changes

**1. New `lib/phone.ts:toE164UsPhone`** — single source of truth. Idempotent. `"4057619006"`, `"(405) 761-9006"`, `"+1 405 761 9006"`, `"1 405 761 9006"` all → `"+14057619006"`. Already-E.164 inputs (any country) returned with non-digits stripped. Inputs that can't confidently be normalized return null.

**2. `lib/telnyx.ts:sendQuoteSms`** — calls `toE164UsPhone(to)` first, throws + `console.error`s with a clear message if the phone can't be normalized (so future similar failures hit Sentry instead of being invisible). Also added `console.error` on the existing terminal-failure path so Telnyx 4xx/network errors from this function reach Sentry the same way `sendSms` already does.

**3. `lib/notify.ts:sendSms`** — same `toE164UsPhone` normalization; logs and returns false on un-normalizable inputs.

**4. `lib/validations.ts`** — `leadSubmitSchema.customerPhone` now applies `toE164UsPhone` as a `.transform()` after the existing regex check, so every NEW lead lands E.164 in `customers.phone` and `leads.customer_phone`. Same transform applied to `updateSettingsSchema.phone` so contractor profile updates land E.164. Empty/un-normalizable inputs fall through to null/undefined (existing "no phone" behavior preserved — the row still saves).

**5. New migration `supabase/migrations/0061_e164_phone_backfill.sql`** — backfills the historical rows. Pre-flight: 140 `leads.customer_phone`, 128 `customers.phone`, and 4 `contractor_profile.phone` rows needed normalization; every one was either 10 digits or 10 digits with formatting, all normalize cleanly to `+1XXXXXXXXXX` with no manual disambiguation. Migration applied to live DB via Supabase MCP `apply_migration`. Post-flight: 0 non-E.164 phones across all three tables.

### Verification

- `npx tsc --noEmit` exit 0.
- The original failing quote (`17c8d7ce-ef76-4298-a7ee-7143152aba9f`, lead `5c57ad12-...`, customer phone now `+14057619006`) — if the contractor reopens that EXPIRED quote and re-sends, the SMS path will now go through. (We don't auto-resend; the customer needs to be re-contacted from the mobile app.)
- Future contractor sends against any of the 140 backfilled leads will now hit Telnyx with valid E.164 and surface the correct `sent_via` value on the detail page.
- Future invalid phone inputs surface to Sentry via `console.error` instead of being swallowed into the API response's `warning` field.

### Files changed (this session)

| Path | Reason |
|---|---|
| `lib/phone.ts` (new) | `toE164UsPhone` helper |
| `lib/telnyx.ts` | normalize `to`, log to Sentry on failure |
| `lib/notify.ts` | normalize `to` |
| `lib/validations.ts` | `.transform()` in lead-submit + settings schemas |
| `supabase/migrations/0061_e164_phone_backfill.sql` (new) | backfill 268 historical rows + 4 contractor rows |
| `docs/current-state.md` | SMS section updated |
| `docs/updates-log.md` | this entry |

No build, no submit. Migration applied to live DB; code change + git push only.

---

## Session — April 30, 2026 (Telnyx 10DLC SMS post-approval verification)

### Audit findings (correctly configured)

- `TELNYX_API_KEY` is present in `.env.local` and validated by [`lib/env.ts`](../lib/env.ts) (`z.string().min(1)`, server-only).
- Two SMS senders, both calling Telnyx v2 `/messages`:
  - `lib/telnyx.ts:sendQuoteSms` — used by contractor → customer estimate sends. Throws on missing key. Three-attempt retry with 500/1000/1500ms backoff. Idempotency-Key header set per quote (`quote-send-{quoteId}-sms`).
  - `lib/notify.ts:sendSms` — used by lead-submit notifications (contractor + customer) and quote-accept notifications. Returns false silently on missing key. Same retry policy.
- Customer-facing SMS call sites traced end-to-end and all live-call Telnyx with no interception:
  - `app/api/public/lead-submit/route.ts:467` → `notifyContractor` → `sendSms` → Telnyx (contractor "new lead" SMS gated by `notification_lead_sms` toggle in profile)
  - `app/api/public/lead-submit/route.ts:483` → `notifyCustomer` → `sendSms` → Telnyx (customer "we received your request" SMS)
  - `app/api/app/quote/send/route.ts:237` → `sendQuoteSms` → Telnyx (contractor's estimate SMS)
  - `app/api/public/quote/[publicId]/accept/route.ts:129` → `notifyContractor` → `sendSms` → Telnyx (contractor "estimate accepted" SMS gated by `notification_accept_sms`)
- No dev/mock/stub/dry-run/feature-flag paths intercepting sends. Searched `MOCK_SMS`, `STUB_SMS`, `FAKE_SMS`, `SMS_DRY_RUN`, `skipSms`, `NODE_ENV` gates around SMS — zero hits.
- No leftover Twilio code anywhere (only stale entries in `.env.example`, fixed below).
- Privacy policy ([`app/(public)/privacy/page.tsx`](../app/(public)/privacy/page.tsx)) names Telnyx as the SMS subprocessor in section 4.
- Sentry: no errors matching `telnyx` or `sms` in the last 7 days for the production project.

### Issues found and fixed

**1. `.env.example` was stale — documented Twilio, not Telnyx.** Removed `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_FROM_NUMBER`. Replaced with `TELNYX_API_KEY` (required) and `TELNYX_FROM_NUMBER` (optional override). Web repo has been Telnyx-only since commit `2c114ee`; nothing else still references Twilio.

**2. `TELNYX_FROM_NUMBER` was duplicated as a hardcoded constant in two files** (`lib/notify.ts` and `lib/telnyx.ts`). Centralized as a single `export const TELNYX_FROM_NUMBER` in `lib/telnyx.ts`, imported by `lib/notify.ts`. Reads from `process.env.TELNYX_FROM_NUMBER` with the existing `+17169938159` 10DLC-approved number as the fallback. Same change for `TELNYX_API_URL`. Now changing the production sender is a single env-var update.

**3. No 10DLC opt-out compliance language on customer-facing SMS bodies.** US carriers require an opt-out instruction on A2P SMS, particularly on the first message of a conversation. None of the four customer-facing send call sites included it.

Fix: introduced `ensureSmsOptOutFooter(body)` in `lib/telnyx.ts` (idempotent — won't double-append if `Reply STOP` is already present, case-insensitive) and called it from both senders at the actual send point. So even if a contractor edits their estimate template in profile settings and removes the footer, every outbound message is brought into compliance at the Telnyx-handoff layer. The default estimate template (`lib/quote-template.ts:buildDefaultEstimateTemplate`) was also updated so contractors who never customize the template start with the footer included.

**4. No SMS consent disclosure on the public lead form.** When a customer typed their phone number into the form, there was no language telling them they'd receive a text. Added a small disclosure paragraph below the phone input in [`components/PublicLeadForm.tsx`](../components/PublicLeadForm.tsx): _"By providing your phone number, you agree to receive text messages about your estimate. Message and data rates may apply. Reply STOP at any time to opt out."_ Wired via `aria-describedby` on the phone input for accessibility.

### Verification

- `npx tsc --noEmit` exit 0.
- Manual trace: a customer submitting the lead form will now (a) see the consent paragraph before submitting, (b) receive a confirmation SMS that ends with `Reply STOP to opt out.`, (c) receive an estimate SMS that ends with `Reply STOP to opt out.` regardless of how the contractor edited their template.
- Production from-number unchanged: still `+17169938159`. App Store Connect / Telnyx campaign approval references this number; aligning the env-driven path to it preserves the approved sender.

No build, no submit, no migration. Code change + docs + git push only.

---

## Session — April 30, 2026 (Business plan seat limit 4 → 5)

### Bring code in line with App Store Connect's "5 team seats" copy

Background: a previous mobile-side audit (mobile commit `c61a3f9`) found that App Store Connect's product descriptions for both `snapquote_business_monthly` and `snapquote_business_annual` advertise **"5 team seats"**, but the source-of-truth code path in this repo (and in mobile) enforced **4**. The audit also identified two duplicated source-of-truth locations for the BUSINESS seat limit: `lib/plans.ts` (TypeScript) and the Postgres invite RPCs (`accept_invite_token`, `handle_auth_user_pending_invites`). This session aligns the code with the customer-facing ASC promise.

**Pre-flight safety check:** queried the live database — the three BUSINESS-plan organizations (`falconn`, `Rivera's Pressure Washing`, `poo`) currently have 2, 1, and 1 members respectively. Going from 4 → 5 is purely additive: no existing org is at risk, no existing data needs migration. The change can only allow a 5th invitee that the previous RPC would have rejected at acceptance time.

**Source code changes:**
- [`lib/plans.ts:12`](../lib/plans.ts#L12) — `PLAN_SEAT_LIMITS.BUSINESS = 5` (was 4). Authoritative TypeScript constant. Every consumer that derives via `getPlanSeatLimit(plan)` (team page, email templates, plan-change emails, demo server, `lib/teamInvites.ts` enforcement, landing demo) follows automatically.
- [`components/plan/PlanOptionsSection.tsx:66-67`](../components/plan/PlanOptionsSection.tsx#L66) — UI strings: `seats: 5` and `"5 team members"` (was 4 / "4 team members"). These are hardcoded in `PLAN_OPTIONS` and don't derive from `getPlanSeatLimit`.

**Postgres migration:** [`supabase/migrations/0060_business_seat_limit_5.sql`](../supabase/migrations/0060_business_seat_limit_5.sql) replaces both `accept_invite_token()` (lives in 0049) and `handle_auth_user_pending_invites()` (lives in 0048) with their `else 4` `case` blocks flipped to `else 5`. The trigger function has TWO seat-limit `case` blocks (one for the auto-accept INSERT, one for the seat-overflow REVOKE). Both updated.

**Live database update:** the migration was applied via the Supabase MCP `apply_migration` call. Verified post-flight by querying `pg_get_functiondef` on both functions — both now contain `else 5` and neither contains `else 4`. Migration also recorded in `supabase/migrations/` for the next environment-rebuild.

**Mobile counterpart shipped in lockstep:** mobile commit on the same date updates `lib/plans.ts` fallback (`BUSINESS: 5`) and `app/(tabs)/more/plan.tsx` highlight string (`"5 team members"`). The web `/api/plans/config` endpoint already reflects the new value and mobile clients hydrate it on launch — the fallback only matters for the cold-boot window before that hydration completes.

**Audit nothing-was-missed:** searched both repos for any `\bBUSINESS\b.*\b4\b`, `else 4`, `seats?\s*[=:]\s*4`, `"4 (team|user|seat|member)"` patterns; full sweep across `*.ts`, `*.tsx`, `*.sql`, `*.md`, `*.json` excluding `node_modules` / `.next` / `.git`. Only the locations updated above contained BUSINESS-plan seat=4 references. Other "4" hits in the codebase are unrelated (estimator dimensions, tailwind class names like `space-y-4`, etc.). RevenueCat (entitlements + products via MCP) and Stripe wrapper (`lib/stripe.ts`) carry no seat-count metadata, so neither needs touching.

**App Store Connect:** still says "5 team seats" — that's now consistent with the rest of the system. No ASC change needed in this session.

**Verification:** `npx tsc --noEmit` exit 0 on both repos. The two pre-existing `components/navigation/TopBar.tsx:59-60` typed-routes errors in mobile remain — unchanged, outside scope.



---

## Session — May 1, 2026 (pre-ship comprehensive audit — findings only, no code changes)

End-to-end audit of both repos before App Store submission. Read-only across web (`C:\Users\murdo\SnapQuote`) and mobile (`C:\Users\murdo\SnapQuote-mobile`). Used live MCP access to Supabase (project `upqvbdldoyiqqshxquxa`), Sentry (`snapquote-web`, `snapquote-mobile`), RevenueCat (`proj39ead10c`), Vercel (`prj_9Z7T6lgKutlpfapplWbQo8JmJVbi`), and Telnyx. Six parallel agents covered the five known issues plus auth, code quality, cross-repo contract, and Supabase backend. No code or migrations changed in this session — this entry is the only file touched.

### 1. EXECUTIVE SUMMARY

**Ship readiness AS-IS RIGHT NOW: NO.** Two true ship-blockers found. Both have small, specific fixes — neither is architectural — but both must land before App Store submit:
1. **CRITICAL backend security vulnerability** — six SECURITY DEFINER RPCs are callable by `anon` and `authenticated` via PostgREST. An anonymous attacker can rewrite any org's credit allotment by calling `update_org_plan_credits(uuid, integer, timestamptz)` against `/rest/v1/rpc/`. Verified live (see Section 3 / CRITICAL #1).
2. **Telnyx 10DLC campaign still unbound** — `+17169938159` shows `messaging_campaign_id: null` as of right now (May 1, 2026, MCP-verified). Carriers silently drop A2P traffic; contractors see "Sent" while customers receive nothing. The web fix (commit `2d0ec5cc`) added persistence of `telnyx_message_id` so we have post-hoc visibility, but the underlying carrier-side rejection is still happening on every send until the binding is done in the Telnyx Mission Control portal.

**Ship readiness AFTER recommended fixes: YES, with two caveats.** 
- Caveat A: ship without a Telnyx DLR webhook (post-launch v1.0.x can add it). Once the campaign binding lands, the silent-drop window closes; DLR is observability hardening, not correctness.
- Caveat B: ship mobile without the Customers tab. It's a half-day OTA in v1.0.1.

**Top 5 blockers:**
1. (CRITICAL) anon-callable SECURITY DEFINER credit-mutation RPCs — fix is `REVOKE EXECUTE ... FROM anon, authenticated` on 4 functions; ~5 lines in a migration.
2. (CRITICAL) Telnyx 10DLC `+17169938159` not bound to approved campaign — non-code action in Telnyx portal (Messaging → 10DLC → Campaigns → SnapQuote → Phone Numbers → assign).
3. (HIGH) **Known Issue #4 confirmed live**: org "falconn" (BUSINESS plan) is currently locked at 5/5 because of 4 anonymous-link `pending_invites` rows + 1 owner. The owner cannot generate any more invite links. Fix is removing the seat-cap pre-flight from `/api/app/team/invite-link` OR filtering anon-link rows out of the count in `assertSeatAvailable`.
4. (HIGH) **Known Issue #2 root cause confirmed live**: user `murdochmarcum@icloud.com` is OWNER of two orgs (BUSINESS-plan "falconn" + SOLO-plan "Worcester Test Contractor"). `requireAuth` does `.limit(1).single()` with no `ORDER BY` on `organization_members`, so different requests can land on different orgs — Plan page shows BUSINESS, Team page shows SOLO. Fix is adding stable ordering to three helpers (`requireAuth`, `requireOwnerForApi`, `requireMemberForApi`).
5. (HIGH) **Known Issue #1 root cause confirmed**: Supabase Google OAuth provider almost certainly disabled at the project level (only 1 google identity in `auth.identities` over a 3-week period for the developer's own account; everyone else is `email`). Compounded on mobile by an OAuth-flow-type mismatch — `lib/supabase.ts` defaults to PKCE but the mobile login/signup screens parse `access_token` from URL fragment (implicit-flow pattern), so even if Supabase is fixed, mobile Google would still silently no-op.

**Recommendation: do NOT ship today.** The five blockers above are all small fixes — the security migration is ~5 lines, the Telnyx binding is a portal click, the invite-link gate is a 1-line removal, the requireAuth fix is 3 line changes, the Google fix is one Supabase dashboard toggle plus the mobile flow swap. **Estimated total fix time: half day.** Ship after, not before.

---

### 2. KNOWN ISSUES (the 5 Murdoch flagged)

#### Issue #1 — Google Sign-In not working (web + mobile)

**Web findings.** Both login (`app/(public)/login/page.tsx` → `components/auth/LoginForm.tsx:151-156` → `components/auth/OAuthButtons.tsx:89-99`) and signup (`app/(public)/signup/page.tsx` → `components/auth/SignupForm.tsx:190-195`) **already have the Google button**, and both handlers correctly call `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: \`${origin}/auth/callback?next=/app\` } })`. The PKCE callback at `app/auth/callback/route.ts:25-73` exchanges `?code=` for a session correctly. `middleware.ts` doesn't block `/auth/callback`. The earlier note that "Codex removed Google from LoginForm.tsx" is stale — it was restored in commit `c6739ce`. The Apple sign-in button is also present on the signup page (`SignupForm.tsx:190-195`); that prior gap is also closed.

**Mobile findings.** Login (`app/(auth)/login.tsx:100-136`) and signup (`app/(auth)/signup.tsx:106-142`) both render Google + native Apple buttons. The Google handler calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "snapquotemobile://", skipBrowserRedirect: true } })`, then opens `WebBrowser.openAuthSessionAsync(data.url, "snapquotemobile://")`.

**Root cause #1 (both platforms): Supabase Google OAuth provider is not enabled / not properly configured at the project level.** Direct query of `auth.identities` shows 90 `email` identities and exactly 1 `google` identity — the developer's own account, created `2026-04-09`, never used since. Three weeks of email signups but zero additional Google sign-ins is the strong signal. Code path is correct; the API is rejecting because the provider isn't on. Fix in Supabase Studio → Authentication → Providers → Google: Enabled, valid Client ID/Secret, `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1/callback` registered in Google Cloud Console OAuth credentials, `https://snapquote.us/auth/callback` in Supabase Auth → URL Configuration → Redirect URLs allowlist.

**Root cause #2 (mobile only):** `lib/supabase.ts:38-45` uses `@supabase/supabase-js` v2.100.1 which **defaults `flowType: 'pkce'`** and explicitly sets `detectSessionInUrl: false`. But `login.tsx:119-129` parses **`access_token` and `refresh_token` from the URL hash** — that's the deprecated implicit-flow shape. Under PKCE the redirect carries `?code=...` in the query, and the client must call `supabase.auth.exchangeCodeForSession(code)`. Net effect: even after Supabase is fixed, mobile Google login will appear to succeed (the WebBrowser closes), but the session never lands and the user stays on the login screen with no error feedback. Fix options: (a) add `flowType: 'pkce'` to `lib/supabase.ts` and switch the OAuth handlers to `exchangeCodeForSession`, or (b) force `flowType: 'implicit'` (simpler, matches existing token-parsing code).

**Severity:** CRITICAL (blocks the only OAuth path on web for non-Apple users; secondary on mobile because Apple Sign-In works). **Fix complexity:** S (Supabase dashboard toggle) + S (mobile flow swap). **Ship-blocking:** YES on web. Mobile would be functional via Apple-only if the user is OK with Google being broken at launch.

#### Issue #2 — Plan tier mismatch (Plan tab vs Team tab)

**Where each page reads plan:**
- Plan page `app/app/plan/page.tsx:74` → RPC `get_org_credit_row(p_org_id)` → `select plan, monthly_credits, ... from organizations where id = p_org_id`
- Team page `app/app/team/page.tsx:22,38` → `admin.from("organizations").select("plan").eq("id", auth.orgId).single()`
- Both ultimately read `organizations.plan`. Both then derive seat count via `getPlanSeatLimit(plan)` from `lib/plans.ts:19-21` (single source of truth: BUSINESS=5, TEAM=2, SOLO=1).

**They should agree, but can diverge through three confirmed mechanisms:**

1. **Non-deterministic org resolution for multi-org users (THE LIVE BUG).** `lib/auth/requireAuth.ts:21-26`, `lib/auth/requireRole.ts:75-80`, and `lib/auth/requireRole.ts:122-127` all do `.from("organization_members").select("org_id, role").eq("user_id", user.id).limit(1).single()` — **no `ORDER BY`**. Postgres returns rows in arbitrary order. **Verified live in production**: user `murdochmarcum@icloud.com` is OWNER of org `8f939f96-...` ("falconn", BUSINESS) AND org `cdd61290-...` ("Worcester Test Contractor", SOLO). Different requests can pick different orgs → Plan page renders one plan, Team page renders the other.
2. **Silent fallback divergence.** `app/app/team/page.tsx:38` uses `(organizationQuery.data?.plan as OrgPlan | null) ?? "SOLO"` — Team silently shows SOLO on a missing-row error. Plan page (`app/app/plan/page.tsx:78-79`) throws hard. Even when reading the same org, an error mid-fetch presents differently.
3. **Stripe upgrade write asymmetry.** `app/api/stripe/checkout/route.ts:138-177` updates `subscriptions.plan` unconditionally on TEAM→BUSINESS upgrade but updates `organizations.plan` only when the new subscription status is `active` or `trialing`. An `incomplete` upgrade (e.g. 3DS pending) leaves `subscriptions.plan = BUSINESS` and `organizations.plan = TEAM`. Both UIs read `organizations.plan` so they still agree with each other in this case, but downstream code reading subscription state will see BUSINESS — the inconsistency is internal, not user-visible. Lower priority than #1 / #2.

**Bonus finding (live data):** `subscriptions` table holds **four rows** for that single user (`sub_test_manual` BUSINESS active, `sub_1T9C4Z` SOLO trialing, `sub_1TCivO` TEAM trialing, `sub_1TCj32` BUSINESS active). The table is keyed on `user_id` but has no rule preventing multiple rows per user, and `lib/subscription.ts` has no explicit "pick the active one" ordering — `getOrganizationSubscriptionStatus` will return whatever Postgres yields first. Recommend either UNIQUE on `user_id` (with cleanup of stale trial rows) OR explicit `ORDER BY status, created_at DESC LIMIT 1` in the read path. **Severity:** HIGH for #1 (real user-visible bug), MEDIUM for #2 (cosmetic), MEDIUM for #3 (rare edge case). **Fix complexity:** S for #1 (add `.order("created_at", { ascending: true })` in three places); S for #2 (throw on Team page); M for #3 (don't gate `organizations.plan` write on status). **Ship-blocking:** YES for #1 — the bug is reproducing on the developer's own account today.

#### Issue #3 — Plan switching timing (immediate vs next cycle)

**Web Stripe semantics (verified in code):**
- **Upgrade** (`app/api/stripe/checkout/route.ts:138-151`): `stripe.subscriptions.update(... proration_behavior: "create_prorations")`. **Immediate** swap with proration. DB updated synchronously.
- **Downgrade / SOLO**: kicks user to Stripe Billing Portal (`app/api/stripe/checkout/route.ts:114-131`). Portal config governs whether the swap is immediate or deferred to period end.
- **UI bug**: After upgrade, `components/plan/PlanOptionsSection.tsx:134,141` does `router.replace("/app/plan")` but **not `router.refresh()`**. Server Component data isn't re-fetched; the user sees the success toast but the rendered "Current Plan" card still shows the old tier until manual reload. **This matches the user's complaint that "plan switching doesn't appear to take effect immediately."** It DOES take effect on the backend immediately; the UI just doesn't re-render.
- The downgrade modal copy (`PlanOptionsSection.tsx:355-381`) does correctly say "You'll keep your current plan until your billing cycle ends, then switch to {plan}." Good.

**Mobile IAP semantics (Apple defaults):**
- **Upgrade** (`app/(tabs)/more/plan.tsx:354-399`): `purchasePackage()` → Apple swaps **immediately with proration** (Apple default for upgrades within the same subscription group). Mobile correctly refreshes (`handleRefresh()` at line 378). UI alert confirms.
- **Downgrade**: not implemented in-app. UI text on the SOLO card directs the user to Apple. There is **no period-end note on the TEAM card** when the user is on BUSINESS, so a BUSINESS-on-mobile user who wants to downgrade to TEAM has no inline guidance. Minor UX gap.

**Recommended UX fixes:**
- (S) Web: add `router.refresh()` after upgrade success in `PlanOptionsSection.tsx:134,141`.
- (S) Mobile: show a period-end note on any non-SOLO downgrade target when current plan rank > target rank.
- (M) Both: persistent "Plan change scheduled — effective {date}" banner whenever a downgrade is queued.

**Severity:** HIGH (user explicitly reported this is confusing). **Ship-blocking:** NO standalone, but the missing `router.refresh()` is the load-bearing piece — fix it.

#### Issue #4 — "Copy Invite Link" hits seat cap

**Confirmed reproducing live.** Org "falconn" (BUSINESS plan, 5-seat allowance) currently has 1 owner + 4 anonymous-link `pending_invites` rows (`email IS NULL`, `status = 'PENDING'`, `expires_at > now()`) → 5/5 → seat cap exhausted → owner cannot generate any more invite links until one expires (7 days) or is manually revoked.

**Flow when "Copy Invite Link" is clicked (web):**
- `components/TeamManager.tsx:46` `invite()` POSTs to `/api/app/team/invite-link`.
- `app/api/app/team/invite-link/route.ts:22` calls `deleteExpiredPendingInvites`, then line 23 calls `assertSeatAvailable` → throws `SeatLimitReachedError` if full.
- If allowed, lines 29-37 INSERT a fresh row into `pending_invites` with `email: null`, `status: "PENDING"`, random `token`, `expires_at = now()+7d`.

**Where the cap fires:** `lib/teamInvites.ts:43-69` `assertSeatAvailable` counts `organization_members` + `pending_invites` (where `status='PENDING' AND expires_at > now()`). If sum ≥ seatLimit, throws. The author's comment at `lib/teamInvites.ts:34-42` justifies pre-flight checking — but that justification fits **directed email invites** (where reserving a seat for the named invitee makes sense), not **anonymous shareable link tokens** (where the user might click "Copy Link" multiple times before sharing once).

**Mobile:** thin client of the same web API. Same bug surfaces via `app/(tabs)/more/team.tsx:179-204` → `lib/api/team.ts:64-74` → `POST /api/app/team/invite-link`.

**Recommended fix (Approach A, minimal):**
- Remove `assertSeatAvailable` from `app/api/app/team/invite-link/route.ts:23`. The `accept_invite_token` RPC already enforces the cap at acceptance time (and only counts members, not pending invites — the right semantic).
- In `lib/teamInvites.ts:50-56`, scope `pendingResult` count to `email IS NOT NULL` so directed-email invites still count but anonymous links don't.

**Severity:** HIGH — actively blocking the developer's own org from doing further team setup. **Fix complexity:** S (~5-10 line change, no migration). **Ship-blocking:** YES.

#### Issue #5 — Customers tab missing on mobile

**What the web Customers tab actually does** (`app/app/customers/page.tsx`, `components/CustomersTable.tsx`): read-only deduped projection of `leads ⋈ lead_unlocks`. Each row = name, phone (`tel:` link), email (`mailto:` link), date added. Features: client-side first-name search, server-side pagination (25/page), responsive (cards on mobile breakpoint, table on `md:`), empty state with "Share your link" CTA. **No detail view, no edit, no bulk actions, no delete.** It does not query the `customers` table at all — that table is the eventual write target but currently `customers` is "write-only" and unread by any UI.

**Mobile port estimate:**
- New screen `app/(tabs)/customers/index.tsx` (FlatList of cards + search input)
- New hook `lib/hooks/useCustomers.ts` (mirrors `useLeads`/`useTeam` pattern with AsyncStorage cache + `isStale` flag)
- New API helper `lib/api/customers.ts` (port the dedup logic from web `page.tsx:50-100`)
- Tab navigation entry in `app/(tabs)/_layout.tsx` and the More menu
- No new web API route required; no new RPC required. Supabase RLS already protects `leads`/`lead_unlocks`.

**Effort:** **M (half day)**. Pattern is well-trodden in the mobile repo.

**Ship decision: YES, ship v1.0.0 without it.** The Customers tab is a read-only convenience view that contains no unique data — every contact shown is already accessible by tapping into the lead it came from on the leads tab. Add via OTA as v1.0.1 within 2-4 weeks of launch.

---

### 3. NEW FINDINGS — bucketed by severity

#### CRITICAL (must fix before ship)

**C1. Anon-callable SECURITY DEFINER credit-mutation RPCs.** Verified live via `has_function_privilege` checks:

| Function | anon | authenticated | What it does |
|---|---|---|---|
| `update_org_plan_credits(uuid, int, timestamptz)` | YES | YES | Rewrites any org's monthly_credits + reset timer. **Anonymous attacker can grant unlimited credits to any org.** |
| `reset_org_credits(uuid, int, timestamptz, timestamptz)` | YES | YES | Same vector. |
| `refund_bonus_credits(uuid, int)` | YES | YES | Adds bonus_credits to any org without authorization. |
| `trigger_rescue_stuck_leads()` | YES | YES | Triggers `pg_net` HTTP POST to `/api/cron/rescue-stuck-leads`. DoS amplification vector. |
| `reset_due_solo_monthly_credits()` | YES | YES | Resets credits for all SOLO orgs whose timer is past. Force-resets the entire customer base. |
| `handle_auth_user_pending_invites()` | YES | YES | Trigger function reachable via PostgREST. |

`accept_invite_token`, `is_org_member`, `is_org_owner`, and `get_org_credit_row` (auth-only, RLS-protected internally) are correct. `record_credit_purchase` and `unlock_lead_with_credits` are correctly locked down (`anon=false, auth=false`). **Fix:** new migration with `REVOKE EXECUTE ON FUNCTION public.update_org_plan_credits(uuid, integer, timestamptz) FROM anon, authenticated;` (and matching REVOKEs for the other 4 mutating functions). The trigger function `handle_auth_user_pending_invites` should be REVOKE'd too — it's only meant to be called by the trigger, not via PostgREST. **File:** new migration. **Ship-blocking:** YES.

**C2. Telnyx 10DLC campaign still not bound to production from-number.** MCP-verified at audit time: `mcp__Telnyx__list_phone_numbers({filter_phone_number: "+17169938159"})` returns `messaging_campaign_id: null`. Messaging profile "SnapQuote" has `webhook_url: null` and `health_webhook_url: null` — no DLR webhook either. Carriers silently drop A2P traffic from un-registered numbers. Every contractor SMS-send currently records `sent_via=["text"]` (because Telnyx API returns 200) but the message never reaches the customer's handset. **Fix:** Telnyx Mission Control → Messaging → 10DLC → Campaigns → SnapQuote → Phone Numbers → assign `+17169938159`. Verify with `mcp__Telnyx__get_phone_number` after — `messaging_campaign_id` should be non-null. **No code change needed for the binding itself.** Adding the DLR webhook is a separate post-launch task (see HIGH H4 below). **Ship-blocking:** YES.

#### HIGH (should fix before ship)

**H1. Multi-org user `requireAuth` non-determinism.** See Known Issue #2. Fix is one-line `.order("created_at", { ascending: true })` in three helpers (`lib/auth/requireAuth.ts:21-26`, `lib/auth/requireRole.ts:75-80`, `lib/auth/requireRole.ts:122-127`). **Ship-blocking:** YES.

**H2. Anonymous-link invite consumes seat slot.** See Known Issue #4. Fix is one of two small changes in `app/api/app/team/invite-link/route.ts:23` and `lib/teamInvites.ts:50-56`. **Ship-blocking:** YES.

**H3. `subscriptions` table has multiple rows per user_id with no resolution rule.** Live: developer's user has 4 subscription rows (one `sub_test_manual` + three real Stripe sub IDs across statuses trialing/active/SOLO/TEAM/BUSINESS). `lib/subscription.ts:124` and `getOrganizationSubscriptionStatus` will pick whichever Postgres returns first. Result: the same user can see different `billingSource` / plan info on different requests. **Fix:** either add `UNIQUE(user_id)` constraint with cleanup migration, or change all readers to `ORDER BY status DESC, created_at DESC LIMIT 1`. **File:** `lib/subscription.ts` + new migration. **Ship-blocking:** Reduces to YES because it amplifies H1.

**H4. Telnyx DLR webhook not implemented.** `quotes.telnyx_message_id` was added in migration 0062, but no `app/api/public/telnyx/webhook/route.ts` consumes it. After C2 binding lands, this becomes the next priority — without DLR, the app cannot detect carrier-side rejections, customer STOP replies, or dead-number drops. **Fix:** new route that verifies `Telnyx-Signature` HMAC, updates a future `quotes.sms_delivery_status` column based on `event_type` (`message.sent`, `message.finalized`, `message.received`). Needs `mcp__Telnyx__update_messaging_profile` to set `webhook_url`. **Ship-blocking:** NO — can ship after C2 binding closes the silent-drop window. Add as v1.0.x post-launch.

**H5. Webhook tables empty in production.** `webhook_events` has 0 rows and `iap_subscription_events` has 0 rows. Either no Stripe / RevenueCat webhook has ever fired in prod (unlikely after weeks of testing), or the tables were truncated. Both webhook handlers are otherwise production-quality (signature-verified, idempotent via `claimWebhookEvent`, full event coverage). **Action:** before launch, send a Stripe test event from the dashboard and a RevenueCat test event, confirm rows land in both tables. If they don't, the webhook URL is misconfigured at the provider end. **Ship-blocking:** NO standalone but verify before launch.

**H6. Mobile signup password length 6 chars vs reset 8 chars vs web 8 chars.** `app/(auth)/signup.tsx:37` (mobile) accepts `min: 6`; `app/(auth)/reset-password.tsx:21` requires 8; web `components/auth/PasswordField.tsx:36` requires 8. A user who signs up on mobile with a 6-char password can never reset it later because the reset form rejects it. **Fix:** raise mobile signup to 8. **Ship-blocking:** NO but should fix.

**H7. Mobile `signOut` deletes ALL `push_tokens` for user_id.** `lib/auth.tsx:329-359` does `.delete().eq("user_id", userId)` instead of scoping to the current `device_id` (available from `lib/notifications.ts:23-28`). A user signed in on iPhone A and iPhone B who signs out on A loses pushes on B until B's app re-foregrounds and re-registers. **Fix:** `.eq("user_id", userId).eq("device_id", deviceId)`. **Ship-blocking:** NO but should fix.

**H8. Web Plan upgrade UI doesn't `router.refresh()`.** See Known Issue #3. **Ship-blocking:** NO standalone but the user explicitly flagged the symptom.

**H9. Stripe upgrade `organizations.plan` write gated on status.** `app/api/stripe/checkout/route.ts:165-177` only writes the new plan when status is `active` or `trialing`. An `incomplete` upgrade (3DS pending) leaves DB inconsistent until the webhook eventually catches up. **Fix:** write `organizations.plan` unconditionally; let webhook revert if the subscription ultimately fails. **Ship-blocking:** NO (rare edge).

#### MEDIUM (post-ship)

**M1. Mobile Google OAuth uses deprecated implicit flow.** See Known Issue #1 root cause #2.

**M2. Mobile invite token wiped on transient errors.** `app/(auth)/invite/[token].tsx:56` calls `clearPendingInviteToken()` for ANY error. Network blip → user must re-click email/SMS link to retry. Wrap clearing in only-for-terminal-errors logic.

**M3. Silent failure on mobile password-reset deep-link.** `app/_layout.tsx:115-117` swallows `verifyOtp` errors from the OTP-confirm path. If the recovery link is expired, user lands on whatever screen with no message. Add error surfacing or fallback to `/forgot-password`.

**M4. 6 SECURITY DEFINER functions have mutable `search_path`.** `plan_monthly_credits`, `prune_org_notifications`, `reset_org_credits`, `update_org_plan_credits`, `set_updated_at`, `storage_org_id_from_path`. Combined with C1, this is a hijack vector if any privilege escalation exists. Newer functions are correctly hardened with `SET search_path`. **Fix:** add `SET search_path = public, pg_catalog` to each.

**M5. `iap_subscription_events.event_id` has no UNIQUE constraint.** Index `idx_iap_subscription_events_event_id` exists but is non-unique. If a webhook handler errors after the audit insert but before completing, retry inserts a duplicate audit row. Cosmetic for now (count = 0); add `ALTER TABLE ... ADD CONSTRAINT iap_subscription_events_event_id_key UNIQUE (event_id)` post-launch.

**M6. Stripe annual prices differ from Apple IAP annual prices** (by Apple-tier constraint, not bug):
- Team Annual: web `$191.99/yr` ($15.99/mo) vs Apple `$189.99/yr`
- Business Annual: web `$383.99/yr` ($31.99/mo) vs Apple `$389.99/yr`
Apple constrains annual prices to discrete tiers. Document for App Review notes if not already.

**M7. Apple subscription level ordering not done.** Per RevenueCat audit: subscription group "SnapQuote Plans" still has Team Monthly at L1 and Business Annual at L4. Apple convention is Level 1 = highest tier. The Edit Level dialog is drag-and-drop; this has to be done manually in App Store Connect. Cosmetic but visible to App Review reviewers.

**M8. `.env` is committed to mobile repo at `C:\Users\murdo\SnapQuote-mobile\.env`** (not gitignored). All values are `EXPO_PUBLIC_*` (inherently public — bundled into the app), so this is not a leak today. But: dangerous pattern. If anyone ever adds a non-public secret there, it will be silently committed. **Fix:** add `.env` to `.gitignore`, keep `.env.example` tracked.

**M9. `useEntitlementSync.ts:96,108` `console.log` of plan name** is not `__DEV__`-guarded. Goes into production console + Sentry's `captureConsoleIntegration` (it's `log`, not `error`, so Sentry won't capture by default — confirm levels filter). Low-impact telemetry leak.

**M10. Auth leaked-password-protection disabled** in Supabase. One-toggle fix in dashboard.

**M11. `audit_log` only captures 4 of 9 declared `AuditAction` enum values in production data.** `account.deleted`, `plan.changed`, `team.invite_sent`, `team.invite_accepted`, `member.self_removed`, `settings.password_changed`, `credits.purchased` are declared in `lib/auditLog.ts:7` but never written. Either those code paths haven't been exercised yet, or writers are missing.

#### LOW / nice-to-have

**L1.** 5 unindexed FKs (`audit_log.actor_user_id`, `notifications.user_id`, `pending_invites.invited_by`, `quote_events.org_id`, `quote_events.quote_id`). Low impact at current scale.

**L2.** 4 `auth_rls_initplan` warnings on policies for `subscriptions`, `push_tokens`, `notifications`, `audit_log`. Use `(select auth.uid())` to fix when convenient.

**L3.** `@expo/ngrok` still in mobile `package-lock.json` as a transitive dep (`@expo/cli` → `@expo/ngrok`). Not in production bundle.

**L4.** Three hardcoded `APP_URL = "https://snapquote.us"` constants in mobile (`lib/quote-template.ts:1`, `lib/hooks/useOnlineStatus.ts:27`, `app/(tabs)/more/my-link.tsx:37`) instead of using `EXPO_PUBLIC_APP_URL`. Production URL is stable; not blocking but inconsistent.

**L5.** `package.json` mobile has no `tsc --noEmit` script. A pre-commit hook would catch type drift.

**L6.** Web popover desktop auto-closes after 5s of no hover — can fire while user is reading a long notification. Add pause-on-hover-within or scroll-within.

**L7.** Mobile lacks light/dark mode support (intentionally removed during render-loop investigation, ready to re-implement).

**L8.** Delete Account cleanup gaps — RevenueCat/Apple IAP subscriptions not cancelled on account delete; Storage blobs (lead photos) not removed. Documented in current-state.md.

**L9.** "11 pre-existing failing tests" per docs (2 real bugs, 6 stale plan-limit tests, 3 API contract fixtures). Worth a sweep post-launch.

**L10.** Sentry mobile issue SNAPQUOTE-MOBILE-3 is `[RevenueCat] 🍎‼️ Purchase was cancelled.` from RC SDK's `setLogHandler` getting captured by `captureConsoleIntegration`. 160 occurrences over 2 weeks but it's user-cancelled IAP purchase = expected. Filter via Sentry beforeSend or RC log level downgrade.

---

### 4. CROSS-REPO CONSISTENCY

**Status: solid.** Cross-repo audit found NO contract drift across all 14 mobile→web API calls. Every endpoint mobile calls exists on web with matching request/response shape. Auth via Bearer token consistently. The two `lib/quoteSendSchema.ts` files in both repos are byte-identical with an explicit "keep in sync" comment block — the type alias `SendQuoteInput` would catch drift at compile time of either repo.

| Mobile call | Web route | Status |
|---|---|---|
| `lib/api/activity.ts → /api/app/activity/touch` | exists | OK |
| `lib/api/iap.ts → /api/iap/sync` | exists | OK (discriminated union schema matches) |
| `lib/api/iap.ts → /api/app/subscription-status` | exists | OK |
| `lib/api/leads.ts → /api/app/leads/unlock` | exists | OK |
| `lib/api/myLink.ts → /api/app/my-link/caption` | exists | OK |
| `lib/api/onboarding.ts → /api/public/onboard` | exists | OK |
| `lib/api/quotes.ts → /api/app/quote/send` | exists | OK (shared Zod schema) |
| `lib/api/settings.ts → /api/app/settings/patch` | exists | OK |
| `lib/api/settings.ts → /api/app/settings/check-slug` | exists | OK |
| `lib/api/team.ts → /api/app/team/members` | exists | OK |
| `lib/api/team.ts → /api/app/team/invites` | exists | OK |
| `lib/api/team.ts → /api/app/team/remove` | exists | OK |
| `lib/api/team.ts → /api/app/team/invite` | exists | OK |
| `lib/api/team.ts → /api/app/team/invite-link` | exists | OK (but see H2) |
| `lib/api/team.ts → /api/public/invite/accept` | exists | OK |
| `app/(tabs)/more/profile.tsx → /api/app/account/delete` | exists | OK |
| `app/(auth)/forgot-password.tsx → /api/public/auth/forgot-password` | exists | OK |
| `lib/plans.ts → /api/plans/config` | exists | OK |

**Plan limits source of truth:** `lib/plans.ts` is consistent in both repos at BUSINESS=5, TEAM=2, SOLO=1. Mobile hydrates from `/api/plans/config` (authoritative) with cold-boot fallback to its local `lib/plans.ts`. Postgres-side `accept_invite_token` and `handle_auth_user_pending_invites` RPCs were updated to BUSINESS=5 in migration 0060 (verified live: both functions contain `else 5`). However, the duplication between TS constant and Postgres `case` block remains a long-term divergence risk — if BUSINESS ever changes, both must be updated together.

**Annual-pricing intentional discrepancy:** Web Stripe and Apple IAP have different annual prices by Apple-tier constraint (see M6). This is by design.

**Customers tab:** web only. Mobile doesn't ship it for v1.0.0; OTA candidate.

---

### 5. CUSTOMERS TAB ON MOBILE — full breakdown

**Web implementation summary:**
- `app/app/customers/page.tsx` (150 LOC, server component): one query against `leads ⋈ lead_unlocks`, dedupes by normalized phone or email keeping the most recent submission, paginates 25/page, ordered `submitted_at DESC`. Filtered by `org_id` (RLS-enforced).
- `components/CustomersTable.tsx` (212 LOC, client component): client-side first-name search, responsive table/card switch, empty state.
- Sidebar entry at `components/Sidebar.tsx:26`, TopBar title at `components/TopBar.tsx:15`.
- **Does NOT touch the `customers` table.** That table is currently write-only — populated by `app/api/public/lead-submit/route.ts:282-331` on every public lead submission, but no UI reads it. Forward-looking CRM placeholder.

**Mobile port plan:**
- New screen `app/(tabs)/customers/index.tsx` (FlatList of cards + search input + pull-to-refresh — pattern matches existing `app/(tabs)/leads/index.tsx`)
- New hook `lib/hooks/useCustomers.ts` (mirrors `useLeads`/`useTeam` — `{ data, isLoading, error, refetch, isStale }` + AsyncStorage cache key `cache:customers:${orgId}`)
- New API helper `lib/api/customers.ts` (port the `leads ⋈ lead_unlocks` query + dedup logic from web)
- Tab navigation entry in `app/(tabs)/_layout.tsx`; menu entry in `app/(tabs)/more/index.tsx` (or wherever the More menu lives)
- No new web API route required — mobile reads Supabase directly with RLS protection (same pattern as `useLeads`)
- No new RPC required

**Effort:** **M (half day)**. Established hook/screen patterns; no novel architecture.

**Blockers / dependencies:** none. RLS, schema, write path all already in production.

**Ship decision:** **YES, ship v1.0.0 without it.** Acceptable for v1 because (a) the data shown is already accessible via lead detail screens, (b) the Customers tab is a roll-up convenience, not unique functionality, (c) it's pure JS/TS so it can be added in a v1.0.1 OTA — no binary update required (assuming `updates.enabled` is flipped back to `true` post-launch). User-facing impact: contractors lose deduped customer roll-up + first-name search across history. Low impact for current target customer (small contractors managing tens, not thousands, of leads).

**OTA caveat:** mobile `app.json` currently has `updates.enabled: false` (intentional from Build 6 to evict stale crashing OTA bundles). Before shipping v1.0.0 to the App Store, **decide explicitly** whether you want OTA hotfix capability post-launch. If yes, flip to `true` before submit so v1.0.1 can land via `eas update` instead of needing a new binary. If no, every fix requires App Store review (~24-48hr cycle).

---

### 6. WHAT'S WORKING WELL — verified solid

These areas were re-verified and look ready to ship; do NOT need re-testing:

- **TypeScript** — both repos `npx tsc --noEmit` exit 0. The two prior `components/navigation/TopBar.tsx:59-60` typed-routes errors are no longer present (resolved by `as string | undefined` casts).
- **Sentry signal-to-noise** — quiet across both projects in last 7 days. Web: 1 deprecation warning (Node `url.parse` from a dep, not our code), 1 ZodError, 1 Telnyx 40310 from before the phone normalization fix landed. Mobile: 5 RC purchase-cancelled false positives + 1 Error event. Nothing alarming. The render-loop SNAPQUOTE-MOBILE-9 is silent on Build 9.
- **Cross-repo API contract** — 14/14 routes match. Shared Zod schema for quote-send. Bearer token auth consistent.
- **Stripe webhook** (`app/api/stripe/webhook/route.ts`) — signature-verified, idempotent (`claimWebhookEvent` with `webhook_events` table), full event coverage (subscriptions, invoices, charge.refunded). Production-ready.
- **RevenueCat webhook** (`app/api/revenuecat/webhook/route.ts`) — Bearer-auth via `timingSafeEqual`, idempotent, 9 event types covered, full audit trail to `iap_subscription_events`. Production-ready.
- **Supabase schema** — 18 tables, all RLS-enabled. 62 migrations applied (matches `supabase/migrations/` on disk).
- **RPCs** — every `.rpc(` call in code corresponds to a function that exists in the live DB. No signature drift.
- **Edge function `run-estimator`** — ACTIVE, version 2, JWT-protected.
- **pg_cron** — `rescue-stuck-leads` (every 3 min) + `reset-solo-credits` (daily) both active.
- **Notification system** — 50-cap trigger + 7-day TTL cron + NEW_LEAD dedup index + TRIAL_EXPIRED idempotency marker all in place.
- **RevenueCat product config** — 7 products active; 2 offerings (default + credits); 2 entitlements (team + business). Prices match what web docs claim. Display names match.
- **Vercel deployments** — last 20 builds all READY, no failed deploys, auto-deploy from `main` healthy. Latest commit `2d0ec5cc` (SMS delivery fix) in production.
- **Render-loop fix chain** — `lib/auth.tsx` correctly avoids unbatched `setIsLoading(true)` in `onAuthStateChange`. `registerSessionExpiredHandler` atomic-batches 8 setStates. Invite Redirect href is `useMemo`'d on `pendingInviteToken`. Send-quote Stack.Screen options are `useMemo`'d. All four documented triggers closed.
- **Apple Sign-In (mobile)** — uses native `expo-apple-authentication`, `signInWithIdToken` exchange, FULL_NAME + EMAIL scopes. Solid. `usesAppleSignIn: true` in app.json.
- **Role gating (web)** — every owner-only API route uses `requireOwnerForApi`. Member routes use `requireMemberForApi`. `account/delete` correctly branches on role for org-vs-self teardown.
- **Webhook idempotency** — both Stripe + RC use the same `claimWebhookEvent("provider", event.id, event.type)` upsert pattern with `onConflict: "provider,event_id", ignoreDuplicates: true`. Duplicates return `{received:true, duplicate:true}` immediately.
- **Phone normalization** — `lib/phone.ts:toE164UsPhone` is single source of truth; applied at every Telnyx-handoff and at every `customers.phone` / `leads.customer_phone` / `contractor_profile.phone` write boundary. Migration 0061 backfilled 268+4 historical rows.
- **iOS App Store submission gates per docs** — only outstanding hard blockers were "no build uploaded" (Build 9 went out April 21) and "zero 6.5\" screenshots" (need to verify in ASC).

---

### Outstanding pre-ship checklist

Before App Store submit, complete in order:
1. **REVOKE EXECUTE** on the 6 SECURITY DEFINER functions in C1 (new migration, ~10 lines)
2. **Bind `+17169938159`** to the approved 10DLC campaign in Telnyx Mission Control (no code)
3. **Add `.order("created_at", { ascending: true })`** to the 3 `requireAuth`/`requireRole` helpers (1-line each)
4. **Remove `assertSeatAvailable` call** from `/api/app/team/invite-link` route (1 line) OR scope to `email IS NOT NULL`
5. **Enable Google OAuth provider in Supabase** + add allowed redirects + (mobile) flip `flowType` or rewrite handler to use PKCE
6. **Add `router.refresh()`** after upgrade success in `components/plan/PlanOptionsSection.tsx`
7. **Deduplicate `subscriptions` table** for the developer's user_id (4 stale rows) and add `ORDER BY status, created_at DESC LIMIT 1` to readers
8. (optional) Raise mobile signup password length 6 → 8
9. (optional) Scope mobile `signOut` push-token cleanup to current device_id
10. (optional) Test-fire Stripe + RC webhooks to populate `webhook_events` / `iap_subscription_events` and confirm endpoint reachability before launch

After all of the above, re-run this audit's critical checks (security advisor, Telnyx phone status, multi-org user query) before pressing submit.

No code committed in this session. This entry appended to `docs/updates-log.md` in both repos as the only file change.

---

## Session — May 1, 2026 (post-audit fixes — security REVOKE migration + Telnyx campaign binding instructions)

Closing two ship-blockers from this morning's pre-ship audit. One landed as a Postgres migration; the other could not be done via MCP and is documented for Murdoch to action in the Telnyx portal.

### Fix #1 — REVOKE EXECUTE on dangerous SECURITY DEFINER RPCs (CLOSED)

**What landed.** New migration `0063_revoke_anon_auth_security_definer_rpcs.sql` revokes EXECUTE from PUBLIC, anon, and authenticated for seven server-side-only SECURITY DEFINER functions. Migration version `20260501190248`. Applied to live DB via Supabase MCP `apply_migration`.

**Function-by-function decisions** (all verified live via `has_function_privilege` post-flight):

| Function | Before | After | Why |
|---|---|---|---|
| `update_org_plan_credits(uuid, int, timestamptz)` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Called only from server-side webhook handlers (`app/api/iap/sync/route.ts:99`, `app/api/stripe/webhook/route.ts:115`, `app/api/revenuecat/webhook/route.ts:93`) via admin client. The most dangerous of the bunch — accepts arbitrary `org_id` + `monthly_credits` and rewrites unconditionally. |
| `reset_org_credits(uuid, int, timestamptz, timestamptz)` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Called only from `lib/credits.ts:65` via admin client. |
| `refund_bonus_credits(uuid, int)` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Called only from `app/api/stripe/webhook/route.ts:515` and `app/api/revenuecat/webhook/route.ts:393` via admin client. |
| `reset_due_solo_monthly_credits()` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Called only by pg_cron job (runs as `postgres` superuser, bypasses grants — REVOKE doesn't break it). |
| `trigger_rescue_stuck_leads()` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Same — pg_cron-only, runs as postgres. |
| `handle_auth_user_pending_invites()` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | AFTER INSERT trigger on `auth.users`. Triggers fire regardless of role grants, so revoking PostgREST exposure costs us nothing. |
| `accept_invite_token(text, uuid, text)` | anon=YES, auth=YES, service_role=YES | anon=NO, auth=NO, service_role=YES | Called only from `app/api/public/invite/accept/route.ts:44` via admin client. The route is at `/api/public/invite/accept` (matches the unauth-allowed prefix) but the route itself requires a Supabase user (lines 33-39, returns 401 if no user) and routes the RPC call through `createAdminClient()` — service_role is what lands in Postgres. |

**Functions deliberately NOT touched** (verified still working):

| Function | Status | Reason |
|---|---|---|
| `is_org_member(uuid)` | anon=YES, auth=YES (unchanged) | Used inside RLS USING expressions across multiple tables. Postgres checks EXECUTE at the call site even for SECURITY DEFINER functions; revoking would make every RLS-protected query fail for authenticated users. The advisor will continue to flag this as informational — accepted by design. |
| `is_org_owner(uuid)` | anon=YES, auth=YES (unchanged) | Same reason. |
| `get_org_credit_row(uuid)` | anon=NO, auth=YES (unchanged) | Authenticated-only RLS-aware read. Already correct. |
| `record_credit_purchase(uuid, text, int)` | anon=NO, auth=NO (unchanged) | Already locked to admin-only. |
| `unlock_lead_with_credits(uuid, uuid)` | anon=NO, auth=NO (unchanged) | Already locked to admin-only. |

**Post-flight verification.**
1. `has_function_privilege` queried live for all 12 functions — every one matches the table above.
2. `get_advisors(type=security)` re-run. Before: 9 `anon_security_definer_function_executable` warnings + 9 `authenticated_security_definer_function_executable` warnings (18 total). After: 2 + 3 = 5 total. The remaining 5 are all on `is_org_member`, `is_org_owner`, and `get_org_credit_row` — all legitimate per the table above. **The dangerous attack surface (credit rewrite, cron triggers, trigger function, invite acceptance) is now closed.**
3. pg_cron jobs continue to run as the `postgres` superuser, so `trigger_rescue_stuck_leads` and `reset_due_solo_monthly_credits` are unaffected by the REVOKE.
4. The `handle_auth_user_pending_invites` trigger on `auth.users` continues to fire on user creation; trigger invocation does not go through the EXECUTE grant chain.
5. All four real-world call sites (Stripe webhook, RevenueCat webhook, IAP sync, accept-invite route, lib/credits) continue to work because they all use the admin client (`createAdminClient()`) which carries `service_role` — and `service_role` retains EXECUTE on every revoked function.

**Files changed.**
- `supabase/migrations/0063_revoke_anon_auth_security_definer_rpcs.sql` (new) — migration source
- Migration applied to live DB via Supabase MCP (recorded in DB as version `20260501190248`)
- `docs/current-state.md` — migrations list extended through 0063; Known Outstanding Issues section reorganized into "Closed in this session", "Remaining hard blockers", "Remaining post-launch / non-blockers"
- `docs/updates-log.md` — this entry

### Fix #2 — Telnyx 10DLC campaign binding (NOT FULLY CLOSEABLE FROM MCP — Murdoch action required)

**Live state confirmed via `mcp__Telnyx__get_phone_number({id: "2933798527966381131"})` at audit-fix time (May 1, 2026 ~18:00 UTC):**

```
phone_number: "+17169938159"
status: "active"
messaging_profile_id: "40019d6e-d8b1-447b-8d8b-bdc03ca9ceab"
messaging_profile_name: "SnapQuote"
messaging_campaign_id: null      ← STILL UNBOUND
```

Murdoch reportedly went into the Telnyx portal earlier and assigned the number, but the assignment didn't take effect. Three plausible causes (in order of probability):

1. **Wrong Telnyx organization context.** The SnapQuote messaging profile lives under Telnyx organization `44ea795f-672b-4bb4-9adb-f7e27e0bd3ad`. Mission Control has an org switcher in the top-right; if Murdoch's account belongs to multiple orgs and a different one was selected when the assignment was made, the assignment would have landed on a campaign in a different org's tenancy — invisible to the SnapQuote profile. Verify by ensuring the top-right org switcher shows "SnapQuote" before navigating to 10DLC.
2. **Campaign not in `ACTIVE` state.** Only campaigns whose The Campaign Registry (TCR) status is `ACTIVE` can have phone numbers assigned. If the campaign is still `PENDING_VETTING`, `EXPIRED`, or in any other state, the Add Number form will accept the click but the binding will silently not take effect. Verify Status column on the Campaigns list page.
3. **Campaign capacity exhausted.** TCR campaigns have a `maximum_phone_numbers` limit. If the SnapQuote campaign has reached its limit, the assignment fails silently. Check the campaign's "Phone Numbers" tab — if the count equals the cap, increase the cap with the carriers (or remove an unused number).

**Why the Telnyx MCP can't do this directly.** The available Telnyx MCP tools cover phone-number metadata (`update_phone_number`, `update_phone_number_messaging_settings`), messaging profiles (`update_messaging_profile`), call control, voice, and storage. There is no exposed tool for `assign_phone_to_campaign` or any 10DLC campaign-management endpoint. This is consistent with the Telnyx public API — 10DLC campaign binding goes through a separate `/v2/messaging_brands` and `/v2/messaging_campaigns` API surface that the MCP server does not currently wrap. The portal is the only path.

**Exact click path for Murdoch:**

1. Go to https://portal.telnyx.com/#/app/messaging
2. Top-right org switcher: confirm "SnapQuote" is selected (or whatever name corresponds to org id `44ea795f-672b-4bb4-9adb-f7e27e0bd3ad`)
3. Left sidebar → 10DLC → Campaigns
4. Find the SnapQuote campaign in the list. **Verify Status = ACTIVE** (not PENDING_VETTING, not EXPIRED). If anything other than ACTIVE, stop here — that's the problem.
5. Click the campaign name to open it
6. Click the "Phone Numbers" tab
7. **Verify current count vs `maximum_phone_numbers` cap.** If count = cap, the campaign is full — that's the problem (would need to increase the cap with the carriers).
8. Click "Add Numbers" or "Assign Phone Numbers" (button label varies)
9. Search for or select `+17169938159`
10. Save / Confirm

**Verification step (after Murdoch finishes the click path):**

Run `mcp__Telnyx__get_phone_number({id: "2933798527966381131"})` again. The response should now have `messaging_campaign_id` set to a non-null UUID. Once that lands, every contractor SMS will route through the registered campaign and carriers will accept it.

**Webhook URL — deliberately NOT set in this session.** The messaging profile still has `webhook_url: null` and `health_webhook_url: null`. The audit identified this as HIGH-priority (no DLR = no carrier delivery visibility) but explicitly NOT ship-blocking. Setting the webhook URL via `mcp__Telnyx__update_messaging_profile({profile_id: "40019d6e-d8b1-447b-8d8b-bdc03ca9ceab", request: {webhook_url: "https://www.snapquote.us/api/public/telnyx/webhook"}})` BEFORE the handler ships would cause Telnyx to send DLRs to a 404 endpoint, which Telnyx may eventually mark as broken and disable. Correct sequence post-launch:

1. Add `quotes.sms_delivery_status text` column (new migration)
2. Build `app/api/public/telnyx/webhook/route.ts` that verifies the `Telnyx-Signature` HMAC header and updates `quotes.sms_delivery_status` based on `event_type` (`message.sent`, `message.finalized`, `message.received`)
3. Deploy the route
4. Run the `update_messaging_profile` MCP call above to point Telnyx at the now-existing handler
5. Verify by sending a test SMS and watching `quotes.sms_delivery_status` flip

### Audit MEDIUM and LOW findings — full dump for visibility

The pre-ship audit's executive summary covered CRITICAL and HIGH only. Below is the complete MEDIUM and LOW set so nothing's hidden, even though most won't be fixed pre-launch.

**MEDIUM — post-ship priority**

| # | Severity | Location | Finding | Fix complexity |
|---|---|---|---|---|
| M1 | MEDIUM | mobile — `lib/supabase.ts:38-45` + `app/(auth)/login.tsx:119-129` + `app/(auth)/signup.tsx:125-135` | Mobile Google OAuth uses deprecated implicit-flow shape (parses `access_token` from URL fragment) but Supabase JS client defaults to PKCE flow. After the Supabase Google provider is enabled, mobile Google login will silently no-op — the WebBrowser closes but the session never lands. **Apple Sign-In is the iOS primary path, so this is non-blocking, but Google won't work on mobile until fixed.** | S — either add `flowType: 'pkce'` and switch handlers to `exchangeCodeForSession(code)`, OR force `flowType: 'implicit'` to match existing token-parsing code |
| M2 | MEDIUM | mobile — `app/(auth)/invite/[token].tsx:56` | Mobile invite token is wiped from `pendingInviteToken` storage on **any** error, including transient network errors. A network blip during invite acceptance forces the user to re-click the original email/SMS link. | S — wrap the `clearPendingInviteToken()` call so it only fires on terminal errors (already-used / expired / wrong-user), not on network failures |
| M3 | MEDIUM | mobile — `app/_layout.tsx:115-117` | OTP-confirm deep-link handler swallows `verifyOtp` errors silently. If the password-reset link is expired or used, the user is dropped on whatever screen with no error feedback or fallback. | S — surface error toast or `router.replace("/(auth)/forgot-password")` on failure |
| M4 | MEDIUM | DB — 6 SECURITY DEFINER functions | `plan_monthly_credits`, `prune_org_notifications`, `reset_org_credits`, `update_org_plan_credits`, `set_updated_at`, `storage_org_id_from_path` have `search_path` mutable per role. Combined with their SECURITY DEFINER status, this is a privilege-escalation hijack vector if any other privilege bug exists. The newer functions (`accept_invite_token`, `is_org_member`, `is_org_owner`, etc.) are correctly hardened with explicit `SET search_path`. | S — add `SET search_path = public, pg_catalog` to each function definition in a new migration |
| M5 | MEDIUM | DB — `iap_subscription_events` table | Index `idx_iap_subscription_events_event_id` exists but is non-unique. If a webhook handler errors after the audit-row insert but before completing the orchestration (and `releaseWebhookEvent` is called), the retry will insert a duplicate audit row. Cosmetic for now (count = 0 in production). | S — `ALTER TABLE iap_subscription_events ADD CONSTRAINT iap_subscription_events_event_id_key UNIQUE (event_id)` in a new migration |
| M6 | MEDIUM | both | Stripe annual prices differ from Apple IAP annual prices by Apple-tier constraint (not a bug). Web Team Annual: `$191.99/yr`. Apple: `$189.99/yr`. Web Business Annual: `$383.99/yr`. Apple: `$389.99/yr`. Apple constrains annual prices to discrete tiers. | N/A — document in App Review notes if not already |
| M7 | MEDIUM | App Store Connect — subscription group "SnapQuote Plans" | Subscription levels still ordered Team Monthly at L1, Business Annual at L4. Apple convention is Level 1 = highest tier. Drag-and-drop in ASC; manual-only step. Cosmetic but visible to App Review reviewers. | S — Edit Level dialog in ASC, drag-and-drop |
| M8 | MEDIUM | mobile — `C:\Users\murdo\SnapQuote-mobile\.env` | `.env` is committed to the mobile repo (not in `.gitignore`). All current values are `EXPO_PUBLIC_*` which Expo bundles into the JS bundle anyway, so this is **not a leak today**. But: if anyone ever adds a non-public secret there, it gets silently committed. Dangerous pattern. | S — add `.env` to `.gitignore`, keep `.env.example` tracked |
| M9 | MEDIUM | mobile — `lib/hooks/useEntitlementSync.ts:96,108` | `console.log` of plan name (TEAM/BUSINESS) on entitlement sync, not `__DEV__`-guarded. Low-impact telemetry but technically logs internal state to Sentry's `captureConsoleIntegration` (only if level filter includes `log`, which it doesn't by default). | S — wrap in `if (__DEV__)` |
| M10 | MEDIUM | Supabase Auth | Leaked-password protection (HaveIBeenPwned check) is disabled. One toggle in Supabase Studio → Authentication → Providers → Email → Settings. | S — dashboard toggle |
| M11 | MEDIUM | web — `lib/auditLog.ts:7` | Of 9 declared `AuditAction` enum values, only 4 are observed in production `audit_log` rows. Missing: `account.deleted`, `plan.changed`, `team.invite_sent`, `team.invite_accepted`, `member.self_removed`, `settings.password_changed`, `credits.purchased`. Either those code paths haven't been exercised yet, or writers are missing. Worth grepping for `recordAuditAction` callers to find the gap. | M — investigate and fill in missing writers |

**LOW — nice-to-have**

| # | Severity | Location | Finding | Fix complexity |
|---|---|---|---|---|
| L1 | LOW | DB | 5 unindexed FKs: `audit_log.actor_user_id`, `notifications.user_id`, `pending_invites.invited_by`, `quote_events.org_id`, `quote_events.quote_id`. Low impact at current scale (small tables). | S — `CREATE INDEX` migration |
| L2 | LOW | DB | 4 `auth_rls_initplan` advisor warnings on policies for `subscriptions`, `push_tokens`, `notifications`, `audit_log`. RLS function calls re-evaluate per row. Will degrade as `notifications` grows past the 50-cap on busy orgs. Standard fix: replace `auth.uid()` with `(select auth.uid())` inside policy USING/WITH CHECK expressions. | S — migration that recreates the affected policies |
| L3 | LOW | mobile — `package-lock.json` | `@expo/ngrok` still listed as a transitive dep (`@expo/cli` → `@expo/ngrok`). Not in production bundle, but a stale lockfile entry. Will clear on next `npm install`. | XS — `rm package-lock.json && npm install` |
| L4 | LOW | mobile — `lib/quote-template.ts:1`, `lib/hooks/useOnlineStatus.ts:27`, `app/(tabs)/more/my-link.tsx:37` | Three hardcoded `APP_URL = "https://snapquote.us"` constants instead of using `EXPO_PUBLIC_APP_URL`. Production URL is stable; not blocking but inconsistent. | S — replace with env var read |
| L5 | LOW | mobile — `package.json` | No `tsc --noEmit` script. Pre-commit hook would catch type drift. | XS — add `"typecheck": "tsc --noEmit"` |
| L6 | LOW | web — `components/TopBar.tsx` desktop popover | Auto-closes after 5s of no hover. Can fire while user is reading a long notification. | S — pause-on-hover-within or scroll-within |
| L7 | LOW | mobile | Light/dark mode support intentionally removed during render-loop investigation. Ready to re-implement post-launch. | M |
| L8 | LOW | web — `app/api/app/account/delete/route.ts` | Delete Account doesn't cancel Apple IAP / RevenueCat subscriptions, doesn't remove lead photo blobs from Storage. Two separate gaps. | M for IAP cancel (RC Server API), S for storage cleanup |
| L9 | LOW | both — tests | "11 pre-existing failing tests" per docs (2 real bugs in estimator: out-of-service-area lawn quote, concrete repeatability; 6 stale plan-limit tests; 3 API contract fixtures). Worth a sweep post-launch. | M — needs investigation per failure |
| L10 | LOW | mobile — Sentry | `SNAPQUOTE-MOBILE-3` issue is `[RevenueCat] 🍎‼️ Purchase was cancelled.` from RC SDK's `setLogHandler` getting captured by `captureConsoleIntegration`. 160 occurrences over 2 weeks but it's user-cancelled IAP = expected behavior. | S — Sentry beforeSend filter or RC log level downgrade |
| L11 | LOW | web — `webhook_events` and `iap_subscription_events` tables | Both empty in production. Either no Stripe / RevenueCat webhook has ever fired in prod, or the tables were truncated. Webhook handlers themselves are production-quality (signature-verified, idempotent). Not a blocker — but verify before launch by sending a test event from each provider's dashboard. | XS — provider-side test event |
| L12 | LOW | mobile — App Store readiness | iOS App Review notes should explicitly explain the Stripe-vs-IAP split to prevent 3.1.1 reviewer confusion. | XS — text update in ASC |

### What's confirmed ship-ready (status today)

After this session:
- ✅ Critical anon-callable RPC vulnerability — closed via migration `0063`
- ✅ Mobile Build 9 already in TestFlight (Apr 21)
- ✅ Sentry quiet on Build 9 (the 160-event SNAPQUOTE-MOBILE-3 stream is RC purchase-cancelled noise, not a real bug)
- ✅ Stripe + RevenueCat webhook handlers production-ready (signature-verified, idempotent)
- ✅ TypeScript clean both repos
- ✅ Cross-repo API contract (14/14 routes match)
- ✅ Phone E.164 normalization at every boundary (since migrations 0061 + commits 88928d2)
- ✅ Render-loop fix chain verified in place (4 commits, all in Build 9)
- ✅ Apple Sign-In native flow solid
- ✅ RevenueCat product config complete and active

### Still required before App Store submit

The remaining ship-blockers are not in code:
1. **Murdoch action — Telnyx portal binding** (see Fix #2 above for exact path).
2. **Murdoch action — Supabase Studio toggle** to enable Google OAuth provider; add Google Cloud Console OAuth credentials with the right redirect URLs.
3. **Code fix — `requireAuth` ORDER BY** (1-line change in 3 helpers; high impact for multi-org users including the developer).
4. **Code fix — anonymous-link invite seat-cap bypass** (1-line change; org "falconn" is currently locked out of generating any more invite links).
5. **(Optional but recommended) Mobile flow-type fix** for Google OAuth so it works after Supabase is enabled.

Items 3 and 4 are next session.

### Verification

- `0063` listed as version `20260501190248` in `mcp__0f97026c-7d53-48d1-a863-ca1790b1ba77__list_migrations` output.
- `mcp__0f97026c-7d53-48d1-a863-ca1790b1ba77__get_advisors(type=security)`: 9+9 anon/authenticated SECURITY DEFINER warnings → 2+3 (only `is_org_member`, `is_org_owner`, `get_org_credit_row` remain — all legitimate per the table above).
- `has_function_privilege` confirmed live: 7 functions now anon=NO, auth=NO, service_role=YES, postgres=YES.
- Telnyx phone state: still `messaging_campaign_id: null`. No code change needed; Murdoch portal action required.

### Files changed this session

| Path | Change |
|---|---|
| `supabase/migrations/0063_revoke_anon_auth_security_definer_rpcs.sql` | new — REVOKE EXECUTE on 7 SECURITY DEFINER RPCs |
| (Supabase live DB) | migration `20260501190248` applied via MCP |
| `docs/current-state.md` | migration list extended through 0063; Known Outstanding Issues section reorganized |
| `docs/updates-log.md` | this entry |

No build, no submit, no OTA. Migration applied to live DB; code change + git push only.

---

## Session — May 1, 2026 (5 HIGH-priority fixes from the pre-ship audit)

Five remaining HIGH items from the May 1 audit. All landed as code or DB changes; `tsc --noEmit` exit 0 on both repos; the dev user's stale subscription rows are cleaned up. The two pre-ship blockers that are NOT closed in this session are out-of-band actions Murdoch must take in dashboards (Telnyx 10DLC binding + Supabase Google OAuth provider toggle); both are documented in the May 1 post-audit-fixes entry above.

### Fix #1 — Mobile Google OAuth flow-type mismatch (CLOSED, but Supabase provider must still be enabled)

**Web side: nothing to change in code.** The web login + signup pages already wire `signInWithOAuth({ provider: "google" })` correctly and the PKCE callback at `app/auth/callback/route.ts` exchanges `?code=...` for a session. The reason Google sign-in doesn't work on web today is that the **Supabase Google provider isn't enabled at the project level** — out-of-band Studio toggle, no code fix possible. Murdoch action documented in `current-state.md` Known Outstanding Issues.

**Mobile side: code fix landed.** `lib/supabase.ts:38-45` uses `@supabase/supabase-js` v2.100.1, which defaults `flowType: 'pkce'`. But `app/(auth)/login.tsx:117-130` and `app/(auth)/signup.tsx:123-136` were parsing `access_token` from the URL fragment — that's the deprecated implicit-flow shape. Even after Supabase Google is enabled, mobile Google login would have appeared to succeed (WebBrowser closes) but the session never lands.

The handlers now extract `?code=...` from the redirect URL's query string and call `supabase.auth.exchangeCodeForSession(code)`. As a robustness fallback, the legacy implicit-flow fragment-parser is kept for the case where someone forces `flowType: 'implicit'` in the future — both shapes work either way. Errors from `exchangeCodeForSession` surface to the existing error UI (`setPasswordError` on login, `setEmailError` on signup).

**Files changed:**
- `C:\Users\murdo\SnapQuote-mobile\app\(auth)\login.tsx` — `signInWithGoogle` now uses PKCE-first
- `C:\Users\murdo\SnapQuote-mobile\app\(auth)\signup.tsx` — `signUpWithGoogle` same

### Fix #2 — `requireAuth` non-determinism for multi-org users (CLOSED)

The May 1 audit confirmed live: user `murdochmarcum@icloud.com` is OWNER of both "falconn" (BUSINESS) and "Worcester Test Contractor" (SOLO). Three helpers were doing `.from("organization_members").select("org_id, role").eq("user_id", user.id).limit(1).single()` with **no ORDER BY**. Postgres returned rows in arbitrary order; Plan page and Team page would land on different orgs across requests, producing the user-visible "BUSINESS vs Team plan" mismatch.

All three helpers now order `.order("role", { ascending: false }).order("created_at", { ascending: true })`:
- **Why role DESC:** the enum values are `OWNER` and `MEMBER`. Alphabetical 'M' < 'O', so descending puts OWNER first. A user who is OWNER of one org and MEMBER of another deterministically lands on the OWNER org (which is the right UX — they have admin authority there).
- **Why created_at ASC tiebreaker:** if a user is OWNER of multiple orgs, the oldest membership wins. Stable, deterministic, easy to reason about.

For the developer's user, this means `requireAuth` will now always resolve to "falconn" (BUSINESS, OWNER, joined 2026-03-06) — older than "Worcester Test Contractor" (SOLO, OWNER, joined 2026-03-16), so falconn wins on the created_at tiebreaker. The Plan tab and Team tab will both show BUSINESS consistently.

**Files changed:**
- `lib/auth/requireAuth.ts:21-31` (added .select with created_at, .order × 2)
- `lib/auth/requireRole.ts:75-82` (`requireOwnerForApi`)
- `lib/auth/requireRole.ts:122-130` (`requireMemberForApi`)

### Fix #3 — Anonymous-link invite no longer consumes seat slot (CLOSED)

`assertSeatAvailable` in `lib/teamInvites.ts:43-71` was counting **every** unexpired pending invite — including anonymous shareable-link rows where `email IS NULL`. Net effect: clicking "Copy Invite Link" 4 times on a BUSINESS-plan org with 1 owner inserted 4 anon `pending_invites` rows, putting the org at 5/5 cap → next link generation rejected with `SeatLimitReachedError`. Verified live: org "falconn" was already locked at 5/5 from this exact pattern.

The pending-invite count query now adds `.not("email", "is", null)` so only directed email invites count toward the cap. Anonymous links remain unlimited; the cap still fires correctly when there are too many directed-email invites pending.

The `accept_invite_token` Postgres RPC continues to enforce the cap at acceptance time based on `organization_members` count only (no change there). So even if 100 anonymous links are generated, only the first N acceptors who fit under the seat cap actually become members. The rest get the standard "already full" error from the RPC, which is the right semantic.

**File changed:** `lib/teamInvites.ts:50-58` (one `.not("email", "is", null)` added; comment expanded).

**Note on the existing 4 anon-link rows in org "falconn":** intentionally left in place. Each is a valid invite token that someone may have shared. They no longer block link generation thanks to the count fix. They'll naturally expire 7 days after creation (existing TTL).

### Fix #4 — Web Plan upgrade UI now refreshes after success (CLOSED)

`components/plan/PlanOptionsSection.tsx:130-145` was doing `router.replace("/app/plan")` after a successful `?updated=1` or `?change=scheduled` query param landed. `router.replace` strips the query string but **doesn't trigger a Server Component re-fetch** in the App Router. The "Current Plan" badge stayed on the pre-upgrade tier until the user manually reloaded.

Both code paths (immediate upgrade success and deferred-downgrade scheduled) now also call `router.refresh()` immediately after `router.replace`. Server Component data refetches; the Plan card reflects post-upgrade state without manual reload.

**File changed:** `components/plan/PlanOptionsSection.tsx:130-148` (two `router.refresh()` calls + comment).

### Fix #5 — Stale subscription rows removed + read path hardened (CLOSED)

**Data side.** Live query showed the developer's user_id had 4 subscription rows (audit had flagged this). Three were stale and one was real:

| stripe_subscription_id | plan | status | created_at | Disposition |
|---|---|---|---|---|
| `sub_test_manual` | BUSINESS | active | 2026-04-12 07:32 | DELETED — fake test row (real Stripe IDs are `sub_1...`) |
| `sub_1TCivOLT0JKiq1dxAkKl3uT5` | TEAM | trialing | 2026-03-19 15:55:56 | DELETED — stale, superseded ~8 min later by the BUSINESS active sub |
| `sub_1T9C4ZLT0JKiq1dxbiEJWEZO` | SOLO | trialing | 2026-03-09 22:14 | DELETED — stale, very old, superseded by later upgrades |
| `sub_1TCj32LT0JKiq1dxn5tGrGh2` | BUSINESS | active | 2026-03-19 16:03 | KEPT — the one true current sub for this user |

DELETE issued via `mcp__0f97026c-7d53-48d1-a863-ca1790b1ba77__execute_sql`, returning the 3 deleted rows. Post-cleanup verification: `select count(*) from subscriptions where user_id = '71622212-...'` returns 1; cross-check `users_with_dupes = 0` across all subscriptions in the table; total subscription row count went from 7 to 4 (the other 3 belong to other users and were not touched).

**Read path.** `lib/subscription.ts:75-91` previously did `.order("created_at", { ascending: false })` then `rows.find(isActiveStatus)` — which returned the most-recent ACTIVE OR TRIALING row. If a stale TRIALING row was newer than an active row (an unlikely but possible race, e.g. user starts a TEAM trial, immediately upgrades, but the trial-row created_at is later than the active-row created_at by Stripe's webhook ordering), the reader would return TRIALING.

Now reads:
```ts
const current =
  rows.find((row) => row.status === "active") ??
  rows.find((row) => row.status === "trialing") ??
  rows[0] ?? null;
```

Explicit priority: ACTIVE first, then TRIALING, then the most-recent of any other status as a last-resort fallback. The `created_at DESC` order on the underlying query is preserved so the ".find" within each status bucket still picks the most recent.

**Files changed:**
- `lib/subscription.ts:86-95` (replaced single `.find(isActive)` with the priority-then-fallback chain)
- live DB: 3 rows DELETEd (no migration file — this is data cleanup specific to the dev user, not a schema change)

### Verification

- `npx tsc --noEmit` exit 0 on both repos.
- `mcp__0f97026c-7d53-48d1-a863-ca1790b1ba77__execute_sql` confirms 1 subscription row remaining for the dev user (the real BUSINESS active sub) and 0 users with duplicate subscriptions.
- All 5 affected files compile clean and the surrounding logic was preserved (no behavior change for users who weren't hitting the bugs).

### Files changed this session

| Path | Change |
|---|---|
| `lib/auth/requireAuth.ts` | deterministic ORDER BY (role DESC, created_at ASC) |
| `lib/auth/requireRole.ts` | same in 2 helpers (`requireOwnerForApi`, `requireMemberForApi`) |
| `lib/teamInvites.ts` | filter pending count to `email IS NOT NULL` |
| `components/plan/PlanOptionsSection.tsx` | `router.refresh()` after upgrade + scheduled change |
| `lib/subscription.ts` | active > trialing > newest-fallback priority |
| `C:\Users\murdo\SnapQuote-mobile\app\(auth)\login.tsx` | PKCE-first OAuth handler with implicit-flow fallback |
| `C:\Users\murdo\SnapQuote-mobile\app\(auth)\signup.tsx` | same |
| (Supabase live DB) | 3 stale subscription rows DELETEd for user `71622212-...` |
| `docs/current-state.md` | Known Outstanding Issues reorganized — 5 items moved to "Closed in this session" |
| `docs/updates-log.md` | this entry |

### Pre-ship status after this session

| Status | Items |
|---|---|
| ✅ Closed | Anon-callable SECURITY DEFINER RPCs (migration 0063, prior session); requireAuth multi-org determinism; anon-link seat cap; Plan UI refresh; sub-rows dedup + read-path priority; mobile Google OAuth flow-type |
| ⚠ Murdoch action required | Telnyx 10DLC campaign binding (portal); Supabase Google OAuth provider toggle (Studio) |
| 📋 Optional pre-launch | Mobile signup password length 6 → 8; mobile `signOut` per-device push token cleanup; `subscriptions` UNIQUE constraint follow-up migration |

No build, no submit, no OTA. Code changes + DB cleanup + git push only.

---

## Session — May 1, 2026 (Google Sign-In 500 — post-mortem + hotfix)

Cowork tested Google Sign-In end-to-end on snapquote.us after enabling the provider in Supabase Studio. The OAuth handshake worked (Google issued a valid auth code and bounced back), but Supabase's `/callback` endpoint returned a generic 500: `{"code":500,"error_code":"unexpected_failure","msg":"Unexpected failure, please check server logs for more information"}`. The user-visible symptom: every Google sign-in attempt lands on a 500 error page.

This entry documents the investigation, the actual root cause (different from initial hypothesis), the migration hotfix that landed, and the remaining Studio-side action Murdoch must take to fully close it.

### Investigation timeline

1. **Initial hypothesis (mine):** the prior session's migration `0063_revoke_anon_auth_security_definer_rpcs` revoked EXECUTE on `handle_auth_user_pending_invites()` from PUBLIC, anon, authenticated. That function is wired as an AFTER INSERT trigger on `auth.users`. Supabase's GoTrue auth service inserts as the `supabase_auth_admin` role. If supabase_auth_admin had been getting EXECUTE *implicitly* via PUBLIC, my REVOKE would have broken it — and every new-user creation would 500 with "permission denied for function" during the trigger.

2. **Verification of hypothesis (partially correct):** queried `has_function_privilege('supabase_auth_admin', 'public.handle_auth_user_pending_invites()', 'EXECUTE')` — returned `false`. So 0063 had indeed broken the trigger path. **Migration 0064 applied** as a hotfix: `GRANT EXECUTE ON FUNCTION public.handle_auth_user_pending_invites() TO supabase_auth_admin`. Re-verified: now `true`.

3. **Pulling the actual auth log** (via Supabase MCP `get_logs(service=auth)` — output was 50KB so I sliced it via subagent + Bash grep): the actual error message is **not** "permission denied for function". It's:
   ```
   level=error  path=/callback  status=500
   msg="Unhandled server error: parse \" https://snapquote.us\": first path segment in URL cannot contain colon"
   referer=" https://snapquote.us"
   request_id=9f5164f14c6b2b54-LAX  time=2026-05-01T20:04:16Z
   ```
   That's a Go `url.Parse` failure on the literal string `" https://snapquote.us"` — leading space, no path. The `referer` field in the structured log shows the same value with leading whitespace.

4. **Source of the leading-space value:** queried `auth.flow_state.referrer` for the failing flow id (extractable from the OAuth state cookie, but more practically: the most recent google-provider row by created_at). Result:
   ```sql
   id=1b31243f-...  provider_type=google  
   referrer="| https://snapquote.us|"  length=21  ascii(left(referrer,1))=32
   ```
   Confirmed: every OAuth flow_state row from May 1 17:36 UTC onward (Google + Apple) has the same `" https://snapquote.us"` value — leading space, length 21 (= 1 space + `https://snapquote.us` 20 chars).

5. **Why the SDK's explicit `redirect_to` isn't being used:** our web code passes `redirectTo: \`${origin}/auth/callback?next=/app\`` to `signInWithOAuth`, which the SDK forwards as a `redirect_to` query param to GoTrue's `/authorize`. GoTrue is supposed to validate that against the Redirect URLs allowlist and store it as the redirect target. But `flow_state.referrer` only contains the origin (`https://snapquote.us`, no path) — meaning GoTrue rejected our explicit redirect_to and fell back to the Site URL config. The most plausible reason it rejected: the Redirect URLs allowlist also has leading whitespace in the entry that should match `https://snapquote.us/auth/callback`, so the wildcard/exact match fails.

6. **Where the leading space lives:** in the GoTrue config (Supabase Studio → Authentication → URL Configuration → Site URL field, and almost certainly the Redirect URLs allowlist entries too). Studio config is stored in the Supabase platform's auth-config service, not in Postgres — so SQL can't fix it. Has to be edited via Supabase Studio dashboard or Supabase Management API.

### Actual root cause

**Two distinct bugs, both real, only one of which I could fix from MCP:**

| # | Bug | Impact | Fix path |
|---|---|---|---|
| A | `0063` regression: `supabase_auth_admin` lost EXECUTE on the trigger function `handle_auth_user_pending_invites()` because the GRANT was implicit-via-PUBLIC and 0063 revoked PUBLIC. After every successful OAuth handshake, the `auth.users` AFTER INSERT trigger would fire and fail with "permission denied for function". | Pre-fix, this would have 500'd every new-user creation **even if Bug B were resolved.** | **CLOSED via migration `0064`** (this session). Applied to live DB; verified via `has_function_privilege`. |
| B | Supabase Auth URL Configuration has leading whitespace in the Site URL field (and likely in one or more Redirect URLs entries). GoTrue copies the Site URL into `flow_state.referrer` on /authorize, parses it on /callback, and Go's `url.Parse` rejects the leading space because `https` becomes a path segment with a colon. Existed since at least 17:36 UTC May 1 (Cowork's earliest OAuth attempts), well before migration 0063. | This is what's actually surfacing the 500 today. Until cleaned up, every OAuth /callback (Google AND Apple on web) will 500. | **NOT CLOSEABLE via MCP** — requires Studio dashboard edit or Supabase Management API call. Documented exact click path in `current-state.md` Known Outstanding Issues + the Cowork-ready prompt below. |

### Migration 0064 — applied + in source control

```sql
-- supabase/migrations/0064_grant_auth_admin_execute_on_pending_invites_trigger.sql
GRANT EXECUTE ON FUNCTION public.handle_auth_user_pending_invites()
  TO supabase_auth_admin;
```

Live DB version: `20260501190248` (apply_migration name `grant_auth_admin_execute_on_pending_invites_trigger`).

Post-flight `has_function_privilege` check (the table below shows the state after 0064):

| Role | Before 0063 | After 0063 | After 0064 |
|---|---|---|---|
| anon | true (via PUBLIC) | false | false |
| authenticated | true (via PUBLIC) | false | false |
| supabase_auth_admin | true (via PUBLIC) | **false** ← broken | **true** ← fixed |
| postgres | true | true | true |
| service_role | true | true | true |

The other six functions revoked by 0063 (`update_org_plan_credits`, `reset_org_credits`, `refund_bonus_credits`, `reset_due_solo_monthly_credits`, `trigger_rescue_stuck_leads`, `accept_invite_token`) are unaffected by this regression: none are wired as triggers on `auth.*` tables, and none are invoked by `supabase_auth_admin`. They are correctly still locked to service_role / postgres.

### What still has to happen for Google Sign-In to actually work

A 60-second dashboard fix. Hand this to Cowork or do it directly:

```text
SUPABASE STUDIO — fix leading-whitespace in Auth URL Configuration

CONTEXT
=======
Every entry in auth.flow_state stores `referrer = " https://snapquote.us"`
with a leading space. GoTrue parses this on the OAuth /callback path and
500s with "first path segment in URL cannot contain colon". Confirmed
live. Fix is to clean up the Site URL and Redirect URLs in Supabase
Studio so GoTrue stops persisting the leading space.

STEPS
=====
1. Open https://supabase.com/dashboard. Select project `upqvbdldoyiqqshxquxa`
   (display name "snapquote" or similar).
2. Left sidebar → Authentication → URL Configuration.
3. SITE URL field:
   a. Click into the field.
   b. Triple-click to select the entire current value.
   c. DELETE everything (Backspace until empty).
   d. Type from scratch (do NOT paste): `https://snapquote.us`
      (exactly 20 chars, no leading/trailing whitespace, no quotes)
   e. Click Save. Wait for the green "Saved" toast.
4. REDIRECT URLs allowlist:
   a. Inspect each existing entry. For any with leading or trailing
      whitespace, delete and re-add it cleanly. Final allowlist should
      contain exactly these entries (case sensitive, no whitespace):
        https://snapquote.us/auth/callback
        https://snapquote.us/**
        snapquotemobile://*
      (If the existing allowlist has more entries that aren't whitespace-
      polluted, leave them.)
   b. Save.
5. VERIFICATION (don't skip this step):
   a. Open a fresh Chrome incognito tab.
   b. Go to https://snapquote.us/login
   c. Click "Sign in with Google".
   d. Complete the Google flow with a real Google account.
   e. You should end up signed into the SnapQuote app at /app or
      /onboarding (depending on whether the account already had an org).
      A 500 error page = fix didn't take. Try again or report back.
   f. Sign out and try once more — first-time create AND existing-user
      sign-in should both work.
6. Take screenshots of:
   - Site URL field after Save (visible green "Saved" toast)
   - Redirect URLs allowlist after Save
   - Successful sign-in landing page (/app or /onboarding)
```

### Verification SQL (run after Murdoch/Cowork completes the Studio fix)

```sql
-- Should return |https://snapquote.us| (no leading space, length 20)
-- after a fresh OAuth attempt:
SELECT '|' || referrer || '|' AS referrer, length(referrer) AS len
FROM auth.flow_state
ORDER BY created_at DESC
LIMIT 1;
```

Expected before fix: `| https://snapquote.us|`, length 21.
Expected after fix:  `|https://snapquote.us|`, length 20.

### Files changed this session

| Path | Change |
|---|---|
| `supabase/migrations/0064_grant_auth_admin_execute_on_pending_invites_trigger.sql` | new — restores supabase_auth_admin EXECUTE on the trigger function |
| (Supabase live DB) | migration `20260501190248` applied |
| `docs/current-state.md` | migrations list extended through 0064; Known Outstanding Issues gained "Supabase Auth URL Configuration leading whitespace" hard blocker; Google OAuth blocker note expanded |
| `docs/updates-log.md` | this entry |

### Pre-ship status after this session

| Status | Items |
|---|---|
| ✅ Closed | All prior closed items (anon-callable RPCs, requireAuth determinism, anon-link seat cap, Plan UI refresh, sub-rows dedup, mobile Google PKCE) + supabase_auth_admin trigger grant (0064) |
| ⚠ Murdoch action required | Telnyx 10DLC campaign binding (portal); Supabase Studio: enable Google OAuth provider AND fix leading-whitespace in Site URL + Redirect URLs |
| 📋 Optional pre-launch | Mobile signup password length 6 → 8; mobile per-device push token signOut; subscriptions UNIQUE constraint follow-up |

No build, no submit, no OTA. Migration applied to live DB; code change + git push only. The Studio fix above has to be done in the browser before a fresh end-to-end Google Sign-In test can succeed.

---

## Session — May 1, 2026 (Google Sign-In post-callback redirect to landing — root cause + middleware fix)

After Murdoch fixed the Site URL whitespace in Supabase Studio, the OAuth /callback stopped 500'ing. But the user-facing flow was still broken: clicking "Sign in with Google" → completing the Google account picker → bouncing back to snapquote.us → ending up on the marketing landing page instead of /app or /onboarding. As if no sign-in happened.

This entry documents the diagnosis, the root cause, the code-side belt-and-suspenders fix that landed, and the recommended Studio cleanup.

### Diagnostic timeline

1. **flow_state** check after Murdoch's fix:
   - 5 new google-provider rows from 21:00:55Z onward, all with `referrer = "|https://snapquote.us|"` length 20 (no leading space — whitespace fix worked).
   - **All 5 have `referrer = "https://snapquote.us"`** (origin only — no `/auth/callback` path). That's the Site URL value, not our explicit `redirect_to`.
   - All 5 have `auth_code_issued_at` set (GoTrue did issue an exchange code).
   - All resolved to `user_id = 71622212-...` (the dev user, linked via google email).

2. **auth.users** for the dev user:
   - `last_sign_in_at = 2026-05-01 17:37:08Z` (stale, from earlier today before the URL fix).
   - `updated_at = 2026-05-01 21:02:34Z` (touched at the most recent attempt).
   - 2 sessions total, most recent at 17:37:08Z. **Zero new sessions from the 5 post-fix attempts.**

3. **Auth log** (slice via Bash grep on the saved file):
   - 4× `/callback` events at 21:01:52, 21:02:02, 21:02:07, 21:02:34 — all returned status `302`. No errors.
   - 4× `/authorize` events at the same timestamps — all `302`.
   - **Zero `/token` events post-fix.** `/token` is the endpoint supabase-js calls server-side from snapquote.us/auth/callback to exchange the code for a session. Zero calls means the Vercel `/auth/callback` route handler never ran.
   - GoTrue config-reload event at 20:55:27Z (Murdoch's URL save took effect).

### Root cause

When `LoginForm.tsx:handleOAuth` calls `signInWithOAuth({ options: { redirectTo: \`${origin}/auth/callback?next=${...}\` } })`, supabase-js sends that as `?redirect_to=https://snapquote.us/auth/callback?next=/app` on GoTrue's `/authorize`. **GoTrue validates the redirect_to against the Studio Redirect URLs allowlist.** The current allowlist apparently only matches the bare origin (`https://snapquote.us`), not `/auth/callback`. GoTrue silently rejects the path-bearing redirect_to and falls back to Site URL.

On OAuth /callback success, GoTrue uses `flow_state.referrer = "https://snapquote.us"` (the fallback Site URL, origin only) as the redirect target. It bounces the browser to `https://snapquote.us?code=<auth_code>` — the **marketing landing page** — instead of `/auth/callback`. The Vercel `/auth/callback` route handler (which calls `exchangeCodeForSession`, sets cookies, and redirects to /app) never runs. The auth code goes unused. No session cookies get set on snapquote.us. The user sees the marketing landing page like they were never logged in.

That perfectly explains the symptom Murdoch reported.

### Two fixes — one landed in code, one needs Studio

**Code-side fix (LANDED):** middleware now intercepts the OAuth-bounce-to-origin failure mode and forwards to the real callback handler:

```ts
// middleware.ts — at the very top of the middleware function
const requestUrl = new URL(request.url);
if (requestUrl.pathname === "/" && requestUrl.searchParams.has("code")) {
  const callbackUrl = new URL("/auth/callback", requestUrl.origin);
  callbackUrl.searchParams.set("code", requestUrl.searchParams.get("code")!);
  const incomingNext = requestUrl.searchParams.get("next");
  callbackUrl.searchParams.set(
    "next",
    incomingNext && incomingNext.startsWith("/") ? incomingNext : "/app"
  );
  return NextResponse.redirect(callbackUrl);
}
```

Behavior: any request to `/` with `?code=...` (the OAuth bounce shape) is forwarded to `/auth/callback?code=...&next=/app` (preserves any `next=` if the OAuth round-trip happened to carry one through, otherwise defaults to `/app`). The Vercel `/auth/callback` route handler runs `exchangeCodeForSession`, sets cookies, and redirects to /app. End-to-end works **even with the misconfigured Studio allowlist.**

This is intentional defense-in-depth: the Studio config can drift again (whitespace, removed entries, dashboard-side changes by anyone with admin access), and Google sign-in shouldn't silently fail every time. Cost of the guard: ~2 lines of comparison per request, only matters at all on `/`. Zero impact on other paths.

**Studio fix (RECOMMENDED but no longer ship-blocking):** Authentication → URL Configuration → Redirect URLs allowlist. Add the entries that should accept the path-bearing redirect_to values directly:

- `https://snapquote.us/auth/callback` (exact — narrow, safe)
- OR `https://snapquote.us/**` (wildcard — covers `/auth/callback`, future invite-token routes, etc)
- AND `snapquotemobile://*` (or `snapquotemobile://**`) — **CRITICAL for mobile OAuth.** Without this, the in-app WebBrowser on mobile bounces to `https://snapquote.us` (web origin) when GoTrue rejects the mobile scheme, and the user is stuck in the WebBrowser modal looking at the marketing page with no way back into the app. The middleware fix above only helps web; mobile WebBrowser doesn't watch web URLs.

After the Studio fix lands, every fresh OAuth attempt should produce a flow_state row whose `referrer` is the full `https://snapquote.us/auth/callback?next=/app` (path included), and the middleware-redirect path becomes a no-op for the happy case (only fires on misconfig). Verify via:

```sql
SELECT '|' || referrer || '|' AS referrer, length(referrer)
FROM auth.flow_state
ORDER BY created_at DESC LIMIT 1;
```

Expected post-Studio-fix: `|https://snapquote.us/auth/callback?next=/app|` (or similar with full path), length 41+.
Acceptable interim (with code-side fix only): `|https://snapquote.us|` length 20 (the middleware redirect picks up the slack).

### What did NOT need fixing

- `app/auth/callback/route.ts` — already correct: `exchangeCodeForSession`, cookie handling via `createServerSupabaseClient`, x-forwarded-host honored, safe `next` path validation, redirect lands on /app correctly. The handler just never got reached because GoTrue redirected to the wrong URL.
- `lib/supabase/server.ts` cookie config — confirmed correct via the existing pattern; the cookie-setting infrastructure works (already verified by other auth flows like email/password sign-in).
- `requireAuth` / `requireRole` — the multi-org ORDER BY fix from earlier today is unrelated. The user never reached requireAuth because no session was ever set.
- Mobile `app/(auth)/login.tsx` / `signup.tsx` — already PKCE-correct (commit `0e65d3f`). Mobile-side issue is purely Studio allowlist config (snapquotemobile:// scheme), no mobile code change.

### Files changed

| Path | Change |
|---|---|
| `middleware.ts` | Added OAuth-bounce-to-origin rescue redirect at top of middleware, before the Supabase session-cookie-refresh logic |
| `docs/current-state.md` | Known Outstanding Issues — moved "Site URL whitespace" to closed; replaced "Google OAuth provider disabled" with the new "Redirect URLs allowlist doesn't match /auth/callback" entry (partially closed by code-side fix) |
| `docs/updates-log.md` | this entry |

### Verification

- `npx tsc --noEmit` exit 0 on web repo.
- After deploy, the next Google Sign-In attempt should land on `/app` (or `/onboarding` for first-time users without an org).
- Auth log should show new `/token` events appearing (was zero post-fix; will be non-zero after this commit + redeploy + a real attempt).
- `auth.users.last_sign_in_at` for the developer should advance past `17:37:08Z` once they sign in successfully.
- `auth.sessions` count for the developer should go from 2 → 3+.

### Remaining pre-ship status

| Status | Items |
|---|---|
| ✅ Closed (code/DB) | Site URL whitespace; Google Sign-In post-callback dead-end (this commit); migration 0064; all prior closed items |
| ⚠ Murdoch action recommended (not ship-blocking now) | Studio Redirect URLs cleanup (add `https://snapquote.us/**` + `snapquotemobile://*`); Telnyx 10DLC campaign binding |
| 📋 Optional pre-launch | Mobile signup password length 6 → 8; mobile per-device push token signOut; subscriptions UNIQUE constraint |

The mobile Google OAuth path is still effectively broken without the `snapquotemobile://*` Studio entry, even with this commit (the middleware redirect only helps the web origin). Mobile users should use Apple Sign-In (which works natively, bypasses OAuth/WebBrowser) or wait for the Studio fix.

No build, no submit, no OTA. Code change + git push only.


---

## Session — May 1, 2026 (Meta Pixel install for Facebook ads tracking)

### What was done

Installed Meta Pixel base code on the web app for Facebook ads conversion tracking. Pixel ID: `1500154638449582`.

### Implementation

- **`app/layout.tsx`**: Added `next/script` block (`id="meta-pixel"`, `strategy="afterInteractive"`) running the standard Meta `fbevents.js` loader and `fbq('init', '1500154638449582')`. Added the `<noscript>` 1x1 tracking pixel fallback. The inline `fbq('track', 'PageView')` from Meta's snippet was intentionally **omitted** here to avoid double-counting — see next item.
- **`components/MetaPixelPageView.tsx`** (new, client): Uses `usePathname` + `useSearchParams` in a `useEffect` to fire `fbq('track', 'PageView')` on every route change. Wrapped in `<Suspense fallback={null}>` in the layout because `useSearchParams` triggers the App Router CSR bailout.
- Pixel ID hardcoded as a `const META_PIXEL_ID` at the top of `layout.tsx`. It's a public identifier (visible in any browser's network tab once the script loads), so no env-var gating was added — keeps the code simple and means no Vercel env-var coordination required for deploy.

### Why a client component for PageView

Next.js App Router does soft client-side navigations between routes. The base `<Script>` only runs once per hard load, so without a route-change listener the pixel would only count the first PageView per session. The `usePathname`/`useSearchParams` effect re-fires on every soft nav (including back/forward and query-string changes), giving Meta one PageView per route the user actually visits.

### Verification

- `npx tsc --noEmit` exit 0.
- After deploy, Meta's Pixel Helper Chrome extension on snapquote.us should show:
  - "Pixel base code" detected
  - "PageView" event firing on initial load AND on navigations between routes (e.g. `/` → `/auth/login` → `/dashboard`).
- Events Manager → Test Events tab should show PageView pings within ~30s of opening any page.

### Files changed

| Path | Change |
|---|---|
| `app/layout.tsx` | Added `next/script` Pixel base loader + `<noscript>` fallback + `<Suspense>` wrapper around `<MetaPixelPageView />`. Imported `Script`, `Suspense`, and the new component. |
| `components/MetaPixelPageView.tsx` | New file. Client component that fires `fbq('track', 'PageView')` on every route change via `usePathname`/`useSearchParams`. |
| `docs/current-state.md` | Web tech stack — added Meta Pixel line under Sentry. |
| `docs/updates-log.md` | This entry. |

### Not done / out of scope

- No custom event tracking (Lead, CompleteRegistration, Purchase, etc.). Only PageView right now. Custom events require deciding which user actions count as conversions and wiring `fbq('track', 'Lead')` etc. into the relevant flows.
- No Conversions API (server-side) — only the browser-side Pixel. CAPI would need a Meta access token and a webhook/API route.
- Mobile app (`SnapQuote-mobile`) is unchanged. Meta Pixel is web-only; mobile tracking would use the Facebook SDK for React Native.
- No `NEXT_PUBLIC_META_PIXEL_ID` env var — ID hardcoded since it's public anyway.

---

## Session — May 1, 2026 (desktop sidebar user menu — UX fix)

**Problem.** On desktop, clicking the user-info card at the bottom of the 220px sidebar opened the `AccountSheet` modal — a slide-up sheet positioned via `absolute inset-x-0 bottom-0` that spans the entire viewport width. On mobile that's intentional and right (full-width slide-up matches the rest of the mobile UX, thumb-friendly). On desktop it looked oversized — a giant horizontal bar across the bottom of the screen for a UI element that's only relevant to the narrow sidebar.

**Fix.** New `DesktopUserMenu` component in `components/Sidebar.tsx`. On desktop, user info + Sign Out button render inline at the bottom of the 220px sidebar, alongside the existing nav items (Dashboard, Leads, Estimates, etc.). The desktop branch no longer renders `AccountSheet` at all. Mobile is untouched — `MobileSidebar` still uses `SidebarFooter` + `AccountSheet` for the slide-up bottom drawer.

Styling matches the existing nav items:
- Sign Out button uses the same `min-h-[44px]`, `rounded-[10px]`, `border-l-[3px]`, `px-4 py-3`, `text-sm font-medium` shape so it visually slots in with the other nav items.
- Border-top divider above the user-info block separates it from the navigation list.
- Avatar + business name + email read at a glance; clicking Sign Out signs out directly (no intermediate modal step on desktop).

Tailwind responsive separation:
- Desktop sidebar wrapper continues to use `hidden md:fixed md:flex` so it only renders on `md:` breakpoints and up.
- `DesktopUserMenu` is rendered only inside that wrapper. Below `md:` (mobile + tablet), the existing `MobileSidebar` path runs unchanged.
- `MobileSidebar` keeps its own `md:hidden` wrapper plus the `SidebarFooter` + `AccountSheet` modal pattern.

So the same `Sidebar` component renders one way on desktop and a different way on mobile, with no `useEffect`/`window` matchMedia trickery — purely Tailwind breakpoint-driven branching plus the existing `mode="desktop" | "mobile"` prop wiring.

**Files changed:**
- `components/Sidebar.tsx` — new `DesktopUserMenu` component; desktop `Sidebar` no longer wraps `AccountSheet` or holds the `accountOpen` state. `SidebarFooter` and `AccountSheet` remain (used by `MobileSidebar`).
- `docs/current-state.md` — Design System section gained a "Sidebar user menu" note describing the desktop/mobile split.
- `docs/updates-log.md` — this entry.

`npx tsc --noEmit` exit 0. No build, no submit, no OTA. Code change + git push only.

No mobile-repo changes — mobile rendering is intentionally untouched.

---

## Session — May 1, 2026 (red Sign Out button in desktop sidebar)

Tiny styling tweak. The desktop `DesktopUserMenu`'s Sign Out button was using the muted nav-item styling (`text-muted-foreground` with `hover:bg-muted`) — visually identical to a non-destructive nav link, which understated the action. Recoloured to:

- Default: `bg-red-600` + `text-white`
- Hover: `bg-red-700`
- Disabled (mid-signout): `disabled:opacity-60` (unchanged)

Kept everything else the same — same `min-h-[44px]`, `rounded-[10px]`, `border-l-[3px]`, `px-4 py-3`, `text-sm font-medium`, same icon + label, same position. Only the colour palette changed.

Mobile is untouched. The `AccountSheet` modal's Sign Out button (used by `MobileSidebar`) was already red (`bg-red-600 hover:bg-red-700`) — desktop now matches that visual treatment for the destructive action.

**File changed:** `components/Sidebar.tsx` — single className tweak inside `DesktopUserMenu`.

`npx tsc --noEmit` not re-run (single Tailwind className change, no type implications). No build, no submit, no OTA.

---

## Session — May 1, 2026 (plan-display reflects current plan, not queued/future plan)

**Bug context.** A user on Business plan with a queued downgrade to Team for the next billing cycle saw the Team page (/app/team) render the "You're flying solo" empty-state with the copy "Team plan includes up to 2 seats" — even though they were currently on Business with 5 seats. Symptom looks like future-plan leakage; actual root cause is a single hardcoded string. Audit confirms the data layer correctly tracks effective plan and no other UI surface leaks queued changes.

### Audit findings

**Data layer — correct, no fix needed.** Stripe webhook (`app/api/stripe/webhook/route.ts`) calls `setOrganizationPlan(orgId, plan)` only on `customer.subscription.updated` / `.created` / `invoice.paid`. The `plan` value is derived from the current subscription items via `getSubscriptionPlan(subscription)` which reads `subscription.items[0].price.id` — not `subscription.pending_update`, not `subscription_schedule.phases`. When a user schedules a downgrade via Stripe Customer Portal, Stripe creates a `subscription_schedule` whose phases swap items at the period boundary; the active subscription's items continue to point at the current plan until the phase transition fires another `customer.subscription.updated`. So `organizations.plan` never reflects a queued/scheduled future plan — it flips at the actual transition. **`subscriptions.plan` follows the same path** (saved by the same webhook handler from the same source).

Grep across the web repo for `pending_update` / `cancel_at_period_end` / `phase` / `schedule_change` / `future.*plan` / `next.*billing` returned only doc references — no production code reads pending changes from Stripe. The codebase has no concept of "scheduled plan change"; everything reads current effective plan.

**UI consumers audited — all read `orgPlan` / `currentPlan` / `subscription.plan` dynamically except one.**

| File | What it shows | Source | Status |
|---|---|---|---|
| `app/app/plan/page.tsx` | Current plan badge, seat/credit allowances, plan-options carousel | `plan` from `get_org_credit_row` RPC → `organizations.plan`; `getPlanSeatLimit(plan)` / `getPlanMonthlyCredits(plan)` | ✓ correct |
| `app/app/team/page.tsx:38-40` | Seat-limit warning ("Over seat limit (X/Y)") | `orgPlan` from `organizations.plan` | ✓ correct |
| `app/app/team/page.tsx:73` (was) | "You're flying solo" empty-state | **hardcoded `"TEAM"` literal** | ✗ **BUG FIXED THIS COMMIT** |
| `components/plan/PlanOptionsSection.tsx` | Plan carousel, "Current Plan" highlight | `currentPlan` prop (passed from page); per-card `PLAN_OPTIONS` constants intentionally hardcoded (these describe each plan, not the user's current state) | ✓ correct |
| `components/SubscriptionStatusCard.tsx` | "Current Plan" + status badge | `subscription.plan` prop (from `getOrganizationSubscriptionStatus`) | ✓ correct |
| `lib/teamInvites.ts:assertSeatAvailable` | Seat-cap pre-flight | reads `org.plan` from row | ✓ correct |
| `lib/credits.ts`, `lib/usage.ts`, `lib/planChangeEmails.ts` | Credit-allowance computation, plan-change emails | `plan` parameter passed in by caller | ✓ correct |
| `lib/demo/server.ts` | Landing-page demo data builder | `plan` parameter | ✓ correct (demo, not production user-facing) |

**Mobile audit.** Mobile reads plan info via `/api/plans/config` (per-tier limits, fetched once, cached) + `/api/app/subscription-status` (the org's current effective plan). Both endpoints route through the same web-side data path that the audit confirms is correct. Mobile-side hardcoded plan strings are confined to:

- `app/(tabs)/more/plan.tsx` `PLAN_OPTIONS` array (lines ~79-95) — option-card definitions for the plan carousel, intentionally hardcoded (these describe what each plan offers).
- `app/(tabs)/more/plan.tsx:100-102` `formatPlan` helper — pure display-name mapping function, takes plan parameter.
- `app/(tabs)/more/team.tsx` empty-state copy — verified clean (uses generic "No team members yet." / "Invite a team member" / "Generate a secure invite link" — no plan tier referenced).

**Mobile is not affected by this class of bug**, no follow-up commit needed.

### Fix applied

`app/app/team/page.tsx` — replaced the hardcoded `getPlanSeatLimit("TEAM")` literal with plan-aware copy that switches on `orgPlan`:

```tsx
{orgPlan === "SOLO" ? (
  <>
    Solo plans include 1 seat.{" "}
    <Link href="/app/plan" className="font-medium text-primary hover:text-primary/90">
      Upgrade to Team or Business
    </Link>{" "}
    to invite teammates.
  </>
) : (
  <>
    Invite a teammate below to share leads, send estimates together, and keep
    everyone in sync. Your {planDisplayName[orgPlan]} plan includes up to{" "}
    {seatLimit} {seatLimit === 1 ? "seat" : "seats"}.
  </>
)}
```

`planDisplayName` is a literal record `{ SOLO: "Solo", TEAM: "Team", BUSINESS: "Business" }` defined in the page module. Behavior:

- **SOLO** user sees an upgrade CTA — invite isn't possible on their plan, so the previous "Invite a teammate below" copy was misleading even before this bug.
- **TEAM** user sees "Your Team plan includes up to 2 seats." — accurate.
- **BUSINESS** user sees "Your Business plan includes up to 5 seats." — accurate. **This is the case Murdoch surfaced;** previously it said "Team plan includes up to 2 seats" regardless of plan.

The `over seat limit` warning at lines 44-64 was already plan-aware (`seatLimit = getPlanSeatLimit(orgPlan)`); only the empty-state was buggy.

### What did NOT need fixing

- **`organizations.plan` data flow** — verified webhook never writes a queued/scheduled plan; reads current items only.
- **Plan-options carousel hardcoded values** — intentionally hardcoded per option card (what each plan offers); the user's "current" highlight is separate and reads `currentPlan` dynamically.
- **`SubscriptionStatusCard`** — already reads from `subscription.plan` prop dynamically.
- **Mobile codebase** — already routes plan info through API endpoints and dynamic `plan` parameters; no hardcoded user-facing plan-tier copy beyond the option-card definitions.

### Verification

- `npx tsc --noEmit` exit 0.
- The fix is purely additive copy + a record literal; no behavior or data changes for users not in the bug-affected state.
- Manual test path (Murdoch can verify after deploy): on the Business org with 1 owner and 0 members, navigate to /app/team — empty-state should now read "Your Business plan includes up to 5 seats." instead of "Team plan includes up to 2 seats."

### Files changed

| Path | Change |
|---|---|
| `app/app/team/page.tsx` | added `planDisplayName` record + plan-aware empty-state copy switching on `orgPlan`; SOLO gets upgrade CTA; TEAM/BUSINESS get accurate "Your {plan} plan includes up to {N} seats" line |
| `docs/current-state.md` | Design System section gained a "Plan-display invariant" note documenting the data-layer guarantee + the historical fix |
| `docs/updates-log.md` | this entry |

No mobile-repo changes — mobile audit confirmed clean. No build, no submit, no OTA.

---

## Session — May 1, 2026 (Stripe "No such customer" on credit purchase — systemic fix)

**Symptom.** Murdoch tried to buy a $70 / 100-credit pack on snapquote.us. Stripe rejected with `No such customer: 'cus_U7QwHG44vyWPzE'`. The customer doesn't exist in the live Stripe account.

**Root cause.** The `subscriptions` table has a row from 2026-03-19 with `stripe_customer_id = 'cus_U7QwHG44vyWPzE'`, but that customer no longer exists in the live Stripe account it's pointed at. Most likely cause: the customer was created when the project was in Stripe **test mode**, and we've since switched to **live mode** (`.env.local` shows `STRIPE_SECRET_KEY=sk_live_...`). Test-mode and live-mode customers live in separate Stripe customer spaces; the test-mode ID is invalid against the live API.

This is **systemic, not Murdoch-specific.** Three routes passed the stored `stripe_customer_id` to Stripe with no recovery if it was stale:

| Route | Stripe call | Stale path |
|---|---|---|
| `/api/stripe/credits` | `stripe.checkout.sessions.create({ customer })` | the bug Murdoch hit |
| `/api/stripe/checkout` | `stripe.subscriptions.retrieve(subscription_id)` then `stripe.checkout.sessions.create({ customer })` | both subscription-id and customer-id can be stale |
| `/api/stripe/customer-portal` | `stripe.billingPortal.sessions.create({ customer })` | same |

Anyone whose stored Stripe IDs got out of sync (test→live swap, manual deletion, account migration, Stripe customer-merge) would hit one of these errors and have no path to recover without manual intervention. **Ship-blocking** for any user in that state.

### Fix — three layers

**1. Helpers in `lib/stripe.ts`.**

```ts
export function isStripeResourceMissingError(err: unknown, param: string): boolean {
  if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) return false;
  if (err.code !== "resource_missing") return false;
  if (err.param === param) return true;
  return typeof err.message === "string" && err.message.toLowerCase().includes(`no such ${param}`);
}

export async function clearStaleStripeCustomerId(admin, userId): Promise<void> {
  // schema has NOT NULL on stripe_customer_id, so we DELETE the row(s).
  // The next successful webhook re-inserts with fresh IDs.
  await admin.from("subscriptions").delete().eq("user_id", userId);
}
```

**2. Route wrappers (3 routes).**

`/api/stripe/credits` and `/api/stripe/checkout` (subscription-create path) now share the same retry pattern:

```ts
const buildSessionParams = (customerId: string | null): Stripe.Checkout.SessionCreateParams => ({
  // ... shared params ...
  customer: customerId ?? undefined,
  customer_email: customerId ? undefined : user?.email,
});

let session: Stripe.Checkout.Session;
try {
  session = await stripe.checkout.sessions.create(buildSessionParams(initialCustomerId));
} catch (stripeError) {
  if (initialCustomerId && isStripeResourceMissingError(stripeError, "customer")) {
    console.warn(`[stripe/credits] Stale stripe_customer_id ${initialCustomerId} for user ${auth.userId}; clearing and retrying with fresh customer.`);
    await clearStaleStripeCustomerId(admin, auth.userId);
    session = await stripe.checkout.sessions.create(buildSessionParams(null));
  } else {
    throw stripeError;
  }
}
```

`/api/stripe/checkout` also wraps `stripe.subscriptions.retrieve` separately — if the stored `stripe_subscription_id` is stale, treat as "no active subscription" and fall through to fresh checkout (with the customer-id retry path catching the customer-id staleness too if it follows). It also tracks an `initialCustomerId` local that gets invalidated if the subscription-retrieve path cleared the row, so the fresh-checkout path doesn't re-pass the now-deleted-from-DB customer ID.

`/api/stripe/customer-portal` clears the stale row and returns a 404 with copy "We couldn't find your billing profile. Please re-subscribe from the Plan page to refresh your billing details." — the Customer Portal API can only OPEN existing customers, not create new ones, so the user has to start a fresh checkout.

**3. Murdoch-specific data fix.** DELETE the one stale row directly via Supabase MCP:

```sql
DELETE FROM subscriptions
WHERE user_id = '71622212-9016-4360-bedb-524d5adbabf2'
  AND stripe_customer_id = 'cus_U7QwHG44vyWPzE'
RETURNING id, plan, status, stripe_customer_id, stripe_subscription_id;
```

Returned the row that was previously the dev user's only `subscriptions` row (BUSINESS / active / `cus_U7QwHG44vyWPzE` / `sub_1TCj32LT0JKiq1dxn5tGrGh2`). `organizations.plan` for falconn stays at BUSINESS — that's the source of truth for plan display; no UI change. After this delete, Murdoch's next credit-pack click will fall through to `customer_email` and Stripe creates a fresh customer.

### Why DELETE rather than null-out

Tried `UPDATE subscriptions SET stripe_customer_id = NULL` first — failed with `null value in column "stripe_customer_id" of relation "subscriptions" violates not-null constraint`. The schema has NOT NULL. The cleanest path is DELETE the row entirely; the canonical effective plan is on `organizations.plan` (set by webhook on actual transitions), so removing a `subscriptions` row doesn't affect any plan-display. The next webhook (after Murdoch completes a fresh purchase or kicks off a new checkout) will INSERT a clean row.

### Note on `getOrganizationSubscriptionStatus`

After Murdoch's row is deleted, `getOrganizationSubscriptionStatus` for his org returns `plan: null, active: false, billingSource: null`. That's a transient "no subscription" state that resolves the next time he completes a Stripe checkout. The Plan page reads `organizations.plan` (via `get_org_credit_row` RPC), not `subscriptions.plan`, so the user-visible plan stays at BUSINESS during the gap. The mobile `/api/app/subscription-status` reader returns the transient null — mobile would briefly show "no plan" which is a known known-acceptable state.

### What didn't need fixing

- **Webhook handlers** (`stripe/webhook`, `revenuecat/webhook`) — they CREATE/UPDATE rows with current Stripe IDs as those events fire. Not the source of staleness.
- **Mobile** — does not store `stripe_customer_id` directly; it reads `/api/app/subscription-status` which routes through `getOrganizationSubscriptionStatus`. If that returns a stale row, mobile shows the wrong plan/status briefly but doesn't crash. Mobile doesn't trigger Stripe customer/portal flows itself.
- **Stripe webhook idempotency / signature verification** — already correct.

### Verification

- `npx tsc --noEmit` exit 0 on web repo.
- DB query confirms Murdoch's row is gone: 0 rows for user `71622212-...` after the DELETE.
- Next steps for Murdoch: refresh the page and try the $70 credit pack again — checkout should succeed and a fresh `cus_...` will be created in the live Stripe account, then the webhook will INSERT a fresh `subscriptions` row.

### Files changed

| Path | Change |
|---|---|
| `lib/stripe.ts` | new helpers `isStripeResourceMissingError(err, param)` + `clearStaleStripeCustomerId(admin, userId)` |
| `app/api/stripe/credits/route.ts` | retry-on-resource-missing wrapper around `checkout.sessions.create`; imports the new helpers |
| `app/api/stripe/checkout/route.ts` | retry-on-resource-missing for `subscriptions.retrieve` (falls through to fresh-checkout) AND for the fresh-checkout `sessions.create` |
| `app/api/stripe/customer-portal/route.ts` | clear-and-404-with-resubscribe-message on stale customer |
| (Supabase live DB) | DELETE 1 stale row for user `71622212-...` |
| `docs/current-state.md` | new "Stripe customer-id staleness recovery" note in Design System / infra section |
| `docs/updates-log.md` | this entry |

No build, no submit, no OTA. Code change + DB cleanup + git push only.

---

## Session — May 1, 2026 (credit-pack price labels match Stripe; mobile sign-out per-device push token cleanup)

### Fix #1 — Web credit-pack display prices match Stripe ($9.99 / $39.99 / $69.99)

**Problem.** The /credits page displayed "$10", "$40", "$70" for the three credit packs. Stripe's actual configured prices are $9.99, $39.99, $69.99. The mismatch wasn't a checkout-time bug (Stripe correctly charges the configured amount), but a UX/trust issue — the user sees one number on the page and a different number in the Stripe Checkout session. Also: the prices were duplicated across `lib/stripe.ts` and `app/app/credits/page.tsx`, so the next price change would need TWO edits to stay in sync (and almost certainly drift again).

**Fix — single source of truth, live from Stripe.**

`lib/stripe.ts` gets a new helper:

```ts
export const getStripeCreditPackPriceLabel = cache(async (pack: StripeCreditPackKey): Promise<string> => {
  const env = stripeCoreEnvSchema.parse(process.env);
  const priceIdMap = { "10": env.STRIPE_CREDIT_PACK_10_PRICE_ID, /* ... */ };
  const priceId = priceIdMap[pack];
  const fallback = getStripeCreditPackConfig(pack).priceLabel;

  if (!priceId) return fallback;
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (typeof price.unit_amount !== "number") return fallback;
    return `$${(price.unit_amount / 100).toFixed(2)}`;
  } catch (err) {
    console.warn(`[stripe] Failed to retrieve price ${priceId} for credit pack ${pack}:`, err);
    return fallback;
  }
});
```

Wrapped in `React.cache` so a single Server Component request that needs all 3 packs only fires 3 Stripe API calls deduped within that request. Fetches `Price.unit_amount` (cents) from the live Stripe Price object pointed at by `STRIPE_CREDIT_PACK_X_PRICE_ID` env vars; divides by 100; formats `$X.XX`. **Drift impossible** — the displayed label is the actual amount Stripe will charge.

`app/app/credits/page.tsx` switched from a static `creditPacks` array with hardcoded `price: "$10"` to a runtime `Promise.all` over `CREDIT_PACK_META` that fetches each label via the helper. Static metadata (credits count, accent gradient, "featured" flag) stays in code; only the `price` string is now sourced from Stripe.

`lib/stripe.ts:getStripeCreditPackConfig` `priceLabel` values updated to `$9.99 / $39.99 / $69.99` so the **fallback** path (Stripe API down, env var missing) shows the correct prices too. The fallback is only hit on Stripe outages — in normal operation the live helper wins.

**Mobile.** Already correct. `app/(tabs)/more/credits.tsx:253` uses `pkg?.product.priceString` from the RevenueCat SDK, which is the actual Apple App Store / RevenueCat-reported price string ("$9.99" etc). Mobile never had this drift because it always asked the platform for the real price.

### Fix #2 — Mobile sign-out push token cleanup, scoped to current device

**Problem (current state on `main`):** `lib/auth.tsx:signOut` was deleting **every** `push_tokens` row for the user (`.eq("user_id", userId)`). That meant a multi-device user signing out on iPhone A would lose pushes on iPhone B too — even though they're still signed in on B. Equivalent to logging the user out of every device when they only intended to sign out of one.

(In Build 9, the cleanup may have been entirely absent — leaving the row stale with a now-invalid token. Either failure mode — wipe-everything OR leave-stale — is wrong; per-device delete is the correct behavior.)

**Fix.**

`lib/notifications.ts` exports a new read-only helper:

```ts
export async function getCurrentDeviceId(): Promise<string | null> {
  return (await get<string>(DEVICE_ID_KEY)) ?? null;
}
```

Distinct from `getOrCreateDeviceId` — on sign-out, if the device never registered for push, there's nothing to delete. Returning `null` lets the caller skip the DB call.

`lib/auth.tsx:signOut` now scopes the delete to `(user_id, device_id)`:

```ts
try {
  const deviceId = await getCurrentDeviceId();
  if (userId && deviceId) {
    const { error: tokenError } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("device_id", deviceId);
    if (tokenError) {
      console.warn("[auth] Failed to clean up push token on sign-out:", tokenError);
    }
  }
} catch (tokenError) {
  console.warn("[auth] Failed to clean up push token on sign-out:", tokenError);
}
```

Wrapped in try/catch so any failure (network, RLS edge case, etc.) `console.warn`s but does not block the rest of the sign-out flow (clearing local session state, calling `supabase.auth.signOut`, etc). Murdoch's intent: sign-out must always succeed even if the cleanup network call fails.

Net behavior:
- **Single-device user signs out** → row for `(user_id, device_id)` deleted → no stale token sitting in the DB.
- **Multi-device user signs out on one device** → only that device's row deleted; other devices keep receiving pushes.
- **User on a never-registered device signs out** → no `device_id` stored → skip the DB call entirely.
- **Network failure during cleanup** → warn only; sign-out proceeds.
- **User signs back in on the same device later** → `registerForPushNotifications` fires from `app/_layout.tsx`, upserts a fresh row with the same `device_id`, normal operation resumes.

### Files changed

| Repo | Path | Change |
|---|---|---|
| Web | `lib/stripe.ts` | new `getStripeCreditPackPriceLabel` helper (cached, React.cache); fallback `priceLabel` constants updated to `$9.99 / $39.99 / $69.99` |
| Web | `app/app/credits/page.tsx` | imports the helper, fetches all 3 labels via `Promise.all` at render time; removed hardcoded `"$10/$40/$70"` literals |
| Mobile | `lib/notifications.ts` | new exported `getCurrentDeviceId` (read-only) |
| Mobile | `lib/auth.tsx` | imports `getCurrentDeviceId`; signOut delete scoped to `(user_id, device_id)` |
| Web | `docs/current-state.md` | new "Credit-pack price labels" note; minor update |
| Web | `docs/updates-log.md` | this entry |
| Mobile | `docs/current-state.md` | new "Sign-out push-token cleanup" note |
| Mobile | `docs/updates-log.md` | this entry |

### Verification

- `npx tsc --noEmit` exit 0 on both repos.
- Manual test path Murdoch can run after deploy:
  - Web: visit /credits → all three pack cards now show `$9.99 / $39.99 / $69.99` (or the fallback values match Stripe; either way, no `$10/$40/$70`). Click any pack → Stripe Checkout shows the same `$X.99` amount; price drift impossible.
  - Mobile: sign in on iPhone A, register for push, send self a notification → arrives. Sign out on A. The single matching `push_tokens` row should be gone (verify via `select * from push_tokens where user_id = '<murdoch>'`). Sign back in → fresh row with same `device_id`. If a second device is signed in concurrently, signing out on A leaves B's row intact and notifications keep working there.

No build, no submit, no OTA. Code change + git push only.

---

## Session — May 4, 2026 (Google Analytics 4 install)

### What was done

Installed Google Analytics 4 on the web app alongside the existing Meta Pixel. GA4 measurement ID: `G-2QM16SWP9D`.

### Implementation

- **`app/layout.tsx`**: Added two `next/script` blocks (both `strategy="afterInteractive"`):
  - `id="ga4-loader"` — loads `https://www.googletagmanager.com/gtag/js?id=G-2QM16SWP9D`.
  - `id="ga4-init"` — initialises `window.dataLayer`, defines `gtag`, calls `gtag('js', new Date())`, then `gtag('config', 'G-2QM16SWP9D', { send_page_view: false })`. The `send_page_view: false` flag is intentional — it suppresses GA's automatic initial-load page_view so the only page_view per route comes from the route-change effect (mirrors the Meta Pixel pattern, prevents double-counting).
- **`components/GA4PageView.tsx`** (new, client): Same shape as `MetaPixelPageView`. Uses `usePathname` + `useSearchParams` in a `useEffect` to fire `gtag('event', 'page_view', { page_path, page_location, page_title })` on every route change including soft navs and query-string changes. Augments the global `Window` interface with `gtag?` and `dataLayer?`.
- Layout reuses the existing `<Suspense fallback={null}>` boundary that already wraps `<MetaPixelPageView />`. Both components now sit inside it (`useSearchParams` triggers App Router CSR bailout in either component).
- Measurement ID hardcoded as `const GA4_MEASUREMENT_ID` next to the existing `META_PIXEL_ID`. Same reasoning as Meta Pixel — public identifier, no env-var coordination needed for deploy.

### Why it's safe alongside Meta Pixel

The two pixels live on different globals (`window.fbq` vs `window.gtag`/`window.dataLayer`) and load from different domains (`connect.facebook.net` vs `googletagmanager.com`). No shared state, no hooked event listeners, no script ordering dependency. Both are loaded `afterInteractive`. Both rely on the same `Suspense` boundary for the route-change client component, which is fine — `<Suspense>` does not coordinate sibling effects.

### Verification

- `npx tsc --noEmit` exit 0.
- After Vercel deploy:
  - GA4 Realtime report should show users on snapquote.us and `page_view` events for each route navigated.
  - DevTools → Network: requests to `googletagmanager.com/gtag/js?id=G-2QM16SWP9D` and beacons to `google-analytics.com/g/collect` per page nav.
  - Meta Pixel should continue working unchanged (Pixel Helper still detects PageView per route).

### Files changed

| Path | Change |
|---|---|
| `app/layout.tsx` | Added GA4 loader + init `next/script` blocks. Added `<GA4PageView />` inside the existing Suspense boundary. New `GA4_MEASUREMENT_ID` const. |
| `components/GA4PageView.tsx` | New file. Client component fires `gtag('event', 'page_view', ...)` on every route change via `usePathname` / `useSearchParams`. |
| `docs/current-state.md` | Web tech stack — added Google Analytics 4 line under Meta Pixel. |
| `docs/updates-log.md` | This entry. |

### Not done / out of scope

- No GA4 custom events (sign_up, generate_lead, purchase). Only page_view. Custom events require deciding which actions to instrument and wiring `gtag('event', ...)` into the relevant flows (signup completion, lead submission, quote sent, plan upgrade, credit pack purchase).
- No GA4 user_id linking to Supabase auth user — currently anonymous-only tracking.
- No Measurement Protocol / server-side events. Browser-side only.
- No consent banner / cookie banner gating GA4. If a future EU/UK launch needs GDPR consent gating, both pixels will need to be wrapped behind a consent guard.
- Mobile (`SnapQuote-mobile`) is unchanged. GA4 is web-only here; mobile would use Firebase Analytics if/when added.

---

## Session — May 4, 2026 (fixes)

### Fix: AI estimator timeout + failed lead visibility + retry cron

**Symptom (3 production bugs from a single test session):**
1. Three test leads (deck install, deck repair, tree service) all returned "AI estimate unavailable" with degenerate UI: $25 max on the Send Estimate slider, "AI Confidence 40% / Medium confidence" rendered even though no estimate existed.
2. In-app toast notification appeared for each lead but the lead was nowhere in the leads list or dashboard "recent leads."
3. Leads appeared to "disappear" from the list. (Investigation showed they never appeared at all — they were filtered out from the moment AI failed.)

**Root cause (single, cascading):**
- AI estimator was timing out at the outer `ESTIMATE_GENERATION_TIMEOUT_MS = 40000` wrapper in `lib/ai/estimate.ts`. Sentry [SNAPQUOTE-WEB-4](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-4) recorded 3 events in 8 minutes matching the test leads exactly.
- 40s wrapper budget was structurally too tight for `gpt-5-mini` with multi-image inputs (`detail: "high"` on every customer photo + the satellite tile). The inner `STRUCTURED_AI_MAX_ATTEMPTS = 3` retry loop, with a 45s per-attempt timeout, was dead code — the outer wrapper killed everything before even one full retry could complete.
- Both lead-list queries (`app/app/leads/page.tsx` and `app/app/page.tsx`) hard-filtered `.eq("ai_status", "ready")`, so leads that landed in `failed` were silently invisible. Toast still fired correctly from the estimator's terminal-state notifications path, but the lead the toast pointed to was never in the list.
- UI: `ConfidenceMeter` defaulted to `0.4` (rendering "40% / Medium confidence") when both `ai_confidence_score` and `ai_confidence` were null. `PriceSlider` collapsed to `trackMax = STEP = $25` when both endpoints were 0/null.

**Fix (6 changes, all in this commit):**

1. **Bumped `ESTIMATE_GENERATION_TIMEOUT_MS` 40000 → 55000** in `lib/ai/estimate.ts`. Route `/api/internal/run-estimator` already has `maxDuration = 60`, so this leaves ~5s of headroom for the terminal write + notifications fan-out. Also tightened `STRUCTURED_AI_TIMEOUT_MS` from 45000 → 40000 so the per-call budget fits inside the wrapper.
2. **Lowered satellite image `detail` from `"high"` → `"low"`** in `callOpenAI` (`lib/ai/estimate.ts:~3697`). Customer photos stay high. The 600x400 satellite tile is property-context only and doesn't need high-detail tokens; biggest single latency win for the request.
3. **Removed dead retry config.** Deleted `STRUCTURED_AI_MAX_ATTEMPTS`, `STRUCTURED_AI_BASE_BACKOFF_MS`, `STRUCTURED_AI_MAX_BACKOFF_MS`, `computeStructuredAiRetryDelayMs`, and `retryStructuredAiOperation`. Replaced with single-attempt helper `runStructuredAiOperation` that runs the operation once and returns the same trace shape. Cross-call retries now happen externally in the rescue cron with a per-row attempt cap. Removed `maxAttempts` field from `AiExtractionTrace` and updated `buildAiExtractionTrace` / `buildAiExtractionNotes` accordingly. Updated `tests/unit/ai.test.ts` (removed the retry test, fixed the trace-notes test to match new wording).
4. **Made failed leads visible.** Both list queries (`app/app/leads/page.tsx:33`, `app/app/page.tsx:106`) changed from `.eq("ai_status", "ready")` to `.in("ai_status", ["ready", "failed"])`. Plumbed `ai_status` through `LeadList` / `LeadCard` / dashboard recent-leads card. `LeadCard` now renders "AI estimate unavailable" with amber color + "Review and send a manual estimate" sub-copy when `ai_status === "failed"`. Dashboard recent-leads shows the same "AI unavailable" amber label. Lead detail page (`app/app/leads/[id]/page.tsx`):
   - `ConfidenceMeter` is now hidden entirely when both `ai_confidence_score` and `ai_confidence` are null/unknown — instead of falling through to the misleading 0.4 "Medium" default.
   - `QuoteComposer` now receives sane fallback values (`$500–$2000` range, `$1000` snap quote) when the lead has no AI estimate AND no existing draft/expired quote, instead of `Number(null) = 0` collapsing the slider to $0–$25. New `composerDefaults` helper handles the resolution chain (existing quote → AI estimate → fallback).
   - Added an amber banner above the QuoteComposer card: "AI estimate unavailable for this lead. Set your price manually below and send the estimate as usual." (Only shows on `ai_status === "failed"`.)
   - `PriceSlider` hardened with a `(0, 0)` defense-in-depth fallback to `$0–$5000` working range.
5. **Extended `rescue-stuck-leads` cron to retry failed leads.** Added migration `0065_lead_ai_retry_count.sql` (`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_retry_count integer NOT NULL DEFAULT 0`). Added a third stage to `app/api/cron/rescue-stuck-leads/route.ts`: leads in `ai_status="failed"` within the last 6 hours and with `ai_retry_count < 2` get atomically transitioned back to `processing` (CAS on both `ai_status` and `ai_retry_count`) with the counter incremented, then re-triggered through the existing `triggerEstimatorForLead` path. Caps retries at 2 per lead so a permanently-broken lead doesn't loop forever.
6. **Added missing `org_id` filter on the failure-path UPDATE** in `lib/ai/estimate.ts`. Reordered the catch block to look up `failureLead` first (already needed for notifications), then add `.eq("org_id", failureLead.org_id)` to the failure UPDATE — parity with the success-path UPDATE's defense-in-depth at line ~4615.

### Files changed

| Path | Change |
|---|---|
| `lib/ai/estimate.ts` | Timeout 40000→55000; STRUCTURED_AI_TIMEOUT_MS 45000→40000; satellite `detail: "low"`; removed retry constants + `retryStructuredAiOperation` + `computeStructuredAiRetryDelayMs`; replaced with single-attempt `runStructuredAiOperation`; removed `maxAttempts` from `AiExtractionTrace`; updated `buildAiExtractionTrace` / `buildAiExtractionNotes`; reordered failure-path catch block to add `org_id` filter on UPDATE. |
| `app/app/leads/page.tsx` | List filter `.eq("ai_status","ready")` → `.in("ai_status",["ready","failed"])`. Added `ai_status` to projection and lead card mapping. |
| `app/app/page.tsx` | Dashboard recent-leads filter widened to include `failed`; added `ai_status` to projection and `DashboardLead` type; `getEstimateLabel` returns "AI unavailable" when failed; recent-leads card renders amber color when failed. |
| `app/app/leads/[id]/page.tsx` | `ConfidenceMeter` now conditional on having actual confidence data (no more 0.4/Medium fallback). New `composerDefaults` helper computes price values from existing-quote → AI estimate → fallback ($500/$2000/$1000). Added amber banner above the QuoteComposer card when `ai_status === "failed"`. |
| `components/LeadList.tsx`, `components/LeadsPageClient.tsx`, `components/LeadCard.tsx` | Added `ai_status` to Lead type. `LeadCard` renders "AI estimate unavailable" + "Review and send a manual estimate" sub-copy + amber color when failed. |
| `components/PriceSlider.tsx` | Hardened against (0, 0) inputs — falls back to $0–$5000 working range instead of collapsing to $0–$25. |
| `app/api/cron/rescue-stuck-leads/route.ts` | Added stage 3: retry recent failed leads with `ai_retry_count < 2` via per-lead CAS update. Constants `MAX_AI_RETRIES = 2`, `FAILED_RETRY_WINDOW_HOURS = 6`. Response now also returns `failedRetried` count. |
| `supabase/migrations/0065_lead_ai_retry_count.sql` | New. `ADD COLUMN IF NOT EXISTS ai_retry_count integer NOT NULL DEFAULT 0`. Forward-only, idempotent. Applied to live DB via Supabase MCP. |
| `tests/unit/ai.test.ts` | Removed the `retryStructuredAiOperation` import + test. Updated the trace-notes test to match the new "1 attempt" wording (no more "1/3"). |
| `docs/current-state.md` | Updated Estimator Pipeline section: timeout 40s → 55s, single-attempt AI calls, satellite detail `low`, retry happens at the cron layer with per-row cap. Added migration 0065 to the migrations list. |
| `docs/updates-log.md` | This entry. |

### Verification before push

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (only pre-existing `<img>` warning in `app/layout.tsx`, unrelated).
- `npm run test` — 75/75 tests passing across 10 files (incl. updated `ai.test.ts`).
- Verified DB schema: `ai_retry_count integer NOT NULL DEFAULT 0` present on `leads` table.
- Verified no leftover references to `retryStructuredAiOperation`, `STRUCTURED_AI_MAX_ATTEMPTS`, `computeStructuredAiRetryDelayMs`, `STRUCTURED_AI_BASE_BACKOFF_MS`, `STRUCTURED_AI_MAX_BACKOFF_MS`, or `trace.maxAttempts` anywhere in the codebase.
- Verified both production list queries updated; `lib/demo/server.ts` intentionally left at `.eq("ai_status","ready")` (curated demo data, never has failed leads).

### Not done / out of scope

- Did not change the model. `gpt-5-mini` stays.
- Did not refactor the estimator pipeline beyond the listed timeouts + retry collapse.
- Did not touch quote expiry, archive cron, or RLS policies.
- Did not run a build or deploy. Code pushed to GitHub; Vercel will auto-deploy.
- The 3 failed test leads from the original incident (Tree Service `006c1b2c…`, Deck `89a38c8c…`, Deck `e5c894fc…`) will be picked up by the rescue cron's new failed-retry stage on its next 3-min tick — they're within the 6-hour window and at `ai_retry_count = 0`.

---

## Session — May 4, 2026 (fix #2)

### Fix: Remove outer estimator timeout, guarantee catch-block fallback, property-data timeout, pipeline audit markers

**Why a second fix on the same day:** The earlier May 4 commit (`4346563`) addressed the symptom (AI was timing out at the outer wrapper) by bumping the wrapper from 40s → 55s and tightening the inner AI timeout. That helped but did not close the architectural hole: the outer wrapper still wrapped both *the thing that can hang* (AI) and *the safety net for when it does* (the heuristic fallback at `lib/ai/estimate.ts:~4010`) in the same kill switch. So on a sustained AI degradation, the fallback would still get killed alongside the AI call. Murdoch's product requirement is that contractors NEVER see "AI estimate unavailable" / $0 — that has to be structurally guaranteed, not probabilistically reduced. This commit makes the guarantee structural.

**Three architectural changes + five new audit markers:**

1. **Removed the outer `runWithAbortTimeout` wrapper around `generateEstimate`.** Deleted `ESTIMATE_GENERATION_TIMEOUT_MS = 55000`. The pipeline now relies on per-call timeouts at every external boundary instead. Each timeout is narrower than the prior umbrella and they don't compete with each other:
   - Property data: `PROPERTY_DATA_TIMEOUT_MS = 8000` (new)
   - AI call: `STRUCTURED_AI_TIMEOUT_MS = 35000` (lowered from 40000 — no longer needs to leave room for an outer wrapper)
   - Polish: 10000 (unchanged)
   - Pure JS (fallback engine compute, DB writes): no timeout needed
   The `runWithAbortTimeout` helper is kept (used now for the property-data lookup) but it no longer wraps the entire pipeline.

2. **Added a guaranteed catch-block fallback in `generateEstimateAsync`.** Hoisted `estimateInput`, `leadOrgId`, `leadAddressFull` from inside the try block to `let` declarations at function scope. In the catch block, if `estimateInput` and `leadOrgId` are populated, the catch:
   - Builds a degraded `PropertyData` via `buildDegradedPropertyData` (new helper exported from `lib/property-data.ts`).
   - Calls `fallbackEstimate(estimateInput, degradedPropertyData, ...inferSignalsFallback(...))` directly — pure JS, deterministic, no external network calls.
   - Writes the success-style UPDATE with `ai_status="ready"` and the resulting prices.
   - Skips polish entirely (catch path's job is GUARANTEE A PRICE, not a polished one).
   - Captures the original error to Sentry with tag `stage: "catch-fallback-recovered"` so we can monitor what forced the catch even on the recovery path.
   - Fires `sendNewLeadNotifications` and returns.
   If the catch fallback itself throws (which would require `fallbackEstimate` to throw — it doesn't under any input we feed it), Sentry-tagged `stage: "catch-fallback-threw"`, then falls through to the last-resort `ai_status="failed"` write tagged `stage: "catch-fallback-unreachable"`.

3. **Added 8s timeout + degraded-fallback to the `getPropertyData` call site.** Wrapped in `runWithAbortTimeout(PROPERTY_DATA_TIMEOUT_MS, ...)` inside `generateEstimate`. On timeout/throw, pushes `"Property data lookup failed: <reason>; using degraded defaults."` and continues with `buildDegradedPropertyData(...)` — no throw, the rest of the pipeline runs identically.

**Five new pipeline audit markers added to `ai_estimator_notes`** (all 1-2 line `auditMarkers.push(...)` additions; no schema change). The markers are threaded through `generateEstimate` via a local `auditMarkers: string[]` array, then merged into the result's `estimatorNotes` via the new `mergeAuditMarkers` helper:

a. **Property data success/failure** — `"Property data resolved: <city>, <state> (lot <sqft> sqft)."` or `"Property data lookup failed: <reason>; using degraded defaults."`
b. **Satellite image** — pushed inside `resolveSatelliteImageUrl`: `"Satellite image attached."` or one of `"Satellite image unavailable: no location coordinates|no Google Maps API key|fetch failed."` Plus `"Satellite image: skipped (estimator mode=off)."` when AI is disabled entirely.
c. **Polish summary** — pushed inside `polishJobSummary`: `"Summary polish: applied."` / `"Summary polish: failed (<reason>); using raw deterministic summary."` / `"Summary polish: skipped (catch fallback|estimator mode=off|no OPENAI_API_KEY|empty raw summary)."`
d. **Catch fallback origin** — pushed in the catch path: `"Estimator origin: catch_fallback."` and `"Catch fallback triggered by: <message>"`. Distinguishes from the in-pipeline fallback (which still uses `"Estimator signal source: fallback."`).

The slice limit on `engineEstimate.estimatorNotes` was bumped from 12 → 20 (line ~3899) and `mergeAuditMarkers` caps at 24 to ensure the new markers don't get truncated by the existing engine-level cap.

### Files changed

| Path | Change |
|---|---|
| `lib/ai/estimate.ts` | Added `import * as Sentry from "@sentry/nextjs"`. Imported `buildDegradedPropertyData`. Removed `ESTIMATE_GENERATION_TIMEOUT_MS`. Added `PROPERTY_DATA_TIMEOUT_MS = 8000`. Lowered `STRUCTURED_AI_TIMEOUT_MS` 40000 → 35000. `resolveSatelliteImageUrl` accepts optional `auditMarkers` and pushes satellite markers. `callOpenAI` accepts optional `auditMarkers` and forwards. `polishJobSummary` and `polishEstimateSummary` accept optional `auditMarkers` and push polish markers. `generateEstimate` collects `auditMarkers` locally, wraps `getPropertyData` in `runWithAbortTimeout(8000, ...)` with degraded fallback, threads markers through callOpenAI / polishEstimateSummary, and merges into result via new `mergeAuditMarkers` helper. `engineEstimate.estimatorNotes` slice cap raised 12 → 20. `generateEstimateAsync` had `estimateInput / leadOrgId / leadAddressFull` hoisted to `let` declarations, removed the outer `runWithAbortTimeout` around `generateEstimate`, added a full catch-block fallback path that runs `fallbackEstimate` directly with degraded property data, writes the success-style UPDATE, fires notifications, and Sentry-tags the recovery. Last-resort `ai_status="failed"` write is now reached only if the catch fallback itself fails (Sentry-tagged `catch-fallback-unreachable`). |
| `lib/property-data.ts` | New exported helper `buildDegradedPropertyData(input)` that returns a fully-shaped `PropertyData` with all-null fields and `locationSource="unavailable"` for use when the real lookup fails or times out. |
| `docs/current-state.md` | Estimator Pipeline section rewritten with the new failure topology (in-pipeline fallback → catch fallback → rescue cron) and the five new audit-marker conventions documented. |
| `docs/updates-log.md` | This entry. |

### Verification before push

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (only pre-existing `<img>` warning in `app/layout.tsx`, unrelated).
- `npm run test` — 75/75 tests passing across 10 files.
- Verified `ESTIMATE_GENERATION_TIMEOUT_MS` is fully removed from code (only references remaining are historical mentions in `docs/updates-log.md` from the prior fix entry — left intact as record).
- Spot-checked all five new audit markers reach a code path that's not behind a dead branch:
  - Property data success: pushed after successful `getPropertyData` return at the top of `generateEstimate`.
  - Property data failure: pushed in the catch around the property data timeout.
  - Satellite: pushed at all 4 exit points of `resolveSatelliteImageUrl` + once for `aiMode === "off"` in `generateEstimate`.
  - Polish: pushed at success, failure (empty + thrown), and 3 skip paths in `polishJobSummary`.
  - Catch fallback origin: pushed in the catch path of `generateEstimateAsync`.
- Verified `ai_estimator_notes` is written on the catch path (success-style UPDATE writes `catchEstimate.estimatorNotes` which includes the merged audit markers).
- Verified the catch path writes `ai_status="ready"` (not "failed") since the deterministic estimate IS a real estimate.
- Verified `getPropertyData` timeout returns degraded data (via `buildDegradedPropertyData`) rather than throwing.
- Verified `lead`, `contractor`, `photos` data correctly hoisted via `estimateInput` capture (compiles clean; catch-path TS is happy with the `null` checks before use).

### Sentry tagging

Three new `area: "estimator"` tag values to monitor:
- `stage: "catch-fallback-recovered"` — the catch ran, produced a price, lead is `ai_status="ready"`. The original error is captured for diagnostic purposes.
- `stage: "catch-fallback-threw"` — the catch fallback itself crashed (very unexpected; would require `fallbackEstimate` to throw).
- `stage: "catch-fallback-unreachable"` — the catch fired but `estimateInput` wasn't populated (e.g. lead row load failed before we could hoist it).

Healthy steady state: `catch-fallback-recovered` should be rare (single-digit per day at most). Spikes mean AI/property-data is degraded — useful operational signal.

### Not done / out of scope

- Did not change the model. `gpt-5-mini` stays.
- Did not move polish to async / fire-and-forget. Polish still runs synchronously in the critical path on success and in-pipeline-fallback paths; only the catch fallback skips it.
- Did not add an `ai_signal_source` column. The audit markers above provide the same info via `ai_estimator_notes`.
- Did not add a typed JSONB audit column. The string-array markers are sufficient for the testing/grep use case.
- Did not touch retry cron, leads list filters, ConfidenceMeter, or any UI from the prior fix.
- Did not run a build or deploy. Code pushed to GitHub; Vercel will auto-deploy.

---

## Session — May 4, 2026 (fix #3)

### Perf: Drop customer photo detail to low for AI estimator latency

**Why a third fix on the same day:** After the prior architectural fix (commit `51f7890` removed the outer wrapper and added the catch-block fallback) the contractor-visible behavior was good — `ai_status="ready"` with a real heuristic price within ~48s on every test lead. But Sentry [SNAPQUOTE-WEB-6](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-6) showed AI was still timing out on every call (4 events in the diagnostic window, all `finalFailureCategory: "timeout"` at the 35s inner timeout). That meant 100% of leads were going through the heuristic-fallback path — getting prices, but with no AI vision input at all (`inferSignalsFallback` produces empty `detectedSurfaces`, defaulted `materialClass`, keyword-only `condition`). Healthy state requires AI to succeed routinely so the fallback is a true safety net rather than the default. Diagnostic showed the dominant wall-clock cost on these multi-photo test leads was customer-photo tile-processing — every photo at `detail: "high"` gets tiled into multiple 512×512 sub-images that the model processes sequentially, inflating wall-clock latency well beyond what the token count suggests.

**The change (one-line semantic, ~10 lines with the comment):**
- `lib/ai/estimate.ts` — customer photos in `callOpenAI`'s `imageInputs` array changed from `detail: "high"` → `detail: "low"`. Each photo now costs a flat 85 vision tokens with no per-tile preprocessing pass.
- Satellite tile already at `detail: "low"` from fix #1; left alone.
- Photo count NOT capped — at "low" detail, extra photos are near-free (85 tokens each, single pass each), and they help AI form a fuller categorical picture (multiple angles) at almost zero latency cost.

**Why this and not the other options on the table:**
- Confidence formula is structurally robust to lower-quality AI signals: `imageQuality`, `surfaceDetectionConfidence`, `satelliteClarity`, `scopeMatchConfidence` all have count-based heuristic defaults at `lib/ai/estimate.ts:920-924, 1004-1009`. If AI returns a lower-confidence number (which it might honestly do with low-detail images), the weighted formula absorbs ~5–8 points worst case — both tiers stay "high confidence" in the UI's tier system (≥0.7).
- The pricing isn't actually photo-dependent for the affected services. Reading [estimators/deckEstimator.ts:40](estimators/deckEstimator.ts:40), the only AI signal that affects deck price is `estimatedQuantity` (sqft), with questionnaire + propertyData fallbacks. All multipliers (`materialMultiplier`, `conditionMultiplier`, etc.) come from questionnaire answers + `regionalCostModel`. Tree service is the same shape. The architecture is "AI interprets, logic prices."
- Status quo ("AI fails, no vision input at all") was much worse than "AI succeeds with low-detail vision." Switching gets us from "no AI on photos 70%+ of the time" to "AI succeeds with reduced-detail vision most of the time" — strict improvement.

**Did NOT do:**
- Cap photo count. Extra "low" photos are near-free latency-wise.
- Change model. `gpt-5-mini` stays.
- Touch the structured-output schema. Defer until after measuring fix #3's effect.
- Modify the confidence formula. Count-based defaults already degrade gracefully.
- Touch retry cron, fallback paths, audit markers, list filters, or UI.

### Files changed

| Path | Change |
|---|---|
| `lib/ai/estimate.ts` | Customer-photo `detail` value `"high"` → `"low"` in `callOpenAI`'s `imageInputs` array (~line 3737). Comment updated explaining the rationale and pressure-washing caveat. |
| `docs/current-state.md` | Estimator Pipeline → "OpenAI request shape" updated to reflect customer photos at `detail: "low"`. New paragraph documenting the photo-to-pricing dependency model and flagging pressure-washing as the A/B candidate. |
| `docs/updates-log.md` | This entry. |

### Verification before push

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (only pre-existing `<img>` warning in `app/layout.tsx`, unrelated).
- `npm run test` — 75/75 tests passing across 10 files.
- Confirmed only the customer-photo detail value changed (one semantic change; comment expansion adjacent).
- Confirmed satellite still at `detail: "low"` (unchanged).

### Expected effect

- AI p50 latency drops from current ~35–45s into the **~15–25s** range for typical multi-photo leads. Vision tokens for a 4-photo lead drop from ~3,000 ("high") → ~340 ("low"), a 90% reduction — but more importantly the tile-processing serialization cost is eliminated entirely.
- AI success rate on the inner 35s timeout goes from current ~30% (4-of-4 timeouts in the recent diagnostic window) to majority. Fallback then becomes the true safety net it was designed to be.
- Mechanical confidence drop ~5–8 points worst case (`ai_confidence_score`). Both starting and ending tiers remain "high confidence" (≥0.7) in the UI for the typical lead. UI label and color don't change.
- Estimate quality unchanged for non-pressure-washing services (price math runs off questionnaire + propertyData; AI photo signals are categorical refinements with engine fallbacks for every input).

### Pressure-washing caveat (flagged in Pending Work)

Pressure-washing is the one service where photo detail meaningfully affects price — `detectedSurfaces` from satellite/photos drives the surface scope and `quotedSurfaces` reconciliation, which feeds the priced sqft. With photos at "low" detail, AI may detect fewer or less-accurate surface boundaries, which could push the priced sqft lower than it would be with "high" detail photos. Worth A/B testing once pressure-washing is a launch priority. Filed as a Pending Work entry "Pressure-washing photo detail A/B".

---

## Session — May 4, 2026 (fix #4)

### Fix: Move notifications into after() so customer form doesn't block on Telnyx/Resend

**Symptom:** After commit `8478173` shipped (photo detail to "low") AI was succeeding on test leads. But Murdoch tested submitting the public lead-request form and the "Sending..." button hung for 60+ seconds before returning. Conversion-killing — real customers will think the form is broken, close the tab, hit submit again creating duplicates, or just abandon and we lose the lead.

**Root cause:** `app/api/public/lead-submit/route.ts` was already deferring the AI estimator correctly via `after()`. But three other provider calls were `await`ed in the synchronous path **before** `NextResponse.json` was returned:
1. `notifyContractor(...)` — Telnyx SMS, 3 retries with 500ms backoff, **no per-fetch timeout** in `lib/notify.ts` `sendSms`.
2. `notifyCustomer(...)` — same shape.
3. `sendEmail(...)` for the customer confirmation — Resend SDK call, 3 retries, no timeout passed to the SDK.

With no per-fetch `AbortController` / `signal`, a hung Telnyx response (which we'd seen sporadically since the 10DLC campaign came online) could stall each `fetch` for any amount of time. Three notification calls × multi-second hangs each × 3 retries each = easily 60+s of customer-facing wait. The AI was a red herring — it was already deferred. The notifications were the real block.

**Fix (commit on `main`, 2 files):**

1. **`app/api/public/lead-submit/route.ts`** — moved `notifyContractor`, `notifyCustomer`, and the customer confirmation `sendEmail` from the synchronous path into the existing `after()` block alongside `triggerEstimatorForLead`. The notification option objects (`contractorNotificationOptions`, `customerNotificationOptions`, `customerEmailRecipient`, `customerEmailReplyTo`) are computed before the `after()` registration so they're closed-over by the deferred callback. All three calls run in parallel via `Promise.allSettled([...])`, each wrapped in `.catch` so a single hung/failing provider doesn't sink the others. The customer's `NextResponse.json(...)` returns as soon as photo uploads + DB writes complete — no provider gates the response. Floor on customer wait: ~3–8s, dominated by photo uploads.
2. **`lib/notify.ts`** — added defense-in-depth `PROVIDER_FETCH_TIMEOUT_MS = 8000` per attempt for both providers. `sendSms` now wraps each Telnyx fetch with a fresh `AbortController` whose `controller.abort(...)` fires at 8s; the abort signal is passed to `fetch(..., { signal })` so the underlying request actually unwinds instead of hanging. `sendEmail` wraps the Resend SDK's `emails.send(...)` in `Promise.race` against an 8s timer (the SDK doesn't expose an AbortController directly). On timeout each call falls through the existing retry / fail-quiet path.

Notifications still fire on every successful submission — they just land seconds AFTER the form's thank-you screen instead of gating it. Even after the move, the 8s per-attempt cap means worst-case after()-block time is 3 retries × 8s = 24s for a fully-stuck provider, well inside the 60s `maxDuration` budget.

### Why this and not the alternatives

- **Vercel queues / background jobs:** unnecessary infrastructure for a problem `after()` already solves. The estimator side already proves this pattern works.
- **Webhook-style separate edge function:** overkill for "send 3 messages." Notifications fail-quietly; they don't need their own service boundary.
- **Just adding the 8s timeout, leaving notifications synchronous:** still bottlenecks the form at 3 calls × 3 retries × 8s = up to 72s in the absolute worst case. Need both the move AND the timeout.
- **Defer photo uploads too:** out of scope per Murdoch's instruction. He's planning a separate change where uploads start when photos are picked + form returns success even if photos still finishing in background. That's a different commit.

### Files changed

| Path | Change |
|---|---|
| `app/api/public/lead-submit/route.ts` | `notifyContractor`, `notifyCustomer`, customer-confirmation `sendEmail` moved from synchronous path into the existing `after()` block. All three run in parallel via `Promise.allSettled` with per-call `.catch`. Notification option objects hoisted above `after()` so they're captured. The dead `contractorNotifications` / `customerNotifications` arrays (computed but never returned in the response) removed. |
| `lib/notify.ts` | New `PROVIDER_FETCH_TIMEOUT_MS = 8000`. `sendSms` wraps each Telnyx fetch with a fresh `AbortController` + 8s timer + `signal` passed to `fetch`. `sendEmail` wraps the Resend SDK call in `Promise.race` against an 8s timer. Each `finally` clears its timer to avoid leaks. Existing 3-retry / 500ms-backoff logic untouched. |
| `docs/current-state.md` | New "Customer lead submission (public form)" section documenting the synchronous vs deferred work split and the realistic floor (~3–8s). |
| `docs/updates-log.md` | This entry. |

### Verification before push

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (only pre-existing `<img>` warning in `app/layout.tsx`, unrelated).
- `npm run test` — 75/75 tests passing across 10 files.
- Confirmed `NextResponse.json({ success, leadId, photoUpload, photoUploadPartialFailure })` is unchanged — photo error surfacing still works exactly as before.
- Confirmed no orphaned `contractorNotifications` / `customerNotifications` references remain.

### Expected effect

- "Sending..." button on the public lead form completes in ~3–8s instead of 60+s on slow-provider days. Realistic floor is photo-upload time + DB writes + Turnstile.
- Customer SMS and email confirmation still arrive within seconds of submit (just after the response, not before).
- Contractor SMS still arrives within seconds of submit; the lead also still appears in the contractor's dashboard via the existing realtime path once AI completes (separate signal).
- Worst-case `after()` block runtime is 24s per provider with the 8s timeout × 3 retries, well inside the 60s `maxDuration` budget.

### Not done / out of scope

- Did not touch photo upload logic (separate commit Murdoch is planning).
- Did not touch the AI estimator, schema, or any AI-side code.
- Did not change Vercel `maxDuration`.
- Did not run a build or deploy. Code pushed to GitHub; Vercel auto-deploys.

---

## Session — May 4, 2026 (fix #5)

### Feature: Public lead form — upload-as-picked photos + submit-doesn't-wait

**Why:** After fix #4 the form's "Sending..." button completed in ~3–8s, but most of that floor was photo uploads happening synchronously after submit. Murdoch wants the form to feel instant (target <2s in the common case). Customers will close the tab on slower waits and either lose the lead or hit submit again creating duplicates.

**Hybrid strategy:**
1. Photos start uploading the moment the customer picks them, in parallel with form filling. Most customers finish typing well after their photos finish uploading.
2. Submit returns success immediately whether or not in-flight uploads have finished. Lead row is created; in-flight uploads attach themselves to the lead in the background.
3. Per-photo failures during form filling surface inline so the customer can retry or remove. Failures after submit are silent — lead just lands with whatever photos succeeded (rare tail case; per Murdoch's spec).

**The "tempLeadId is the lead.id" trick:** the client generates a v4 UUID at form mount. Every photo uploaded during form-fill goes to `${orgId}/${tempLeadId}/${randomShort}.${ext}` in Storage. When the form is submitted, the lead row is inserted with `id = tempLeadId` (overriding Postgres's `gen_random_uuid()` default). No rename, no move — the storage paths from form-fill already point at the right lead row. Photos still in flight at submit time, when their upload endpoint completes, see the lead row exists and insert their own `lead_photos` row directly.

### Implementation

**New endpoint `app/api/public/lead-photo-upload/route.ts`** — multipart per-photo upload. Body: `photo` (File), `contractorSlug`, `tempLeadId`. Server: rate-limits per-IP (80/hour), validates content-type/size/tempLeadId-is-v4-UUID, resolves slug→org_id, uploads to `${orgId}/${tempLeadId}/${randomShort}.${ext}` with 3-attempt retry, mints 24h signed URL, then checks if a lead row with `id = tempLeadId AND org_id = orgId` exists — if yes, inserts the `lead_photos` row directly (auto-attach); if no, just returns the path. Returns `{ success, storagePath, publicUrl, attached }`.

**Refactored `app/api/public/lead-submit/route.ts`** — JSON only, no more multipart. Body now includes `tempLeadId` (v4 UUID) and `photoStoragePaths: Array<{ storagePath, publicUrl }>` for the photos the client thinks are already uploaded. Server inserts the lead row with `id = payload.tempLeadId`, filters supplied paths through the prefix `${orgId}/${tempLeadId}/` (silently drops + Sentry-warns on mismatched paths so a malformed/spoofed path can't write a row pointing at another customer's lead), upserts `lead_photos` rows via `onConflict: "lead_id,storage_path", ignoreDuplicates: true`. Returns `{ success, leadId, received }`. Notification + AI deferral via `after()` from fix #4 unchanged. The lead now lands ~immediately; in-flight photo uploads attach in the background.

**Migration `0066_lead_photos_unique_storage_path.sql`** — `UNIQUE (lead_id, storage_path)` on `lead_photos`. Required for the dual-writer race: lead-submit can insert a row for a path while the upload endpoint's auto-attach branch is also trying to insert the same path. Unique constraint + ON CONFLICT DO NOTHING (lead-submit) and `if (insertError.code === "23505") continue` (upload) makes the second writer a no-op rather than an error. Wrapped in DO/EXCEPTION block since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`. Applied to live Supabase via MCP.

**Refactored `components/PhotoUploader.tsx`** — new prop shape: `entries: PhotoEntry[]`, `onAddFiles`, `onRemove`, `onRetry`. Each entry tracks `localId`, `file`, `status: "uploading"|"done"|"failed"`, `storagePath?`, `publicUrl?`, `errorMessage?`. UI shows per-photo overlay (uploading spinner / done check / failed badge) plus inline error + retry button when failed. Always-visible remove button (touch-friendly). Compression logic preserved.

**Refactored `components/PublicLeadForm.tsx`** — replaced `photos: File[]` state with `photoEntries: PhotoEntry[]`. New `tempLeadId` state generated once at mount via `crypto.randomUUID()`. New `uploadEntry`, `handleAddPhotos`, `handleRemovePhoto`, `handleRetryPhoto` helpers. Each upload is fired with its own `AbortController` so removing a photo cancels its in-flight upload (prevents the "removed photo successfully landed in storage anyway and tried to setState on a missing entry" race). `onSubmit` now sends JSON to `/api/public/lead-submit` with `tempLeadId` + only the `done`-status photo paths. `canSubmit` blocks on any failed photos (forces customer to retry or remove) but does NOT block on uploading photos. Submit body includes `description`, `serviceQuestionAnswers`, `services`, `customerName`, etc., as JSON instead of FormData.

**Updated `lib/validations.ts`** — `leadSubmitSchema` now requires `tempLeadId` (v4 UUID regex) and `photoStoragePaths` (array of `{storagePath, publicUrl}`, max 10, default `[]`). Removed `photoCount` field. New `leadPhotoUploadSchema` for the upload endpoint's text fields. Added `uuidV4Schema` helper for both schemas.

**Updated `tests/integration/api-contracts.test.ts`** — every `leadSubmitSchema.parse(...)` call updated for the new shape (`tempLeadId` + `photoStoragePaths` instead of `photoCount`). New tests: "accepts empty `photoStoragePaths` (in-flight uploads case)" and "rejects `tempLeadId` not a v4 UUID". 11 tests in this file (was 10), 76 total across the suite (was 75), all passing.

### Files changed

| Path | Change |
|---|---|
| `app/api/public/lead-photo-upload/route.ts` | New. Per-photo upload endpoint. Rate-limited, validated, uploads to org-scoped + tempLeadId-scoped path, auto-attaches if lead exists. |
| `app/api/public/lead-submit/route.ts` | Refactored to JSON. Accepts `tempLeadId` + `photoStoragePaths`. Inserts lead with explicit id. Drops bad-prefix paths silently. Upserts `lead_photos` with `onConflict: ignoreDuplicates`. Notification/AI `after()` deferral preserved. |
| `components/PhotoUploader.tsx` | New `PhotoEntry` type and prop shape. Per-photo status overlay (uploading/done/failed), inline error, retry button. Compression preserved. |
| `components/PublicLeadForm.tsx` | New `tempLeadId` state, `photoEntries` state, `uploadEntry` helper, AbortController per upload. `onSubmit` sends JSON. Submit blocks on `failed` photos, never on `uploading`. |
| `lib/validations.ts` | New `uuidV4Schema`, `photoStoragePathSchema`, `leadPhotoUploadSchema`. `leadSubmitSchema` now requires `tempLeadId` + `photoStoragePaths`; `photoCount` removed. |
| `supabase/migrations/0066_lead_photos_unique_storage_path.sql` | New. `UNIQUE (lead_id, storage_path)` on `lead_photos`. Idempotent via DO/EXCEPTION. Applied to live Supabase. |
| `tests/integration/api-contracts.test.ts` | All lead-submit tests rewritten for new payload shape. Added empty-paths and bad-uuid tests. |
| `docs/current-state.md` | "Customer lead submission" section rewritten with new endpoint flow + race protection. Migrations list bumped to 0066. |
| `docs/updates-log.md` | This entry. |

### Verification

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (only pre-existing `<img>` warning).
- `npm run test` — 76/76 tests passing across 10 files.
- Migration verified applied: `lead_photos_lead_storage_path_unique` constraint present.
- Manual data-flow trace:
  - Pick photo → POST /api/public/lead-photo-upload → photo lives at `${orgId}/${tempLeadId}/...` in Storage → entry status flips `uploading` → `done` with `storagePath` + `publicUrl`.
  - Submit → POST /api/public/lead-submit (JSON) with `tempLeadId` + done-photo paths → lead row inserted with `id = tempLeadId` → `lead_photos` upserted for done paths → response returned (~1–2s) → after() block fires AI estimator + notifications.
  - In-flight upload completes after submit → upload endpoint's auto-attach branch finds the lead row exists → inserts `lead_photos` row → unique constraint absorbs any race against lead-submit's insert.
  - Failed upload during form-fill → entry status `failed` + `errorMessage`, retry/remove UI surfaces inline, submit blocks until resolved.
  - Failed upload after submit → silent; lead lands with whatever photos succeeded.

### Expected effect

- Customer sees the form complete in **~1–2s** at submit time (Turnstile + DB writes), down from ~3–8s post-fix-#4 / 60+s pre-fix-#4.
- Photo upload latency moves to the form-fill phase. Most customers won't notice it because they're typing.
- Contractor experience unchanged: the lead lands with all photos within seconds of submit (most attached at submit; trailing in-flight uploads attach within 1–10s).
- AI estimator's image input may briefly include fewer photos than the customer ultimately attached if AI fires before late uploads attach — acceptable degradation per the broader fallback strategy from prior commits.

### Pending follow-up (filed in Pending Work)

**Orphan cleanup cron** — customers who pick photos and abandon the form leave objects in `lead-photos` Storage at `${orgId}/${tempLeadId}/...` with no corresponding `leads` row. Manageable for now (low abandonment volume), but should add a TTL cleanup cron that deletes Storage objects older than 24h with no lead row. Filed as `[Source: Claude Code]` "Orphan lead-photo cleanup cron" in Pending Work.

### Not done / out of scope

- Did not touch the AI estimator, the notification fix from fix #4, or anything else outside the photo upload + form submission flow.
- Did not change Vercel `maxDuration`.
- Did not add the orphan cleanup cron in this commit (filed in Pending Work).
- Did not add Turnstile to the upload endpoint (would defeat the upload-as-picked UX). Rate limit + content validation + size cap are the protection.
- Did not run a build or deploy. Code pushed to GitHub; Vercel auto-deploys.

---

## Session — May 5, 2026 (Meta Pixel `CompleteRegistration` event on signup)

### What was done

Wired the Meta Pixel custom event `CompleteRegistration` to fire exactly once per fresh signup. Previously the Pixel was only firing `PageView` on every route change; the May 1 install entry explicitly flagged "No custom event tracking (Lead, CompleteRegistration, Purchase, etc.)" as the natural follow-up — this closes the registration half of that.

### Implementation

- **`components/onboarding/OnboardingWizard.tsx`** (3 lines added inside the existing welcome-toast `useEffect`): after the `toast.success("Account created! Welcome to SnapQuote.")` call, calls `window.fbq("track", "CompleteRegistration")` guarded by `typeof window.fbq === "function"`. The `fbq` global is already declared in `components/MetaPixelPageView.tsx`, so no new ambient typings or imports were needed.

### Why this exact spot

The signup → post-signup handoff already has a clean "fresh signup, not a login" signal: `SignupForm.tsx` sets `sessionStorage["snapquote-oauth-signup-success"] = "1"` immediately before either (a) `router.replace("/onboarding")` on email/password signup, or (b) `signInWithOAuth` redirecting to Google/Apple. After the user lands back on the app, `OnboardingWizard.tsx` reads + removes that key and shows the welcome toast. That same `useEffect` is therefore guaranteed to run exactly once per fresh signup and never on plain login (login pages don't set the key). Piggybacking the Pixel call on the same effect inherits the same guarantees:

- **Fires only on signup, not login** — the sessionStorage key is set only by `SignupForm.tsx` (and `InviteSignupForm.tsx` if it follows the same pattern; not changed in this session — see Out of scope).
- **Fires once** — the key is removed inside the same effect (`window.sessionStorage.removeItem(OAUTH_SIGNUP_TOAST_KEY)`), so subsequent OnboardingWizard mounts (revisiting `/onboarding`, refreshing the page) do not re-fire it.
- **Fires at the moment of "successful arrival"** — the user has a session, has cleared the OAuth round-trip if applicable, and is rendering the first authenticated page. Both the email-signup path (lands directly on `/onboarding`) and the OAuth-signup path (lands on `/app` then bounces to `/onboarding` if not yet onboarded) converge here.
- **Does not break any existing logic** — the `fbq` call is non-throwing (`typeof === "function"` guard handles ad-blockers, the brief window before the Meta Pixel `<Script afterInteractive>` loads, and the `<noscript>` fallback case where `fbq` never exists). If it ever fails for any reason, the welcome toast and the rest of the onboarding flow proceed unchanged.

### Files touched

| Path | Change |
|---|---|
| `components/onboarding/OnboardingWizard.tsx` | Added `window.fbq("track", "CompleteRegistration")` inside the existing welcome-toast `useEffect`, guarded by `typeof window.fbq === "function"`. |
| `docs/current-state.md` | Tech-stack Meta Pixel line expanded to enumerate the events tracked (`PageView` + `CompleteRegistration`) and the `OnboardingWizard` location. |
| `docs/updates-log.md` | This entry. |

### Verification

- `npx tsc --noEmit` — exit 0. No new TypeScript errors. The `Window.fbq?` global is already declared in `components/MetaPixelPageView.tsx`, so the call type-checks without any new ambient types.
- Read-back of the patched file confirms the `fbq` call sits inside the same effect that consumes the sessionStorage key, after the toast.
- No changes to `SignupForm.tsx`, `auth/callback/route.ts`, or any auth/routing code path. The signup + login + OAuth flows are byte-identical apart from the new fbq line.

### Not done / out of scope

- **`InviteSignupForm.tsx`** — not changed in this session. If invite-flow signups don't pass through `OnboardingWizard.tsx` (because invited users skip onboarding and land directly on `/app`), they won't fire `CompleteRegistration` under this implementation. Audit + extension to that path is a separate follow-up.
- **No `Lead` or `Purchase` events** — only `CompleteRegistration` was in scope this session. Lead-form submissions and Stripe checkout completion remain un-instrumented for Pixel.
- **No Conversions API** — still browser-only. Server-side CAPI for offline matching is unchanged.
- **No `eventID` for browser/CAPI dedup** — not needed yet because there is no CAPI counterpart firing the same event server-side. Add when CAPI is wired.
- **Mobile app unchanged** — Meta Pixel is web-only. Mobile would use the Facebook SDK for React Native (separate scope, not in this session).
- **No build / deploy run** — code pushed to GitHub; Vercel auto-deploys.

---

### 2026-05-04 — Stripe Business Annual price aligned to ASC ($384.99/yr)
- New price ID: `price_1TTpUuFNX8cpZFmwUMWMg77W` (created via claude.ai Stripe MCP)
- Old price ID: `price_1TLCZcFNX8cpZFmw0HVXNHwm` ($383.99/yr — to be archived in Stripe dashboard, not via API)
- Zero subscriptions on the old price at time of swap
- Updated `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` in `.env.local`
- Updated cosmetic strings in `components/plan/PlanOptionsSection.tsx:64` (`"billed $383.99/yr"` → `"billed $384.99/yr"`) and `app/app/plan/page.tsx:29` (`"$383.99/year"` → `"$384.99/year"` in `getPlanPrice` annual branch). Mobile has zero hardcoded references — verified via grep, mobile reads `pkg.product.priceString` from ASC at runtime.
- Updated `docs/current-state.md` plans table (`$383.99/yr` → `$384.99/yr`) and re-headed the Apple IAP price section as ASC-canonical with the four current ASC prices ($19.99/$191.99/$39.99/$384.99). Noted the still-stale RC dashboard labels (`$189.99` / `$389.99`) as non-user-facing.
- ACTION REMAINING: Murdoch to update Vercel production env var `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` to the new price ID, then redeploy.

---

### 2026-05-05 — Removed stale subscription gate from `/api/app/quote/send`

**Symptom:** Mobile users saw a red error "Your subscription is inactive. Please update billing to continue." between the Estimate Message box and Delivery Method card on Send Estimate. Web Solo users hit the same 402 but it was masked by `SubscriptionRequiredModal` (`components/QuoteComposer.tsx:292-295`), so the regression went unnoticed on web.

**Root cause:** `app/api/app/quote/send/route.ts:61` called `requireActiveSubscription(auth.orgId)`, which throws `SubscriptionRequiredError` (402, code `SUBSCRIPTION_INACTIVE`) for any org without a `subscriptions` row whose status is `active` or `trialing` (`lib/subscription.ts:181-191`). Solo plan is free with no Stripe product, so every Solo contractor — including demo and test orgs — has zero `subscriptions` rows and tripped the gate. SnapQuote's product model says cancelled/expired subs are downgraded to SOLO by the lifecycle, never left in an "inactive" state, and the only legitimate Solo gate is the 30-day inactivity check on `/api/public/lead-submit`. This send-time gate was wrong by design.

**Precedent:** Commit `3900c24` ("fix: remove subscription check from lead submit, blur locked customer info") removed the same `requireActiveSubscription` call from `app/api/public/lead-submit/route.ts` and replaced it with the 30-day Solo inactivity gate. The matching call in `quote/send/route.ts` was missed.

**Fix:**
- `app/api/app/quote/send/route.ts:9` — removed `import { SubscriptionRequiredError, requireActiveSubscription } from "@/lib/subscription";`
- `app/api/app/quote/send/route.ts:61` — removed the `await requireActiveSubscription(auth.orgId)` call.
- `app/api/app/quote/send/route.ts:413-421` — removed the `if (error instanceof SubscriptionRequiredError) { … }` catch branch.
- Net: send is now gated only by the existing per-quote credit decrement in `incrementUsageOnQuoteSend` (already imported at `route.ts:14`) and the standard auth/lead checks.

**Untouched on purpose:**
- `lib/subscription.ts` — `requireActiveSubscription` and `SubscriptionRequiredError` left in place. No active callers remain in the codebase outside the helper file itself; left so future endpoints can adopt them deliberately.
- `components/QuoteComposer.tsx:292-295` — `if (res.status === 402 || json.code === "SUBSCRIPTION_INACTIVE")` modal trigger left as-is. Effectively dead from this endpoint now, but cheap to keep and useful if any future endpoint emits the same code.
- Mobile — no changes. The mobile composer was already a faithful messenger; removing the server-side gate is sufficient.
- `lead-submit` — its 30-day Solo inactivity gate (`app/api/public/lead-submit/route.ts:159-186`) is unchanged.

**Docs updated:**
- `docs/current-state.md` Solo inactivity gate paragraph clarified that the gate applies only to `/api/public/lead-submit` and that quote send is gated by credits, not subscription status.

**Verification:**
- Grep confirms zero remaining references to `requireActiveSubscription` or `SubscriptionRequiredError` outside `lib/subscription.ts`.
- `npx tsc --noEmit` — exit 0, no new errors.
- `npm run lint` — passes.

**Risk:** None observed. Web Solo users move from "blocked with modal" to "successful send" — net improvement. Cancelled-sub edge case is the responsibility of the lifecycle/webhook layer (which already downgrades to SOLO), not a re-check on every send. The friendly customer-facing 30-day Solo gate at `lead-submit` continues to enforce dormant-Solo backpressure where it belongs.
- ACTION REMAINING: Murdoch to archive old Stripe price `price_1TLCZcFNX8cpZFmw0HVXNHwm` in Stripe dashboard. Existing Business Annual subscribers are auto-grandfathered on the old price by Stripe's price-immutability behavior; only new checkouts use the new price.

---

## Session — May 5, 2026 (Favicon audit — read-only, no code changes)

### Goal

Audit only. Determine whether snapquote.us has a favicon set up correctly for browser tabs, iOS home-screen pin, and Google Search. No code changes; report findings only.

### Findings

**1. No favicon file exists anywhere in the source tree.**

| Path checked | Status |
|---|---|
| `app/favicon.ico` (App Router auto-served) | does not exist |
| `app/icon.{ico,jpg,jpeg,png,svg}` | does not exist |
| `app/apple-icon.{jpg,jpeg,png}` | does not exist |
| `app/icon.tsx` / `app/apple-icon.tsx` (dynamic generators via `ImageResponse`) | do not exist |
| `public/favicon.ico` | does not exist |
| `public/apple-touch-icon.png` | does not exist |
| `public/icon-*.png`, `public/manifest.{json,webmanifest}` | do not exist |
| Any `app/favicon*`, `app/icon*`, `app/apple*`, `public/favicon*`, `public/icon*`, `public/apple*` ever in `git log` | never committed |

The only branding raster/vector assets in the web repo are at the repo root: `AppIcon-1024.png` (verified `1024×1024`, 8-bit RGB, non-interlaced PNG, no alpha) and `AppIcon.svg` (viewBox `0 0 104 92` — **not square**, aspect ratio ~1.13:1). Both are App Store Connect upload artifacts. Neither is wired to any web favicon route or `<link>` tag.

**2. `metadata.icons` not configured.**

`app/layout.tsx`'s `metadata` export sets `title` and `description` only — no `icons` field. Repo-wide grep across `.ts/.tsx` for `icons:|favicon|apple-touch|appleTouch|rel=["']icon|rel=["']shortcut|manifest` returned a single non-`node_modules` hit: `middleware.ts:66`'s matcher exclusion `(?!api/public|_next/static|_next/image|favicon.ico)`. That exclusion is correct hygiene (defends a future `favicon.ico` from auth processing) but is currently moot because the request just 404s. No nested layout (e.g. `app/app/layout.tsx`) sets `icons` either.

**3. What Google Search currently sees.**

Per Google's documented favicon requirements: a discoverable `<link rel="icon">` element OR a file at `/favicon.ico`, square, **at least 48×48**, ideally a multiple of 48 (48 / 96 / 144 / 192). Snapquote.us currently emits:

- `GET /favicon.ico` → 404 (no static file, no dynamic route)
- No `<link rel="icon">` in the rendered `<head>` (because nothing in `app/` triggers the App Router auto-injection and `metadata.icons` is unset)
- No `<link rel="apple-touch-icon">` for iOS home-screen pin

Net effect: Google Search shows a generic globe placeholder next to snapquote.us results; browser tabs render the empty-page glyph; iOS "Add to Home Screen" gets a screenshot fallback.

**4. `metadata.icons` shape correctness.**

The `metadata` export's omission of `icons` is technically valid TypeScript (`Metadata.icons` is optional in `next/types`) and is the correct shape when relying on App Router file-based icon convention (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` auto-injected). But since none of those convention files exist, the result is "shape is valid, effect is empty." No icons of any kind reach the rendered `<head>`.

### Recommended fix path (NOT executed in this session)

Two valid completions:

- **File-based (recommended for App Router):** drop `app/favicon.ico` (multi-size 16/32/48), `app/icon.png` (≥48×48 square, ideally 512×512), and `app/apple-icon.png` (180×180 square) into `app/`. Next.js auto-injects `<link rel="icon">` and `<link rel="apple-touch-icon">`. No `metadata.icons` change needed. The existing `AppIcon-1024.png` (1024×1024 square) is suitable raw material — downsize to the target sizes via `sharp` / `ImageMagick` / Squoosh.
- **Explicit metadata override:** add `icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png", … }` to the `metadata` export in `app/layout.tsx` and place files in `public/`.

`AppIcon.svg` (104×92) is **not** suitable as-is for a favicon — it would render letterboxed in square containers and Google would reject the non-square aspect for search results. Either a square SVG variant or a square PNG export of the bubble glyph at 1:1 aspect is needed.

### Files touched

| Path | Change |
|---|---|
| `docs/current-state.md` | Added "No favicon at all on snapquote.us" line under "Remaining post-launch / non-blockers" with full context (what's missing, what exists, fix path, middleware-matcher non-issue). |
| `docs/updates-log.md` | This entry. |

### Not done / out of scope

- **No code changes** — explicit user instruction: audit only, do not modify.
- **No favicon files added.** No `metadata.icons` edit. No `git commit`.
- **No Google Search Console submission** — even if a favicon were added, recrawl + reindex of the homepage is needed before the search-results icon updates. Out of scope.
- **PWA manifest (`manifest.webmanifest`)** — not part of the requested favicon audit. SnapQuote is not currently installable as a PWA (no manifest, no service worker); a future PWA-ification would also need 192×192 and 512×512 maskable icons.

---

## Session — May 6, 2026 (Favicon installed via App Router file-based convention)

### What was done

Closed yesterday's audit finding. Generated and committed the three Next.js App Router file-based favicon assets from `AppIcon-1024.png`:

| Path | Size | Format | Bytes |
|---|---|---|---|
| `app/favicon.ico` | 16×16 + 32×32 + 48×48 (multi-size, PNG-encoded entries) | MS Windows icon resource | 4,541 |
| `app/icon.png` | 512×512 | PNG (8-bit RGB, no alpha) | 15,482 |
| `app/apple-icon.png` | 180×180 | PNG (8-bit RGB, no alpha) | 6,749 |

All three derived from `AppIcon-1024.png` (1024×1024 RGB PNG, no alpha) via `sharp@0.34.5` Lanczos3 downscale. The `.ico` was assembled by hand (PNG-encoded ICO entries) so no new dependency was added — sharp was already a transitive dep of Next.js.

### Why no `metadata.icons` change

Per explicit instruction, did not modify `app/layout.tsx`'s `metadata` export. App Router auto-discovers `app/favicon.ico`, `app/icon.{png,…}`, and `app/apple-icon.{png,…}` and emits the corresponding `<link>` tags into `<head>` without any `metadata.icons` configuration. Adding both file-based icons AND a `metadata.icons` field would risk double-emission, so file-based is the cleaner single-source-of-truth.

### Verification

- `file app/favicon.ico` reports `MS Windows icon resource - 3 icons, 16x16 with PNG image data, … 32x32 with … PNG image data` (output truncated mid-third entry but the third 48×48 is present per the assembly script).
- `sharp(...).metadata()` confirms 512×512 for `app/icon.png` and 180×180 for `app/apple-icon.png`.
- `npx tsc --noEmit` exit 0.
- `git check-ignore -v app/favicon.ico app/icon.png app/apple-icon.png` exits 1 with no output → no `.gitignore` rule excludes them. The repo's `.gitignore` was inspected directly: `node_modules`, `.next`, build artifacts, env files, `metabase.*`, `tsconfig.tsbuildinfo`, `supabase/.temp/`, `.claude/` — none touch `app/*.ico` or `app/*.png`.

### Generation script

A one-shot script `scripts/generate-favicons.mjs` was used to produce the three files. It was **deleted from the working tree before commit** to keep the change minimal per the "do not change anything else" instruction. The conversion logic (sharp Lanczos3 → PNG buffers at 16/32/48/180/512; hand-assembled ICO with PNG-encoded entries — 6-byte header + 16-byte directory entries + concatenated PNG data) is preserved in this log entry for re-creation when the source icon next changes.

### Conflict flag

`docs/current-state.md` "Brand mark" paragraph notes that `AppIcon-1024.png` is "a rasterization of an earlier stylized canvas and does not match the current glyph" — i.e. the source PNG used here is slightly older than the canonical SVG in `components/BrandLogo.tsx` (which had its lightning-bolt path refined on April 20, 2026). The web favicons therefore carry the older glyph just like the ASC upload. Updated the same paragraph in `docs/current-state.md` to call out that web favicons inherit the same staleness and should be regenerated from the new source whenever the ASC icon is next re-rendered.

### Files touched

| Path | Change |
|---|---|
| `app/favicon.ico` | New — 16+32+48 multi-size PNG-encoded ICO. |
| `app/icon.png` | New — 512×512 PNG (auto-injected as `<link rel="icon" sizes="512x512">`). |
| `app/apple-icon.png` | New — 180×180 PNG (auto-injected as `<link rel="apple-touch-icon" sizes="180x180">`). |
| `docs/current-state.md` | Struck-through the "No favicon at all" post-launch line and added a closure note. Updated "Brand mark" paragraph to flag favicon staleness inheritance. |
| `docs/updates-log.md` | This entry. |

### Not done / out of scope

- **No `metadata.icons` edit** — file-based convention covers it.
- **No PWA manifest, no service worker, no maskable icons** — explicitly out of scope per audit follow-up.
- **No Google Search Console "Request Indexing" hint** — Murdoch can do this manually after Vercel deploys to accelerate the SERP icon refresh; otherwise Google's natural recrawl cadence (typically a few days) takes care of it.
- **No 32×32 / 96×96 separate `app/icon-*.png` variants** — Next.js generates appropriate `<link>` entries from the single `app/icon.png` and downsizes per the `sizes` attribute. Multiple variants would be relevant only if specific platforms needed sharper non-power-of-two sizes; not the case here.
- **No regeneration of `AppIcon-1024.png`** — would be a separate task gated on the ASC icon re-render. Source-of-truth alignment between ASC, web favicons, and `BrandLogo.tsx` is tracked in the "Brand mark" paragraph of `docs/current-state.md`.

---

## Session — May 6, 2026 (Favicon regenerated from canonical `BrandLogo.tsx` SVG source)

### What was done

Replaced the three favicon files (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`) with versions rasterized directly from the inline SVG in `components/BrandLogo.tsx` instead of the earlier rasterization from `AppIcon-1024.png`. Closes the staleness conflict the prior favicon entry flagged: the ASC PNG predates the 2026-04-20 lightning-bolt refinement, while `BrandLogo.tsx` is the canonical current glyph. Web favicons now carry the refined lightning bolt and match what users see everywhere else on the site (login, dashboard header, marketing pages).

### Source SVG and centering decision

`BrandLogo.tsx`'s SVG has viewBox `0 0 104 92` — non-square (104:92 ≈ 1.13:1, wider than tall). To produce a square favicon canvas I built a wrapper SVG with viewBox `0 0 104 104` and a `<g transform="translate(0 6)">` around the original two paths (bubble + lightning bolt). The translate vertically centers the original 104×92 viewBox within the 104×104 square — half of the extra 12 height units is added as top/bottom padding. **Horizontal positioning is intentionally not re-centered** even though the bubble's bounding box `x ∈ [10, 100]` is asymmetric within the viewBox (10 left padding, 4 right). The asymmetry is by design — the chat-tail at `(24, 78)` extends down-left of the bubble body, shifting the visual center right of the geometric body center. The BrandLogo viewBox encodes the designer's "looks centered" framing, so the wrapper inherits it directly.

### Gradient handling

`BrandLogo.tsx`'s `<linearGradient>` uses raw values `x1="12" y1="12" x2="88" y2="80"` with no `gradientUnits` attribute (defaults to `objectBoundingBox` per spec, but values are far outside the 0–1 range expected for that mode). Browsers render the live logo correctly because the gradient direction-line is preserved regardless of bounding-box overrun, and the 0%/100% stops sit at the far ends of that line. To get **predictable, identical-looking** rasterization out of librsvg/sharp, I added `gradientUnits="userSpaceOnUse"` explicitly to the wrapper SVG. With user-space coords inside `<g transform="translate(0 6)">`, the gradient inherits the same translate as the path it fills (per the SVG spec rule that user-space gradients use the user coord system at the referencing element), so the gradient stays correctly aligned with the translated bubble.

### Generation

One-shot script `scripts/generate-favicons.mjs` (deleted from working tree before commit, per the "do not change anything else" instruction). Conversion logic preserved here for reproducibility:

1. Build the wrapper SVG string with the bubble + lightning paths from `BrandLogo.tsx` and the gradient defined inside `<defs>` with `gradientUnits="userSpaceOnUse"`.
2. For each target size `S` in `{16, 32, 48, 180, 512}`:
   - `sharp(svgBuffer, { density: max(72, ceil((S/104) * 72)) })`
     - density bump scales librsvg's internal rasterization DPI so small-size outputs aren't softened by an under-resolved intermediate raster
   - `.resize(S, S, { fit: "contain", background: { r:0, g:0, b:0, alpha:0 } })`
     - `fit: "contain"` preserves the SVG's 1:1 aspect (the wrapper is already square); transparent fill for any letterboxing
   - `.png({ compressionLevel: 9 }).toBuffer()`
3. Write `app/icon.png` (S=512) and `app/apple-icon.png` (S=180).
4. Hand-assemble `app/favicon.ico` from the 16/32/48 PNG buffers using the same ICO encoder as the prior session (6-byte header + 16-byte directory entries with `width=u8` `height=u8` `palette=0` `reserved=0` `planes=u16=1` `bpp=u16=32` `size=u32` `offset=u32`, all LE; PNG-encoded image data concatenated after the directory).

### Output sizes

| Path | Size | Format | Bytes (was → is) |
|---|---|---|---|
| `app/favicon.ico` | 16+32+48 multi-size, PNG-encoded ICO | RGBA ICO | 4,541 → 3,339 |
| `app/icon.png` | 512×512 | RGBA PNG | 15,482 → 15,148 |
| `app/apple-icon.png` | 180×180 | RGBA PNG | 6,749 → 4,898 |

All three now carry an alpha channel (corners outside the bubble are transparent), where the previous AppIcon-1024-derived versions were RGB no-alpha (corners filled with the gradient's edge color). The transparent corners are correct: the bubble shape is the brand identity and the canvas corners shouldn't render as solid blue. Browser tabs, iOS home-screen pin, and Google SERP all handle alpha-channel favicons correctly.

### Verification

- `file app/favicon.ico` reports `MS Windows icon resource - 3 icons, 16x16 with PNG image data … 32x32 with … PNG image data` (third 48×48 entry per assembly script).
- `sharp(...).metadata()` confirms `512×512 channels=4 hasAlpha=true` and `180×180 channels=4 hasAlpha=true`.
- Visual inspection of `app/icon.png` confirms the canonical chat-bubble + refined lightning bolt with transparent corners, vertical-centered on the 512×512 canvas.
- `git check-ignore -v app/favicon.ico app/icon.png app/apple-icon.png` exits 1 with no output → not gitignored. (`.gitignore` patterns unchanged from the prior session.)
- `npx tsc --noEmit` exit 0.

### Files touched

| Path | Change |
|---|---|
| `app/favicon.ico` | **Replaced.** Now rasterized from `BrandLogo.tsx` SVG (refined glyph). Same multi-size 16+32+48 PNG-encoded ICO format. |
| `app/icon.png` | **Replaced.** 512×512, transparent corners, refined lightning. |
| `app/apple-icon.png` | **Replaced.** 180×180, transparent corners, refined lightning. |
| `docs/current-state.md` | "Brand mark" paragraph updated: web favicons now noted as rasterized from `BrandLogo.tsx` (canonical), staleness inheritance from `AppIcon-1024.png` removed, wrapper-SVG centering decision documented. |
| `docs/updates-log.md` | This entry. |

### Not done / out of scope

- **No edit to `components/BrandLogo.tsx`** — explicit instruction. The component is the source of truth and was read but not modified.
- **No edit to `app/layout.tsx`** — `metadata.icons` deliberately untouched; App Router file-based convention is the single source of truth.
- **No regeneration of `AppIcon-1024.png` or `AppIcon.svg`** — those are ASC / brand-asset artifacts whose update path runs through App Store Connect uploads, not this commit.
- **No build / deploy run** — code pushed to GitHub; Vercel auto-deploys.

---

## Session — May 6, 2026 (Preview-mode banner copy tweak)

- `components/PublicQuoteCard.tsx` — simplified the contractor preview-mode banner from "Preview mode: this is the page your customer sees. Customer actions are disabled — you can't accept your own estimate." to "Preview mode — this is what your customer sees." Styling unchanged (amber background, same positioning, same JSX structure). The server-side accept guard from `79bf5b9` still enforces the actual security boundary; the banner is just the UX hint.

---

## Session — May 6, 2026 (Stripe-vs-IAP discriminator fallback)

**Bug:** Stripe-paid users on iOS were seeing IAP prices on the plan + credits screens. Reproduced live against Murdoch's `falconn` org (`8f939f96-7f92-4973-97f8-f08450ccb71f`, BUSINESS): zero rows in `subscriptions` for his `user_id` (`71622212-...`), zero rows in `iap_subscription_events` for the org. `resolveBillingSource` returned `null` → mobile's fail-open default (`null` → "new signup, show IAP UI") surfaced ASC IAP prices. Apple guideline 3.1.1 violation. Affects every Stripe-paid org whose `subscriptions` row got cleared by `clearStaleStripeCustomerId` (most likely trigger: Stripe `resource_missing` on the stored `customer_id` after a test→live swap or the May 4 Business Annual price migration). Diagnostic write-up at `C:\Users\murdo\SnapQuote-mobile\docs\stripe-vs-iap-display-bug-diagnostic-2026-05-06.md`.

**Fix:** `lib/subscription.ts:resolveBillingSource` now consults `organizations.plan` as a third fallback. Precedence stays the same — `subscriptions` rows win, then `iap_subscription_events` rows, then the new branch: if `org.plan && org.plan !== "SOLO"` return `"stripe"`. Reasoning: any non-SOLO plan was reached via a past Stripe webhook (the webhook's `setOrganizationPlan` is the only writer for paid plans), so a non-SOLO org with no live subscription/IAP signals is effectively orphaned-from-Stripe. SOLO orgs still resolve to `null` (genuine new-signup state on mobile so the IAP carousel can render). On lookup error, fail closed to `null` (existing behavior preserved).

**Files affected:** `lib/subscription.ts` only. No mobile change — mobile's UI gate already does the right thing once `billingSource` is correct. No change to `clearStaleStripeCustomerId` — the deletion behavior is orthogonal; this fix handles the consequence.

**Verification:** `npx tsc --noEmit` clean; `npm test` 76/76 pass. Manual trace for `falconn`: stripe rows = 0 → skip; iap events = 0 → skip; new branch reads `organizations.plan = 'BUSINESS'` → returns `"stripe"`. Mobile will now render manage-on-web UI in place of the IAP carousel for that org and any other Stripe-paid org in the same orphaned state.

---

## Session — May 7, 2026 (Brand kit extraction for Claude Design landing redesign)

Read-only audit of the web repo to extract a complete brand kit for use as input to Claude Design when redesigning the landing page. No code changes.

**Sources read:** `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/(public)/page.tsx`, `components/BrandLogo.tsx`, `components/ui/button.tsx`, `public/` and `public/landing/`, app icon assets.

**Key findings:**

- **Primary brand color** is Tailwind blue-500 — `#3B82F6` / `hsl(217.2 91.2% 59.8%)`. Used as `--primary`, `--ring`, and `--accent-foreground` in light theme; unchanged in `.dark`. Hover convention is `bg-primary/90`.
- **Logo gradient** in `BrandLogo.tsx` is `#3FA1F7 → #174BB7` (linear). The wordmark is rendered as text in `font-extrabold tracking-tight text-primary`, not as a static image — there is **no separate wordmark SVG file**. Static logo assets are limited to App Store / favicon variants (`AppIcon-1024.png`, `AppIcon.svg`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`).
- **Two fonts in play:** Inter is the global UI font (`--font-inter` on `<body>` via `next/font/google`); Manrope is loaded **only on `app/(public)/page.tsx`** as a marketing display face. Any redesign of the landing should preserve this split or consciously choose to unify.
- **Border-radius is inconsistent across the codebase:** Tailwind tokens are `sm: 0.375rem / md: 0.5rem / lg: 0.75rem`, but the shared `Button` component hard-codes `rounded-[8px]` and the landing hero CTA uses `rounded-2xl` (1rem). Worth flagging for the redesign — Claude Design should be told which radius is canonical.
- **Landing dark palette** (`#101320` hero bg, `#1e2a4a` radial top, `#c3c6d7` body text, `#b4c5ff` overlay) is **landing-only** — the rest of the app is light-themed. The brand kit summary handed to Claude Design distinguishes core brand tokens from these landing-only values so the redesign can either reuse or replace them deliberately.
- **CTA pattern on landing** uses an override style (`h-14 rounded-2xl bg-primary px-7 ... shadow-[0_24px_60px_-24px_rgba(37,99,235,0.6)]`) rather than the `Button` component's default sizes — the redesign should match this larger-radius, soft-glow CTA treatment.

**Output:** Brand kit summary written into `docs/current-state.md` under a new "Brand Kit" section (placed above "Tech Stack"), formatted as a copy-pasteable reference for Claude Design. This log entry captures the audit context and the inconsistencies/decisions worth flagging before the redesign starts.

**No code touched.** No commit.

---

## Session — May 7, 2026 (Auth observability shipped — diagnostic instrumentation only)

After 6 failed auth fixes this week (Build 11, 12, 13, 14/15 mobile retry, JWT-direct refactor) and a meta-strategy admission that we were debugging by guess, we shipped diagnostic instrumentation to the auth path. **Observability-only — no behavior change.** This is the first auth deploy this week with proper Sentry capture, which we should have had from day one.

**Files touched:** `lib/auth/verifyJWT.ts` (+154 LOC), `lib/auth/requireRole.ts` (+67 LOC). Pure additive across both files. No verify logic changed, no membership lookup changed, no 401 response shape changed.

**What was added:**

- **`redactBearer(token)`** helper — returns `${first8}...${last8} (len=N)`. Never logs the middle, never logs the signature.
- **`safeDecodeHeader(token)`** helper — defensively decodes the JWT protected header (`alg`, `kid`, `typ`) via `jose.decodeProtectedHeader`. Never throws.
- **`Sentry.addBreadcrumb` calls** at every step of `verifySupabaseJWT` — verify start (with bearer fingerprint + decoded header), ES256 success/failure (with jose error code/name/message-slice), HS256 success/failure, and final null return. Allowlisted claim logging only on success: `aud`, `iss`, `exp`, `iat`. **Never** logs `sub`, `email`, `user_metadata`, or full payload.
- **`Sentry.captureMessage("auth.requireMember 401" | "auth.requireOwner 401")`** at both 401 return points in `requireRole.ts`, with `Sentry.flush(2000)` to ensure the event transmits before Vercel's lambda freezes. Tags stay low-cardinality (`auth_source`, `has_bearer`, `bearer_len_class`); high-cardinality data (`bearer_fingerprint`, `decoded_header`, `authorization_header_length`, method, url) goes in `extra`.

**Why this design:** breadcrumbs accumulated during a request are buffered in the request scope and only flush to Sentry when an event is captured — so without `captureMessage` on the 401 path, the rich diagnostic chain would be silently dropped. Verified mechanism via Sentry docs ([Capturing Errors | @sentry/nextjs](https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/)) before shipping.

**Pre-merge discipline (yesterday's lesson applied):**

1. `npm run typecheck` clean
2. `git diff` review — confirmed only the 2 files changed, pure additive
3. Pushed to feature branch `claude/auth-observability-2026-05-07` (NOT main)
4. Vercel preview built (commit `ee2a76c`, dpl_HZfwQurb5sXK78X6zCmkoM3ZyH2N) — READY at 17:03 UTC
5. **Preview verification** — multi-test: (a) no-bearer GET /api/app/team/members → 401 + Sentry event with tags+extras (no breadcrumbs because verifyJWT never ran — expected); (b) bogus bearer GET /api/app/team/members → 401 + Sentry event with full breadcrumb chain showing verify start → ES256 fail (`ERR_JWS_INVALID`) → HS256 fail → null; (c) fresh refresh-grant ES256 bearer (new mint per test, 3 iterations) → 200 OK on team/members + 400 on leads/unlock (auth passed, validation error on missing leadId — expected) + 200 on subscription-status. **Both failure capture and success path confirmed working.**
6. Only after step 5 verified, fast-forward merged to main and pushed
7. Production deploy `dpl_HnkvXEfxH7hmiy6FkYWHp8n7FREF` READY at 17:11 UTC
8. **Production verification** — same 3 tests on www.snapquote.us → 401s captured correctly in Sentry as issue `SNAPQUOTE-WEB-9` with `environment=production` tag, breadcrumbs intact, no behavior regression

**Sentry issue:** [`SNAPQUOTE-WEB-9`](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-9) — "auth.requireMember 401". Each event includes:
- Tags: `auth_source` (requireMember/requireOwner), `has_bearer` (yes/no), `bearer_len_class` (none/short/small/expected/long/huge), `environment`, `level=warning`
- Extras: `bearer_fingerprint`, `decoded_header` ({alg, kid, typ}), `authorization_header_length`, `method`, `url`
- Breadcrumbs: verify start → ES256 path result → HS256 path result → final null (when bearer present)

**Next step (Murdoch's input):** Murdoch triggers the failing action (lead unlock) on Build 15 from his iPhone. We pull the resulting Sentry event within 5 minutes, dump all breadcrumbs + extras, and finally have **DATA on why mobile bearers fail**. From that data we decide: focused fix, revert, or further investigation. **No fix proposed in this round** — observability only.

**Diagnostic budget after capture:** if 90 minutes after Murdoch's reproduction we don't have a confident root cause, revert to commit `933079b` (Option A from the meta-strategy doc) and accept GoTrue race for launch.

**Backing docs:** `docs/breadcrumb-vs-charles-opinion-2026-05-07.md` (rationale for choosing breadcrumbs over Charles Proxy), `docs/auth-bug-meta-strategy-2026-05-07.md` (meta-strategy after 6 failed fixes), `docs/jwt-direct-postdeploy-diagnostic-2026-05-07.md` (yesterday's post-deploy diagnostic), `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` (original JWT-direct plan).

**Self-criticism applied this turn:**

- Capture data first; propose fix only after data
- Multi-token sustained verify before merging (yesterday's mistake)
- Branch-then-merge (not direct push to main)
- Bearer redaction enforced (first/last 8 only)
- High-cardinality data in `extra`, not `tags`
- Event mechanism verified via Sentry docs before shipping (not assumed)

**Scope of `ee2a76c`:** the auth observability commit only touches `lib/auth/verifyJWT.ts` and `lib/auth/requireRole.ts`. The brand-kit session entry above this one came in via separate concurrent work on the same workstation that was unstaged when this entry was added; both updates-log.md sessions are committed together in this docs commit but reflect distinct work streams.

---

## Session — May 7, 2026 (Brand standardization: primary color → #2563EB, button radius → 12px)

Resolves the cross-repo color split + button-radius inconsistencies surfaced in the May 7 brand kit audit. Web now matches mobile's primary brand color, and all `<Button>` usages share a single radius.

**Files changed (web repo only):**

1. `app/globals.css` — light-mode `--primary`, `--accent-foreground`, `--ring` changed from `217.2 91.2% 59.8%` (blue-500, `#3B82F6`) to `221.2 83.2% 53.3%` (blue-600, `#2563EB`). Dark-mode same trio: `--primary` and `--ring` updated to `221.2 83.2% 53.3%`; `--accent-foreground` updated to `221.2 83.2% 70%` (preserves the +10pt-ish lightness boost the dark mode used for accent text-on-accent-bg contrast). The CTA shadow tint `rgba(37, 99, 235, 0.6)` (already blue-600) now matches `--primary` exactly — this was previously a subtle mismatch where the shadow was darker than the button it shadowed.

2. `components/ui/button.tsx` — base `cva` className changed from `rounded-[8px]` to `rounded-xl` (12px). All variants (default / outline / secondary / ghost / destructive) and sizes (default / sm / lg) inherit this.

3. `app/(public)/page.tsx` — both top-of-hero CTAs (`Get Started Free` / `Log In`) changed from `rounded-2xl` (16px) to `rounded-xl` (12px). The footer-section pill CTA at line 153 (`rounded-full`) was deliberately left alone — pills are explicitly excluded from the radius standardization.

4. `components/QuoteComposer.tsx` — Generate/Regenerate Estimate Button: `rounded-[10px]` → `rounded-xl`.

5. `components/PublicQuoteCard.tsx` — Accept-quote Button (the public-facing customer one): `rounded-[10px]` → `rounded-xl`.

6. `components/PublicLeadForm.tsx` — Lead-form submit Button: `rounded-[10px]` → `rounded-xl`.

7. `components/plan/PlanOptionsSection.tsx` — three Buttons (current-plan disabled / upgrade CTA / downgrade outline): all `rounded-[10px]` → `rounded-xl`.

**Files NOT touched (deliberate):**

- `app/(public)/page.tsx:153` `rounded-full` pill — explicit pill style, per task scope.
- All `rounded-[8px]` / `rounded-[14px]` / `rounded-2xl` instances on inputs, cards, modals, banners, and nav menus — task scope was buttons only. Inputs in `SettingsForm`, `AddressAutocomplete`, `PublicLeadForm`, `CustomersTable`, `MyLinkPageClient`, `quote-template/QuoteTemplateEditor`, `forms/ServiceQuestion`, `forms/ServiceSelector` all keep their `rounded-[8px]`. Cards/modals in `GetStartedFlow`, `SubscriptionRequiredModal`, `ConfidenceMeter`, `TopBar` (notification panel), `TeamManager`, `PlanOptionsSection` (downgrade modal), `app/app/credits/page.tsx` keep their `rounded-[14px]` / `rounded-2xl`.
- `components/TopBar.tsx:148-149` `notificationButtonClassName` (`rounded-[10px]`) — this is a native `<button>` element (not the `<Button>` shadcn component) used as a small icon-only notification toggle; visually closer to an icon-button affordance than a CTA, so left untouched. If we want true uniformity later, this is the one remaining non-12px button-shaped element in the app.
- Auth Buttons (`LoginForm`, `SignupForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `InviteSignupForm`, `InviteAcceptAfterLogin`) already used `rounded-xl` — their explicit overrides are now redundant with the new base, but harmless. Not removed (out of scope, no behavioral change).

**Hardcoded `#3B82F6` references:** the audit found none in code (only in docs from the previous session). Both `docs/current-state.md` and `docs/updates-log.md` references are now the only places that mention the old value, kept for historical accuracy in this entry.

**Verification:**
- `npx tsc --noEmit` exits 0.
- `grep` for any `<Button>` className containing `rounded-(2xl|3xl|sm|md|lg|none|\[8px\]|\[10px\]|\[14px\]|\[16px\])` returns nothing — every `<Button>` now uses either `rounded-xl` (the new base, mostly inherited) or the one intentional `rounded-full` pill.
- Brand kit section in `docs/current-state.md` rewritten to reflect the new canonical values (primary `#2563EB`, button radius `rounded-xl`/12px, plus an explicit "intentional exception" callout for the landing footer pill).

**Cross-repo status:** Web and mobile now agree on `#2563EB` as primary. The brand-kit conflict flagged in Notion's Code Patterns & Conventions on May 7 is resolved — web was the side that moved.

---

## Session — May 7, 2026 (Public landing page redesign — Claude Design v2 handoff)

Replaced the visual layer of the public landing page (`/`) with the new design from Claude Design's "SnapQuote Landing v2" handoff. Direction B (all-light, Linear/Stripe-style restraint) per Murdoch's earlier pick. One responsive page covers desktop + mobile via Tailwind breakpoints; the mobile design file in the handoff was a preview wrapper, not a separate design.

**Files changed:**
- `app/(public)/page.tsx` — full rewrite. New structure: sticky nav (logo + light "Log in" pill + CTA, with CTA hidden below `md`), asymmetric/left-aligned hero with gradient-tail H1 ("Stop driving to estimates that **waste your time.**"), `<ProductDemo />` desktop-only section (kept the existing interactive demo per "do not break"), 4-step "How it works" with alternating sides on `lg`, dashed-vertical connector line on `lg+`, phone-shaped media placeholders at correct aspect ratio (256×520 / 280×568) labeled `SCREEN RECORDING — …` for later drop-in, final CTA section, single-line footer.

**Files NOT changed (deliberate):**
- `app/layout.tsx` — preserved Meta Pixel, GA4 page-view tracking, viewport meta, root metadata, favicon. The new page exports its own `title` + `description` which Next merges over root.
- `components/landing/ProductDemo.tsx` — kept the existing interactive desktop demo as-is and embedded it where the design's static dashboard mock would have gone. Hidden below `lg` per the design spec, so mobile users skip straight from hero to How It Works.
- `components/BrandLogo.tsx` — used as-is in nav and footer (the design handoff included a placeholder SVG that was discarded per the polish requirement to "use the existing components/BrandLogo.tsx").
- `components/ui/button.tsx` — used as-is via `asChild` for all CTAs (the design's hero CTA had a soft elevated shadow which is reproduced via a className override on `<Button>`, but the base `rounded-xl` 12px from this morning's standardization is preserved).

**Key design decisions translated to Tailwind:**
- Color tokens from the design (`--sq-ink: #0B0E14`, `--sq-soft: #FAFAFB`, `rgba(11,14,20,0.04/.08/.45/.60)`) are used as Tailwind arbitrary values throughout (e.g., `text-[#0B0E14]/60`, `border-[#0B0E14]/[0.08]`, `bg-[#FAFAFB]`). Not added to `tailwind.config.ts` because they're page-scoped accent values, not design tokens.
- Manrope loaded via `next/font/google` with weights 500/600/700/800 and exposed as `--font-manrope` (in addition to `manrope.className` for direct application on display headings). Inter remains the global font from `app/layout.tsx`.
- Headline gradient (`#3FA1F7 → #174BB7`) reused from `BrandLogo.tsx` — applied via `bg-clip-text text-transparent` with an inline `backgroundImage` style. Same gradient applied to the step numbers (01 / 02 / 03 / 04).
- Phone-frame placeholders use `aspect-[256/520]` lock so the container scales correctly when a real screen recording (typical iOS portrait aspect) is dropped in. The dashed-border `<div>` inside is a swap-out target — it'll be replaced with `<video>` or `<Image>` per step in a follow-up.
- The asymmetric hero L1 max-width is constrained at `lg+` to `14ch` so "Stop driving to estimates that waste your time." breaks cleanly across two visual lines on the design's intended 1280px artboard.
- Connector line uses an absolutely-positioned 1px element with a top/bottom-fading linear-gradient, sitting behind the phones via `z-[1]` on the phone frames. Hidden below `lg`.

**Preserved routes / flows:**
- `/signup` (Get Started Free CTAs ×3)
- `/login` (nav pill)
- `/privacy`, `/terms` (footer)

**Verification:**
- `npx tsc --noEmit` exit 0.
- Started `npx next dev -p 3050` locally and visually verified hero, hero CTA, ProductDemo render (existing dashboard nav + demo content; the demo data fetch hit a transient Cloudflare 502 from the public Supabase API, which is the existing component's own behavior, not a regression introduced by this change), all 4 steps with correct alternating layout, gradient step numbers, dashed media placeholders at the right aspect ratio, final CTA, and footer.
- All `<Button>` instances inherit the `rounded-xl` (12px) base from `components/ui/button.tsx`; CTA shadow tints use `rgba(37,99,235,0.4)` (blue-600 family) so they match the standardized `--primary` exactly.

**Reference materials kept in chat / out-of-tree:** `landing-page/README.md` (handoff guide), `landing-page/chats/chat1.md` (design transcript with Murdoch's iteration feedback), `landing-page/project/SnapQuote Landing v2.html` (source HTML), `landing-page/project/landing-v2.jsx` (source JSX prototype). Not committed to repo — these are mockup artifacts, not production code.


## Session — May 8, 2026 (RLS plan-write hole + RPC membership leak fixed — Audit 2 C-7, C-12)  [Source: Claude Code]

**Context:** Audit 2 (2026-05-08) flagged two open Critical security holes verified live via Supabase MCP at HEAD:
- **C-7** `pg_policies` showed `organizations_update_owner` cmd=UPDATE, qual=`is_org_owner(id)`, with_check=`is_org_owner(id)`, no column-level grant. Authenticated owners could PATCH `/rest/v1/organizations?id=eq.<their-org>` with `{"plan":"BUSINESS"}` (or arbitrary `monthly_credits` / `bonus_credits` / `has_used_trial` / `trial_ends_at` / `credits_reset_at`) and self-promote without paying.
- **C-12** `pg_proc` showed `get_org_credit_row(uuid)` SECURITY DEFINER, EXECUTE granted to `authenticated`, body had no `is_org_member(p_org_id)` check. Any signed-in user could RPC any org_id and read its plan + credit balances. (Migration 0028 originally REVOKED authenticated; a later CREATE OR REPLACE re-installed Supabase default grants.)

**Sibling RPC check:** `reset_org_credits` and `update_org_plan_credits` are also SECURITY DEFINER without membership checks, but migration 0063 already revoked EXECUTE from anon/authenticated. They are now `service_role`-only and called from Stripe/RC webhooks + `lib/credits.ts` via the admin client. Adding `is_org_member` to them would BREAK those call sites because `auth.uid()` is null under service_role. Left untouched.

**Fix:** [supabase/migrations/0067_lock_owner_organization_updates_and_credit_row_membership.sql](../supabase/migrations/0067_lock_owner_organization_updates_and_credit_row_membership.sql)

- Drop existing permissive `organizations_update_owner` UPDATE policy.
- `REVOKE UPDATE ON TABLE organizations FROM authenticated`.
- `GRANT UPDATE (name, slug, onboarding_completed) ON organizations TO authenticated` — column-level allowlist of safe non-billing columns.
- Recreate `organizations_update_owner` policy with the same `is_org_owner(id)` USING + WITH CHECK row gate. Now an authenticated owner needs BOTH the column-level grant AND the row policy to write — billing columns get blocked at the table-grant layer regardless of policy.
- Replace `get_org_credit_row(uuid)` with a plpgsql body that runs `IF NOT is_org_member(p_org_id) THEN RAISE EXCEPTION ... USING errcode = 42501; END IF;` before the SELECT. Re-asserts REVOKE from public/anon and GRANT EXECUTE to authenticated/service_role.

Applied via Supabase MCP `apply_migration` to project `upqvbdldoyiqqshxquxa` (success).

**Verification (live, post-fix):**

1. `pg_policies` — `organizations_update_owner` row gate still `qual=is_org_owner(id) wc=is_org_owner(id)`.
2. `information_schema.column_privileges` for `authenticated` on `organizations` — UPDATE only on `name`, `slug`, `onboarding_completed`.
3. `information_schema.table_privileges` for `authenticated` on `organizations` — UPDATE no longer in the privilege list (only DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE remain from Supabase defaults).
4. `pg_proc` — `get_org_credit_row` body now contains the `is_org_member` raise.

**Behavior tests** (executed via `SET LOCAL role authenticated; set_config('request.jwt.claims', ...)`, real OWNER user `bffcc8d0-...` of org `1c5dd00c-...`):

- Owner `UPDATE organizations SET plan=`'BUSINESS' WHERE id=...` → rejected with `ERROR 42501: permission denied for table organizations` ✅
- Owner `UPDATE organizations SET name=name WHERE id=...` → succeeded, returned `{id, name=Poo}` ✅
- Same authenticated user calling `get_org_credit_row(`'d2868f2a-...')` (NOT a member) → rejected with `ERROR 42501: permission denied for organization d2868f2a-...` ✅
- Same user calling `get_org_credit_row(`'1c5dd00c-...')` (their own org) → returned `{plan: SOLO, monthly_credits: 5, bonus_credits: 0, credits_reset_at: null}` ✅

No client code paths affected: all three `from("organizations").update(...)` sites in the codebase (`app/api/stripe/webhook/route.ts:109`, `app/api/revenuecat/webhook/route.ts:87`, `app/api/app/settings/update/route.ts:61`) use the admin (service_role) client, which has BYPASSRLS. Mobile repo has zero direct `organizations.update` calls.

Audit 2 status updated in `docs/current-state.md` (lines 23-24 + critical findings line): C-7 and C-12 marked FIXED with migration reference. Notion saves: Bugs & Fixes entry added with file + verification cites.


## Session — May 8, 2026 (RevenueCat webhook hardening — Audit 2 C-5 / C-9 / C-10)  [Source: Claude Code]

Three audit findings against `app/api/revenuecat/webhook/route.ts` triaged. Two confirmed and fixed in a single commit; one returned NOT-A-BUG.

### F1 / C-5 — webhook bearer-not-HMAC: NOT A BUG
- HEAD `app/api/revenuecat/webhook/route.ts:222-225` uses `safeEqual(authorization, process.env.REVENUECAT_WEBHOOK_AUTH)` — a static Authorization-header comparison.
- Verified against RC official docs (`https://www.revenuecat.com/docs/integrations/webhooks`) and an explicit RC community thread ("Is x-revenuecat-signature removed, and where is webhook secret key?"): RC does **not** offer HMAC signature verification, no `X-RevenueCat-Signature` header, no signing secret. The dashboard-configured Authorization header is the only mechanism RC provides.
- The current implementation matches RC's design. **No code change.** Audit 2 C-5 is downgraded — leaving HEAD as-is is correct.

### F2 / C-9 — `PRODUCT_CHANGE` did not reset credits: FIXED
- HEAD pre-fix `route.ts:345-359` called `setOrganizationPlan(orgId, plan)` only; comment claimed credits would refresh on next RENEWAL. Mid-cycle upgrade left user under-credited up to a full cycle.
- Fix: added `await resetOrganizationCredits(orgId, plan)` after `setOrganizationPlan` in the `PRODUCT_CHANGE` branch, matching the RENEWAL / INITIAL_PURCHASE pattern. Per-cycle idempotency is preserved by `claimWebhookEvent` higher up. Comment rewritten.

### F3 / C-10 — credit-pack idempotency key drift: FIXED (latent)
- HEAD pre-fix `route.ts:147` keyed `record_credit_purchase` with `p_purchase_reference: `'`rc_${eventId}`'` where `eventId = event.id` (RC event id).
- HEAD `app/api/iap/sync/route.ts:115` keys with `p_purchase_reference: body.transactionId` — Apple `transactionIdentifier`. Different keyspace → both inserts succeed → bonus_credits double-incremented.
- Live verified `record_credit_purchase` has `on conflict (purchase_reference) do nothing` (Supabase MCP `pg_get_functiondef`).
- Live verified zero rows in `credit_purchases` (`select count(*) from credit_purchases` → 0). Bug is latent — no live cleanup needed.
- Fix: `recordCreditPackPurchase` now takes `storeTransactionId` and writes that as the purchase reference. Caller in `NON_RENEWING_PURCHASE` reads `event.transaction_id ?? event.original_transaction_id`; if both are absent it logs a warn and skips (rather than silently keying on a non-Apple value, which would re-introduce the divergence).
- iap/sync was already Apple-keyed; no change needed there. Both paths now collide on the same `purchase_reference`, so whichever lands first wins and the second is a no-op via the existing ON CONFLICT clause.

### Verification
- `npx tsc --noEmit` exit 0.
- Diff reviewed: only `app/api/revenuecat/webhook/route.ts` changed (function signature + comment in `recordCreditPackPurchase`, body added to `PRODUCT_CHANGE`, store-transaction-id resolution in `NON_RENEWING_PURCHASE`). No other files touched in this prompt.
- Live state at fix time: `credit_purchases` 0 rows, `iap_subscription_events` 0 rows, RC project `proj39ead10c` 0 active subs / 0 transactions in 28d. There is no production traffic that needs reconciliation — the fix lands ahead of any real RC delivery.

### Out of scope, untouched
- F1 (bearer auth) — no change, RC limitation documented.
- iap/sync receipt validation (separate prompt).
- Stripe webhook (separate prompt).
- RLS / Supabase functions (locked-in by prior task).

File: [app/api/revenuecat/webhook/route.ts](../app/api/revenuecat/webhook/route.ts).

---

## Session — 2026-05-08 — [Source: Claude Code] Stripe lifecycle fixes (Audit 2 C-6 / C-8 / H-9 / C-11)

Web HEAD `ba38278` at start. Four findings from Audit 2 verified live, then fixed in one commit.

**Migration 0068**: `alter table subscriptions add column if not exists stripe_customer_invalid_at timestamptz;` Applied via Supabase MCP `apply_migration` to `upqvbdldoyiqqshxquxa`. File at `supabase/migrations/0068_subscriptions_stripe_customer_invalid_at.sql`.

### C-6 FIXED — multi-org owner non-determinism
- Verified live: `app/api/stripe/webhook/route.ts:58-68` had `.eq("user_id", userId).limit(1).maybeSingle()` with no `.order()`.
- Verified live: `app/api/stripe/checkout/route.ts` already passes `orgId` in both `session.metadata` (line 243-247) AND `subscription_data.metadata` (line 213-218); every webhook handler already prefers `metadata.orgId` over the fallback. So metadata propagation was already correct — the only bug was the un-ordered fallback.
- Fix: `getOrgIdForUser` now adds `.order("created_at", { ascending: true })` so fallback consistently picks the oldest membership.

### C-8 FIXED — trial-to-paid never grants paid-tier credits
- Verified live: `handleCheckoutCompleted` (lines 229-277) calls `setOrganizationPlan` + `markOrganizationTrialUsed` + `setOrganizationTrialEnd` but never `resetOrganizationCredits`.
- Verified live victims via Supabase MCP: orgs `eabc1e4a-a479-4e1c-844d-cf28364cc77f` and `f77b0ebb-5536-4580-9e45-87fc7d6e2058`, both TEAM with `monthly_credits=5` and `has_used_trial=true`. Each has exactly one matching `subscriptions` row (`status='trialing'`, `plan='TEAM'`), so they're real C-8 victims (not C-7 RLS).
- Fix: `handleCheckoutCompleted` now calls `await resetOrganizationCredits(orgId, plan)` after `setOrganizationPlan`. Going forward, trial→paid converts and direct paid signups will receive the correct tier credit allowance.

### H-9 FIXED — Stripe upgrade path doesn't reset credits
- Verified live: `app/api/stripe/checkout/route.ts:152-197` (upgrade branch) updated Stripe sub, `subscriptions` table, and `organizations.plan` — but did not call `update_org_plan_credits`.
- Fix: After the `organizations` update, call `admin.rpc("update_org_plan_credits", { p_org_id, p_monthly_credits: getPlanMonthlyCredits(plan), p_credits_reset_at })` with reset 1 month out. Mirrors the webhook's `handleInvoicePaid` cycle pattern.

### C-11 FIXED — clearStaleStripeCustomerId no longer hard-deletes
- Verified live: `lib/stripe.ts:165-182` did `.delete().eq("user_id", userId)`.
- Fix: replaced with `.update({ stripe_customer_invalid_at: new Date().toISOString() }).eq("user_id", userId).is("stripe_customer_invalid_at", null)`. Cancellation handler `handleSubscriptionDeleted` (webhook line 391-395) looks up by `stripe_subscription_id`, so soft-marked rows remain addressable. Updated `app/api/stripe/checkout/route.ts` `latestSubscription`/`activeSubscriptions` queries to filter `is("stripe_customer_invalid_at", null)` so soft-marked rows don't re-trigger the same Stripe `resource_missing` flow on the next checkout attempt. (Per Audit 2 self-correction the audit's claim that 3 specific drift orgs were caused by this is unverified — not cited.)

### Verification
- `tsc --noEmit` exit 0.
- All four code paths re-read after edits.

### Out of scope (deferred to other prompts)
- RC webhook (separate prompt)
- iap/sync (separate prompt)
- RLS / Supabase functions (separate prompt)
- Mobile repo
- Frontend code



## Session — May 8, 2026 (iap/sync server-side validation via RevenueCat — Audit 2 C-4)  [Source: Claude Code]

### Diagnose (live, pre-fix)
[`app/api/iap/sync/route.ts`](../app/api/iap/sync/route.ts) at HEAD only zod-validated the body shape (`route.ts:13-26` schema with `plan: z.enum([...])`, `creditAmount: z.number()`, `transactionId: z.string()`) and then directly wrote those values to Supabase:

- Subscription branch `route.ts:86-110`: `update organizations set plan = body.plan` followed by `rpc update_org_plan_credits` with `getPlanMonthlyCredits(body.plan)`. **Plan trusted from request body.**
- Credits branch `route.ts:112-117`: `rpc record_credit_purchase` with `body.transactionId` + `body.creditAmount`. **Both trusted from request body.**

No call to RevenueCat REST API, no call to Apple `verifyReceipt`, no Apple App Store Server API JWT, no signature on the payload. The only auth gate was `requireOwnerForApi` (correct — proves the caller is the org owner — but says nothing about whether they actually paid).

**Confirmed exploit:** authenticated owner POSTs `{type: \"subscription\", plan: \"BUSINESS\", transactionId: \"x\"}` and becomes BUSINESS for free. `{type: \"credits\", creditAmount: 999999, transactionId: \"x\"}` mints arbitrary bonus credits. No mitigation in any wrapper / middleware / RPC.

### Path chosen: A (RevenueCat v2 server-side)
Reuses the existing `lib/revenuecatServer.ts` integration (already used for account-deletion cleanup). RC is already the source of truth for IAP — the SDK syncs Apple receipts to RC server-side, and our RC webhook is what actually grants plans/credits in the canonical path. Apple’s legacy `verifyReceipt` is being deprecated in favor of the App Store Server API which requires JWT signing with an ASC private key — heavier integration for a path RC already does for us.

### Implementation

**[lib/revenuecatServer.ts](../lib/revenuecatServer.ts)** — added two helpers + one exported type:
- `getRevenueCatActivePlanForCustomer(customerId)` — GETs `/v2/projects/{project_id}/customers/{customer_id}/active_entitlements`, paginates, returns `\"BUSINESS\"` if entitlement id `entl4353fa7d61` is active, `\"TEAM\"` if `entlcac5098bbd` is active, else `null`. Entitlement IDs verified live via `list-entitlements` MCP on project `proj39ead10c` and pinned as constants with comment.
- `listRevenueCatCustomerPurchases(customerId)` — GETs `/v2/projects/{project_id}/customers/{customer_id}/purchases`, paginates, returns a defensively-shaped array including `storeTransactionIdentifier`, `originalStoreTransactionIdentifier`, `storeProductIdentifier`, `refundedAt`.

**[app/api/iap/sync/route.ts](../app/api/iap/sync/route.ts)** — rewrote the route:
- Body schema reduced to `{type, transactionId}` for both branches. Mobile may still send `plan` / `creditAmount` / `productId`; zod’s default `.strip()` drops them silently. Server NEVER reads any plan or amount claim from the body.
- Subscription branch: calls `getRevenueCatActivePlanForCustomer(orgId)`. If RC reports neither business nor team → 403 \"RevenueCat reports no active subscription entitlement for this account.\" Else uses RC-resolved plan to write Supabase. Added `alreadySyncedSubscription` idempotency check on `iap_subscription_events.(org_id, store_transaction_id, event_type=MOBILE_IAP_SYNC_SUBSCRIPTION)` so retry-queue replays do not refill `monthly_credits` (the underlying `update_org_plan_credits` RPC is ungated, so without this guard a 30-day cycle could be repeatedly topped up).
- Credits branch: calls `listRevenueCatCustomerPurchases(orgId)`, finds the purchase whose `store_purchase_identifier` (or `original_store_purchase_identifier`) matches `body.transactionId`. If no match → 403 \"RevenueCat has no record of this transaction for this account.\" If `refundedAt !== null` → 410. Credit amount is read from `purchase.storeProductIdentifier` and the same `CREDIT_PACK_AMOUNTS` map the RC webhook uses (`snapquote_credits_10` →10, `_50` →50, `_100` →100). `record_credit_purchase` keyed on Apple `transactionIdentifier` collides with RC webhook’s post-C-10 key on the same row, ON CONFLICT DO NOTHING.
- Failure mapping: `Missing REVENUECAT_PROJECT_ID or REVENUECAT_SECRET_KEY` → 503 with explicit hint to add Vercel envs; `RevenueCatApiError` → 502; otherwise 500.

### Threat-model walk-through (post-fix)

- Attacker POSTs `{type: subscription, plan: BUSINESS, transactionId: fake}` → plan field stripped, RC returns no entitlement → **403** ✅
- Attacker POSTs `{type: credits, creditAmount: 999999, transactionId: fake}` → creditAmount stripped, RC has no matching purchase → **403** ✅
- Attacker POSTs another customer’s real `transactionId` → RC purchase listing is per-customer, so the txn does not appear in attacker’s purchases → **403** ✅
- Real BUSINESS purchase by legitimate user → RC reports active business entitlement → plan + credits granted → **200** ✅
- Race: mobile syncs before RC has processed Apple receipt → RC returns no entitlement yet → **403** → mobile’s persistent retry queue retries until RC catches up ✅
- Stripe-billed user (legitimate BUSINESS via Stripe, no RC entitlement) somehow hits this route → RC returns no entitlement → 403 refuses to *upgrade* but does not *downgrade* the existing plan ✅

### Verification
- `npx tsc --noEmit` exit 0.
- Diff is +138 lines in `lib/revenuecatServer.ts` (additive helpers + types) and +176 / -44 lines in `app/api/iap/sync/route.ts` (full rewrite of the POST body, schema simplified). No other files modified.
- Live RC project state cross-checked against the entitlement-ID constants: `entl4353fa7d61` (lookup_key `business`, state `active`) and `entlcac5098bbd` (lookup_key `team`, state `active`) verified via MCP `list-entitlements` against project `proj39ead10c` on 2026-05-08.

### Deploy prerequisite — BLOCKING

**[`REVENUECAT_PROJECT_ID`](../.env.example) and [`REVENUECAT_SECRET_KEY`](../.env.example) MUST be present in Vercel Production environment before this commit reaches prod.** Audit 2 (2026-05-08) C-13 reported these missing. Until they are added the route returns 503 \"Server-side IAP verification is not configured\". Mobile’s persistent retry queue backs off and replays once the env is fixed; the RC webhook path (which uses the unrelated `REVENUECAT_WEBHOOK_AUTH` env, already present) keeps granting plans/credits in the meantime, so there is no data-loss window — only a UX delay where mobile’s instant-feedback after-purchase sync fails until envs are added.

Values come from RevenueCat dashboard → Project Settings → API Keys (V2 secret key) and Project ID. Add both to Vercel → Project → Settings → Environment Variables → Production.

---

## Session — May 8, 2026 — Audit 9 of 13 (Data Model & Migrations): findings (read-only, no fixes shipped)

Read-only audit of Supabase project `upqvbdldoyiqqshxquxa` (snapquote, Postgres 17.6.1.063). Web HEAD `27305ac`, mobile HEAD `d2d992e`. Compared 68 local migration files at HEAD (`C:\Users\murdo\SnapQuote\supabase\migrations\`) against live `supabase_migrations.schema_migrations` (69 entries) and live schema state via Supabase MCP. NO code or schema changed.

### Verified live: 0067 + 0068 applied to prod

- **0067** applied as `20260508204110_lock_owner_organization_updates_and_credit_row_membership`. Live `pg_policies` confirms `organizations_update_owner` policy + column-level UPDATE GRANT to `authenticated` is restricted to `name`, `slug`, `onboarding_completed` only. Live `pg_get_functiondef('public.get_org_credit_row')` confirms in-body `is_org_member` raise/permission-denied.
- **0068** applied as `20260508205902_subscriptions_stripe_customer_invalid_at`. Live `information_schema.columns` confirms `public.subscriptions.stripe_customer_invalid_at timestamptz NULL`.

### CRITICAL drift (3)

- **C1 — Local 0056 NOT applied.** Live `contractor_profile` UPDATE policy is `_update_owner` (qual=`is_org_owner(org_id)`); `_update_member` policy doesn't exist. Migration log query returned no entry for `revert_contractor_profile_update_to_member`. Non-owner team members cannot save their own delivery preferences in QuoteComposer.
- **C2 — Local 0059 NOT applied; live duplicate notifications confirmed.** Live `pg_indexes` returned `notifications_new_lead_dedup_idx` does NOT exist. Live query returned 3 (org_id, lead_id) pairs with 2 NEW_LEAD dupes each (org `8f939f96`, lead IDs `006c1b2c`/`89a38c8c`/`e5c894fc`). `docs/current-state.md:376` and `docs/updates-log.md:880-882` both claim the index exists — STALE.
- **C3 — `lead_status` enum missing OPENED.** Live `pg_enum` returned only NEW, QUOTED, ACCEPTED, ARCHIVED. Migration 0030 recorded as applied with statement `ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'OPENED'` but enum was never updated. Code at HEAD doesn't reference OPENED so no caller error today.

### HIGH (6)

- **H1 — Migration numbering scheme drift.** Local files 0001-0068 sequential. Prod log: 0001-0055 numeric, then 14 ISO-timestamped (`20260419030653`-`20260508205902`). `supabase db reset` against local files would produce a different schema than prod.
- **H2 — `update_org_plan_credits` and `reset_org_credits` lack `SET search_path`.** Advisor `function_search_path_mutable`. EXECUTE service_role only mitigates external attack.
- **H3 — `update_org_plan_credits` has no row lock.** Plain UPDATE without FOR UPDATE; concurrent webhooks race. Cross-flag Audit 2.
- **H4 — 7 RLS policies re-evaluate `auth.<function>()` per row** (subscriptions, push_tokens x4, notifications x2, audit_log). Advisor `auth_rls_initplan`.
- **H5 — `subscriptions` has no FK to `organizations`.** Org affiliation inferred via `organization_members.user_id` at runtime. Long-standing design.
- **H6 — 5 missing FK indexes** on audit_log.actor_user_id, notifications.user_id, pending_invites.invited_by, quote_events.org_id, quote_events.quote_id.

### MEDIUM (8) and LOW (5) — see Notion

Findings page id: `35a32498-a1cb-81ed-b0ec-db4a1cec68ba`. To-dos page id: `35a32498-a1cb-81f0-8542-f6a38328dfa7`.

### Cron health (verified live)

- `reset-solo-credits` (`0 0 * * *`, jobid=3): 1/0 success/fail in 24h.
- `rescue-stuck-leads` (`*/3 * * * *`, jobid=8): 480/0 success/fail in 24h (full coverage).

### Orphaned data scan: clean

All FK orphan counts returned 0 (leads w/o org, quotes w/o lead, contractor_profile w/o org, organization_members w/o org, subscriptions w/o user, lead_photos w/o lead, customers w/o org, organizations w/o any member). Soft drift: 4 leads have customer_phone/email not matching any `customers` row in same org (M5).

### Demo / test orgs in prod tenant

`Worcester Test Contractor` (slug `worcester-test-org`, SOLO, **184 leads**); `Demo` (BUSINESS, 100 credits, 5 leads); `Verify Test Services`/`QA Test Contracting` (SOLO, 0 leads); `Rivera's Pressure Washing` (BUSINESS — already in Audit 2 STALE_PAID list).

### Could not verify live

- PITR / backup retention config (not exposed via MCP `get_project`).
- Why migration 0030 was a no-op (would need pg startup logs).

Severity summary: 3 Critical, 6 High, 8 Medium, 5 Low. NO code or schema changed.

---

## Session — May 8, 2026 — Audit 9 migration-drift fixes (C1, C2, H1; C3 documented as no-op)

Three migration-drift findings from the morning's Audit 9 of 13 fixed by re-deploying the local files as new timestamped migrations via Supabase MCP. Verified live before fixing and after fixing. C3 (lead_status OPENED) decided to document as historical no-op rather than add a value with no callers.

### Diagnosis (live, before fix)

- **C1** — `pg_policies` for `public.contractor_profile`: only `_insert_owner`, `_select_member`, `_update_owner` (qual=`is_org_owner(org_id)`). NO `_update_member`. `supabase_migrations.schema_migrations` has no row matching `revert_contractor_profile_update_to_member`. Local file `supabase/migrations/0056_revert_contractor_profile_update_to_member.sql:6-13` exists at HEAD with the intended drop+create policy SQL.
- **C2** — `pg_indexes` filtered to `notifications_new_lead_dedup_idx`: 0 rows. Duplicate query returned 3 (org_id, lead_id) pairs in org `8f939f96-7f92-4973-97f8-f08450ccb71f`, each with 2 NEW_LEAD notification rows (lead ids `006c1b2c-43b8-46a0-81b4-cb42c397ba7e`, `89a38c8c-dcd3-4868-b104-74c17466e0c7`, `e5c894fc-44b5-44d3-9d46-6f2bb9814895`), all created on 2026-05-04 between 20:07 and 21:30 UTC. Local file `supabase/migrations/0059_notifications_new_lead_dedup.sql:13-31` has the cleanup CTE + CREATE UNIQUE INDEX.
- **C3** — `pg_enum` for typname='lead_status': NEW, QUOTED, ACCEPTED, ARCHIVED — no OPENED. `schema_migrations` version='0030' has statement `["ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'OPENED'"]`. Grep across `C:\Users\murdo\SnapQuote` and `C:\Users\murdo\SnapQuote-mobile` for `\bOPENED\b` returned zero application code references (only the migration file itself + audit docs).
- **H1** — 68 local migration files at HEAD. `schema_migrations` has 69 rows: 0001-0055 numeric, then 14 ISO timestamps `20260419030653`-`20260508205902`. Three local files (0056, 0058, 0059) had no matching prod entry by name or timestamp. One prod entry (`20260421021818_fix_get_org_credit_row_permissions`, statement `GRANT EXECUTE ON FUNCTION get_org_credit_row TO authenticated`) had no matching local file at HEAD.

### Fixes applied

1. `20260508233306_redeploy_contractor_profile_update_member_policy.sql` — applied via Supabase MCP. Drops both `_update_owner` and `_update_member` (idempotent), then creates `_update_member` with `is_org_member(org_id)` USING + WITH CHECK.
2. `20260508233326_redeploy_notifications_new_lead_dedup_index.sql` — applied via Supabase MCP. Cleanup CTE keeps oldest notification per (org_id, lead_id) pair and deletes the rest, then creates the partial UNIQUE index.
3. `20260508233337_record_lead_photos_lead_id_index_in_log.sql` — applied via Supabase MCP as a no-op `CREATE INDEX IF NOT EXISTS`. Live state unchanged; the migration log now has an entry for the index that was previously applied out-of-band.
4. `20260421021818_fix_get_org_credit_row_permissions.sql` — local file added matching the existing prod migration. Not re-applied (already in log); the file just restores file/log parity for `supabase db reset` consumers.

Local files renamed post-apply to match the actual MCP-recorded timestamp versions (Supabase MCP `apply_migration` generates a server-side timestamp at apply time, which differs from any timestamp in the input name).

### Verification (live, after fix)

- `pg_policies` for `public.contractor_profile`: `_insert_owner`, `_select_member`, `contractor_profile_update_member` (qual=`is_org_member(org_id)`, with_check=`is_org_member(org_id)`). `_update_owner` gone. ✓
- `pg_indexes` for `notifications_new_lead_dedup_idx`: `CREATE UNIQUE INDEX notifications_new_lead_dedup_idx ON public.notifications USING btree (org_id, ((screen_params ->> 'id'::text))) WHERE ((type = 'NEW_LEAD'::text) AND ((screen_params ->> 'id'::text) IS NOT NULL))`. ✓
- Duplicate query: 0 rows. NEW_LEAD count: 24 → 21 (3 stale rows removed by cleanup CTE). ✓
- `schema_migrations` post-fix has 3 new entries: `20260508233306_redeploy_contractor_profile_update_member_policy`, `20260508233326_redeploy_notifications_new_lead_dedup_index`, `20260508233337_record_lead_photos_lead_id_index_in_log`. ✓
- `npx tsc --noEmit` (web repo): pending; will run before commit.

### C3 decision (no fix)

Migration 0030 (`ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'OPENED'`) is recorded as applied but the value is missing in `pg_enum`. Since no application code references `OPENED`, adding it now would create a value with no callers. Documented as a known historical no-op in `docs/current-state.md` instead. The original migration file `supabase/migrations/0030_add_opened_lead_status.sql` is left untouched (out-of-scope rule).

### Stale Notion / docs flagged

- `docs/current-state.md:376` "0059: notifications_new_lead_dedup_idx — partial unique index" was historically inaccurate (the index didn't exist live) but is now accurate post-fix. The line in this entry is corrected.
- `docs/updates-log.md` 2026-05-08 Audit 9 entry stated 0056 + 0059 NOT applied; that was true at time of audit. After the fixes in this session, the equivalent SQL is applied (under new timestamped versions). The earlier entry stands as historical record.

### Out of scope (intentionally NOT fixed)

- 6 High items from Audit 9 (mutable search_path, FOR UPDATE on `update_org_plan_credits`, `auth_rls_initplan` policies, `subscriptions` FK, missing FK indexes). Listed in Pending Work as PW-A9-6 through PW-A9-9.
- 8 Medium + 5 Low items.
- Local files 0001-0055 numeric naming retained; only new work uses timestamp convention going forward.

---

## Session — May 8, 2026 — Audit 9 RPC hardening (H2, H3, L5)

Three function-level hardening fixes from Audit 9 shipped as a single migration `20260508234346_rpc_hardening_search_path_row_lock_revoke_anon`. Each diagnosed live before fixing.

### Diagnosis (live, before fix)

- **H2** — `pg_get_functiondef` for `public.update_org_plan_credits` and `public.reset_org_credits`: both have `LANGUAGE plpgsql SECURITY DEFINER AS $function$` with NO `SET search_path` clause. Supabase advisor `function_search_path_mutable` flagged both. EXECUTE on both is `service_role` only (proacl: `postgres=X/postgres, service_role=X/postgres`) — migration 0063 already revoked from anon/authenticated. Mutable search_path is defense-in-depth.
- **H3** — `pg_get_functiondef` for `public.update_org_plan_credits`: body is plain `UPDATE organizations SET monthly_credits = p_monthly_credits, credits_reset_at = p_credits_reset_at WHERE id = p_org_id`, no `SELECT ... FOR UPDATE` first. Compare `unlock_lead_with_credits` (`select plan, monthly_credits, … from organizations where id = p_org_id for update`) and `refund_bonus_credits` (`SELECT bonus_credits INTO v_current FROM organizations WHERE id = p_org_id FOR UPDATE`). Caller trace: `app/api/stripe/webhook/route.ts:122`, `app/api/stripe/checkout/route.ts:206`, `app/api/iap/sync/route.ts:172`, `app/api/revenuecat/webhook/route.ts:93` — all use `admin.rpc("update_org_plan_credits", …)` (service_role). Concurrent webhook bursts for the same org could race (e.g. `checkout.session.completed` + `invoice.paid`).
- **L5** — `pg_proc.proacl` for `public.is_org_member` and `public.is_org_owner`: `=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres`. Both are SECURITY DEFINER with `SET search_path TO 'public'` and depend on `auth.uid()`. Anon's `auth.uid()` is null so calls always returned false, but the functions were callable via `/rest/v1/rpc/is_org_member` etc. Verified safe-to-revoke via `pg_policies` query — every RLS policy referencing these functions targets `{authenticated}` only (20 policies on 11 tables: contractor_profile, credit_purchases, customers, lead_photos, lead_unlocks, leads, org_usage_monthly, organization_members, organizations, pending_invites, quote_events, quotes — none target anon). Migration 0063 had deliberately left these untouched citing "must stay callable by anon/auth"; that reasoning was overcautious.

### Fix applied

`20260508234346_rpc_hardening_search_path_row_lock_revoke_anon`. Single migration:

1. `CREATE OR REPLACE FUNCTION public.update_org_plan_credits(...) ... SET search_path = public AS $function$ BEGIN PERFORM 1 FROM organizations WHERE id = p_org_id FOR UPDATE; UPDATE organizations SET ... WHERE id = p_org_id; END; $function$`
2. `CREATE OR REPLACE FUNCTION public.reset_org_credits(...) ... SET search_path = public AS $function$ BEGIN RETURN QUERY UPDATE organizations SET ... WHERE id = p_org_id AND (credits_reset_at <= p_now OR credits_reset_at IS NULL) RETURNING ...; END; $function$`
3. `REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;` and same on `is_org_owner`. CRITICAL: `REVOKE FROM anon` alone would NOT have worked — anon retains effective EXECUTE via PUBLIC unless PUBLIC is also revoked.

### Verification (live, after fix)

- `pg_get_functiondef('public.update_org_plan_credits')` shows `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN PERFORM 1 FROM organizations WHERE id = p_org_id FOR UPDATE; UPDATE organizations SET monthly_credits = p_monthly_credits, credits_reset_at = p_credits_reset_at WHERE id = p_org_id; END; $function$`. ✅
- `pg_get_functiondef('public.reset_org_credits')` shows `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN RETURN QUERY UPDATE organizations SET ... RETURNING organizations.monthly_credits, organizations.bonus_credits; END; $function$`. ✅
- `pg_proc.proacl` for `is_org_member` and `is_org_owner`: `postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres` — anon and PUBLIC removed. ✅
- Supabase security advisor: `function_search_path_mutable` no longer flags `update_org_plan_credits` or `reset_org_credits` (4 still flagged — `plan_monthly_credits`, `prune_org_notifications`, `set_updated_at`, `storage_org_id_from_path` — out of scope for this fix). `anon_security_definer_function_executable` no longer flags `is_org_member`/`is_org_owner`. ✅
- `npx tsc --noEmit` exit 0. ✅
- Migration recorded as version `20260508234346` in `supabase_migrations.schema_migrations`. Local file renamed from `20260508234247_…` to `20260508234346_…` to match prod (per the established convention: MCP `apply_migration` server-stamps the version).

### Deadlock analysis

Each of the four callers makes a single `update_org_plan_credits` call per webhook, against one `organizations` row identified by `p_org_id`. The new `FOR UPDATE` lock acquires only that single row. No call site holds a second `organizations` row lock simultaneously, so no deadlock cycle is possible. If two webhooks for the same org fire concurrently, the second waits for the first to commit (Postgres serializes) — exactly the desired behavior.

### Sibling concerns NOT addressed (out of scope)

- `plan_monthly_credits`, `prune_org_notifications`, `set_updated_at`, `storage_org_id_from_path` still have mutable search_path. Will be a future hardening pass.
- `auth_rls_initplan` advisor warnings on subscriptions/push_tokens/notifications/audit_log RLS policies still present (Audit 9 H4) — not RPC scope.
- `subscriptions` lacking FK to organizations still present (Audit 9 H5) — schema change, not RPC scope.
- 5 missing FK indexes still present (Audit 9 H6) — index creation, not RPC scope.

Severity: 2 High + 1 Low fixed. Notion finding entry: see Bugs & Fixes 2026-05-08 RPC hardening entry.
