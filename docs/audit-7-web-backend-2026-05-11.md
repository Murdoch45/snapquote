# Audit 7 — Web Stack & Backend (READ-ONLY)

**Date:** 2026-05-11
**Branch:** `claude/audit-7-web-backend-2026-05-11` (worktree off origin/main)
**HEAD at audit:** `1d6e834`
**Source:** Claude Code
**Scope:** Next.js / middleware / API runtime config; auth + session gates on protected routes; rate limiting coverage; DB access (admin client, tenant filters, transactions, indexes); cron auth + inventory; env var coverage; Sentry instrumentation regression check against Audit 13 fixes; caching/CDN headers; public surface; deps; build/deploy health; TS hygiene; hardcoded secrets/URLs. **NOT** included: feature correctness (covered by Audits 1–6, 8–13), schema design (Audit 9), AI/estimator internals (Audit 11).

NO code, schema, or data changed. Findings cite live sources only — Notion / docs not accepted as evidence.

---

## Verdict

Zero **Critical** findings. The Audit 8 (web infra hardening, 2026-05-09) and Audit 13 (observability, 2026-05-11) fix passes landed cleanly and survive at HEAD. Headers, CSP-Report-Only, distributed rate limiter, admin-client tenant filter, JWT verification, webhook idempotency, Sentry scrub + sample rates + global error boundary, cron auth — all verified live and intact.

Five **High** findings. They cluster on three themes:
1. **Public-surface enumeration & abuse.** Three public endpoints have no rate limiter and no per-IP key — they can be sprayed to enumerate quotes, fan magiclinks, or brute-force org creation.
2. **Webhook timeout risk.** Stripe + RevenueCat webhooks have no `maxDuration` export. Hobby-plan default is 10s, Pro is 60s; the checkout-completed handler does 5–7 sequential DB writes + a Stripe round-trip + 2 emails. A single slow path can timeout, causing the webhook event to be marked failed and replayed (re-claim returns `false` → no retry effect, but Stripe sees a 5xx and applies its 72-hour retry policy).
3. **GoTrue race on `/api/public/onboard`.** This route resolves identity via `admin.auth.getUser(accessToken)` (GoTrue round-trip), which is exactly the race that motivated the `verifySupabaseJWT` switch in Audit 1.

Seven **Medium** + four **Low** findings on edges of the same surface plus dependency / hygiene items.

The system is solid enough to take real production traffic *now*. The High items are the kind of gap that bites in the first week of real load: a rogue script hitting `/api/public/quote/<random>` 1k times per second, or a Stripe webhook running long because Resend was slow that minute.

---

## Critical

(none)

---

## High

### H1 — `/api/public/quote/[publicId]` GET + `/accept` POST + `/viewed` POST have zero rate limiting

**Live evidence:**
- `app/api/public/quote/[publicId]/route.ts:12` — `GET` handler, no `rateLimit(...)`/`getClientIp(...)` calls anywhere in the file.
- `app/api/public/quote/[publicId]/accept/route.ts:20` — `POST` handler, no rate limit.
- `app/api/public/quote/[publicId]/viewed/route.ts:9` — `POST` handler, no rate limit.
- `lib/rateLimit.ts:98-113` — the only `rateLimit(...)` function in the codebase. Grep at HEAD shows 8 files importing it; none of them are the three quote routes above.

**Why this matters:** `quote.public_id` is 96 bits of entropy minted by `randomBytes(12).toString("base64url")` (`app/api/app/leads/unlock/route.ts:20`), so blind enumeration is effectively impossible. But:
- An attacker who finds *one* publicId (e.g., from a leaked SMS link, share, or screenshot) can hammer the GET handler to scrape pricing + customer-name + address-full unlimited times — the response includes all of those (`route.ts:60-72`).
- The accept handler flips quote status. Replay-spam after the customer accepts is a no-op, but a hostile client racing the customer can fire many accepts before the customer's tap reaches the server — only one wins, but the loser POSTs all carry the cost (DB read + 1 RPC + push fan-out per request).
- The viewed handler fans out a push to *every device in the org* on the CAS-winner path (`route.ts:72-87`). A single bot tap floods notifications.

**Recommended fix approach:** Add `rateLimit("public-quote-read:<ip>:<publicId>", 60, ONE_HOUR_MS)` to the GET and `public-quote-accept:<ip>:<publicId>` at a much tighter cap (e.g., 5/hr) on the POST handlers. Keep them keyed on both IP + publicId so a contractor sharing a link from their office doesn't get blocked by a noisy neighbor.

### H2 — `/api/public/auth/mobile-handoff` has no rate limit (magiclink fan-out path)

**Live evidence:**
- `app/api/public/auth/mobile-handoff/route.ts:63-120` — `POST` handler, no `rateLimit(...)` import or call.
- The handler is gated by `verifySupabaseJWT(bearer)` at `route.ts:69-78` — only valid bearer holders can hit it. But for each valid bearer it calls `admin.auth.admin.generateLink({ type: "magiclink", email })` (`route.ts:96-100`).
- `app/api/public/auth/forgot-password/route.ts:28-31` is the comparable pattern — *that* route has a both-gates `Promise.all` rate limit (`forgot:email:<email>` 3/hr + `forgot:ip:<ip>` 10/hr per Audit 8 M6).

**Why this matters:** A leaked/stolen mobile bearer (which survives until expiry, ~1h, or revocation) can spam this endpoint to mint unlimited magiclinks to the bearer's email. Resend send-budget exhaustion + email-deliverability damage (Resend will rate-limit *us* with a 429 if we spam, and reputational damage carries forward to legitimate auth/notification email). Also useful for a phishing replay: each magiclink is single-use and short-TTL, but harvesting many keeps the attack window open.

**Recommended fix approach:** Match the `forgot-password` pattern. Add a Promise.all of `handoff:user:<userId>` 6/hr + `handoff:ip:<ip>` 15/hr. Key on the verified `userId` (not the bearer) so a refreshed bearer can't reset the counter mid-window.

### H3 — `/api/public/onboard` still uses `admin.auth.getUser(accessToken)` GoTrue round-trip

**Live evidence:**
- `app/api/public/onboard/route.ts:42-47` — `const admin = createAdminClient(); const { data: { user } } = await admin.auth.getUser(accessToken);`
- `lib/auth/verifyJWT.ts:131-195` — the local-verify path. Comment at `verifyJWT.ts:11-26` and `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` document exactly *why* GoTrue round-trips are problematic ("races against its read replicas, returning null for tokens issued <~50 ms ago and 401-ing the caller").
- `app/api/public/auth/mobile-handoff/route.ts:69` (uses `verifySupabaseJWT(bearer)`) and `app/api/public/invite/accept/route.ts:34` (uses `verifySupabaseJWT(bearerToken)`) are the pattern this route should follow.

**Why this matters:** Onboarding is the first authenticated POST a newly-signed-up user makes. Their access token is fresh-minted (<10s old) — exactly the window in which the GoTrue read replica may still be 50–500ms behind. A 401 here drops the user out of the signup flow back to login.

The handler does have a *fallback* path via `createServerSupabaseClient().auth.getUser()` (`route.ts:50-55`), which reads the cookie session — but if the cookie hasn't been set yet (mobile or web-from-mobile-handoff path), the fallback also returns null and the route 401s. Audit 1 closed this in `requireRole.ts` everywhere except this one route.

**Recommended fix approach:** Mirror the `invite/accept` pattern at `app/api/public/invite/accept/route.ts:29-48`: read bearer from body or `Authorization`, run `verifySupabaseJWT`, fall back to `createServerSupabaseClient().auth.getUser()` only on missing bearer. Removes the GoTrue round-trip from the happy path.

### H4 — Stripe + RevenueCat webhooks have no `maxDuration` export; checkout handler does 5–7 sequential awaits

**Live evidence:**
- `app/api/stripe/webhook/route.ts:18` — `export const runtime = "nodejs";`. No `export const maxDuration` anywhere in the file (grep at HEAD).
- `app/api/revenuecat/webhook/route.ts:14` — same shape: `runtime = "nodejs"`, no `maxDuration`.
- `handleCheckoutCompleted` (`stripe/webhook/route.ts:237-289`) does, in order: 1 Stripe API `subscriptions.retrieve`, 1 upsert into `subscriptions`, conditionally 1 update + 1 update on `organizations` (trial), 1 update on `organizations` (plan), 1 RPC `update_org_plan_credits`, 1 async email send fired with `void` (so doesn't block, OK). That's 5 awaited DB/Stripe round-trips minimum.
- `handleInvoicePaid` (`stripe/webhook/route.ts:341-399`) does 1 Stripe retrieve, then nested calls `handleSubscriptionChanged` (3 awaited DB writes) + 1 RPC + 1 conditional email.
- Vercel function timeout default: Hobby = 10s, Pro = 60s. The `lambdaRuntimeStats` in the production deploy meta shows `{"nodejs":7}` which doesn't tell us the plan tier directly, but the `cron/*` routes set explicit `maxDuration = 60` (e.g., `app/api/cron/unopened-leads-reminder/route.ts:7`) — implying the team treats 60s as the ceiling and is aware they need the explicit export to get it. Webhook routes don't have it set.

**Why this matters:** A slow Stripe response, a slow Supabase RPC, or a slow Resend call can push the webhook handler past the function timeout. Vercel kills the function, Stripe sees a 5xx, marks the event for retry. The `webhookEvents` dedupe table (`lib/webhookEvents.ts` + migration 0050) means the *next* retry will see `claimWebhookEvent` return `false` (already claimed) and skip the handler — so the org gets a half-applied state (plan updated but credits not reset, or trial flag set but plan still SOLO). That's exactly the kind of inconsistency that's nearly impossible to debug from outside.

**Recommended fix approach:** Add `export const maxDuration = 60;` to both webhook route files. Long-term, refactor `handleCheckoutCompleted` so the DB writes happen in a single RPC or a Postgres function (`apply_stripe_checkout_completed(orgId, userId, ...)`) — one atomic transaction, one network round-trip. That solves both the timeout and the partial-state risks together. Cross-flag: `webhook_events` table also has no transaction boundary across the claim + handler — see M3 below.

### H5 — No `/api/health` or external uptime monitoring; detection-of-down latency is hours

**Live evidence (forwarded from Audit 13 H7, re-verified at HEAD 1d6e834):**
- `find app -name 'health*' -type d` returns zero matches (Bash output captured 2026-05-11).
- No `UptimeRobot` / `Better Stack` / `Statuscake` / `Pingdom` strings in `package.json`, `vercel.json`, or `next.config.ts`.
- `curl -sI https://www.snapquote.us/` returns 200 OK with `X-Vercel-Cache: HIT` — landing is currently up, but no automated probe is hitting it.

**Why this matters:** If snapquote.us starts returning 5xx (Vercel platform incident, Supabase outage, expired Stripe/Resend key, DNS misconfig), Murdoch's discovery path is: customer complaint, or Sentry "ingest stopped" alert if it's configured (Sentry MCP doesn't expose alert-rule config — see Audit 13 L3). Detection latency: hours, not minutes.

**Recommended fix approach:** Add `app/api/health/route.ts` (Node runtime) that does a 200ms-budget Supabase ping (`select 1`) + returns 200 / 503 + a cheap JSON body with build SHA. Point an external uptime monitor (Better Stack free tier, UptimeRobot 5-minute free tier) at it. Pages Murdoch's phone via SMS on 2 consecutive failures. Cross-flag: Audit 13 H7 already flagged this; re-flagged here for completeness within Audit 7's ops surface.

---

## Medium

### M1 — Several `api/app/*` routes do not set `export const runtime = "nodejs"`

**Live evidence (Grep for `^export const (runtime|dynamic|maxDuration)` across `app/api/`):**

Routes WITHOUT an explicit `export const runtime`:
- `app/api/app/account/delete/route.ts`
- `app/api/app/leads/unlock/route.ts`
- `app/api/app/my-link/caption/route.ts`
- `app/api/app/settings/check-slug/route.ts`
- `app/api/app/settings/patch/route.ts`
- `app/api/app/settings/update/route.ts`
- `app/api/app/settings/verify-email/route.ts`
- `app/api/app/team/invite/route.ts`
- `app/api/app/team/invite-link/route.ts`
- `app/api/app/team/invites/route.ts`
- `app/api/app/team/members/route.ts`
- `app/api/app/team/remove/route.ts`
- `app/api/onboarding/complete/route.ts`
- `app/api/onboarding/reset/route.ts`
- `app/api/public/auth/bootstrap/route.ts`
- `app/api/public/auth/forgot-password/route.ts`
- `app/api/public/auth/mobile-handoff/route.ts`
- `app/api/public/invite/accept/route.ts`
- `app/api/public/onboard/route.ts`
- `app/api/public/quote/[publicId]/route.ts`
- `app/api/public/quote/[publicId]/viewed/route.ts`

**Why this matters:** Next.js 15's default runtime is `nodejs`, so today these are fine. But the default could change (Vercel has been pushing edge-default in marketing for months) and several of these routes will *break* on edge: any route that imports `@/lib/supabase/admin` (which uses `service-role` via the Node-only `@supabase/supabase-js` client), any route that uses `crypto.randomBytes` (`leads/unlock/route.ts:1`), and any route that uses `next/server`'s `after()` (`leads/unlock/route.ts:2`). Making the runtime explicit prevents an accidental future regression.

**Recommended fix approach:** Add `export const runtime = "nodejs";` to all 21 routes. Mechanical change, one commit. The 14 routes that already set it (lead-submit, lead-photo-upload, all crons, all stripe/iap routes, plus a few others) provide the canonical pattern.

### M2 — Webhook handlers (Stripe, RC) lack `maxDuration` AND the multi-write paths are not in a Postgres transaction

**Live evidence:**
- `app/api/stripe/webhook/route.ts:267-288` — `handleCheckoutCompleted` runs `saveSubscriptionRecord` → `setOrganizationPlan` → `resetOrganizationCredits` as three separate awaited admin-client calls. No `BEGIN`/`COMMIT` boundary. If `saveSubscriptionRecord` succeeds and `setOrganizationPlan` throws, the org has a `subscriptions` row pointing at a plan but the `organizations.plan` is unchanged.
- Same shape in `app/api/revenuecat/webhook/route.ts:306-314` (`INITIAL_PURCHASE`) — `setOrganizationPlan` → `resetOrganizationCredits` → conditional `markOrganizationTrialUsed` + `setOrganizationTrialEnd`.

**Why this matters:** The handler-level `try/catch` calls `releaseWebhookEvent(...)` on failure (`stripe/webhook/route.ts:657-659`), which lets Stripe's retry re-attempt the handler. But the retry will start from scratch and re-do the writes that already succeeded. Each write is individually idempotent (upsert, conditional update) — so this *probably* converges. But there are no integration tests proving it. And there's no transactional rollback if e.g. the credit-reset RPC fails after the plan was bumped: the customer is on TEAM/BUSINESS in `organizations.plan` but the `monthly_credits` are still the SOLO default. That's a real-money inconsistency.

This is a real-week-1 risk because Resend and Stripe both have transient slowness windows where partial completion is the most likely failure mode.

**Recommended fix approach:** Wrap the multi-write paths in a Postgres function (`apply_stripe_checkout_completed`, `apply_rc_initial_purchase`) called once via `admin.rpc(...)`. Postgres provides the transaction automatically. The handler then becomes "verify event, compute params, call one RPC, send emails async" — cleaner failure semantics and a much shorter critical section. Cross-flag: H4.

### M3 — `/api/public/auth/bootstrap` has no rate limit; relies on cookie session + Turnstile only

**Live evidence:**
- `app/api/public/auth/bootstrap/route.ts:26-62` — no `rateLimit` import, no `getClientIp`. The route checks Turnstile and `auth.getUser()` (cookie session).
- An attacker holding a valid signup cookie (got past Turnstile once) can replay this endpoint indefinitely.
- Each invocation calls `ensureOrganizationMembershipForUser` (`lib/onboarding.ts`) which can create an organization row.

**Why this matters:** Without a rate limit, a single signed-up user can create many `organizations` rows via repeated calls. The function is supposed to be idempotent — it returns the existing org if the user already has one — but the audit-1 re-verification doc (`docs/audit-1-auth-session-2026-05-11.md`) flagged this exact endpoint as needing per-IP rate limiting. Confirmed still missing at HEAD.

**Recommended fix approach:** Add `rateLimit("bootstrap:user:<userId>", 5, ONE_HOUR_MS)` after the Turnstile check + `auth.getUser` resolve.

### M4 — `iap_subscription_events` and `webhook_events` have RLS enabled but zero policies

**Live evidence:**
- Supabase MCP `get_advisors(type='security')` returned:
  - `Table public.iap_subscription_events has RLS enabled, but no policies exist` (INFO-level)
  - `Table public.webhook_events has RLS enabled, but no policies exist` (INFO-level)
- Both tables are written by service-role only (admin client). The IAP table is also read by an internal `iap_subscription_events?needs_review=true` query path.

**Why this matters:** RLS-enabled-with-no-policies = "deny all" to non-service-role connections. Service-role bypasses RLS so today this is effectively just opaque. But if anyone ever needs to expose a row to an authenticated client for an in-app "review needs-review events" panel or similar, the table will silently 0-row the query and the developer will spend 30 minutes wondering why before realizing the policy is missing. Make the intent explicit.

**Recommended fix approach:** Either drop the RLS toggle (`ALTER TABLE public.iap_subscription_events DISABLE ROW LEVEL SECURITY;`) and rely on the service-role-only access pattern, OR add a `service_role = current_user`-style policy that explicitly documents the "service role only" stance. Same for `webhook_events`.

### M5 — `customers_safe` and `leads_safe` views are `SECURITY DEFINER` (ERROR-level advisor)

**Live evidence:**
- Supabase MCP `get_advisors(type='security')` returned two ERROR-level lints:
  - `View public.customers_safe is defined with the SECURITY DEFINER property`
  - `View public.leads_safe is defined with the SECURITY DEFINER property`
- Remediation reference: `https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view`

**Why this matters:** A `SECURITY DEFINER` view enforces *the view-creator's* RLS, not the querying user's. For `leads_safe` (which is the masked view that hides PII for locked leads), this is *intentional* — the view applies a masking pattern that doesn't depend on the caller's identity. But Supabase flags it ERROR-level because the common foot-gun is creating a view that accidentally bypasses tenant isolation. Worth a comment-only review to confirm the design is intentional and the masking logic carries org_id correctly.

**Recommended fix approach:** Document the rationale in a migration comment block and acknowledge the advisor; or, if a `SECURITY INVOKER` rewrite is feasible, switch to that and let downstream RLS do the work. Cross-flag: Audit 8 already touched `leads_safe` (column-masking behavior for locked rows) — confirm with that audit's owner whether the DEFINER design is by-design.

### M6 — Stripe webhook DB writes don't release the webhook_events claim on partial failure

**Live evidence:**
- `app/api/stripe/webhook/route.ts:607-619` — `claimWebhookEvent("stripe", event.id, event.type)` is awaited; if it succeeds, the row is locked.
- `app/api/stripe/webhook/route.ts:621-664` — handler `try/catch`. On error, `releaseWebhookEvent("stripe", event.id)` runs at `route.ts:657-659`. Looks correct on its face.
- But: if a write *succeeds*, then a later write throws, the handler returns 5xx → `releaseWebhookEvent` runs → Stripe retries → `claimWebhookEvent` returns true again → the first write happens *again* (it's upsert-idempotent so this is OK for Stripe.subscriptions but not for the email sends inside `handleCheckoutCompleted`).
- `lib/webhookEvents.ts` (referenced but not opened in this audit) — the row-claim semantics define whether retry-after-release goes to the original handler or a fresh one.

**Why this matters:** This is M2 from a different angle. The handler is *almost* re-runnable, but the inner `void sendPlanUpgradedEmail(orgId, plan)` at `stripe/webhook/route.ts:288` and `void sendPlanUpgradedEmail(orgId, effectivePlan)` at `route.ts:394` are fire-and-forget — if they ran on the first try and threw on the third write, the retry will fire-and-forget *again*. Customer gets two upgrade emails.

**Recommended fix approach:** Either (a) move the email send to the very end of the handler so it only fires after every write succeeded, or (b) gate it on an idempotency token stored on the `subscriptions` row (`upgraded_email_sent_at`). (a) is the smaller change.

### M7 — Hardcoded `https://snapquote.us` in 44 places, several inside conditional fallbacks

**Live evidence:**
- 44 hits of `snapquote.us` in `.ts`/`.tsx` across the worktree (`Bash grep -rE "snapquote\.us" --include='*.ts' --include='*.tsx' | wc -l`).
- Most are content (privacy/terms/email templates, demo data, support@ mailto) — fine, they're meant to be the product brand.
- Several are conditional fallbacks for the app URL: `process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us"` at `app/api/app/settings/verify-email/route.ts`, `app/api/public/auth/forgot-password/route.ts`, `app/api/public/auth/mobile-handoff/route.ts`. These are correct in production (env var is set, fallback never fires) but if the env var were ever unset on a preview deploy, the cron-nudge link at `app/api/cron/estimate-nudge-unviewed/route.ts:80` (`"https://snapquote.us/app/quotes"` — hardcoded, no env var fallback) would still send hardcoded prod links from a preview environment.

**Why this matters:** Preview/staging links pointing at prod is a debugging foot-gun. On preview deploys without `NEXT_PUBLIC_APP_URL`, customers clicking estimate-nudge SMS links land on production data. This is rare today (preview deploys go to `*.vercel.app` URLs which mobile/SMS doesn't generate), but a Stripe Sandbox cycle that fires a real nudge SMS would surface this.

**Recommended fix approach:** Replace the `estimate-nudge-unviewed/route.ts:80` literal with `${getAppUrl()}/app/quotes`. `lib/utils.ts` already exports `getAppUrl()`. One-line fix.

---

## Low

### L1 — `tsconfig.json` has no `"target": "ESNext"` and no explicit `"forceConsistentCasingInFileNames"`

**Live evidence:**
- `tsconfig.json:3` — `"target": "ES2022"` (set; modern, fine).
- `tsconfig.json:1-28` — no `forceConsistentCasingInFileNames` directive. macOS + Windows have case-insensitive filesystems; Linux/Vercel is case-sensitive. A `from "@/lib/Sentry"` vs `from "@/lib/sentry"` typo will pass local-dev type-check on macOS/Windows but break the Vercel build.

**Why this matters:** Hygiene. The repo's contributors run a mix of Mac (Murdoch's primary), Windows (Bash output shows `win32` + `26200`), and possibly Linux in Vercel CI. Setting this defends against a class of accidental-case-mismatch build failures.

**Recommended fix approach:** Add `"forceConsistentCasingInFileNames": true` under `compilerOptions`. One line.

### L2 — `next.config.ts` has no explicit `output: "standalone"` or image-domain hardening for `public_url`s

**Live evidence:**
- `next.config.ts:76-87` — `images.remotePatterns` allows `**.supabase.co` (correct; lead photos) + `maps.googleapis.com` (correct; map tiles).
- No `output: "standalone"`, no `outputFileTracingExcludes`.

**Why this matters:** None today. Next.js detects standalone deploy targets automatically on Vercel. Flagging only because the file is small and reviewers sometimes assume missing options = bug. Standalone output would only matter for self-hosted builds, which isn't on the roadmap.

**Recommended fix approach:** Leave as-is; document in `docs/` if anyone asks.

### L3 — `Permissions-Policy: payment=(self "https://js.stripe.com")` may break Stripe-Elements iframes in some browsers

**Live evidence:**
- `next.config.ts:54` — `"payment=(self \"https://js.stripe.com\")"` is the directive shipped today.
- Verified live: `curl -sI https://www.snapquote.us/` returns `Permissions-Policy: ...payment=(self "https://js.stripe.com")...`.

**Why this matters:** Firefox 124+ rejects unquoted-vs-quoted mismatch in nested origins for Permissions-Policy in some 2024 versions; double-quoting is the safer spelling and that's what the file has. No issue today — flagging only as a "watch this if Stripe Elements stops loading in some Firefox builds."

**Recommended fix approach:** No action. Documented for completeness.

### L4 — `@xmldom/xmldom` not present in web `package.json` (Audit 8 M12 mobile bump didn't apply here — correctly)

**Live evidence:**
- `package.json` at HEAD — full grep returns no `xmldom` entry. Not a transitive of any web dep.
- The Audit 8 M12 fix bumped `@xmldom/xmldom` in the *mobile* repo only (via `expo-sharing` chain). Web doesn't have it.

**Why this matters:** No-finding. Documented because the audit prompt asked to verify the M12 bump is still in place. Web doesn't have the package at all, which is the correct state.

---

## Verification snapshot — live citations

### Next.js + middleware + TS config

| Item | File:line | Live value |
|------|-----------|------------|
| Strict TypeScript | `tsconfig.json:7` | `"strict": true` |
| Paths alias | `tsconfig.json:23` | `@/*: ./*` |
| Target / module | `tsconfig.json:3,10` | ES2022 / esnext |
| Image domains | `next.config.ts:77-86` | `**.supabase.co`, `maps.googleapis.com` |
| Headers callback | `next.config.ts:88-95` | 6 security headers on `/:path*` |
| CSP-Report-Only directives | `next.config.ts:21-39` | Stripe, Turnstile, Google Maps, Supabase, RevenueCat, Sentry tunnel |
| Middleware matcher | `middleware.ts:86` | `/((?!api/public\|_next/static\|_next/image\|favicon.ico).*)` — excludes /api/public, includes everything else |
| Sentry build wrap | `next.config.ts:102-113` | `withSentryConfig` w/ tunnelRoute=/monitoring |
| tsc --noEmit | `npm run typecheck` 2026-05-11 | 0 errors |

### API runtime config (43 route handlers; sample)

| Route | runtime | dynamic | maxDuration |
|-------|---------|---------|-------------|
| `app/api/stripe/webhook/route.ts:18` | `nodejs` | — | — (**H4**) |
| `app/api/revenuecat/webhook/route.ts:14` | `nodejs` | — | — (**H4**) |
| `app/api/iap/sync/route.ts:17` | `nodejs` | — | — |
| `app/api/public/lead-submit/route.ts:14-15` | `nodejs` | — | 60 |
| `app/api/public/lead-photo-upload/route.ts:9,15` | `nodejs` | — | 25 |
| `app/api/internal/run-estimator/route.ts:5,10` | `nodejs` | — | 60 |
| `app/api/cron/*` (7 Vercel + 1 pg_cron) | `nodejs` | — | 60 |
| `app/api/plans/config/route.ts:5` | `nodejs` | — | — |
| `app/api/demo/[page]/route.ts:5` | — | `force-dynamic` | — |
| `app/.well-known/apple-app-site-association/route.ts:3-4` | — | `force-static` + `revalidate: false` | — |

### Auth + session — 22 protected routes verified

All routes under `app/api/app/*` (16 handlers) use `requireMemberForApi` or `requireOwnerForApi` (`lib/auth/requireRole.ts:215-285`). All Stripe + IAP routes use `requireOwnerForApi`. Onboarding routes use member/owner gates. All 7 Vercel cron handlers + 1 pg_cron handler use `isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)` (`lib/auth/timingSafeBearer.ts`). JWT verification is ES256-only via Supabase JWKS (`lib/auth/verifyJWT.ts:131-195`) — no HS256 fallback (Audit 8 H1 removal confirmed at HEAD).

### Rate-limit coverage

`Grep` for `rateLimit|RateLimit` across `.ts` files returns 8 importers (`lib/rateLimit.ts` plus 7 callers). The `lib/ai/estimate.ts` import is for AI-call cost rate-limiting, not HTTP-endpoint rate limiting. Endpoint-level rate-limited:

| Endpoint | Limit | Key | File:line |
|---|---|---|---|
| `/api/public/lead-submit` | 20/hr | `lead-submit:<ip>` | `app/api/public/lead-submit/route.ts:48` |
| `/api/public/lead-photo-upload` | 80/hr | `lead-photo-upload:<ip>` | `app/api/public/lead-photo-upload/route.ts:79` |
| `/api/public/auth/forgot-password` | 3/hr (email) + 10/hr (ip) | `forgot:email:*` + `forgot:ip:*` | `app/api/public/auth/forgot-password/route.ts:28-31` |
| `/api/app/settings/verify-email` | (in route) | (in route) | `app/api/app/settings/verify-email/route.ts` |
| `/api/app/settings/check-slug` | (in route) | (in route) | `app/api/app/settings/check-slug/route.ts` |
| `/api/app/activity/touch` | (in route) | (in route) | `app/api/app/activity/touch/route.ts` |

Not rate-limited (per **H1 / H2 / H3 / M3** above):
- `/api/public/quote/[publicId]` (GET, POST accept, POST viewed)
- `/api/public/auth/mobile-handoff`
- `/api/public/auth/bootstrap`
- `/api/public/onboard`
- `/api/public/invite/accept`
- Stripe + RC webhooks (intentional — they're signature-verified)

Rate-limiter backend (`lib/rateLimit.ts:61-69, 98-113`): Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present, in-memory `Map` fallback otherwise. Audit 8 H9 ships safely without provisioning; distributed semantics only kick in once Upstash is wired.

### DB indexes (hot paths via Supabase MCP `pg_indexes`)

- `leads`: `(org_id, ai_status, submitted_at DESC)` + `(org_id, submitted_at DESC)` + pkey — covers the dashboard list. Verified live.
- `quotes`: `(org_id, sent_at DESC)` + `(org_id, status, sent_at DESC)` + `public_id` unique + `lead_id` unique + pkey — covers status filter + public-id lookup.
- `lead_unlocks`: `(org_id, lead_id)` unique + `(lead_id)` + `(org_id)` — covers credit-check.
- `contractor_profile`: `public_slug` unique + `org_id` unique — covers slug page + dashboard.
- `organization_members`: `(org_id, user_id)` unique + `(user_id)` — covers `loadPrimaryMembership` at `requireRole.ts:185-213`.
- `notifications`: `(org_id, created_at DESC)`, partial `(org_id) WHERE read=false`, partial `(org_id, screen_params->'id') WHERE type='NEW_LEAD'` — strong dedup + unread paths.

No hot-path missing index spotted at HEAD.

### Cron inventory (live, Supabase MCP `cron.job`)

| Cron | jobid | Type | Schedule | Status |
|------|-------|------|----------|--------|
| `reset-solo-credits` | 3 | pg_cron | `0 0 * * *` | active |
| `rescue-stuck-leads` | 8 | pg_cron | `*/3 * * * *` | active |
| `reset-paid-credits` | 9 | **pg_cron NEW (Audit 3 H3, 2026-05-11)** | `0 0 * * *` | active |
| `unopened-leads-reminder` | — | Vercel | `0 14 * * *` | `vercel.json:3-6` |
| `estimate-expiry-warning` | — | Vercel | `0 2 * * *` | `vercel.json:7-10` |
| `auto-expire-stale-quotes` | — | Vercel | `0 3 * * *` | `vercel.json:11-14` |
| `trial-ending-soon` | — | Vercel | `0 15 * * *` | `vercel.json:15-18` |
| `cleanup-notifications` | — | Vercel | `0 4 * * *` | `vercel.json:19-22` |
| `trial-expired` | — | Vercel | `0 16 * * *` | `vercel.json:23-26` |
| `estimate-nudge-unviewed` | — | Vercel | `0 17 * * *` | `vercel.json:27-30` |

3 pg_cron + 7 Vercel = 10 active crons. The Audit 3 fix-pass (commit `970d402`) added jobid=9 `reset-paid-credits` — confirmed live. No duplication between pg_cron and Vercel (rescue is pg_cron, others are split by need: pg_cron has plan logic, Vercel has external API calls).

All 8 handler files import `isAuthorizedBearer` and call it at the top of `GET()`. Verified via `Grep` for `isAuthorizedBearer` across `app/api/cron`.

### Env vars referenced in code (54 unique)

Grep of `process\.env\.[A-Z_][A-Z0-9_]*` across `.ts`/`.tsx`:

Production-critical (cited in code, must exist in Vercel):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_ISSUER` (optional override)
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL` (Vercel-injected)
- `CRON_SECRET`, `INTERNAL_API_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_EMAIL_NOREPLY`
- `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`
- `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `OPENAI_SUMMARY_POLISH_MODEL` (optional)
- `REVENUECAT_PROJECT_ID`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Audit 8 H9 provisioning flag — code falls back to in-memory if absent)
- `DEMO_ORG_ID`

Test/build-only (not production):
- `CI`, `NODE_ENV`, `NEXT_PHASE`, `NEXT_RUNTIME`, 9× `SNAPQUOTE_TEST_*` + 1× `SNAPQUOTE_ESTIMATOR_AUDIT` (test-runner scaffolding)
- `SNAPQUOTE_APP_URL` (legacy alias; grep shows ~2 hits)

**Verification gap:** Vercel MCP does not expose `env list` for prod environment (no tool surface). Couldn't programmatically diff code-referenced vars against Vercel production set. Manual check needed for: `UPSTASH_REDIS_REST_URL`/`TOKEN` (Audit 8 H9 provisioning still flagged for Murdoch), `REVENUECAT_PROJECT_ID`/`SECRET_KEY` (mentioned in `iap/sync/route.ts:280-291` as conditionally-required). Production deploys for the last 20 are all `READY` (Vercel MCP `list_deployments` 2026-05-11), which suggests no env-var-missing build break — but a 503 at `/api/iap/sync` would be silent.

### Sentry instrumentation regression check (Audit 13 fixes vs HEAD)

| Audit 13 fix | Expected at HEAD | Live verification |
|---|---|---|
| H2 client captureConsole | `instrumentation-client.ts:27` | ✅ `Sentry.captureConsoleIntegration({ levels: ["error"] })` |
| H2 client replayIntegration | `instrumentation-client.ts:28` | ✅ `Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })` |
| H2 client `replaysOnErrorSampleRate: 1.0` | `instrumentation-client.ts:21` | ✅ |
| H3 `app/global-error.tsx` | exists with Sentry.captureException | ✅ `app/global-error.tsx:22-26` |
| H4 Stripe webhook Sentry | `Sentry.addBreadcrumb` + `Sentry.captureException` | ✅ at `stripe/webhook/route.ts:599-604, 610-613, 652-655` |
| H4 RC webhook Sentry | same shape | ✅ at `revenuecat/webhook/route.ts:244-249, 255-258, 465-468` |
| H4 IAP sync Sentry | `Sentry.captureException` w/ tags | ✅ at `iap/sync/route.ts:293-295, 305-307` |
| H4 lead-unlock Sentry | tagged captureException | ✅ at `leads/unlock/route.ts:110-117, 180-187, 240-242` |
| H4 quote-send Sentry | tagged captureException | ✅ at `quote/send/route.ts:380-383` |
| H5 server `tracesSampleRate: 0.2` | `sentry.server.config.ts:14` | ✅ |
| H5 edge `tracesSampleRate: 0.2` | `sentry.edge.config.ts:14` | ✅ |
| H5 client `tracesSampleRate: 0.2` | `instrumentation-client.ts:19` | ✅ |
| M2 DEP0169 noise filter | `isKnownSentryNoise(event)` in all 3 configs | ✅ at `sentry.server.config.ts:38`, `sentry.edge.config.ts:24`, `instrumentation-client.ts:34` |
| M3 requireRole 401 breadcrumb-not-captureException | `lib/auth/requireRole.ts:49-93` | ✅ `Sentry.addBreadcrumb` always; `Sentry.captureMessage` only on bearer-present-rejected path |
| M6 edge `captureConsoleIntegration` | `sentry.edge.config.ts:19` | ✅ |

**All 14 Audit 13 fix points verified intact at HEAD.** Zero regressions.

### Vercel deploy health (last 20 deploys via Vercel MCP `list_deployments`)

- **20/20 READY**, zero ERROR/CANCELED/QUEUED in the current window.
- Current production: `dpl_G1ygAS9a8UgX7aGuQyMytq4Cuvij` (commit `1d6e834`, matches my audit HEAD).
- Two most-recent production READY deploys (`G1ygAS9a8UgX7aGuQyMytq4Cuvij`, `7F5mR5kNE3qhjZScYhsHfvZA7Sry`) flagged `isRollbackCandidate: true` — good rollback posture.
- `lambdaRuntimeStats: {"nodejs":7}` on every deploy — 7 Node runtimes (probably the 7 Vercel crons + 1 webhook + ...; doesn't expose finer per-route breakdown).

### Caching/CDN headers (live curl 2026-05-11)

- `https://snapquote.us/` → 307 to `https://www.snapquote.us/`. `Strict-Transport-Security` present on redirect.
- `https://www.snapquote.us/` → 200 OK. `X-Vercel-Cache: HIT`, `X-Nextjs-Prerender: 1`, `X-Nextjs-Stale-Time: 300`, `Cache-Control: public, max-age=0, must-revalidate`. CSP-Report-Only, STS+preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy all present.
- `https://www.snapquote.us/login` → 200 OK. `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` — correct for authenticated page.
- `https://www.snapquote.us/app` → 307 to `/login` (unauthenticated redirect). Headers intact.
- Notable: `Access-Control-Allow-Origin: *` appears on the landing page response only (a Vercel artifact for prerendered pages with no cookies); `middleware.ts:4-23` comment claims "*intentionally* no Access-Control-Allow-Origin header is set anywhere in this app." The comment is accurate for *application* code but Vercel adds the wildcard on static prerendered responses. Not a finding (a no-credentials wildcard on a public page is the default-safe interpretation), but worth knowing if the comment ever gets cited as proof of absence.

### Dependency health

- `npm audit --json` at HEAD: **0 critical, 0 high, 2 moderate**. Both moderates are in `postcss` (transitive of `next@^15.2.0`'s bundled compiler) — same shape as Audit 8 M11 deferred-to-Next-16. No new vulns since Audit 8.
- `package.json:34` next pinned at `^15.2.0`. React + react-dom at `^19.0.0` — version-aligned.
- `@sentry/nextjs@^10.49.0`, `@supabase/ssr@^0.5.2`, `@supabase/supabase-js@^2.49.4`, `@upstash/ratelimit@^2.0.8`, `@upstash/redis@^1.38.0` — all current.
- No `xmldom` / `@xmldom/xmldom` in web. (Audit 8 M12 bump was mobile-only — correct.)
- No dev-only packages in `dependencies` (spot check: vitest, eslint, typescript, tailwindcss all in `devDependencies` at `package.json:49-61`).

### Hardcoded values / secrets in code

- `grep -rE "sk_(test|live)_|sb_(test|live)_|sbp_|whsec_|sentry-auth-token"` → **0 matches**. No leaked API keys in source.
- 44 hits of `snapquote.us` in `.ts`/`.tsx` (see M7) — mostly content; one literal `https://snapquote.us/app/quotes` in `app/api/cron/estimate-nudge-unviewed/route.ts:80` should use `getAppUrl()`.
- 1 hardcoded URL pattern in `next.config.ts:30` (CSP allowlist) — this is supposed to be hardcoded, no env var needed.

### Supabase advisors (security, INFO/WARN/ERROR)

Captured live 2026-05-11 via `get_advisors(type='security')`:

- ERROR × 2: `customers_safe` + `leads_safe` are `SECURITY DEFINER` views (see **M5**).
- WARN × 5: `function_search_path_mutable` on 4 functions + 3 `authenticated_security_definer_function_executable` warnings on `get_org_credit_row`, `is_org_member`, `is_org_owner`. Cross-flag: Audit 1 re-verification doc (`docs/audit-1-auth-session-2026-05-11.md`) already flagged `is_org_member` + `is_org_owner` — same finding, no change.
- WARN × 1: `auth_leaked_password_protection` disabled (HaveIBeenPwned check off). Cross-flag: Audit 1 re-verification.
- INFO × 2: `iap_subscription_events` + `webhook_events` RLS-enabled-no-policy (see **M4**).

---

## Cross-cutting flags

- **Audit 1 (auth):** JWT verification + 401 noise reduction (M3) all healthy at HEAD. `requireRole.ts` 401 path is breadcrumb + flush — verified. **H3** here (onboard route GoTrue race) is a still-open Audit 1 surface that wasn't picked up in the 2026-05-11 re-run.
- **Audit 2 (billing):** Stripe + RC webhook handlers are correctly captured for Sentry (Audit 13 H4). **H4** + **M2** + **M6** here are real-week-1 timeout / partial-state risks that the billing audit should re-prioritize.
- **Audit 3 (credits):** `reset-paid-credits` pg_cron jobid=9 added (Audit 3 H3 — 2026-05-11 commit `970d402`); confirmed active live.
- **Audit 4 (lead lifecycle):** No N+1 detected on the lead list path; indexes match the dashboard query shape.
- **Audit 8 (security):** All shipped fixes (security headers, Sentry scrub, distributed rate limit, admin org_id filter, x-real-ip, no-CORS) intact at HEAD. **H1 / H2 / M3** here are the *next* tranche of public-surface rate-limit work that Audit 8 didn't cover.
- **Audit 9 (schema):** Index coverage on hot tables is good. `customers_safe` / `leads_safe` SECURITY DEFINER is the same lint Audit 9 flagged. PITR is still free-tier (Audit 13 H6 — not re-audited here, defer to Audit 13).
- **Audit 11 (AI estimator):** `lib/ai/estimate.ts` breadcrumbs intact; estimator route has `maxDuration = 60` — fine.
- **Audit 13 (observability):** Every shipped fix (14 items) verified at HEAD — see table above.

---

## Stale Notion/docs entries flagged

- None contradicted by live state in this audit's scope. `docs/audit-13-observability-ops-2026-05-11.md` correctly described state as of 0024fdb; the H1–H5 + M2/M3/M4/M6/M7 fixes from that audit are merged at HEAD `1d6e834` and the doc's "Recommended fix" sections are now historical. Doc remains valuable as the why-context — preserved as-is per lane rule.
- `middleware.ts:4-23` comment claims "no Access-Control-Allow-Origin header is set anywhere in this app" — *application* code is true to that claim, but Vercel adds a wildcard on prerendered landing responses. Not a stale entry per se; flagging the literal interpretation for future readers.

---

## Out of scope but flagged

- **`/api/internal/run-estimator`** (`app/api/internal/run-estimator/route.ts`) — runs the estimator via an internal-secret bearer. Not user-facing; not covered by the rate-limit audit. No `maxDuration` issue (set to 60). Sentry breadcrumbs are in `lib/ai/estimate.ts` per Audit 11 H4.
- **`/api/demo/[page]`** — `dynamic = "force-dynamic"` + `Cache-Control: no-store`. Correct.
- **`/.well-known/apple-app-site-association`** — `force-static` + `revalidate: false` + `Cache-Control: public, max-age=3600, must-revalidate`. Correct for AASA.
- **Edge-runtime usage** — only `middleware.ts` runs on edge by default. All API routes are explicitly or implicitly Node. No edge-only API routes exist that would carry the Node-vs-Edge import-incompatibility risk.
- **`Sentry tunnelRoute: "/monitoring"`** (`next.config.ts:107`) — Sentry events tunneled to bypass ad-blockers. Verified intact; not a Audit 7 concern.

---

## Files cited (web repo at HEAD `1d6e834`)

- `next.config.ts`, `middleware.ts`, `tsconfig.json`, `vercel.json`, `package.json`
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `app/global-error.tsx`
- `lib/auth/requireRole.ts`, `lib/auth/verifyJWT.ts`, `lib/auth/timingSafeBearer.ts`
- `lib/rateLimit.ts`, `lib/ip.ts`, `lib/db.ts`, `lib/sentryScrub.ts`
- `lib/supabase/admin.ts`, `lib/supabase/orgFilter.ts`
- `app/api/stripe/webhook/route.ts`, `app/api/revenuecat/webhook/route.ts`, `app/api/iap/sync/route.ts`
- `app/api/public/lead-submit/route.ts`, `app/api/public/lead-photo-upload/route.ts`
- `app/api/public/auth/bootstrap/route.ts`, `forgot-password/route.ts`, `mobile-handoff/route.ts`
- `app/api/public/onboard/route.ts`, `app/api/public/invite/accept/route.ts`
- `app/api/public/quote/[publicId]/route.ts`, `/accept/route.ts`, `/viewed/route.ts`
- `app/api/app/leads/unlock/route.ts`, `app/api/app/quote/send/route.ts`
- All 8 cron handlers under `app/api/cron/*` + `app/api/internal/run-estimator/route.ts`
- `app/(public)/page.tsx`, `app/(public)/[contractorSlug]/page.tsx`

---

## To-do summary (saved to Notion Pending Work)

H1. Add rate limiting to `/api/public/quote/[publicId]` GET, POST accept, POST viewed.
H2. Add rate limiting to `/api/public/auth/mobile-handoff`.
H3. Switch `/api/public/onboard` from `admin.auth.getUser` to `verifySupabaseJWT`.
H4. Add `export const maxDuration = 60;` to Stripe + RC webhook routes.
H5. Add `/api/health` + external uptime monitor (cross-flag Audit 13 H7).
M1. Add explicit `export const runtime = "nodejs";` to 21 routes missing it.
M2. Wrap Stripe + RC checkout-completed multi-write paths in a Postgres RPC.
M3. Add rate limit to `/api/public/auth/bootstrap` (user-keyed).
M4. Decide RLS posture on `iap_subscription_events` + `webhook_events` (drop RLS or add explicit policy).
M5. Review/document `customers_safe` + `leads_safe` SECURITY DEFINER intent.
M6. Move Stripe webhook upgrade-emails to end-of-handler or gate on idempotency token.
M7. Replace `https://snapquote.us/app/quotes` literal with `getAppUrl()` in `estimate-nudge-unviewed/route.ts:80`.
L1. Add `"forceConsistentCasingInFileNames": true` to `tsconfig.json`.
L2. (No action.)
L3. (No action.)
L4. (No action — web doesn't have xmldom; correctly.)
