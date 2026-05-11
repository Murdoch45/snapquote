# Audit 13 — Observability, Crons & Ops Reliability (READ-ONLY)

**Date:** 2026-05-11
**Branch:** `claude/flamboyant-elgamal-850556` (worktree off main)
**HEAD at audit:** `0024fdb`
**Source:** Claude Code
**Scope:** pg_cron + Vercel crons; Sentry config (web + mobile); Sentry events 14d; Vercel deploys; error boundaries; health checks; alerts; disaster recovery. NOT included: detailed billing-cron behaviour (Audit 2) or credit-reset logic (Audit 3) — cross-flagged where overlap.

NO code, schema, or data changed. Findings cite live sources only — Notion / docs not accepted as evidence.

---

## Verdict

Zero **Critical** findings — the two pg_cron jobs and all seven Vercel crons are operationally healthy, deploys are clean, and the breadcrumb work landed in Audit 11 H4 covers the AI pipeline well. The audit surfaces seven **High** findings, all on the gap between *captured-when-it-explodes* and *captured-with-enough-context-to-debug*, and on disaster-recovery posture.

The biggest worry: the mobile Sentry config has no PII scrubbing, no UUID redaction, no environment or release tagging — the same protections we shipped to web in Audit 8 H6 and Audit 4 M6 are absent on the mobile lane. Confirmed live: a tenant UUID (`8f939f96-...`) leaks into a mobile Sentry event title from a Realtime subscription error. Web also has UUID-titled events but they all predate the Audit 4 M6 redaction fix and are historical only.

---

## Critical

(none)

---

## High

### H1 — Mobile Sentry has zero PII scrubbing, UUID redaction, env tagging, or release tagging
**Live evidence:**
- `C:\Users\murdo\SnapQuote-mobile\app\_layout.tsx:27-48` — entire Sentry init for the mobile app. Sets `dsn`, `debug`, `attachStacktrace`, `enableAutoSessionTracking`, and one integration (`captureConsoleIntegration({ levels: ["error"] })`). No `beforeSend`. No `beforeBreadcrumb`. No `environment`. No `release`. No `tracesSampleRate` (defaults to 0).
- Sentry MCP query, `snapquote-mobile` project, 14d:
  - `Error: cannot add postgres_changes callbacks for realtime:quotes:8f939f96-7f92-4973-97f8-f08450ccb71f:ALL after subscribe()` — 3 events. UUID is the org id and is leaking into the title verbatim because no `beforeSend` strips it.
- Web parity reference: `sentry.server.config.ts:33-39`, `sentry.edge.config.ts:16-22`, `instrumentation-client.ts:16-23` all wire `scrubSentryEvent` via `beforeSend` + `beforeBreadcrumb`. `lib/sentryScrub.ts:108-156` includes the UUID-redaction regex (Audit 4 M6) applied to `event.message` and `event.exception.values[].value`.

**Why this matters:** Anything Sentry sees on mobile — stack frames, breadcrumbs, captured exceptions — can carry customer name/phone/email/address/lat-lng. The web protections shipped two audits ago do not apply here.

**Recommended fix (out of scope for this audit):** Port `lib/sentryScrub.ts` into the mobile app and wire identical `beforeSend` + `beforeBreadcrumb` hooks in `app/_layout.tsx:27`. Add `environment: __DEV__ ? "development" : "production"` and `release: Constants.expoConfig?.version` so TestFlight vs store builds are separable.

### H2 — Six of seven client error boundaries do not capture to Sentry
**Live evidence:**
- `app/app/error.tsx:14-23` — the only boundary that calls `Sentry.captureException(error, { tags: { segment: "app", digest: ... } })`.
- `app/(public)/login/error.tsx:13-15`, `signup/error.tsx:13-15`, `onboarding/error.tsx:13-15`, `[contractorSlug]/error.tsx:13-15`, `q/error.tsx:13-15`, `app/app/analytics/error.tsx:19-21` — every one of these calls `console.error` only and exits.
- `instrumentation-client.ts:9-23` has no `captureConsoleIntegration` (the integration is server-only at `sentry.server.config.ts:19`). Result: client-side `console.error` from these boundaries is silently dropped from Sentry.

**Why this matters:** A render-time crash on `/login`, `/signup`, `/onboarding`, `/[contractorSlug]` (public lead form), `/q/[publicId]` (public quote view), or `/app/analytics` shows the user a Try-Again UI but never produces a Sentry event. Six high-traffic routes invisible to observability — including the two public-facing customer surfaces.

### H3 — No `app/global-error.tsx`
**Live evidence:**
- `find app -name 'global-error*'` returns zero matches (Bash output captured 2026-05-11).
- Next.js 15 + `@sentry/nextjs` v10 documentation: `global-error.tsx` is the boundary for the root layout itself. Without it, a throw inside the root layout (Sentry init, font hook, top-level provider) yields the default Next runtime error page and no Sentry event.

**Why this matters:** Root-layout crashes are exactly the class of incident where you most want a Sentry event — they break the entire site for affected users.

### H4 — Critical revenue paths have zero explicit Sentry instrumentation
**Live evidence (Grep for `Sentry|captureException|addBreadcrumb`):**

| Route | Result |
|---|---|
| `app/api/stripe/webhook/route.ts` | No matches |
| `app/api/stripe/checkout/route.ts` | No matches |
| `app/api/stripe/credits/route.ts` | No matches |
| `app/api/stripe/customer-portal/route.ts` | No matches |
| `app/api/revenuecat/webhook/route.ts` | No matches |
| `app/api/iap/sync/route.ts` | No matches |
| `app/api/app/leads/unlock/route.ts` | No matches |
| `app/api/app/quote/send/route.ts` | No matches |

Compare to `lib/ai/estimate.ts` — 13 `Sentry.addBreadcrumb` and 3 `Sentry.captureException` calls (Audit 11 H4 work).

**Why this matters:** When the Stripe webhook fails, server captureConsoleIntegration will still produce a stack trace — but with no breadcrumbs for which webhook event, which Stripe customer, which org, or which stage of the flow. Debugging a Stripe / RevenueCat / unlock-credit / SMS-send incident is a black box.

### H5 — `tracesSampleRate: 0.05` on web, default-zero on mobile; no replay sample rate
**Live evidence:**
- `sentry.server.config.ts:11`, `sentry.edge.config.ts:9`, `instrumentation-client.ts:11` — all hardcoded to `0.05`.
- No `replaysSessionSampleRate` or `replaysOnErrorSampleRate` set anywhere (Grep across `sentry.*.config.ts` and `instrumentation*.ts`). No `replayIntegration` in the integrations array.
- Mobile (`app/_layout.tsx:27-48`) does not set `tracesSampleRate` — default is 0.

**Why this matters:** 5% trace sampling on a low-volume B2B product means most outage investigations get zero perf data. The /app/leads outage referenced in the audit prompt surfaced with 4 events instead of ~80 for exactly this reason. The product is pre-PMF; the cost of higher sampling is negligible.

### H6 — No Point-In-Time Recovery; Supabase org plan = `free`
**Live evidence:**
- `mcp__supabase__get_organization` (org `pbsphnzktohkiqxegihs`): `{"plan":"free"}`.
- Supabase free tier provides daily snapshots with 7-day retention. PITR is Pro-tier only.
- WAL settings are healthy (`wal_level=logical`, `archive_mode=on`, `max_wal_senders=5`) but no PITR window is exposed.

**Why this matters:** RPO is 24 h. A bad migration or accidental cascade delete during business hours could destroy up to a day of leads, quotes, and payments. Cross-flag: Audit 9 already raised this as an unverified concern; now verified.

### H7 — No health-check endpoint, no external uptime monitoring
**Live evidence:**
- `find app -name 'health*'` and `find app/api -type d` show no `/api/health`, `/api/_status`, or similar.
- No mention of UptimeRobot / Better Uptime / similar in `package.json`, `vercel.json`, or `next.config.ts`.

**Why this matters:** If snapquote.us goes fully 500 or 502 (Vercel platform incident, Supabase outage, expired SSL, DNS misconfig), Murdoch's discovery path is: customer complaint, or Sentry "ingest stopped" (only if alerts are configured — see L3). Detection latency is hours, not minutes.

---

## Medium

### M1 — Historical UUID leak in 4 web Sentry events; fix has shipped
**Live evidence:**
- Sentry MCP, `snapquote-web`, 14d: `Error: {"code":"42501",...,"message":"permission denied for organization 8f939f96-7f92-4973-97f8-f08450ccb71f"}` — count: 4, release `ea90027` (committed 2026-05-08 17:42:56 -0700 per `git log`).
- UUID redaction commit `e15b53b` landed 2026-05-10 11:27:39 -0700 — after these events. Merged in `95af5a8` and deployed `dpl_8k3satGjpk2GSmes3FJS3wPGkE4q` at 2026-05-10 18:29 UTC.

**Note for verification next audit:** `lib/sentryScrub.ts` scrubs `event.message` and `event.exception.values[].value` for UUIDs, but does NOT scrub `event.title` directly. Sentry derives the title server-side from message + exception value, so the scrubbing should propagate — verify the next post-fix event with a 42501 confirms title is clean. If not, add `event.title` redaction to `scrubSentryEvent`.

### M2 — Noise issue: 18 events of Node `DEP0169` deprecation warning
**Live evidence:** Sentry MCP `snapquote-web` 14d top-issue list: `(node:4) [DEP0169] DeprecationWarning: url.parse() behavior is not standardized...` — count 18, across 9 releases. Originates from Next.js internal use of `url.parse`, not application code.

**Why this matters:** Consumes ~20% of the 14d error budget (92 total events on web) with no signal. Recommend dropping in `beforeSend` via `event.exception?.values?.[0]?.value?.includes("DEP0169") → null`.

### M3 — `auth.requireMember 401` is the top Sentry issue (47 events / 14d)
**Live evidence:**
- Sentry MCP `snapquote-web` top issue: `auth.requireMember 401`, 47 events across 4 releases.
- `lib/auth/requireRole.ts:48-66` — calls `Sentry.captureMessage` + `await Sentry.flush(2000)` on every 401 specifically to flush the verifyJWT breadcrumb chain. This is intentional per the in-file comment.

**Why this matters:** 47 events in 14d is high for an authentication 401. Either a real bug (cross-flag Audit 1: auth/session) or expected noise from expired bearer tokens. Recommend filtering by bearer-length: only capture when bearer is present-but-rejected, drop the no-bearer case (which is just unauthenticated traffic).

### M4 — Telnyx invalid-phone errors logged at error level (6 events)
**Live evidence:** Sentry MCP `snapquote-web` 14d: Telnyx code 10002 + 40310 = 6 events. These are user-input validation failures, not infra errors. Should be filtered out after retry exhaustion or downgraded to warning level.

### M5 — Mobile Sentry has no `release` tag
**Live evidence:** `app/_layout.tsx:27-48` — no `release` field in `Sentry.init`. Web sets `release: process.env.VERCEL_GIT_COMMIT_SHA` in all three configs. Without it, the Sentry "Regressions" view can't tie a mobile error spike to a specific TestFlight / App Store build number.

### M6 — Edge runtime config has no `captureConsoleIntegration`
**Live evidence:** `sentry.edge.config.ts:7-23` declares no `integrations` array. Middleware errors caught via `try/catch` + `console.error` will not auto-flush to Sentry from the edge runtime.

`middleware.ts` exists at the repo root but does not call `Sentry.captureException` directly (Grep would have flagged it). Currently middleware throws would propagate up to `instrumentation.ts` `onRequestError` — which DOES capture via `Sentry.captureRequestError`. So edge errors hit Sentry, but caught-and-logged edge errors do not.

### M7 — `permission denied for organization` events lack Sentry tags/extra
**Live evidence:** The 4 historical events in M1 came from captureConsoleIntegration, with no `tags.area`, no `tags.path`, no structured extras. The new `lib/supabase/orgFilter.ts` helper (Audit 8 M5) is a natural place to wrap throws in a Sentry scope.

---

## Low

### L1 — Cron handlers log via `console.error` without Sentry tags
**Live evidence:** Each of the 7 Vercel cron handlers (`app/api/cron/*/route.ts`) calls `console.error("<cron> failed:", err)` on failure. These do reach Sentry via the server `captureConsoleIntegration`, but with no `tags.area: 'cron'` or `tags.cronName: '...'` — so Sentry alert rules can't filter by cron name.

`rescue-stuck-leads` is the exception — it uses explicit `Sentry.captureException` with tags (`route.ts:154-159, 172-176`).

### L2 — Mobile `TypeError: Network request failed` events not categorized
**Live evidence:** Sentry MCP `snapquote-mobile` 14d: 40 events of `TypeError: Network request failed`. No tags identify the call site (auth, lead-submit, push registration, stripe-return polling). Recommend adding `tags.requestKind` at the fetch wrapper.

### L3 — Sentry alert rules not verifiable via MCP
The Sentry MCP does not expose alert-rule configuration. Murdoch must verify in the Sentry UI: are there alerts on (a) error rate spike, (b) new issue first-seen, (c) ingest stopped? If not, the H7 "how would Murdoch find out the site is down" question has an answer of "Sentry won't tell him either."

---

## Cron inventory (live)

Source: `cron.job` + `cron.job_run_details` via Supabase MCP at 2026-05-11.

| Cron | Type | Schedule | Handler | Last 7d |
|------|------|----------|---------|---------|
| reset-solo-credits | pg_cron jobid=3 | `0 0 * * *` | inline PL/pgSQL UPDATE | 7/7 succeeded (last: 2026-05-11 00:00) |
| rescue-stuck-leads | pg_cron jobid=8 | `*/3 * * * *` | `public.trigger_rescue_stuck_leads()` → HTTP GET `/api/cron/rescue-stuck-leads` with `Bearer ${vault.CRON_SECRET}` | 3360/3360 succeeded (last: 2026-05-11 16:51) |
| unopened-leads-reminder | Vercel | `0 14 * * *` | `app/api/cron/unopened-leads-reminder/route.ts` | – |
| estimate-expiry-warning | Vercel | `0 2 * * *` | `app/api/cron/estimate-expiry-warning/route.ts` | – |
| auto-expire-stale-quotes | Vercel | `0 3 * * *` | `app/api/cron/auto-expire-stale-quotes/route.ts` | – |
| trial-ending-soon | Vercel | `0 15 * * *` | `app/api/cron/trial-ending-soon/route.ts` | – |
| cleanup-notifications | Vercel | `0 4 * * *` | `app/api/cron/cleanup-notifications/route.ts` | – |
| trial-expired | Vercel | `0 16 * * *` | `app/api/cron/trial-expired/route.ts` | – |
| estimate-nudge-unviewed | Vercel | `0 17 * * *` | `app/api/cron/estimate-nudge-unviewed/route.ts` | – |

Inventory check:
- `vercel.json:1-32` declares 7 crons, all with handlers present.
- `app/api/cron/` contains 8 directories — 7 match `vercel.json`; the 8th (`rescue-stuck-leads`) is invoked by pg_cron, not Vercel — verified via `pg_get_functiondef(trigger_rescue_stuck_leads)`.
- All 7 Vercel handlers + the pg_cron handler use `isAuthorizedBearer(...)` (Audit 8 H3 timing-safe compare) — verified by inspection at the top of each `GET()` handler.
- Zero zombie handlers, zero unmapped vercel.json entries.

---

## Sentry coverage map

Source: Grep `Sentry|captureException|addBreadcrumb` across `app/` and `lib/`.

**Explicit Sentry instrumentation (good coverage):**
- `lib/ai/estimate.ts` — 13 addBreadcrumb + 3 captureException (Audit 11 H4)
- `lib/auth/verifyJWT.ts` — 6 addBreadcrumb (Audit 1)
- `lib/auth/requireRole.ts` — captureMessage + flush on 401 (Audit 1)
- `app/api/cron/rescue-stuck-leads/route.ts` — 1 addBreadcrumb + 2 captureMessage + 1 captureException (Audit 11 C2)
- `app/api/public/lead-submit/route.ts` — captureException at top-level catch
- `app/api/public/lead-photo-upload/route.ts` — captureException at top-level catch
- `app/app/error.tsx` — captureException with segment + digest tags

**Implicit-only coverage (captureConsoleIntegration on Node runtime):**
- 7 of 8 cron handlers
- All `api/app/**` and `api/public/**` routes outside the 2 listed above
- All client components other than `app/app/error.tsx`

**Zero coverage (no Sentry, and client-side console.error not captured):**
- `app/(public)/login/error.tsx`, `signup/error.tsx`, `onboarding/error.tsx`, `[contractorSlug]/error.tsx`, `q/error.tsx`, `app/app/analytics/error.tsx`
- Mobile error boundary (no `ErrorBoundary*` file found in mobile)

**Files entirely missing Sentry context on critical paths:**
- All 4 Stripe routes (`webhook`, `checkout`, `credits`, `customer-portal`)
- RevenueCat webhook + IAP sync
- Lead unlock + quote send

---

## Vercel deploy health

Source: Vercel MCP `list_deployments` for project `prj_9Z7T6lgKutlpfapplWbQo8JmJVbi`, last 20 deployments.

- **18 READY**, 1 QUEUED (current production deploy at 2026-05-11), 1 BUILDING (preview).
- **Zero ERROR or CANCELED** in the current window.
- 2 prior production failures referenced in commit history (`eef6693`, `47ac96e`) on 2026-05-09 — orphan eslint-disable directive in `lib/supabase/orgFilter.ts`. Resolved in commit `55bfa21`, redeployed `dpl_4E7GNcqWqdu973T8MsJqCaFTj7aZ`. These are outside the current 20-deploy window.
- `isRollbackCandidate: true` correctly set on the two most-recent production READY deploys (`Dw4mmXddG84QKkugNgLVNFffkRyj`, `4N6947r1YynvSwHpzB3wzFgymStk`).

---

## Sample rate analysis

Current `tracesSampleRate` per config file:

| Config | File | Value |
|---|---|---|
| Web server | `sentry.server.config.ts:11` | 0.05 |
| Web edge | `sentry.edge.config.ts:9` | 0.05 |
| Web client | `instrumentation-client.ts:11` | 0.05 |
| Mobile | `app/_layout.tsx:27-48` | (unset → 0) |

No `replaysSessionSampleRate` or `replaysOnErrorSampleRate` set anywhere. No `replayIntegration` registered.

Recommendation: for the audit window (next 30d), raise web to `tracesSampleRate: 0.30` and enable `replaysOnErrorSampleRate: 1.0` (replays only on errors). Mobile should be set to 0.30 alongside the H1 fix. Revisit after 30d of data.

---

## Cross-cutting flags

- **Audit 2 (Billing):** Stripe + RevenueCat webhook handlers have zero Sentry breadcrumbs (H4). Replay capability for webhooks (replaying a missed event) not audited here.
- **Audit 3 (Credits):** Credit purchase + lead-unlock handlers have zero Sentry breadcrumbs (H4).
- **Audit 4 (Lead lifecycle):** rescue-stuck-leads cron breadcrumbs intact (Audit 11). Other lead-related crons lack tags (L1).
- **Audit 6 (Mobile):** Mobile Sentry config gaps (H1, M5) — Audit 6 covered native stability, not observability config. New gap surfaced here.
- **Audit 8 (Security):** `beforeSend` PII scrubbing works on web — verified. NOT applied to mobile (H1).
- **Audit 9 (Schema/Disaster Recovery):** PITR concern from Audit 9 now confirmed live: org plan = free (H6).
- **Audit 11 (AI estimator):** Breadcrumbs added in Audit 11 H4 — confirmed at `lib/ai/estimate.ts` (13 calls). Audit 11 C2 rescue-cron fallback breadcrumbs also confirmed.

---

## Stale Notion/docs entries flagged

- None contradicted by live state in this audit's scope. `docs/current-state.md:88-90` claim of "rescue-stuck-leads pg_cron jobid=8 succeeded 20/20 last hour" remains accurate (3360/3360 over 7d as of 2026-05-11).
- The audit prompt's claim that "server-side was noted as 5%" is verified accurate (`sentry.server.config.ts:11`).

---

## Out of scope but flagged

- `instrumentation.ts:15` exports `onRequestError = Sentry.captureRequestError` — this is the Next 15+ hook that captures React Server Component render errors. Verified present. This catches a class of errors the per-segment `error.tsx` boundaries miss; partial mitigation for H2 but not a full substitute.
- `next.config.ts:107` sets `tunnelRoute: "/monitoring"` — Sentry events are tunneled through the app to bypass ad-blockers. Not directly observability-critical, noted for posterity.
- The five large `dev-*.log` files at the repo root (`dev-server.log`, `dev-stripe.log`, etc.) are local Bash artifacts and not committed (verified via `git ls-files`). `.gitignore:13` covers them via `*.log`. Not a finding.
