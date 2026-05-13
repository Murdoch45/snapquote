# SnapQuote — Current State

> ⚠️ **FOR REFERENCE ONLY — DO NOT TREAT AS GROUND TRUTH.**
> This document is maintained by hand and may lag behind the actual codebase.
> Always verify against the real code before acting on anything here.
> The audit session content (April 15–20, 2026) is the most reliable portion.
> Older sections carry more uncertainty.

## Step-2 landing video: native iPhone styling + horizontally centered via object-position 60% — 2026-05-13 [Source: Claude Code]

`public/videos/landing/step-2.mp4` (978×1448, AR 0.6754) is rendered inside the `PhoneFrame` in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) with `variant: "web"` set only on `STEPS[1]` (steps 1/3/4 default to `"default"` and render byte-identically to before). For `variant === "web"`:
- The phone frame renders a synthetic iOS status bar overlay (`absolute inset-x-0 top-0 z-10 h-[28px] bg-white`, inline SVGs for the 4-bar signal / 3-arc wifi / battery glyphs at right, "9:41" left in SF Pro / system-ui semibold at 11/12px, black on white to match the form's white background) and a small dark home indicator pill (`absolute bottom-[6px] h-[3.5px] w-[88px] bg-[#0B0E14]/85` lg:`w-[96px]`).
- The `<video>` element gets `object-cover object-[60%_50%]` (vs `object-center` for the default variant) — the Canva recording's form content sits right of the source's horizontal center so default center-crop clips the form's right edge. Visible window biased right by 10 percentage points (left crop ~172 source px, right crop ~115) lands the form with roughly equal ~6–7 display px margins on both sides of the phone frame.

The 978×1448 crop's residual ~80 px top + ~40 px bottom whitespace maps to ~28 px / ~14 px at the phone-frame's display scale (504/1448 = 0.348), which is exactly what the status bar and home indicator overlays cover, so the form starts immediately below the status bar with no visible empty white in most frames. Side cropping is ~14.7%/side. Steps 1/3/4 untouched. `npx tsc --noEmit` clean.

---

## Landing-page screen recordings re-encoded to remove baked-in whitespace — 2026-05-12 [Source: Claude Code]

After the initial swap landed (entry below), Murdoch reported the videos rendered with significant empty white space inside the phone frame — the phone frame felt much larger than the visible video content. Root cause: the source MP4s had whitespace baked INTO the encoded video content, not the CSS layout. Measured at full resolution with a Node-side PNG whitespace scanner (min top/bottom rows that were ≥95% white across all sampled frames): step-1 had 247px top + 309px bottom of white; step-2 had 416 + 372; step-3 had 420 + 159; step-4 had 228 + 351 — meaningful 11–25% top whitespace per video on top of the original 978×2116 frame. CSS was already correct (`absolute inset-0 h-full w-full object-cover object-center` on the `<video>`, parent `overflow-hidden` with aspect-locked container, object-fit:cover verified via `preview_inspect`); the placeholder rendering path was untouched. Fix: re-encoded all four MP4s in [`public/videos/landing/`](../public/videos/landing) with `ffmpeg-static`-installed ffmpeg using per-video `crop=978:H:0:Y` to remove only the safe whitespace bounds, then `libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart`. New dimensions: step-1 978×1560, step-2 978×1328, step-3 978×1536, step-4 978×1536. New aspect ratios (0.63–0.74) are wider than the phone frame's 0.476, so `object-cover` now fits HEIGHT and crops the sides — losing the iPhone status-bar gutter (top) and the home-indicator strip (bottom) instead of leaving them visible as empty white. Side cropping is 12–18% per side; the centered mobile UI content survives. Also added explicit `object-center` Tailwind class to the `<video>` className for clarity. `npx tsc --noEmit` clean.

---

## Landing-page "How it works" screen recordings shipped — 2026-05-12 [Source: Claude Code]

Public landing page at `/` now plays 4 silent autoplaying loops in the "How it works" phone frames instead of placeholder dashed-text labels. Videos live at `public/videos/landing/step-{1,2,3,4}.mp4` (8.8 MB total). `PhoneFrame` in [`app/(public)/page.tsx`](../app/%28public%29/page.tsx) extended with an optional `videoSrc` prop — when set, renders `<video autoPlay loop muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover">` inside the existing `aspect-[256/520]` rounded-[28px] container, falling back to the placeholder dashed-text rendering when absent (kept so the component stays reusable). The notch element is omitted when video is rendering so it doesn't sit on top of the recording. Step 2 (browser-recorded customer form) has a different aspect ratio than the other three — `object-cover` crops to fit. No layout/spacing/alternating-arrangement changes. `npx tsc --noEmit` clean.

---

## Pacific Edge Property Care demo org seeded — 2026-05-12 [Source: Claude Code]

Production Supabase org `5418e6b8-47c8-4365-b2b7-354224f4909d` ("Pacific Edge Property Care", slug `pacific-edge-property-care`, BUSINESS plan, 100 monthly_credits, 0 bonus, owner `jose@pacificedgepropertycare.com`) seeded with 10 fully-AI-processed unlocked leads + DRAFT quotes for marketing/recording. Real AI estimator ran server-side on each lead via `/api/internal/run-estimator` (same code path the public lead-submit handler hits through the Edge Function). One-off seed: [`scripts/seed-demo-leads.ts`](../scripts/seed-demo-leads.ts) — safe to delete post-recording. Org is real prod data and counts in analytics (no `is_test` flag exists; per Audit 4).

---

## Build 20 fix pass (web) — 2026-05-11 [Source: Claude Code]

Three web-side fixes shipped against the Build 19 TestFlight findings audit (see [`docs/audit-build-19-findings-2026-05-11.md`](audit-build-19-findings-2026-05-11.md)): per-channel coercion in `QuoteComposer.tsx` so contractors can email phone-less leads (PW-B19-1); `/auth/callback` removed from AASA so iOS no longer hijacks web Apple Sign In into the installed app (PW-B19-5, Option A per Murdoch); dispatch-side dedup in `lib/pushNotifications.ts` so duplicate `push_tokens` rows don't produce N×push deliveries (PW-B19-7). Full per-finding rationale in [`docs/updates-log.md`](updates-log.md).

---

## Audit 12 (notifications) fix pass — web — 2026-05-11 [Source: Claude Code]

Web bundle: H1 (new Telnyx DLR webhook at `app/api/webhooks/telnyx/route.ts`, Ed25519 signature verify, persists `sms_delivery_status`/`sms_delivered_at`/`sms_failure_reason` on quotes, inserts QUOTE_DELIVERY_FAILED notification on carrier failure; migration `20260511234500_audit12_h1_quotes_sms_delivery_columns` adds the columns + partial index on `telnyx_message_id`), H2 (RC RENEWAL gates `sendPlanUpgradedEmail` on plan-actually-changed — was firing on every cycle; Stripe handler already correct), H3 (push body for ESTIMATE_ACCEPTED and ESTIMATE_NOT_VIEWED no longer contains customer name; in-app feed text is unchanged because it's auth-gated), M2 (ESTIMATE_VIEWED + ESTIMATE_ACCEPTED in-app rows now use `screen: "lead"` to match the push payload — both tap targets land on lead detail), M3 (unopened-leads-reminder threshold reads `UNOPENED_LEADS_REMINDER_THRESHOLD` env var with fallback to 10), H4 web (every push-dispatch catch in `lib/pushNotifications.ts` now calls `Sentry.captureException` with `area: "push"` + `org_id`; breadcrumb on start and done), M1 web (push payload now includes `badge` field set to org's unread-count from `notifications`), L4 (Expo push URL switched from `exp.host` to `api.expo.dev`). Telnyx messaging profile `40019d6e-d8b1-447b-8d8b-bdc03ca9ceab` webhook_url updated via Telnyx MCP to `https://snapquote.us/api/webhooks/telnyx`. **`TELNYX_PUBLIC_KEY` env var required in Vercel production before signature verification will accept any payload** — Murdoch must add via the Telnyx portal (Account Settings → API → Public Key, PEM or base64 32-byte). `npx tsc --noEmit` clean.

---

## Audit 7 fixes (Web Stack & Backend) — 2026-05-11 [Source: Claude Code]

User-prioritized subset shipped: H1 (rate limit 3 public quote endpoints — GET 60/hr, accept 5/hr, viewed 60/hr, keyed on ip+publicId), H2 (rate limit /api/public/auth/mobile-handoff — `handoff:user:` 6/hr + `handoff:ip:` 15/hr Promise.all, mirrors forgot-password pattern), H4 (`maxDuration = 60` on Stripe + RC webhooks — both had `runtime = "nodejs"` but no timeout export, cron handlers already set this), M3 (rate limit /api/public/auth/bootstrap — `bootstrap:user:` 5/hr post-auth), M7 (`getAppUrl()` replaces hardcoded `https://snapquote.us/app/quotes` in estimate-nudge cron fallback), L1 (tsconfig `forceConsistentCasingInFileNames: true`). M6 SKIPPED — live verification at HEAD showed the 4 `void sendPlanUpgradedEmail`/`sendPlanEndedEmail` calls in stripe/webhook/route.ts ARE already at the end of their containing handlers (handleCheckoutCompleted line 288 is the last line; handleSubscriptionChanged line 336 last in conditional; handleInvoicePaid line 394 last in try; handleSubscriptionDeleted line 439 last in conditional). The audit doc's M6 description was wrong about the live state. H3/H5/M1/M2/M4/M5/L2/L3/L4 deferred per user triage. `npm run typecheck`: 0 errors.

---

## Audit 7 (Web Stack & Backend) — 2026-05-11 [Source: Claude Code]

Read-only audit at HEAD `1d6e834`. Zero Critical; 5 High + 7 Medium + 4 Low. All Audit 8 + Audit 13 fixes verified intact at HEAD. Headlines: 3 public routes lack rate limiting (quote/publicId GET/accept/viewed, mobile-handoff, bootstrap); Stripe + RC webhooks have no maxDuration export with 5-7 sequential writes; `/api/public/onboard` still uses GoTrue `admin.auth.getUser(accessToken)` (the race that motivated `verifySupabaseJWT` everywhere else); no `/api/health` + no external uptime monitor (cross-flag Audit 13 H7). 20/20 most-recent Vercel deploys READY, current prod is the audit HEAD. tsc clean. npm audit: 0 critical/high, 2 moderate (next-bundled postcss, deferred to Next 16). Supabase advisors: 2 ERROR (SECURITY DEFINER views — intentional design), 2 INFO (RLS-enabled-no-policy on service-role-only tables). 14 Audit 13 fix points all verified intact. Full report at `docs/audit-7-web-backend-2026-05-11.md`.

---

## Audit 12 (notifications) diagnosed — 2026-05-11 [Source: Claude Code]

Full report: [docs/audit-12-notifications-2026-05-11.md](audit-12-notifications-2026-05-11.md). Read-only diagnostic of push (Expo), email (Resend — `snapquote.us` verified, sending enabled), SMS (Telnyx), and in-app realtime (`notifications` table, RLS-gated, 50/org trigger + 7-day TTL cron). 0 critical, 4 high (Telnyx DLR webhook still missing per Audit 4 PW-A4-21; RC RENEWAL fires "plan upgraded" email every cycle; customer name in lock-screen push body; push dispatch + mobile registration have no Sentry capture), 9 medium, 5 low. Findings + to-dos also in Notion.

---

## Audit 3 fixes (Credits & Quota) — 2026-05-11 [Source: Claude Code]

C2 + H7 + H3 (auto-fixes H1) + H4 + H2 shipped. M4 lands separately on mobile.

- **C2 — DRAFT-quote retry on already-unlocked path.** `app/api/app/leads/unlock/route.ts:128-181` (post-fix) — if the already-unlocked branch finds no existing DRAFT quote, attempts a recovery insert with the same shape as the happy-path insert. Wrapped in try/catch — recovery failure tagged `stage: 'draft-creation-retry'` to Sentry and returns publicId:null (worst case = current behavior). Happy-path branch untouched.
- **H7 — `charge.refunded` partial-refund double-deduct fixed.** Migration `20260511183247_audit3_h7_credit_purchases_refunded_at` adds `credit_purchases.refunded_at timestamptz NULL`. `app/api/stripe/webhook/route.ts:512-540` (post-fix) — `handleChargeRefunded` atomically claims the refund slot via `UPDATE credit_purchases SET refunded_at=now() WHERE purchase_reference=? AND refunded_at IS NULL`; returns no rows ⇒ skip cleanly (already refunded or no row). Then calls `refund_bonus_credits`.
- **H3 — `reset-paid-credits` cron added.** Migration `20260511183257_audit3_h3_reset_paid_credits_cron` schedules a daily 00:00 UTC job mirroring `reset-solo-credits` but `WHERE plan IN ('TEAM','BUSINESS')`. Live: 4 paid-plan orgs (2 TEAM, 2 BUSINESS) eligible at fix time; next nightly run (2026-05-12 00:00 UTC) catches them.
- **H4 — `lead.unlock_blocked` audit_log action.** New action type added to `lib/auditLog.ts` `AuditAction` union; `app/api/app/leads/unlock/route.ts:30-58` (post-fix) — 402 cap-hit path now fires `recordAudit({action:'lead.unlock_blocked', metadata:{reason}})` via `after()` before the response.
- **H2 — dead `reset_due_solo_monthly_credits()` function dropped.** Migration `20260511183236_audit3_h2_drop_dead_reset_function`. Cron jobid=3 was running inline SQL (different body); function was orphaned. Live `pg_proc` rowcount = 0 post-fix.

Live verification (post-migration, Supabase MCP):
- H2 function exists → 0 rows ✅
- H7 `credit_purchases.refunded_at` exists → 1 row ✅
- H3 `reset-solo-credits` active=true; `reset-paid-credits` active=true, schedule `0 0 * * *` ✅
- H3 stale paid orgs that next cron run will catch: 4 orgs (2 TEAM at mc=5 → 20; 2 BUSINESS at mc=86/98 → 100).

Migration versions applied: `20260511183236`, `20260511183247`, `20260511183257` (live `supabase_migrations.schema_migrations`).

Skipped (per fix-pass scope): C1 (test data only, self-heals via lazy reset), H5 (business decision pending), H6/M9 (multi-day project), L1 (RLS already blocks anon), L2 (cosmetic), other M findings.

---

## Audit 13 fixes live-verified — 2026-05-11 [Source: Claude Code]

Production deploy `dpl_Br8miWnDt48D1v5Y43BFZufd1gwo` (commit `6a236e63`) READY at 2026-05-11 17:59:40 UTC. `curl -I https://snapquote.us/` returns 307 → `https://www.snapquote.us/` 200 OK with the full security-headers/CSP report-only set. `curl -I https://www.snapquote.us/login` returns 200 OK. Sentry MCP search on `snapquote-web` (project id `4511244273123328`):
- Total errors on the new release `6a236e63...` over the first hour post-deploy: **0**.
- Total errors project-wide over last 24h: **1** (a single DEP0169 event timestamped 2026-05-10 19:53 UTC on the previous release `9dc5b423...` — pre-fix; M2 filter not yet active when it landed). Zero DEP0169 events on the new release.
- `auth.requireMember 401` events over last 24h: **0** (was top issue at 47 events / 14d, ≈ 3.4/day pre-deploy — confirms M3 no-bearer downgrade is active).
- New issues `firstSeen:-1h`: **0** — no regression spikes.
- `has:tags[pg_error_code]`: 0 results (no Postgres 42501 errors fired in the window, so M7 tagging hasn't had a candidate event to verify against — verify on next 42501).

Verification result: shipped fixes are deployed cleanly with no observable regression. M2 + M3 confirmed working by the absence of expected pre-fix events. H1 (mobile) merged separately to mobile main `0641e7b`; mobile verification deferred until next TestFlight build cycles real device traffic.

---

## Audit 13 observability fixes shipped — 2026-05-11 [Source: Claude Code]

H1, H2, H3, H4, H5, M2, M3, M4, M6, M7 all shipped. Web: `instrumentation-client.ts:18-37` adds `captureConsoleIntegration` + `replayIntegration` (replaysOnErrorSampleRate=1.0, session=0), bumps `tracesSampleRate` to 0.2; `sentry.edge.config.ts:15-19` adds `captureConsoleIntegration`; `sentry.server.config.ts:13` bumps `tracesSampleRate` to 0.2. All three `beforeSend` hooks now call `isKnownSentryNoise` first to drop `[DEP0169]` warnings. `lib/sentryScrub.ts` now stamps `pg_error_code` and `org_id` tags on Postgres error events before UUID scrubbing. New `app/global-error.tsx` catches root-layout crashes with `Sentry.captureException`. `lib/auth/requireRole.ts:42-87` converts no-bearer 401s to an info breadcrumb (kept warning-level captureMessage for bearer-present 401s only). `lib/telnyx.ts` + `lib/notify.ts` Telnyx user-input failure paths now `Sentry.captureMessage` at warning level instead of `console.error`. 8 revenue/auth handlers (`app/api/stripe/{webhook,checkout,credits,customer-portal}/route.ts`, `app/api/revenuecat/webhook/route.ts`, `app/api/iap/sync/route.ts`, `app/api/app/leads/unlock/route.ts`, `app/api/app/quote/send/route.ts`) now `Sentry.captureException` at top-level catch with `tags.area` + tenant identifiers. Mobile: new `lib/sentryScrub.ts` (parity with web) wired into `app/_layout.tsx:27` `Sentry.init` via `beforeSend`/`beforeBreadcrumb`; `environment`, `release` (version+build), `tracesSampleRate: 0.1` added. H6 (PITR upgrade) + H7 (uptime monitor) intentionally deferred per work plan. M5 closed as a subset of H1.

`npx tsc --noEmit` clean on web. `npm run build` clean on web (full route compile). Mobile typecheck: only pre-existing baseline errors (TopBar.tsx tuple index, secureStorage.ts missing module type) — none from these changes.

---

## Audit 13 observability + crons + ops re-audit at HEAD — 2026-05-11 (READ-ONLY) [Source: Claude Code]

Read-only audit. No code, schema, or data changed. Full report: `docs/audit-13-observability-ops-2026-05-11.md`.

- **Crons all healthy.** Supabase pg_cron jobs `reset-solo-credits` (jobid=3, daily) and `rescue-stuck-leads` (jobid=8, every 3 min) succeeded 7/7 and 3360/3360 respectively in last 7d (`cron.job_run_details` via Supabase MCP, 2026-05-11). All 7 Vercel daily crons in `vercel.json` map 1:1 to handlers under `app/api/cron/`. The 8th handler (`rescue-stuck-leads`) is invoked by pg_cron, not zombie — verified via `pg_get_functiondef(trigger_rescue_stuck_leads)`. All 8 handlers use timing-safe bearer compare (Audit 8 H3) at top-of-`GET()`.
- **Vercel deploys clean.** Last 20 deployments via Vercel MCP: 18 READY, 1 QUEUED (current), 1 BUILDING (preview). Zero ERROR or CANCELED in window. Rollback candidates flagged correctly on the 2 most-recent production READYs.
- **Web Sentry coverage**: PII scrubbing (`lib/sentryScrub.ts`) + UUID redaction (Audit 4 M6) verified live in all three configs (`sentry.server.config.ts:33-39`, `sentry.edge.config.ts:16-22`, `instrumentation-client.ts:16-23`).
- **Mobile Sentry coverage GAP (H1).** `app/_layout.tsx:27-48` has no `beforeSend`, no UUID redaction, no env tagging, no release tagging, default-zero trace sampling. Confirmed live leak: Sentry mobile event title `Error: cannot add postgres_changes callbacks for realtime:quotes:8f939f96-7f92-4973-97f8-f08450ccb71f:ALL` — UUID is the test org id.

### High findings at HEAD
- **H1** Mobile Sentry init lacks PII/UUID scrubbing, env, release, sample rate (`app/_layout.tsx:27-48`).
- **H2** 6 of 7 client error boundaries don't call `Sentry.captureException` and the client Sentry config has no `captureConsoleIntegration` — login, signup, onboarding, contractor public page, public quote page, analytics all invisible. Only `app/app/error.tsx:19-22` is wired.
- **H3** No `app/global-error.tsx` — root-layout crashes generate no Sentry event.
- **H4** Stripe webhook + checkout + credits + customer-portal, RevenueCat webhook, IAP sync, lead unlock, quote send — zero explicit Sentry instrumentation. Rely on captureConsoleIntegration only; stack traces with no breadcrumb context.
- **H5** `tracesSampleRate: 0.05` web (all three configs), default 0 on mobile. No replay sample rate, no `replayIntegration`. 5% explains the prior /app/leads outage surfacing with 4 instead of ~80 events.
- **H6** Supabase org plan = `free` (verified `mcp__supabase__get_organization`). No PITR. RPO 24h, 7-day backup retention. Cross-flag from Audit 9.
- **H7** No `/api/health` endpoint, no external uptime monitoring. Site-down detection latency unbounded.

### Medium findings
- **M1** 4 historical web Sentry events with leaked tenant UUID in title (release `ea90027`, 2026-05-08) — predates the M6 redaction fix (`e15b53b`, 2026-05-10). Verify next post-fix event title is clean; if not, add `event.title` to `scrubSentryEvent`.
- **M2** 18 events of Node `DEP0169` (url.parse deprecation, from Next.js internals) consume ~20% of 14d error budget. Filter in `beforeSend`.
- **M3** `auth.requireMember 401` top issue: 47 events / 14d / 4 releases. Either real bug (cross-flag Audit 1) or expected noise from no-bearer traffic that should be filtered.
- **M4** 6 Sentry-error-level Telnyx invalid-phone (10002/40310) events — user-input errors, should downgrade.
- **M5** Mobile Sentry has no `release` tag — can't tie regressions to build numbers.
- **M6** `sentry.edge.config.ts` has no `captureConsoleIntegration` — caught-and-logged edge errors don't reach Sentry.
- **M7** `permission denied` events have no Sentry tags/extras — wrap calls through `lib/supabase/orgFilter.ts` (Audit 8 M5) in a Sentry scope.

### Low findings
- **L1** Cron handlers `console.error` without `tags.cronName` — Sentry alert rules can't filter by cron.
- **L2** Mobile 40-event `TypeError: Network request failed` swarm has no `tags.requestKind` for call-site triage.
- **L3** Sentry alert rules not verifiable via MCP — Murdoch must inspect Sentry UI to confirm error-rate / ingest-stopped / new-issue alerts are configured.

### Cross-cutting flags
- Audit 2 (Billing): Stripe + RC webhooks have zero Sentry breadcrumbs (H4).
- Audit 3 (Credits): Credit purchase + lead unlock have zero Sentry breadcrumbs (H4).
- Audit 6 (Mobile): Audit 6 covered native stability, not Sentry config; new gaps (H1 + M5) surface here.
- Audit 8 (Security): Web `beforeSend` scrubber verified; mobile lane uncovered.
- Audit 9 (DR/PITR): PITR concern confirmed live — org plan = free (H6).
- Audit 11 (AI estimator): Pipeline breadcrumbs verified intact (13 in `lib/ai/estimate.ts`).

---

## Audit 11 AI estimator re-audit at HEAD — 2026-05-09 (READ-ONLY)

Read-only re-audit; no code or schema changed. Full report `docs/audit-11-ai-estimator-2026-05-09.md`.

- **Pipeline solid:** Model `gpt-5-mini` confirmed live (`lib/ai/estimate.ts:3762, 4366`); vision via `input_image` at `:3735`; strict JSON schema enforcement via `zodTextFormat(aiSignalsResponseSchema)` at `:422-424` + `:3767`; per-call AI timeout `STRUCTURED_AI_TIMEOUT_MS = 35000` at `:381`; property data 8s, polish 10s; catch-block fallback in `generateEstimateAsync:4768-4865`; `ai_retry_count` retry cap of 2 in rescue cron.
- **Latency live (Supabase MCP, last 30d, first-attempt successful, n=39):** p50 = 28.05s, p90 = 40.21s, p99 = 88.54s. **Above the 25s revisit threshold.** Polish (second AI call) is on the critical path before `ai_status="ready"` writes.
- **Failure rate:** 2 / 47 leads in last 30d → `ai_status='failed'`; both with NULL estimates and string-shape `ai_estimator_notes` from the rescue-cron Stage-1 give-up path.
- **Sentry coverage:** 30-day search for `area:estimator` / `tags[area]:estimator` / `stack.module:lib/ai/estimate` returned 0 events. Catch-fallback recovery is silent. No breadcrumbs around the OpenAI call.

### Critical at HEAD
- **C1 — `_other_text` and `_contractor_note` answer keys stripped before AI sees them.** `sanitizeAnswersForModeling` at `lib/ai/estimate.ts:1889-1894`; called by both prompt builder (`:3374`) and engine builder (`:1885`). Prompt at `:3338` instructs the model to use "any other-text answer fields" but those fields never reach the prompt. Customer's free-text clarifications on multi-choice questions are invisible to AI and engine.
- **C2 — Rescue-cron Stage-1 give-up writes no fallback estimate.** `app/api/cron/rescue-stuck-leads/route.ts:82-91` flips `ai_status` past 15 min without computing a price. Live: 2 affected leads in last 30d (`25d8964d`, `718642d6`) — both NULL estimates, contractor sees New Lead notification with no price.

### High at HEAD
- **H1** Photo order non-deterministic (`lib/ai/estimate.ts:4607-4612`, no `.order()`).
- **H2** `ai_estimator_notes` shape inconsistency (string from rescue cron, array from estimator) — same issue Audit 4 M1 flagged.
- **H3** p50 latency above 25s threshold — driven by tandem signal+polish OpenAI calls and large schema.
- **H4** No `estimatedQuantity` cross-check vs `propertyData.lotSizeSqft` (schema unbounded at `lib/ai/estimate.ts:220`).
- **H5** `confidenceLabel` (`lib/ai/estimate.ts:4231-4234`) doesn't differentiate AI-source vs fallback-source — contractor UI sees identical labels.
- **H6** No Sentry breadcrumbs around the OpenAI call; only top-level `captureException` at 3 catch sites.

### Stale entries flagged
- Bugs & Fixes 2026-05-04 entry says `STRUCTURED_AI_TIMEOUT_MS = 40000`. HEAD value is **35000**. Notion stale.

---

## Audit 4 lead-lifecycle re-verified at HEAD — 2026-05-09 (READ-ONLY)

Read-only Audit 4 against web HEAD `eef6693`. NO code or schema changed. Full report at `docs/audit-4-lead-lifecycle-2026-05-09.md`.

- **Verdict:** Lead lifecycle functional end-to-end. Zero Critical findings at HEAD. Six prior High items still open + one fresh High (8 ready-but-null-range leads from 2026-03-09 in org `8f939f96`).
- **High items still open:** DRAFT staleness 35 quotes, 25 over 30d (PW-A4-6); ARCHIVED phantom enum (H1); OPENED missing enum (H2); lead-photos bucket missing MIME/size enforcement (H8 / PW-A4-10); unlock route DRAFT-mint silent failure (H5 / PW-A4-7); lead-detail page 48-bit `randomBytes(6)` publicId fallback at `app/app/leads/[id]/page.tsx:174` (H6 / PW-A4-8); 8 leads `ai_status='ready'` with NULL `ai_estimate_low/high` (FRESH H7).
- **Cron health verified live:** rescue-stuck-leads pg_cron jobid=8 succeeded 20/20 last hour, sub-100ms; reset-solo-credits jobid=3 active; all 7 Vercel daily crons present in `vercel.json` and use timing-safe bearer compare (Audit 8 H3 fix verified).
- **Notification dedup index:** `notifications_new_lead_dedup_idx` exists with correct shape; 0 historical duplicates; 0 NEW_LEAD inserts since 2026-05-08 deploy (low-traffic period — index correctly shaped but not stress-tested by post-deploy traffic).
- **State machine integrity:** No leads in inconsistent state (no `lead.status='QUOTED'` without SENT-or-later quote, no `ACCEPTED` without ACCEPTED/EXPIRED quote).
- **AI pipeline integrity:** 0 leads stuck in `processing` >10min. 3 leads ever retried (max=1, none hit MAX_AI_RETRIES=2 cap). 4.7% failure rate (163/3473). Falcon org 30-most-recent leads complete in 21-96s except 3 outliers from 2026-05-04 that hit retry=1 (rescue cron working).
- **Cross-flags:** Audit 8 H6 PII scrubber doesn't redact org_id from error message bodies (4 hits in last 14d); custom Sentry tags `area:lead-submit/estimator` not surfacing in events search (possible scrubber-tag-stripping regression). Audit 11/12 to-dos noted in report.

## AASA file shipped — 2026-05-09 (Audit 8 H8 followup)

`app/.well-known/apple-app-site-association/route.ts` returns the Universal Links JSON (`U58KVR8LTA.com.murdochmarcum.snapquote`, `paths: ["*"]`) with `Content-Type: application/json`. Serves at `/.well-known/apple-app-site-association` on Vercel. Mobile entitlement (`app.json:89-91`) lists both `applinks:snapquote.us` and `applinks:www.snapquote.us`.

## Audit 8 web infra hardening — 2026-05-09 (H4, H6, H9, M5, M6, M7, M11, M12, L3)

Nine defense-in-depth fixes shipped in a single branch off `main` (`claude/audit-8-web-hardening`). Live diagnosis preceded each; nothing taken on Notion-only evidence.

- **H4 CLOSED — Security headers + CSP report-only.** `next.config.ts` now exports a `headers()` function returning Strict-Transport-Security (max-age=63072000; includeSubDomains; preload), X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/microphone/geolocation/etc. denied; payment kept enabled for Stripe Elements), and Content-Security-Policy-Report-Only with allowlists for Stripe.js, Cloudflare Turnstile, Google Maps, Supabase REST/Storage/Realtime WSS, RevenueCat, and Sentry tunnel ingest. CSP intentionally Report-Only first — TODO in `next.config.ts` says flip to enforcing after 1–2 weeks of clean violation reports. Verified live with `curl -sI` against `next start`: all six headers present.
- **H6 CLOSED — Sentry PII scrubbing.** `lib/sentryScrub.ts` (new) walks event payloads and redacts any key containing PII fragments (email/phone/address/name/ssn/token/password/lat/lng/etc.) while preserving stack traces. `beforeSend` + `beforeBreadcrumb` wired into `sentry.server.config.ts`, `sentry.edge.config.ts`, and a new `instrumentation-client.ts` (Sentry v10 / Next 15 client-side init convention — replaces the older `sentry.client.config.ts`).
- **H9 CLOSED — Distributed rate limiter.** `lib/rateLimit.ts` rewritten to use `@upstash/ratelimit` + `@upstash/redis` (sliding-window) when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present; falls back to in-memory `Map` when env vars are absent (local dev). Function signature went sync `boolean` → `Promise<boolean>`; all 6 callers updated to `await`. **Provisioning required: Murdoch must create the Upstash instance and add env vars to Vercel before the distributed path activates in prod.**
- **M5 CLOSED — `requireOrgFilter` admin-client helper.** `lib/supabase/orgFilter.ts` (new) wraps a query in `.eq('org_id', orgId)` and throws on empty orgId. Refactored 4 high-risk admin SELECTs to use it (`leads/unlock`, `quote/send` × 2, `public/quote/accept` post-acceptance lead read). Convention documented in module docstring: admin-client SELECTs against tenant tables MUST go through the helper or include an explicit org_id chain.
- **M6 CLOSED — Forgot-password key composition.** Now requires BOTH email-keyed (3/hr) AND IP-keyed (10/hr) gates to pass. Email-spray attackers now hit the IP cap before exhausting the Resend send budget. Both checks parallel via `Promise.all`.
- **M7 CLOSED — `x-real-ip` over `x-forwarded-for`.** `lib/ip.ts` (new) exports `getClientIp(request)` — prefers `x-real-ip` (Vercel-set, client cannot spoof) with fallback to `x-forwarded-for` first-hop for non-Vercel envs. All 4 call sites switched: `lead-submit`, `lead-photo-upload`, `leads/unlock`, `quote/send`. Convention: any code that needs the client IP MUST use this helper.
- **M11 CLOSED — Web npm audit.** Pre-fix 8 vulns (6 high, 2 moderate). `npm audit fix` resolved all 6 highs (next, picomatch, vite, fast-uri, flatted, lodash). Two moderate postcss vulns remain — transitive *inside* next@15.5.x's bundled compiler; not reachable from app code. Proper fix requires Next 16 major migration, deferred.
- **M12 CLOSED — Mobile npm audit.** `@xmldom/xmldom` 0.8.12 → 0.8.13 via `npm audit fix` in mobile repo (advisory is `<=0.8.12`). High count 1 → 0. Four moderate postcss vulns remain (expo-bundled, same shape as web — Expo major downgrade is the only fix; deferred).
- **L3 CLOSED — Explicit CORS stance.** No CORS handling kept (intentional — browser default blocks cross-origin reads, which is exactly what we want for the current architecture: same-origin public form, bearer-token mobile auth, cookie-auth `/api/app/*`). Documented the policy in a comment block at the top of `middleware.ts` with the trigger conditions for adding allowlist-driven CORS in future (embeddable lead form). Click-jacking is blocked by X-Frame-Options DENY + CSP frame-ancestors 'none' from H4.
- **Verification:** TS clean both repos, `next build --no-lint` succeeds, 76/76 vitest tests pass, headers validated via curl. Web audit: 8 vulns → 2 moderate. Mobile audit: 5 vulns → 4 moderate.
- **Flags for Murdoch:** (1) Upstash provisioning required for H9 distributed mode. (2) AASA file (Universal Links) deferred from Prompt 3 — needs `/.well-known/apple-app-site-association` served from web repo.

## Audit 8 auth hardening closed — 2026-05-09 (H1, H2, H3, H5)

Four web-side auth hardening fixes from Audit 8 shipped in one branch. Live diagnosis preceded each fix; no Notion-only claims acted on.

- **H1 — HS256 JWT fallback removed.** `lib/auth/verifyJWT.ts` now verifies access tokens via ES256 + the project's JWKS endpoint only. The legacy HS256 path keyed by `SUPABASE_JWT_SECRET` (lines 188-235 of the prior version) was deleted along with the cached HS256 key + the env var's reference. Verified live that the project JWKS at `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1/.well-known/jwks.json` exposes a single ES256 P-256 verifying key (`kid 85542139-701f-4514-a75c-76ec5c74cc4c`), so HS256 was unreachable for any newly-issued token and only widened forgery surface area. `.env.example` updated; the legacy `SUPABASE_JWT_SECRET` env var is no longer referenced by app code (only by the historical `scripts/jwt-verify-diagnostic.mjs`, which was simplified to drop the HS256 attempt).
- **H2 — Issuer pinned on JWT verification.** `verifySupabaseJWT` now passes `issuer: getExpectedIssuer()` to `jose.jwtVerify`. `getExpectedIssuer()` reads `SUPABASE_JWT_ISSUER` if set, otherwise derives `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1` (= `https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1` for prod). Cached after first read. Closes the theoretical risk of a token signed by a different Supabase project that happened to use `aud=authenticated` passing verification.
- **H3 — Cron + internal bearer comparisons made constant-time.** New helper `lib/auth/timingSafeBearer.ts` exports `safeEqualSecret(received, expected)` and `isAuthorizedBearer(authHeader, expected)` over `crypto.timingSafeEqual` with explicit length-mismatch short-circuit (since `timingSafeEqual` itself throws on length mismatch). All 8 cron handlers under `app/api/cron/*` (`auto-expire-stale-quotes`, `cleanup-notifications`, `estimate-expiry-warning`, `estimate-nudge-unviewed`, `rescue-stuck-leads`, `trial-ending-soon`, `trial-expired`, `unopened-leads-reminder`) and the `app/api/internal/run-estimator/route.ts` shared-secret check now route through the helper. External behavior unchanged: 401 on bad bearer, work runs on good bearer.
- **H5 — Reset-password gated to recovery-only sessions.** `app/auth/confirm/route.ts` now signs and sets a `sq-pwr` HttpOnly+Secure+SameSite=Lax cookie (10-min TTL) on successful `type=recovery` OTP verification. Cookie value: `${userId}.${expiresAtMs}.${hmac}` where the HMAC is SHA-256 keyed by `SUPABASE_SERVICE_ROLE_KEY` with a `sq-recovery-cookie-v1:` domain separator (avoids requiring a new env var). `app/(public)/reset-password/page.tsx` is now a server component that requires (a) a valid signed cookie, (b) an active session, (c) `cookie.userId === session.user.id` — otherwise renders a "reset link expired" view with a link back to `/forgot-password`. Closes the bypass where a logged-in (or session-hijacked) user could change the account password without re-entering the current one. Helper at `lib/auth/recoveryCookie.ts` (`signRecoveryToken`, `verifyRecoveryToken`).
- **Verification.** `npx tsc --noEmit` clean across the modified files. Live JWKS confirms ES256 only. End-to-end recovery flow trace: email → `/auth/confirm` → `verifyOtp` → cookie set → 302 to `/reset-password` → server component reads cookie + session, both match → form renders → `auth.updateUser({ password })` → redirect `/app`. Direct-nav trace (logged-in user hits `/reset-password` without going through the email): no recovery cookie → "reset link expired" view; form never renders.

## Audit 8 PII leaks closed — 2026-05-08 (C1, C2, H10)

Three Critical/High PII leaks from Audit 8 fixed and verified live in production. Migrations + supporting client changes shipped together.

- **C1 — `get_org_analytics` anon bypass: CLOSED.** Migration `20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views` REVOKEd EXECUTE from PUBLIC + anon (REVOKE FROM PUBLIC required since the prior PUBLIC=X grant kept anon effective). Function body's auth gate replaced: now `if v_role <> 'service_role' then if auth.uid() is null or not is_org_member(p_org_id) then raise exception …` — service_role server callers (web admin client + `unstable_cache` wrapper at `lib/db.ts:98`) bypass; authenticated callers must be a member; anon and missing-auth contexts are denied. Verified live via `curl -X POST .../rest/v1/rpc/get_org_analytics` with anon publishable key → HTTP 401 `42501 permission denied for function get_org_analytics`. Authenticated member call still returns full payload; non-member call rejected with 42501.
- **C2 — locked-lead PII reachable via PostgREST: CLOSED.** Same migration created `public.leads_safe` view (security_invoker=false; runs as postgres with BYPASSRLS) gating PII columns (customer_name, customer_phone, customer_email, address_full, address_place_id, lat, lng, description, parcel_lot_size_sqft) by LEFT JOIN to `lead_unlocks` and CASE-based projection. Tenant isolation enforced inside the view via `WHERE is_org_member(l.org_id)`. Direct SELECT on those columns from `public.leads` is now denied at the column-grant level for `authenticated` (corrective migration `audit8_pii_correct_table_revoke_and_column_allowlist` REVOKEd table-level SELECT and re-GRANTed only the 37 non-PII columns — column-level REVOKE alone was a no-op against the prior table-level grant). Mobile `lib/api/leads.ts` (getLeads + getLead) and web `app/app/leads/page.tsx`, `app/app/leads/[id]/page.tsx`, `app/app/page.tsx`, `app/app/customers/page.tsx`, `app/app/quotes/page.tsx` all switched to `from("leads_safe")` (or `lead:leads_safe(...)` for the quotes embed). Mobile cache key bumped `cache:leads:` → `cache:leads:v2:` (`lib/hooks/useLeads.ts`) so existing AsyncStorage entries with pre-fix unredacted PII are discarded on next launch. Verified live: `WHERE org_id=<murdoch> from leads_safe` returns 64 unlocked rows with full PII (54 phone / 63 email / 64 name / 64 address present) and 3,194 locked rows with all four PII counts = 0.
- **H10 — customers PII same shape: CLOSED.** Same migration created `public.customers_safe` view; LATERAL JOIN matches `lead_unlocks` rows for the same org with either `customer_phone` or `customer_email` matching the customer row, then CASE-gates name/phone/email columns. REVOKEd table-level SELECT on `public.customers` and re-GRANTed only id+org_id+timestamps to authenticated.
- **Design choice (Option B from prompt):** database VIEW with column-level grants. Picked over Option A (RLS row-level — PG can't conditionally return columns), Option C (server-route gating — would require redesigning every read path). Option B keeps RLS doing the membership work inside the view, leaves writes on the underlying table untouched, and lets admin-client code (service_role) read the underlying tables directly for back-office operations.
- **Production schema_migrations rows applied via Supabase MCP:** `audit8_pii_gating_revoke_anon_analytics_and_safe_views` + `audit8_pii_correct_table_revoke_and_column_allowlist`. tsc clean both repos. Mobile cache key bumped to invalidate any pre-fix cached PII.

## Audit 8 security & privacy — 2026-05-08 (READ-ONLY)

Read-only Audit 8 of 13 against web HEAD `27305ac`, mobile HEAD `f38b2f4`/`d2d992e`, Supabase `upqvbdldoyiqqshxquxa` live. NO code or schema changed.

- **Audit 2 C-7 (RLS plan-write hole) and C-12 (`get_org_credit_row` cross-tenant disclosure) VERIFIED FIXED LIVE.** Migration 0067 (recorded as `20260508204110`) closed both. `information_schema.role_table_grants` confirms `authenticated` has no table-level UPDATE on `organizations`; column-level UPDATE granted only on `name`, `onboarding_completed`, `slug`. `pg_get_functiondef` confirms `get_org_credit_row` body has `if not is_org_member(p_org_id) then raise exception … using errcode = '42501'`.
- **2 Critical net-new.** (1) **`get_org_analytics` anon bypass exploitable live** — POC: anonymous curl with publishable key returns full analytics for any org_id. Function is SECURITY INVOKER with anon EXECUTE; body guard is `if auth.uid() is not null and not is_org_member(p_org_id)`, which lets anon (auth.uid() IS NULL) skip. (2) **Locked-lead PII reachable via PostgREST.** RLS `leads_member_crud` is FOR ALL with no `lead_unlocks` filter — any authenticated org member can SELECT all PII columns regardless of unlock state; mobile `lib/api/leads.ts:53-54,166-179` projects PII unconditionally and caches to AsyncStorage.
- **10 High.** HS256 JWT fallback (`lib/auth/verifyJWT.ts:188-235`) — defense-in-depth concern; no leaked secret found in either repo's history. `verifyJWT` doesn't validate `iss`. All 8 cron handlers + `/api/internal/run-estimator` compare bearer with `!==` (timing-unsafe). Zero security headers anywhere. Reset-password page doesn't enforce recovery-only session. Sentry server config has no `beforeSend` redaction. Mobile auth tokens in AsyncStorage not SecureStore. AASA file missing → Universal Links broken; mobile deep-link handler accepts any host. Rate-limit is in-memory `Map` per lambda; many endpoints lack any rate-limit. `customers` RLS same shape as leads (full PII to any member).
- **12 Medium.** `lead-photos` bucket has no size/MIME enforcement. `is_org_member` + `is_org_owner` callable by anon (advisor 0028, body safe today). 6 SECURITY DEFINER functions have mutable search_path (advisor 0011). `iap_subscription_events` + `webhook_events` RLS-enabled with no policies (advisor 0008). Admin-client SELECTs in `app/app/leads/page.tsx:43-50` and `app/api/app/quote/send/route.ts:56-63` — fragile pattern. `forgot-password` rate-limit keys on email-only. `x-forwarded-for` first-segment used for IP rate-limit. Google Maps key bundle restriction unverified. Mobile deep-link host validation missing. Mobile `.env` tracked in git (only EXPO_PUBLIC_ keys, but a process risk). web `npm audit` 6 high (next, vite, lodash, picomatch, fast-uri, flatted); mobile `npm audit` 1 high (`@xmldom/xmldom`).
- **Realtime publication** publishes leads, notifications, pending_invites, quotes only — `pending_invites.token` only flows to owners (RLS gates broadcasts).
- **Storage** — single bucket `lead-photos`, public=false. 4 RLS policies all check `is_org_member(storage_org_id_from_path(name))`. No bucket-level size/MIME enforcement.
- **Notion stale entries flagged.** Audit 1 re-verification claim that `SUPABASE_JWT_SECRET` is committed in mobile `.env` line 7 is **FALSE**: live `.env` has 6 lines, all `EXPO_PUBLIC_*`. Audit 4 claim that `app/(tabs)/more/my-link.tsx:3` is the bare-apex constant is line 37 live.
- **Notion:** findings `35a32498-a1cb-814b-a751-c77aa3e64f47`, to-dos `35a32498-a1cb-816b-88ee-fb9298f0d1ef`. Severity tally: 2 Critical, 10 High, 12 Medium, 5 Low.

## Audit 9 RPC hardening — 2026-05-08 (H2, H3, L5)

Three function-level hardening fixes shipped in a single migration `20260508234346_rpc_hardening_search_path_row_lock_revoke_anon`. Verified live before and after.

- **H2 FIXED — `update_org_plan_credits` and `reset_org_credits` now have `SET search_path = public`.** Verified post-fix via `pg_get_functiondef`: both function bodies show `SET search_path TO 'public'` between the SECURITY DEFINER clause and the AS body. Supabase advisor `function_search_path_mutable` no longer flags either function.
- **H3 FIXED — `update_org_plan_credits` now acquires a row-level lock before mutation.** Function body now starts with `PERFORM 1 FROM organizations WHERE id = p_org_id FOR UPDATE` before the UPDATE statement. Matches the lock pattern in `refund_bonus_credits` and `unlock_lead_with_credits`. No deadlock risk — the function only touches the single `organizations` row identified by `p_org_id`, and all four billing-webhook callers (Stripe webhook, Stripe checkout, RC webhook, mobile `iap/sync`) call it once per webhook with no nested locks.
- **L5 FIXED — `is_org_member` and `is_org_owner` no longer callable by anon or PUBLIC.** Verified post-fix via `pg_proc.proacl`: both ACLs are `postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres`. Supabase advisor `anon_security_definer_function_executable` no longer flags either function. Required `REVOKE EXECUTE FROM PUBLIC, anon` (REVOKE FROM anon alone wouldn't have worked — anon would still have effective EXECUTE via PUBLIC). Verified safe: every RLS policy referencing these functions targets `{authenticated}` only (live `pg_policies` query, 20 policies on 11 tables — none target anon).
- **Sibling concerns NOT addressed (out of scope for this migration):** `plan_monthly_credits`, `prune_org_notifications`, `set_updated_at`, `storage_org_id_from_path` still have mutable search_path (advisor still flags them). Tracked in Pending Work for a future hardening pass.

## Audit 9 fixes — 2026-05-08 migration drift re-deployed (C1, C2, H1)

Three migration-drift fixes shipped from Audit 9. C3 documented as historical no-op (see "Known historical no-ops" below). NO code outside `supabase/migrations/` changed.

- **C1 FIXED** — `20260508233306_redeploy_contractor_profile_update_member_policy` applied via Supabase MCP. Verified live: `pg_policies` for `public.contractor_profile` now shows `contractor_profile_update_member` (qual=`is_org_member(org_id)`, with_check=`is_org_member(org_id)`); `_update_owner` policy gone. Non-owner team members can now save delivery prefs in QuoteComposer.
- **C2 FIXED** — `20260508233326_redeploy_notifications_new_lead_dedup_index` applied via Supabase MCP. Verified live: `pg_indexes` confirms `notifications_new_lead_dedup_idx` exists as UNIQUE partial index on `(org_id, (screen_params->>'id')) WHERE type='NEW_LEAD'`. Pre-fix dupe count: 3 (org_id, lead_id) pairs with 2 NEW_LEAD notifications each. Post-fix dupe count: 0. Total NEW_LEAD rows: 24 → 21 (3 stale rows removed by the cleanup CTE).
- **H1 PARTIAL FIX** — file/log parity restored for the two known drift cases:
  - `20260421021818_fix_get_org_credit_row_permissions.sql` — added local file matching the existing prod migration (no apply needed; already in log). Statement: `GRANT EXECUTE ON FUNCTION get_org_credit_row TO authenticated;`. The in-body `is_org_member` guard added by 0067 makes this grant safe.
  - `20260508233337_record_lead_photos_lead_id_index_in_log` — applied via MCP as a no-op `CREATE INDEX IF NOT EXISTS` so the migration log has an entry for the index that was already live (originally applied out-of-band via SQL editor).
- **Other H1 items remain pending:** local files 0001-0068 sequential numbering vs prod's mix of numeric+timestamp scheme is a long-running historical gap; full cleanup is out of scope for this fix. Going forward, all new migrations follow the timestamp convention (see "Migration naming convention" below).
- **0067 + 0068 still confirmed live** (Audit 2 fixes).

## Migration naming convention (going forward)

All new migrations MUST use UTC timestamp prefix: `YYYYMMDDHHMMSS_<snake_case_name>.sql`. Examples: `20260508204110_lock_owner_organization_updates_and_credit_row_membership.sql`, `20260508233306_redeploy_contractor_profile_update_member_policy.sql`.

Why: Supabase MCP `apply_migration` records the version with a server-generated timestamp at apply time. If you create a local file with a future-or-arbitrary timestamp, the MCP-applied version will not match your file's name. The pattern is to (a) generate a current UTC timestamp via `date -u +"%Y%m%d%H%M%S"`, (b) write the migration body, (c) apply via MCP to get the actual recorded version, then (d) rename the file to match the MCP-recorded version. Files 0001-0055 use a legacy 4-digit sequence — do not extend that pattern; new work is timestamp-only.

`supabase db push` against local files relies on file/version parity. Out-of-band SQL-editor applies are discouraged because they create entries in `supabase_migrations.schema_migrations` that have no corresponding repo file (the case 0058 + 20260421021818 demonstrated). If an emergency SQL-editor change is unavoidable, immediately add a matching file to the repo with `CREATE … IF NOT EXISTS` body.

## Known historical no-ops

Migrations recorded as applied in `supabase_migrations.schema_migrations` but whose effects are not visible in the live schema. Documented for clarity; do NOT re-run.

- **`0030_add_opened_lead_status`** (recorded with statement `ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'OPENED'`) — `pg_enum` shows `lead_status` has only NEW, QUOTED, ACCEPTED, ARCHIVED. No application code references `OPENED` (verified via grep across web + mobile repos at HEAD on 2026-05-08, hits only in the migration file itself and prior audit docs). The migration is a harmless no-op; no fix needed. Audit 9 C3 (2026-05-08) decided NOT to add OPENED because it would create an enum value with no callers.
- **`lead_status.ARCHIVED` enum value never written by application code** (verified via grep across web + mobile repos at HEAD on 2026-05-10, hits only in `supabase/migrations/0001_init.sql` defining the enum and `supabase/migrations/0031_auto_archive_stale_leads.sql` which was itself a parser-broken historical no-op — the auto-archive feature was subsequently removed from the product). Live count of `leads.status='ARCHIVED'` = 0. Same shape as the OPENED case above: enum value defined but no callers. No fix needed; documented for clarity.

## Audit 9 data model & migrations — 2026-05-08 (READ-ONLY snapshot, superseded by fixes above)

Read-only audit of Supabase schema, migrations, RPCs, cron jobs vs repo HEAD. The CRITICAL drift items below were FIXED in the section above on the same day; this section is the original audit snapshot.

- **0067 + 0068 confirmed live** — Audit 2 fixes for C-7 (RLS plan-write hole), C-12 (cross-tenant credit-row read), and C-11 (clearStaleStripeCustomerId hard-delete) are in production. Live `pg_policies`, `information_schema.column_privileges`, `pg_get_functiondef('public.get_org_credit_row')`, and `information_schema.columns` all confirm.
- ~~**3 critical drift items.**~~ **C1 + C2 FIXED 2026-05-08; C3 documented as historical no-op** (see sections above). Original snapshot: (1) Local migration 0056 (contractor_profile member-update revert) NOT applied. (2) Local migration 0059 (notifications_new_lead_dedup index) NOT applied; live query confirmed 3 (org_id, lead_id) pairs with 2 NEW_LEAD dupes each. (3) `lead_status` enum missing `OPENED` despite migration 0030 being recorded as applied — historical no-op.
- **Migration numbering scheme drift** — partially resolved (orphan `20260421021818` and 0058 catch-up files added). Long-running historical mix of 4-digit-sequential 0001-0055 + 14 ISO-timestamps remains; new work uses timestamps only.
- **6 high — original snapshot, partially resolved.** ~~`update_org_plan_credits`/`reset_org_credits` mutable search_path~~ FIXED 2026-05-08 (see "Audit 9 RPC hardening" section above). ~~`update_org_plan_credits` no FOR UPDATE~~ FIXED 2026-05-08. Still pending: 7 RLS policies re-evaluate `auth.<function>()` per row (advisor `auth_rls_initplan` on subscriptions/push_tokens/notifications/audit_log); `subscriptions` no FK to organizations (Audit 2 cross-flag); 5 missing FK indexes (audit_log.actor_user_id, notifications.user_id, pending_invites.invited_by, quote_events.org_id, quote_events.quote_id).
- **Cron health.** Both `reset-solo-credits` (daily, jobid=3) and `rescue-stuck-leads` (every 3min, jobid=8) green: 24h success/fail = 1/0 and 480/0 respectively.
- **Orphans.** Zero orphaned rows across all FK relationships. 4 leads with no matching `customers` row (M5, by-design denormalization).
- **Demo orgs in prod.** `Worcester Test Contractor` (slug `worcester-test-org`) has 184 leads; `Demo` (BUSINESS, 100 credits) has 5; `Verify Test Services` + `QA Test Contracting` are empty.
- **Realtime publication** publishes leads, notifications, pending_invites, quotes only — sensitive tables (subscriptions, credit_purchases, audit_log, organizations, contractor_profile) correctly NOT published.
- **Notion:** findings `35a32498-a1cb-81ed-b0ec-db4a1cec68ba`, to-dos `35a32498-a1cb-81f0-8542-f6a38328dfa7`. Detailed report: `docs/updates-log.md` 2026-05-08 Audit 9 entry. Severity: 3 Critical, 6 High, 8 Medium, 5 Low.

## Audit 2 billing — 2026-05-08 Stripe lifecycle fixes (C-6 / C-8 / H-9 / C-11)

Four Stripe-handling bugs from Audit 2 fixed in a single session. Migration 0068 adds `subscriptions.stripe_customer_invalid_at timestamptz` to support soft-mark of stale rows.

- **C-6 FIXED**: `app/api/stripe/webhook/route.ts:58-76 getOrgIdForUser` now orders by `created_at ASC` so the fallback path is deterministic for multi-org owners. Metadata-orgId path was already preferred in every handler (no change there); checkout already passes `orgId` in both `session.metadata` and `subscription_data.metadata` (no change there).
- **C-8 FIXED**: `handleCheckoutCompleted` now calls `resetOrganizationCredits(orgId, plan)` after `setOrganizationPlan`. Trial→paid (and direct paid) checkouts now grant the paid-tier monthly credits at signup. Live victims at fix time: orgs `eabc1e4a` and `f77b0ebb` (TEAM, monthly_credits=5, has_used_trial=true) — fingerprint matches and both have matching `subscriptions` rows so they're true C-8 (not C-7) victims.
- **H-9 FIXED**: `app/api/stripe/checkout/route.ts` upgrade branch now calls `update_org_plan_credits` RPC after `organizations.plan` update, mirroring the renewal-cycle pattern in the webhook.
- **C-11 FIXED**: `lib/stripe.ts clearStaleStripeCustomerId` now soft-marks rows via `stripe_customer_invalid_at = now()` instead of hard-deleting. Cancellation handler can still find the row by `stripe_subscription_id`. Checkout queries filter `is("stripe_customer_invalid_at", null)` so a marked row no longer poisons the customer-id lookup. Migration 0068 added the column.

`tsc --noEmit` clean.

## Audit 2 billing & subscriptions — 2026-05-08 re-verified at HEAD (READ-ONLY)

Read-only second pass at Audit 2 against live Stripe MCP / RC MCP / Supabase MCP / ASC MCP. Web HEAD same family as morning passes; mobile HEAD `14e2ad7`. No code changed.

**Live state (2026-05-08):**

- **Stripe `acct_1T9B7eFNX8cpZFmw` (SnapQuote)**: 0 active subscriptions, 1 customer (`cus_UJw6eTdHqwL8Ym` Murdoch — none of the 3 stale Supabase `subscriptions` rows reference it), 12 products + 15 prices.
- **Stripe live products:** Team (`prod_UJqGjUmWNMlSPQ` $19.99/mo `price_1TLCZnFNX8cpZFmwZeXOL63t`, $191.99/yr `price_1TLCZmFNX8cpZFmwTFjEf313`), Business (`prod_UJqGzwTrDYV1rs` $39.99/mo `price_1TLCZdFNX8cpZFmwokht9uyb`, $384.99/yr `price_1TTpUuFNX8cpZFmwUMWMg77W` canonical, $383.99/yr `price_1TLCZcFNX8cpZFmw0HVXNHwm` OLD still active), credit packs (`prod_UJqGjbjixP8YLM` $9.99 / `prod_UJqGTtLFlV1W0k` $39.99 / `prod_UJqGlY2pkU4OQM` $69.99), **Solo product `prod_UJqGrSk27Qgc0f` + `price_1TLCZqFNX8cpZFmwfaWXhXKP` $19.99/mo LIVE active=true** (invariant violation — Solo is supposed to be free), 6 "myproduct" CLI test products still active.
- **RevenueCat `proj39ead10c`**: 0 active subs, 0 active trials, $0 MRR last 28d, 28 new customers, 29 active users, 0 transactions in 28d. **ASC API key NOT configured** (`app_store_connect_api_key_configured: false`). 7 products active (4 sub + 3 consumable). 2 entitlements (`team`, `business`). 2 offerings: `default` (current=true), `credits` (current=false). Webhook `whintgr57d2f05487` URL is APEX `https://snapquote.us/api/revenuecat/webhook` (NOT www-canonical). Display labels for annual still drift from ASC.
- **Apple App Store Connect `6761979056`**: bundle `com.murdochmarcum.snapquote`, **`subscriptionStatusUrl: null`** (Apple S2S receipt push NOT configured), `streamlinedPurchasingEnabled: true`. Bundle + IAP product IDs match RC. Per Audit 5 all 7 IAPs READY_TO_SUBMIT.
- **Supabase `upqvbdldoyiqqshxquxa`**: 69 orgs (63 SOLO, 2 TEAM, 4 BUSINESS, 4 has_used_trial=true). 3 stale `subscriptions` rows from 2026-03-19/20 all `status='trialing'` referencing customer IDs `cus_UB{RHOV7QVwyv2n,5GQOLqf90hRq,4rEgJ3Jc9Gvv}` that don't exist in live Stripe. `webhook_events`/`iap_subscription_events`/`credit_purchases` all 0 rows ever. user_ids on the stale rows DO still exist in `auth.users` and `organization_members`.
- **pg_cron jobs** (live): jobid=3 `reset-solo-credits` (`0 0 * * *`, SOLO-only); jobid=8 `rescue-stuck-leads` (`*/3 * * * *`, healthy 9501 runs all succeeded). NO paid-plan reset cron.
- **RPC EXECUTE grants** (live): `get_org_credit_row` callable by `authenticated` but now gated by in-body `is_org_member(p_org_id)` raise/permission-denied (migration 0067, 2026-05-08); cross-tenant disclosure CLOSED. `update_org_plan_credits`, `reset_org_credits`, `record_credit_purchase`, `refund_bonus_credits`, `unlock_lead_with_credits`, `reset_due_solo_monthly_credits` all `service_role`-only (REVOKE from auth/anon in migration 0063). `plan_monthly_credits` callable by `anon`+`authenticated` (lookup, low risk).
- **`organizations` RLS** (live, post-0067 2026-05-08): `organizations_update_owner` policy `qual=is_org_owner(id)`, `with_check=is_org_owner(id)`; whole-table UPDATE REVOKED from `authenticated`; column-level UPDATE granted ONLY on `name`, `slug`, `onboarding_completed`. Owner PATCH on `plan` / `monthly_credits` / `bonus_credits` / `has_used_trial` / trial_* / `credits_reset_at` now returns `42501 permission denied for table organizations`. Service role retains BYPASSRLS, all 3 admin-client write sites unaffected.
- **Live drift orgs:** `8f939f96` (falconn / Murdoch) BUSINESS 84+15 STALE_PAID; `bce3a561` (Demo) BUSINESS 100+0 STALE_PAID; `36ba5025` (Rivera's) BUSINESS 86+12 STALE_PAID + reset PAST 2026-04-18; `7e7ce05f` (poo) BUSINESS 98+0 STALE_PAID + reset PAST 2026-04-20; `eabc1e4a` + `f77b0ebb` (poo) TEAM monthly_credits=5 (should be 20) — Stripe trial-credit gap fingerprint.

**Net-new findings:**

- **C1 NEW** Stripe Solo product + $19.99/mo price LIVE — invariant violation; `lib/stripe.ts:120-128 getPlanFromPriceId` doesn't include this priceID so a checkout against it would silently leave plan=SOLO after charging.
- ~~**C2 NEW** RC `PRODUCT_CHANGE` (`app/api/revenuecat/webhook/route.ts:345-359`) updates plan only — never resets credits. Mid-cycle upgrade leaves user under-credited up to 30 days. Mirror of Stripe upgrade gap.~~ FIXED 2026-05-08: PRODUCT_CHANGE branch now calls `resetOrganizationCredits(orgId, plan)` after `setOrganizationPlan` (matches RENEWAL/INITIAL_PURCHASE pattern).
- **H1 NEW** RC `RENEWAL` (`route.ts:302-317`) sends `sendPlanUpgradedEmail` on every renewal — spam.
- **H2 NEW** RC default branch silently drops `TRANSFER`/`SUBSCRIBER_ALIAS`/`TEMPORARY_ENTITLEMENT_GRANT` after `claimWebhookEvent`.
- **H3 NEW** RC webhook URL is APEX (`snapquote.us`).
- **H4 NEW** ASC `subscriptionStatusUrl: null` — Apple S2S receipt push NOT configured.
- **H5 NEW** RC ASC API key NOT configured.
- **M4 NEW** Web `app/app/plan/page.tsx:22-25 getPlanPrice` hardcodes `$19.99/$39.99` — doesn't read live Stripe.
- **L3 NEW** `iap/sync` logs both itself AND RC webhook in `iap_subscription_events` (intentional double-log per comment).

**Critical findings re-confirmed live at HEAD:**

C-3 webhook events table empty (60+ days, Stripe webhook not delivering); ~~C-4 `/api/iap/sync` no Apple receipt validation~~ FIXED 2026-05-08 (route now fetches RC `active_entitlements` for subs and `customers/{id}/purchases` for credit packs, derives plan + credit amount from RC's response, ignores client-supplied `plan` / `creditAmount`; mobile body schema reduced to `{type, transactionId}`. Hard depends on `REVENUECAT_PROJECT_ID` + `REVENUECAT_SECRET_KEY` — without those Vercel envs the route returns 503 and mobile retries via persistent queue, but the RC webhook path keeps granting plans/credits in the meantime so there is no data-loss window); ~~C-5 RC webhook static-shared-secret bearer (not HMAC)~~ NOT-A-BUG 2026-05-08 (RC dashboard does not support HMAC; static Authorization header is the only mechanism RC offers — `https://www.revenuecat.com/docs/integrations/webhooks` confirmed); C-6 Stripe `getOrgIdForUser` arbitrary org (`route.ts:58-68`); ~~C-7 RLS lets owners write `organizations.plan`~~ FIXED 2026-05-08 migration 0067; C-8 Stripe trial→paid never grants paid-tier credits (live: orgs `eabc1e4a`, `f77b0ebb`); ~~C-10 IAP credit-pack double-credit risk (different keys mobile vs RC)~~ FIXED 2026-05-08 (RC `NON_RENEWING_PURCHASE` now keys on `event.transaction_id ?? event.original_transaction_id` — same Apple `transactionIdentifier` mobile sends to iap/sync; latent at fix time, 0 credit_purchases rows); C-11 `clearStaleStripeCustomerId` lifecycle (`lib/stripe.ts:165-181` hard-deletes); ~~C-12 `get_org_credit_row` cross-tenant~~ FIXED 2026-05-08 migration 0067; **C-13 `REVENUECAT_PROJECT_ID`/`REVENUECAT_SECRET_KEY` STILL missing in Vercel prod — must be added before next deploy or `/api/iap/sync` and account-deletion both 503.**

**Stale Notion flagged:**

- 2026-05-04 hygiene tail "old `price_1TLCZcFNX8cpZFmw0HVXNHwm` ($383.99/yr) still active" re-confirmed live.
- 2026-05-06 fix `b637a4b` "IAP-vs-Stripe defense-in-depth" — live only on `claude/awesome-shamir-7bf77a`, NOT in mobile main.

Severity summary: 13 Critical (2 NEW + 11 confirmed-still-open), 17 High (5 NEW + 12 confirmed-still-open), 14 Medium, 5 Low.

Notion: findings `35a32498-a1cb-81b9-ba5c-e6de0a4c47fd`, to-dos `35a32498-a1cb-81fd-89a3-e17eeeefa043`. No code changed.

## Audit 4 lead lifecycle — 2026-05-08 re-verified at HEAD (READ-ONLY)

Second pass at Audit 4. Earlier today (17:12 UTC) a comprehensive Audit 4 ran and saved findings to Notion (Bugs & Fixes / Pending Work). This pass re-verifies every prior finding against HEAD code and live Supabase, since the audit-prompt rule is "Notion is event history, not current truth."

- **Web HEAD `8ae7499`, mobile HEAD `14e2ad7`.** Commits since 17:12 UTC are docs/UI/auth only — no lead-pipeline code touched. Mobile worktree on `claude/wonderful-kilby-f2fbbc` matches main.
- **Live Supabase (project `upqvbdldoyiqqshxquxa`):** `lead_status={NEW,QUOTED,ACCEPTED,ARCHIVED}` (ARCHIVED phantom — 0 rows). `quote_status={DRAFT,SENT,VIEWED,ACCEPTED,EXPIRED}`. `OPENED` not in enum (0030 historical no-op). `ai_status` is `text` (not enum). Realtime publication: `leads, notifications, pending_invites, quotes` (lead_unlocks/lead_photos NOT included). `pg_cron`: only `rescue-stuck-leads (*/3 * * * *)` and `reset-solo-credits` (no auto-archive). Vercel crons: 7 daily (no auto-archive-stale-leads). Storage `lead-photos` bucket has no MIME/size enforcement at bucket level. Production data: leads 3473 (3310 ready / 163 failed; 0 ARCHIVED), quotes 90 (35 DRAFT, 6 SENT, 4 VIEWED, 15 ACCEPTED, 30 EXPIRED), 25/35 DRAFTs >30 days old, lead_unlocks 80 all with quote, 3 overdue-unflipped quotes (lazy-flip working).
- **All 3 critical, 8 high, 10 medium, 7 low findings from prior pass STAND at HEAD.** C1 (mobile useLeads channel name no random suffix) at `lib/hooks/useLeads.ts:164`. C2 (mobile getLeads filter) at `lib/api/leads.ts:68,74`. C3 (mobile EstimateComposer client-side `?? "preview"` placeholder) at `components/quotes/EstimateComposer.tsx:232`. H5 (DRAFT-mint failure swallowed) at `app/api/app/leads/unlock/route.ts:69-75`. H8 (lead-photos bucket no MIME/size). M4 (realtime publication missing lead_unlocks/lead_photos).
- **Refined C3 analysis:** the `unlock_lead_with_credits` RPC has only `service_role`+`postgres` EXECUTE grants (verified via `information_schema.routine_privileges`; migration 0063 preamble confirms it was already locked down before that migration). Mobile's RPC fast path in `lib/api/leads.ts:250` is therefore unreachable for authenticated users — it always 42501s and falls back to the API route, which DOES mint a DRAFT. So C3 only fires when the route's DRAFT-mint try/catch silently swallows (i.e., contingent on H5). Narrower than read on first pass.
- **Fresh observation 1:** mobile `unlockLead` RPC fast path is dead code post-migration-0063 (and effectively was dead before too). Confirms an aside in the prior Audit 3 entry's Medium section. Wastes one round-trip per unlock. Not a bug, but obscures the actual code path.
- **Fresh observation 2:** `quotes.sent_via` historical-data fidelity gap — 27/30 EXPIRED and 4/15 ACCEPTED rows have empty `sent_via` (vs SENT/VIEWED 100% populated). Pre-column data; not a bug at HEAD; relevant for analytics that filter on `sent_via`.
- **Conclusion: no regressions, no fixes shipped, prior 28-finding report remains canonical.** Pending Work entries PW-A4-1 through PW-A4-23 from the prior pass remain pending. Cross-cutting flags for Audit 3 (credits), Audit 8 (security), Audit 11 (AI), Audit 12 (notifications) remain valid.
- **Detailed verification:** `docs/updates-log.md` 2026-05-08 "Audit 4 re-verification at HEAD" entry. Prior canonical findings: Notion Bugs & Fixes page id `35a32498-a1cb-813d-ac59-fdf77b57fc9b` (titled "Audit 4 (lead lifecycle): findings").

## Audit 11 AI estimator — 2026-05-08 (READ-ONLY)

Read-only audit of `lib/ai/estimate.ts` (4,548 lines), trigger flow, prompt, output parsing, persistence, and Supabase data.

- **Architecture is sound.** "AI interprets, logic prices" invariant holds since 2026-05-04 fixes; AI never produces dollar amounts. Three-layer fallback (heuristic → catch-block → last-resort) keeps a price always landing.
- **Critical C1: prompt-vs-code mismatch on `_other_text`/`_contractor_note`.** Prompt at `lib/ai/estimate.ts:3338` and `:3361` instructs AI to use these fields, but `sanitizeAnswersForModeling` (`:1889`) strips them at the JSON dump (`:3374`). Likely silent root cause of "AI ignores customer-provided dimensions".
- **High:** prompt-injection unfenced in `description` + free-text answers (steerable signals); no photo content moderation; 22.7% recent (May) heuristic-fallback rate dominated by `timeout (retryable)`; no `estimatedQuantity` cross-validation against `propertyData.lotSizeSqft`/`houseSqft`; `ai_confidence` label is source-blind (shows "high" for fallback-path leads).
- **Cost:** ~$0.005/estimate (gpt-5-mini, signal + polish); ~$18/mo at 100 leads/day, ~$177/mo at 1k. Runaway risk LOW. Public form gated by Turnstile only.
- **Supabase data (3,310 ready / 163 failed):** 26 leads with `$0` estimates are intentional out-of-service-area rejections (Lawn Care). 18 leads $50k+ are plausible roofing replacements. 90 leads on 2026-03-14 hit `image_payload` 400; 1 lead 2026-03-19 hit "Subscription required" (transient OpenAI billing). Service-name normalization gap visible: "Lawn Care" / "Landscaping" / "Fence" coexist with their canonical-name counterparts at suspiciously round default prices.
- **`ai_status` flow:** `processing → ready/failed`. No `pending` writes despite that being the column default. `ai_estimator_notes` shape inconsistent (string from rescue-cron, array from estimator).
- **Detailed report:** `docs/updates-log.md` 2026-05-08 entry.
- **9-item accuracy backlog filed in Pending Work** under "AI Estimator deferred work".

## Audit 3 credits & quota — 2026-05-08 RE-VERIFIED at HEAD (READ-ONLY)

Re-run of the credits & quota audit later in the day after the morning pass. Full re-verification against live Supabase + repo HEAD + Stripe MCP + RC MCP. Detailed report at `docs/audit-3-credits-quota-2026-05-08-reverify.md`. Read-only — no fixes shipped.

- **All prior findings (C1–C5, H1–H8, Medium block) STAND at HEAD.** Code unchanged in `app/api/stripe/webhook/route.ts`, `app/api/iap/sync/route.ts`, `app/api/revenuecat/webhook/route.ts`, `app/api/app/leads/unlock/route.ts`, `app/api/stripe/checkout/route.ts`, `lib/credits.ts`, mobile `lib/hooks/useCredits.ts`. RPC source matches prior audit. Live data confirms broken TEAM trial orgs `eabc1e4a` and `f77b0ebb` still at `monthly_credits=5, credits_reset_at=null`. C2 still latent (0 IAP credit purchases). C5 still live (DRAFT-mint try/catch swallows at `app/api/app/leads/unlock/route.ts:69-75`). pg_cron jobid=3 last 5 runs all `succeeded` with daily UPDATE counts {4, 5, 0, 10, 1}.
- **Promoted from cross-flag to first-class Audit 3 findings:** **H9** `get_org_credit_row` cross-tenant disclosure (live RPC source: SECURITY DEFINER, no `is_org_member` check, `auth_exec=true` for `authenticated`); **M1** lead PII enforcement is UI-only (live RLS: single `leads_member_crud` ALL policy, no column mask, no DRAFT-state gate); **M2** RLS allows org owners to PATCH `organizations.plan/monthly_credits/bonus_credits` directly (live `pg_policy` shows `organizations_update_owner` w/ no column-grant; live `pg_trigger` shows zero guards); **M3** `reset_org_credits` + `update_org_plan_credits` lack `SET search_path` (verified live via `pg_get_functiondef`).
- **NEW: M7 — `/api/plans/config` CDN-cache enables silent plan→credit drift on mobile.** `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` means a values change (e.g. SOLO 5→10) takes up to 25h to reach mobile via the edge AND mobile additionally persists to AsyncStorage indefinitely with no TTL. Was not in the prior pass's findings.
- **NEW data point: third BUSINESS org (`36ba5025-f2ec-49ff-8877-8598cb968a0d`) has `credits_reset_at=2026-04-18` — 20 days past.** Plus `7e7ce05f` 18 days past, `8f939f96` (falconn) reset future. The "past_reset" cohort is now 2 of 4 BUSINESS orgs. They will only get reset on next unlock or webhook event.
- **Live verification: Stripe credit packs $9.99 / $39.99 / $69.99 (10 / 50 / 100 credits) — match RC IAP credit packs exactly (no Apple-tax markup absorbed).**
- **Live verification: RC project `proj39ead10c` has 7 products + 2 offerings (`default` w/ 4 sub packages CURRENT + `credits` w/ 3 consumable packages NOT current but `state=active`).**
- **Cross-flag Audit 5 H1 still live:** `app/(tabs)/more/credits.tsx:226-247` Stripe-billed iOS users still see "Top up your bonus balance on the web" → `openAuthenticatedBrowser('/credits')` → web Stripe checkout. Apple 3.1.1 violation persists.

### Original Audit 3 entry (2026-05-08 morning pass)

Full audit at `docs/audit-3-credits-quota-2026-05-08.md`. Read-only — no fixes. 5 critical, 8 high, 6 medium, 4 low. Cross-flagged with Audit 2 (the TEAM-`monthly_credits=5` fingerprint = same root cause as Audit 3 C1).

- **Plan tier truth:** SOLO 5 / TEAM 20 / BUSINESS 100 monthly credits. Three sources (web `lib/plans.ts`, mobile fallback, SQL `plan_monthly_credits()` function) currently in lockstep but no CI check (H7).
- **Critical:** (C1) Stripe TEAM/BUSINESS trial orgs stuck at SOLO-default 5 credits during 14-day trial — `handleCheckoutCompleted` never calls `update_org_plan_credits`; only `invoice.payment_succeeded` does and that doesn't fire for $0 trial invoices. Live broken: orgs `eabc1e4a` and `f77b0ebb` (TEAM trialing, monthly=5). RC IAP path is unaffected. (C2) Latent IAP credit-pack double-credit on every purchase — mobile `iap/sync` and RC `NON_RENEWING_PURCHASE` use different `purchase_reference` strings (raw Apple `transactionIdentifier` vs `rc_<eventId>`), both INSERTs succeed; 0 IAP credit purchases in DB yet so unfired. (C3) Subscription refund silently consumes already-spent credits — Stripe `customer.subscription.deleted` and RC `REFUND` reset `monthly_credits=5` but `bonus_credits` untouched, no clawback for already-used monthly. (C4) No credit ledger / audit trail — no `credit_transactions` table, `lead_unlocks` lacks `charge_source`, plan-change/reset/refund events unlogged. (C5) DRAFT-quote-after-unlock failure leaves credit deducted with no `public_id` — `app/api/app/leads/unlock/route.ts:37-75` swallows `quotes.insert` errors after credit already debited.
- **High:** Stripe upgrade Team→Business doesn't grant new credits immediately (waits for next renewal invoice; mirror downgrade leaks credits the other way) (H1); 3 STALE_PAID orgs (`falconn`, `Demo`, `Rivera's Pressure Washing`) consume paid-tier credits with no Stripe sub (H2 — overlaps Audit 2); `reset_due_solo_monthly_credits()` SQL function dead code (pg_cron `jobid=3` runs different inline SQL bypassing it) (H3); TEAM/BUSINESS have NO scheduled credit reset — relies on lazy-on-unlock + webhook + manual sync (H4); mobile `useCredits` AsyncStorage cache violates Notion's "real-time, no caching" claim (H5); `no_credits` 402 unaudited (H6); 3 sources of plan→credits truth without CI check (H7); `record_credit_purchase` lacks $ amount / payment-provider columns (H8).
- **Medium:** sub-refund unlogged + bonus untouched; `addOneMonth` JS Date vs Postgres `interval '1 month'` boundary drift; reset window always rolls forward from event (anniversary-from-event, not anniversary-from-billing-cycle); mobile direct-RPC fallback wastes a permission-denied round-trip after migration 0063; two-meter quota model (`monthly_credits` + `org_usage_monthly.quotes_sent_count`); `refund_bonus_credits` floors at 0 silently.
- **Race-condition inventory:** `unlock_lead_with_credits` SAFE for concurrent unlocks (FOR UPDATE on org row + double-check `lead_unlocks`). `record_credit_purchase` SAFE per-key, UNSAFE across paths (C2). `refund_bonus_credits` `FOR UPDATE` correct but lacks idempotency across two refund webhooks for same purchase.
- **Real-time guarantee:** Server-side YES (every RPC hits Postgres). Mobile UI has AsyncStorage cache for offline/cold-boot UX with refetch on screen mount and Stripe-return — stale window in normal operation is tens of milliseconds. No edge/CDN caching of balances anywhere; `/api/plans/config` is the only CDN-cached credit-related route (1h s-maxage / 24h SWR), and that's the plan→credits MAP, not balances.
- **Live data snapshot:** organizations=69 (SOLO=63, TEAM=2 both stuck-trial, BUSINESS=4), lead_unlocks=80, credit_purchases=0. `falconn`: monthly=84/bonus=15, 64 unlocks, no `subscriptions` row.

Findings saved to Notion: Bugs & Fixes (Audit 3 of 13: Credits & Quota — C1-C5/H1-H8/Medium/Race-inventory; entry was duplicated due to Notion API timeout, content correct), Pending Work (Audit 3 pending items — 12 action items across Critical and High), Architecture & Stack (Credit & Quota subsystem map with full RPC/webhook/event matrix).

---

## Audit 1 auth & session flow — 2026-05-08 (READ-ONLY)

Full audit at `docs/audit-1-auth-session-2026-05-08.md`. Read-only — no fixes. Headlines:

- **Critical:** `.env` is tracked in mobile git and contains `SUPABASE_JWT_SECRET` (web `verifyJWT.ts:188-236` accepts HS256 signatures with that secret — bearer-token forgery surface) (C1). `auth.identities` shows `email=95, google=1, apple=0` — **SIWA has zero successful identities in 95 users**, consistent with Notion's "unacceptable audience" theory; Studio Apple provider's Authorized Client IDs likely missing iOS bundle id `com.murdochmarcum.snapquote` alongside Service ID `com.murdochmarcum.snapquote.web` (C2). Mobile SIWA passes no `nonce`/`rawNonce` to `signInAsync` or `signInWithIdToken` (C3). Mobile `lib/utils/authBrowser.ts:21-25` leaks `access_token`+`refresh_token` in URL fragment of an apex URL (C4). Web has no source-controlled apex→www redirect — Build 18 fix premise relies on Vercel project domain config (C5).
- **High:** Mobile `getApiBaseUrl` (`lib/api/http.ts:25-33`) lacks the apex→www regex Notion's Code Patterns claims is Rule 1 of Build 18 defense-in-depth — env-var-only (H1). 27 of 95 auth.users (28%) have no `organization_members` row — `SignupForm.tsx:75-84` calls `signUp` before `bootstrap`; failures orphan the user (H2). `Purchases.logOut()` never called on mobile signOut (H3). No app-layer rate limit on login/signup either platform (H4). Notion-claimed mobile `org.plan != 'SOLO' → "stripe"` defense-in-depth fallback in `plan.tsx:263-273` is NOT in code — Stripe users see IAP UI on subscription-status double-failure (App Store 3.1.1) (H5). Supabase HIBP leaked-password protection OFF (H6). `is_org_member`/`is_org_owner` SECURITY DEFINER are anon-callable (H7).
- **Medium:** AsyncStorage not SecureStore for mobile session (M1); no `iss` validation in `verifyJWT.ts` (M2); no `/account-deleted` confirmation screen on either platform (M3); no email-change flow (M4); no magic-link (M5); no `Sentry.setUser` lifecycle (M6); `requireMember` admin-client lookup gated only by `.eq("user_id")` filter (M7); web reset-password page no recovery-session validation (M8); `/auth/confirm` no rate limit (M9); no Turnstile on `InviteSignupForm` (M10); `app.json:17` `buildNumber: "13"` vs Notion=18 (M11); 5 mutable-search-path SECURITY DEFINER fns (M12); RLS-no-policies on `iap_subscription_events`+`webhook_events` (M13).
- **Notion vs code conflicts:** `getApiBaseUrl` regex (claimed; absent), mobile `org.plan` fallback (claimed; absent), worktree `claude/crazy-heyrovsky-2e3c05` Google PKCE + push token cleanup (RESOLVED — confirmed in main).
- **Apple compliance flags (Audit 5):** SIWA Studio config + nonce + `/account-deleted` screen + mobile 3.1.1 fallback. Apple Service-ID JWT (Sept 2026) has no automation.
- **Live Supabase data:** auth.users=95, identities email=95+google=1+apple=0, sessions=34, mfa_factors=0, push_tokens=4, audit_log=49, pending_invites=25, 27 orphan auth.users.

Findings saved to Notion: Bugs & Fixes (C1–C5/H1–H7/M1–M13/L1–L10), Pending Work (Audit 1 to-dos), Architecture & Stack (Auth & session architecture entry).

---

## Audit 2 billing & subscriptions — 2026-05-08 (READ-ONLY)

Full audit at `docs/audit-2-billing-2026-05-08.md`. Read-only — no fixes. Headlines:

- **Critical:** Production `org.plan` ↔ subscription drift in 6 of 69 orgs (4× `BUSINESS-no-sub` including `falconn`/Murdoch + 2× **net-new fingerprint** `TEAM-with-monthly_credits=5` not covered by Pending Work's PR-3 remediation list). Stripe customer-portal cancellation never writes a `subscription_ends_at` column → web users have no scheduled-cancellation banner (PR 2 covers it for IAP via `iap_cancellation_scheduled_at`, but Stripe equivalent missing). `clearStaleStripeCustomerId` DELETE confirmed as falconn root cause (destroys `user_id ↔ stripe_customer_id` link). No reconciliation cron between Stripe / Supabase / RC. `/api/iap/sync` lacks server-side Apple receipt validation (cross-flag Audit 7 C1 / Audit 8 C1). RLS allows org owners to PATCH `organizations.plan` directly via PostgREST (`organizations_update_owner` policy has no column-level grant; suspected root cause of TEAM-5 fingerprint).
- **High:** RC `display_name` annual labels still drift from ASC (Team −$2, Business +$5; mobile reads ASC at runtime so users don't see them, but operator audits do). 6 leftover Stripe CLI test products active. 3 stale `subscriptions` rows referencing dead Stripe customer IDs. `getOrgIdForUser .limit(1)` (also Audit 7 C2). Stripe upgrade path `/api/stripe/checkout` doesn't reset credits (mid-cycle Solo→Team stays at 5 credits up to 30 days). Stripe `customer.subscription.trial_will_end` not handled (loses 24h vs daily cron's 48h window). Stripe `incomplete_expired` not handled (failed initial payment lingers ~3 days). Trial bypass via multiple emails. Solo Stripe product has $19.99/mo price (footgun). `/api/iap/sync` no de-dup on `type:"subscription"` syncs.
- **Medium:** Mobile synthesized transactionId (`${productId}:${originalPurchaseDate}` → 2 audit rows per IAP event), `refund_bonus_credits` floors at 0, Family Sharing (`SUBSCRIBER_ALIAS`) not handled, Apple offer codes not handled, trial-converted email never sent, push-on-trial-expired depends on webhook firing, customer-portal ownership-transfer edge case, mobile `OrgSubscriptionStatus` type drift.
- **Low / nits:** Webhook handlers use `console.error` not Sentry, `accept_invite_token` hardcoded seat limits (1/2/5), currency hardcoded USD on web, Stripe Tax not enabled, dashboard pollution.
- **Apple compliance flags (for Audit 5):** ✅ disclosure / restore / manage-on-web / Stripe-vs-IAP discriminator. ⚠️ disclosure missing on credits.tsx, Restore hidden during loading window. ❌ Family Sharing / offer codes / server-side receipt validation absent.
- **Production data summary:** organizations=69, organization_members=69, subscriptions=3 (all stale), webhook_events=0, iap_subscription_events=0, credit_purchases=0. Stripe live: customers=1 (Murdoch), subscriptions=0. RC live: 7 products / 2 entitlements / 2 offerings / 1 webhook integration.

Findings saved to Notion: Bugs & Fixes (B1–B32), Pending Work (A2-T1 through A2-T17), Architecture & Stack (Billing system topology section).

---

## Audit 8 security & privacy — 2026-05-08 (READ-ONLY)

Full audit at `docs/audit-8-security-privacy-2026-05-08.md`. Read-only — no fixes, no RLS changes, no secret rotation. Headlines:

- **Critical:** `app/api/iap/sync/route.ts` grants plan/credits without verifying the receipt with Apple or RevenueCat REST — any authenticated org owner can fake a `transactionId` and get free upgrades or unlimited credits (C1; same root cause Audit 7 flagged as C1, deeper analysis here). `get_org_credit_row(p_org_id uuid)` is `SECURITY DEFINER` callable by `authenticated` with no `is_org_member` check — any signed-in user reads any org's plan + credit balances (C2).
- **High:** Lock-state PII enforcement is UI-only — mobile `lib/api/leads.ts` returns full customer name/phone/email/address regardless of unlock; contractor can bypass credit paywall via direct PostgREST (H1). `SnapQuote-mobile/lib/utils/authBrowser.ts:24` puts `refresh_token` in URL hash (H2). Sentry web `captureConsoleIntegration` + no `beforeSend` PII scrubbing (H3). `lib/rateLimit.ts` is in-memory on Vercel — multi-lambda fan-out defeats it (H4 — same finding as Audit 7). No security headers on web — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (H5). Mobile session in AsyncStorage plaintext, no expo-secure-store (H6). Privacy policy missing Vercel/Sentry/RevenueCat/Apple/Meta/GA4/Expo subprocessors and lacks GDPR coverage (H7). 7 web + 5 mobile npm-audit vulns including vite path-traversal + `@xmldom/xmldom` XML injection (H8).
- **Medium:** `webhook_events` and `iap_subscription_events` have RLS enabled but zero policies (default-deny works but should be explicit). 6 `SECURITY DEFINER` functions with mutable `search_path`. `webhook_events` has 0 rows in production — verify Stripe webhook is actually delivering. Apple Sign-In missing nonce verification round-trip. JWT verify omits explicit `iss` check. **`https://www.snapquote.us/.well-known/apple-app-site-association` returns 404** — universal links broken in production. Supabase HIBP leaked-password protection disabled (free toggle).
- **Low:** `is_org_member`/`is_org_owner` callable by anon (inert because `auth.uid()` NULL but should be revoked per advisor). Public quote URL exposes street address by design. Per-IP-only rate limit lets botnets through.
- **Verified clean:** Stripe webhook signature + idempotency. RevenueCat webhook (timing-safe shared-secret check + idempotency). Account deletion flow (Apple 5.1.1) — owner deletion tears down org tree, Storage objects, Stripe subs, RC customer, auth user; blocks deletion if active App Store auto-renewal. `.gitignore` correctly excludes `.env*.local`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`. Git history regex sweep for plausible secrets — nothing flagged. EXPO_PUBLIC_* surface correct (no secrets exposed in JS bundle).
- **RLS table review:** all 18 public tables have RLS enabled; storage `lead-photos` bucket policies correct (`is_org_member(storage_org_id_from_path(name))`).
- **Service-role boundary:** `SUPABASE_SERVICE_ROLE_KEY` only referenced in `lib/supabase/admin.ts` and webhook handlers. Zero references in mobile repo. ✓

To-dos tracked in Notion → Pending Work entry "Audit 8 of 13 (Security & Privacy): launch-blocker punch list".

---

## Audit 7 web/backend — 2026-05-08 (READ-ONLY)

Full audit at `docs/audit-7-web-backend-2026-05-08.md`. Read-only — no code changes. Headlines:

- **Critical:** `app/api/iap/sync/route.ts` accepts client-trusted IAP without store-side receipt verification (C1); `app/api/stripe/webhook/route.ts:58-68 getOrgIdForUser` arbitrary org pick still present despite PR-2 plan (C2); RevenueCat webhook uses static shared-secret, not HMAC (C3); `REVENUECAT_PROJECT_ID/SECRET_KEY` MISSING from Vercel — owner account deletion currently broken in prod (C4); no sitemap, robots.txt, or healthz endpoint (C5).
- **High:** middleware `auth.getUser()` runs on every webhook/cron/auth-callback hit; public quote endpoints lack rate limiting; `lib/rateLimit.ts` is in-memory (broken under serverless multi-instance); zero security headers; apex→www is 307 not 308; `invalidateAnalytics()` defined but never called (5min stale dashboard); 8 cron + 1 internal route use non-timing-safe `!==`; sidebar nav for "My Link" exits AppShell layout; no CI workflow.
- **Vercel env matrix:** 28 vars set; missing `REVENUECAT_PROJECT_ID/SECRET_KEY`, `OPENAI_MODEL`, `GOOGLE_MAPS_API_KEY` (server-side), `SNAPQUOTE_APP_URL`, `TELNYX_FROM_NUMBER`, `SENTRY_ORG/PROJECT/AUTH_TOKEN`, `SNAPQUOTE_ESTIMATOR_AI_MODE`. `CRON_SECRET` set in Vercel but missing from `.env.example`.
- **Routes:** 44 total (16 authed `/api/app/*`, 9 `/api/public/*`, 8 `/api/cron/*`, 4 Stripe, 1 RC webhook, 1 IAP sync, 1 internal estimator, 2 onboarding, 1 plans config, 1 demo).

---

## Plan-page architecture overhaul (in progress) — 2026-05-07 / 2026-05-08

Three-PR sequence to fix the Plan page contradiction surfaced by `falconn`. Diagnosis was revised on 2026-05-08 after live-source verification (see `docs/updates-log.md` 2026-05-08 scenario-B entry) — the proximate cause is NOT the architectural bug from yesterday morning's audit; the Stripe webhook is not being delivered to production at all.

**Product invariant Murdoch is enforcing:** SnapQuote is a free app, Solo is the free tier, "Business + No active subscription" is structurally impossible for any authenticated user.

**ACTUAL ROOT CAUSE (2026-05-08, live-source confirmed):** Stripe webhook is not reaching production. `public.webhook_events` has zero rows ever. Vercel runtime logs show zero hits to `/api/stripe/webhook` in the last 30 days. Sentry shows zero events for the route in 90 days. `webhook_events` migration landed 2026-04-11; the 3 trialing sub rows in DB pre-date it (2026-03-18/19/20) — those came from an earlier working webhook delivery that has since been broken. **The architectural fixes in PR 2 were drafted on the assumption that the webhook fires and a downstream code path short-circuits the cancellation handler. That assumption is wrong.** Code in `app/api/stripe/webhook/route.ts` is correct — it just isn't being called. Fix is upstream Stripe Dashboard config (likely a stale Vercel preview URL, missing endpoint, or disabled endpoint), not in this codebase. Cannot be fixed from this session — Stripe MCP doesn't expose webhook ops, Vercel MCP doesn't expose env-var reads. Murdoch action items in `docs/updates-log.md` 2026-05-08 entry.

**PR 1 — UI cleanup — SHIPPED 2026-05-07.** Stops the Plan page from contradicting itself. Files: `app/app/plan/page.tsx`, `lib/subscription.ts`, `app/api/app/subscription-status/route.ts`, `components/QuoteComposer.tsx`, `components/PublicLeadForm.tsx`. Deleted: `components/SubscriptionStatusCard.tsx`, `components/SubscriptionRequiredModal.tsx`. Created: `components/ContractorUnavailableModal.tsx`. Mobile lockstep type sync: `SnapQuote-mobile/lib/api/iap.ts`, `SnapQuote-mobile/lib/hooks/useEntitlementSync.ts`. Plan page now reads only `org.plan` for display; "No active subscription" badge / "Subscription is inactive" surfaces are gone everywhere. `OrganizationSubscriptionStatus` slimmed from 8 fields to 3 (`billingSource`, `hasActiveStripeSub`, `subscriptionEndsAt`). `subscriptionEndsAt` wired to `null` in PR 1.

**PR 2 — lifecycle architecture — DEPRIORITIZED 2026-05-08.** Still good ideas, still should ship eventually as defense-in-depth — but it's not the fix for the falconn drift. Once the webhook is delivering, PR 2 becomes "harden against future failure modes." Reconcile cron portion is independently valuable as a safety net for any future webhook downtime — would catch exactly this scenario. Original scope: replace DELETE in `lib/stripe.ts:clearStaleStripeCustomerId` with soft-cancel (migration `0067_subscriptions_nullable_customer_id.sql`); fix `app/api/stripe/webhook/route.ts:getOrgIdForUser` to fail loudly on multi-org users without metadata; backfill `subscription.metadata.userId/orgId` on existing Stripe subs; add daily reconcile cron `app/api/cron/reconcile-subscription-state/route.ts` (dry-run-first per E4, IAP entitlement source = `iap_subscription_events` log per E5); add `organizations.subscription_ends_at` column (migration `0068`); add `<CancellationScheduledBanner>` component. Sentry instrumentation on every reconcile drift correction.

**PR 3 — one-shot data remediation — PENDING.** SQL `UPDATE organizations SET plan='SOLO', monthly_credits=5` for stale-paid orgs. **Excludes `falconn`** per Murdoch's E6 call. Demo seeds `Demo` and `Rivera's Pressure Washing` get cleaned up. Deferred until Murdoch confirms webhook is restored — otherwise a fresh cancellation in production right now would re-create the same drift.

**Murdoch action items (Stripe + Vercel dashboards — required before PR 2/3 are meaningful). Verified 2026-05-08 second-pass: cannot be done from Claude Code MCPs — see updates-log 2026-05-08 second entry for full scope verification. Both Stripe webhook ops AND Vercel env-var write are out of MCP scope. Paste-ready CLI alternatives are also in that entry.**
1. Stripe Dashboard → Developers → Webhooks (LIVE mode) → verify enabled endpoint at `https://snapquote.us/api/stripe/webhook` subscribed to: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`. Copy signing secret.
2. Vercel Dashboard → snapquote → Settings → Environment Variables (Production) → confirm `STRIPE_WEBHOOK_SECRET` matches step 1. Redeploy.
3. Send Stripe test webhook (`customer.subscription.deleted` test event) → ping Claude Code → I'll verify via Vercel runtime logs + `SELECT FROM webhook_events` in seconds.
4. Check Stripe endpoint delivery history — most likely shows 7+ weeks of failed deliveries; that tells us when + why it broke. **Do NOT click "Resend" on the backlog** — would replay real cancellation events and override Murdoch's E6 falconn allowlist intent.

**Production project info (live, from Vercel MCP `get_project`):** project `prj_9Z7T6lgKutlpfapplWbQo8JmJVbi` / team `team_0kIxSIiTWFytVpdXe22QrXl4`. Domains: `snapquote.us`, `www.snapquote.us`, `snapquote-tau.vercel.app`, `snapquote-murdoch45s-projects.vercel.app`, `snapquote-git-main-murdoch45s-projects.vercel.app`. Recommended webhook URL: `https://snapquote.us/api/stripe/webhook`.

---

## What SnapQuote Is

SnapQuote is an AI-powered quoting and lead management SaaS for outdoor service contractors (landscaping, lawn care, fence, roofing, pressure washing). Contractors share a public link. Customers submit job requests. The AI generates an estimate range. The contractor reviews and sends it. The customer accepts or not.

---

## Repos

- **Web:** `C:\Users\murdo\SnapQuote` → github.com/Murdoch45/snapquote → auto-deploys to snapquote.us via Vercel
- **Mobile:** `C:\Users\murdo\SnapQuote-mobile` → github.com/Murdoch45/SnapQuote-mobile → built via EAS

---

## Public landing page (`app/(public)/page.tsx`)

_Redesigned 2026-05-07 from a Claude Design handoff. Direction B (all-light, Linear/Stripe-restraint). One responsive page covers desktop + mobile via Tailwind breakpoints._

**Sections (top → bottom):**
1. **Sticky nav** — `BrandLogo` + "SnapQuote" wordmark (Manrope) on the left; "Log in" pill (light gray, hairline border) + "Get Started Free" CTA on the right. CTA hidden below `md` (768px). Backdrop-blur-12px on white/85.
2. **Hero** — asymmetric / left-aligned. Mono eyebrow `• FOR OUTDOOR SERVICE CONTRACTORS`, H1 (Manrope 700, clamp 60→72→96px) "Stop driving to estimates that **waste your time.**" with the tail clause in the brand `#3FA1F7→#174BB7` gradient. Subhead and CTA below. Subtle 64×64 grid background masked with a radial fade.
3. **Desktop demo** — `<ProductDemo />` (existing interactive component; preserved per "do not break the desktop interactive demo"). Hidden below `lg` per the design spec — mobile users skip straight from hero to How It Works.
4. **How It Works** — 4 vertical steps, alternating sides on `lg` (text/phone, phone/text, …). Soft `#FAFAFB` background with hairline borders top + bottom. Thin dashed connector line down the center column on `lg+`, fading at top/bottom. Each step has a number in the brand gradient (Manrope, 56px mobile / 88px desktop), title, body, and a phone-shaped media placeholder (256×520 mobile, 280×568 desktop, aspect-ratio locked) — **placeholders are intentionally labeled `SCREEN RECORDING — …` so screen recordings can be dropped in later.**
5. **Final CTA** — same gradient-tail H2 echoed, single CTA button.
6. **Footer** — single line: `BrandLogo` + `© 2026 SnapQuote` left, Privacy + Terms right.

**Typography:**
- Display: **Manrope** (loaded via `next/font/google` with weights 500/600/700/800, exposed as `--font-manrope` and applied via `manrope.className` on display headings).
- UI body: **Inter** (global, from `app/layout.tsx`).
- Mono: system stack `ui-monospace, SFMono-Regular, Menlo, monospace` for eyebrows and small captions.

**Components reused:**
- `components/BrandLogo.tsx` for the actual logo (the design's placeholder SVG was discarded per polish requirements). Used at `size="sm"` with `iconClassName="h-7 w-auto"` (nav) and `h-5 w-auto` (footer).
- `components/ui/button.tsx` for all CTAs (`asChild` wrapping `<Link>`).
- `components/landing/ProductDemo.tsx` for the desktop demo section.

**Preserved (not broken):**
- All CTA routes (`/signup`, `/login`, `/privacy`, `/terms`) unchanged.
- Meta Pixel + GA4 tracking and `CompleteRegistration` events live in `app/layout.tsx` and `OnboardingWizard.tsx` — landing page redesign does not touch them.
- Favicon and root `metadata` defined in `app/layout.tsx`. Landing page exports its own `metadata` (title + description) which Next merges over the root.
- Button-radius standardization (12px) and primary-color standardization (`#2563EB`) shipped earlier on 2026-05-07 are honored; CTAs use `rounded-xl` and `bg-primary`.

**Source design files** (Claude Design handoff, kept locally for reference):
- `landing-page/project/SnapQuote Landing v2.html` — primary design (responsive desktop + mobile in one file via media queries)
- `landing-page/project/SnapQuote Landing - Mobile.html` — iPhone-frame preview wrapper that iframes the v2 file (the actual mobile design lives in v2)
- `landing-page/project/landing-v2.jsx` — React/JSX prototype source

---

## Brand Kit

_Last standardized 2026-05-07 (color + button radius unification). Sources: `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/(public)/page.tsx`, `components/BrandLogo.tsx`, `components/ui/button.tsx`._

**Colors**
- Primary blue: **`#2563EB`** — `hsl(221.2 83.2% 53.3%)` (Tailwind blue-600). Hover = `bg-primary/90`. Same value used for `--ring` (focus rings) and `--accent-foreground`. **Matches the mobile app's primary** (`COLORS.primary` in `SnapQuote-mobile/lib/constants.ts`) — web and mobile are now unified on this hue.
- Logo gradient: `#3FA1F7 → #174BB7` (linear, top-left → bottom-right). Unchanged by the brand-color unification — gradient sits within the same blue family.
- CTA shadow base: `rgba(37, 99, 235, 0.6)` (blue-600). Now matches `--primary` exactly.
- Foreground (text): `#0F172A` (slate-900) — `hsl(222.2 47.4% 11.2%)`.
- Muted bg: `#F1F5F9` (slate-100). Muted text: `#64748B` (slate-500).
- Accent (light blue tint): `#EFF6FF` (blue-50) — `hsl(214 100% 97%)`.
- Border / Input: `#E2E8F0` (slate-200).
- Destructive: `#DC2626` (red-600) — `hsl(0 72.2% 50.6%)`.
- Landing-only dark hero palette: bg `#101320`, radial top `#1e2a4a`, body text `#c3c6d7`, accent overlay `#b4c5ff` (used at 10% opacity).
- Dark theme exists (`.dark` class in `globals.css`) but is not user-toggled today; primary stays `#2563EB` in both modes (dark `--accent-foreground` is the same hue at lightness 70% for contrast on dark accent bg).

**Typography**
- Primary (UI / app): **Inter** — loaded in `app/layout.tsx` via `next/font/google`, exposed as `--font-inter`, applied as `font-sans` on `<body>`.
- Secondary (marketing display): **Manrope** — loaded only in `app/(public)/page.tsx`. Used on the landing hero / public homepage.
- Weights in active use: 400, 600 (semibold), 700 (bold), 800 (extrabold).
- Headline tracking: `tracking-tight` for app, `tracking-[-0.07em]` for marketing hero.

**Logo**
- Component: `components/BrandLogo.tsx` — inline SVG (speech bubble + lightning bolt) with the gradient above. Wordmark "SnapQuote" rendered alongside in `font-extrabold tracking-tight text-primary`. Sizes `sm` / `md` / `lg`; `showWordmark` prop toggles wordmark.
- Static assets: `AppIcon-1024.png`, `AppIcon.svg` (project root); `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`.

**Design tokens**
- Border radius (Tailwind scale): `sm` 0.375rem · `md` 0.5rem · `lg` 0.75rem. **Buttons are standardized at `rounded-xl` (12px)** — both the base in `components/ui/button.tsx` and all in-codebase Button overrides (landing hero CTAs, plan/checkout CTAs, public-quote accept button, lead-form submit, quote composer). The only intentional exception is the landing footer CTA, which is a pill (`rounded-full` on `app/(public)/page.tsx:153`).
- Cards / modals / inputs use their own radii (commonly `rounded-[8px]` for inputs, `rounded-[14px]` and `rounded-2xl` for modals/cards) — these are NOT touched by the button standardization.
- Spacing: stock Tailwind scale (no custom overrides).
- Layout widths: `max-w-7xl` (nav), `max-w-6xl` (content sections), `max-w-4xl` (hero copy). Nav height `h-20`. Section padding `py-24`. Horizontal `px-6 sm:px-8 lg:px-10`.
- Effects: hero glow `blur-[90px–120px]` responsive; landing CTA shadow `shadow-[0_24px_60px_-24px_rgba(37,99,235,0.6)]`; `landing-fade-up` keyframe animation (280ms cubic-bezier(0.22, 1, 0.36, 1)).

**CTA button**
- Base (`components/ui/button.tsx`, default variant): `bg-primary text-primary-foreground hover:bg-primary/90`, `font-semibold text-sm`, **`rounded-xl` (12px)**. Sizes: default `h-10 px-5 py-2.5` · sm `h-8 px-3 text-xs` · lg `h-11 px-8`. Focus = 2px ring on `--ring`.
- Landing hero override: `h-14 rounded-xl bg-primary px-7 text-base font-semibold text-white shadow-[0_24px_60px_-24px_rgba(37,99,235,0.6)] hover:bg-primary/90`.
- Landing secondary CTA (on dark): `h-14 rounded-xl border-white/20 bg-transparent px-7 text-base font-semibold text-white hover:bg-card/5`.
- Landing footer pill CTA (intentional exception): `h-auto rounded-full bg-primary px-10 py-5 text-xl font-bold text-white shadow-lg hover:scale-105 hover:bg-primary/90`.
- Trailing icon: `ArrowRight` from lucide-react (16×16, `gap-2`).
- Other variants: `outline` (primary border, primary text) · `secondary` (accent bg) · `ghost` (muted text, muted hover) · `destructive` (red).

---

## Tech Stack

**Web:**
- Next.js App Router + TypeScript
- TailwindCSS + shadcn/ui
- Supabase (Postgres, Auth, Storage, Realtime)
- OpenAI API — model: `gpt-5-mini` (intentional, not a typo)
- Resend (email notifications)
- Telnyx (SMS notifications) — 10DLC campaign registered
- Stripe (billing) — currently in **test mode**, not yet live
- Cloudflare Turnstile (CAPTCHA on public lead form only)
- Google Places API (address autocomplete)
- Vercel (hosting + cron — Hobby plan)
- Sentry (error monitoring — project: snapquote-web, ID 4511244273123328)
- Meta Pixel (Facebook ads conversion tracking — pixel ID `1500154638449582`). Events: `PageView` (every route change, via `MetaPixelPageView`), `CompleteRegistration` (fires once per fresh signup inside `OnboardingWizard.tsx` when the `snapquote-oauth-signup-success` sessionStorage key is consumed — covers both email/password and OAuth signup; never fires on plain login).
- Google Analytics 4 (web analytics — measurement ID `G-2QM16SWP9D`)

**Mobile:**
- React Native + Expo Router
- EAS (build + deploy)
- RevenueCat (IAP subscriptions + credit packs) — iOS only
- Supabase (same project as web)
- Sentry (error monitoring — project: snapquote-mobile, snapquota.sentry.io)
- `react-native-purchases@9.15.2`
- `expo-web-browser` (in-app browser for Stripe web flow)

**Shared infrastructure:**
- Supabase project ID: `upqvbdldoyiqqshxquxa`
- GitHub → Vercel auto-deploy (reconnected April 16, 2026 after silent integration failure)

---

## Business Model

**Lead credit system:**
- Contractors see all lead details for free (job type, city/state, AI estimate, photos, service questions)
- Spending 1 credit unlocks full contact info (name, phone, email, address) and enables sending the estimate
- Monthly credits reset on billing anniversary
- Bonus/one-time pack credits never expire and follow the user across plan changes

**Plans:**

| Plan | Price (Web/Stripe) | Monthly Credits | Seats |
|---|---|---|---|
| Solo | Free | 5 | 1 |
| Team | $19.99/mo or $15.99/mo (billed $191.99/yr) | 20 | 2 |
| Business | $39.99/mo or $33.99/mo (billed $384.99/yr) | 100 | **5** |

> Source-of-truth for seat + credit allowances: [`lib/plans.ts`](../lib/plans.ts). Mobile hydrates the same values from `/api/plans/config`.
> BUSINESS plan was raised from 4 → 5 seats on April 30, 2026 to align with App Store Connect's "5 team seats" copy. See `updates-log.md` for the migration record.

**Apple IAP prices (App Store Connect — canonical source of truth as of 2026-05-04):**
- Team Monthly: $19.99 | Team Annual: $191.99
- Business Monthly: $39.99 | Business Annual: $384.99
- Stripe and RevenueCat labels must align to these. Stripe Business Annual was migrated to $384.99 on 2026-05-04 (new price `price_1TTpUuFNX8cpZFmwUMWMg77W`). RC dashboard labels for `team_annual` ("$189.99/yr") and `business_annual` ("$389.99/yr") remain stale — non-user-facing per RC; mobile reads `pkg.product.priceString` from ASC at runtime. See `docs/asc-rc-final-alignment-2026-05-04.md`.

**Credit packs (both platforms):** 10 for $9.99 | 50 for $39.99 | 100 for $69.99

**Solo inactivity gate:** Solo plan orgs that have been inactive for 30+ days stop receiving new leads (402 `SUBSCRIPTION_INACTIVE`). "Active" = opened web or mobile app. Tracked via `organizations.last_active_at` (migration 0051). Team and Business always accept leads regardless of activity. **This gate lives only on `/api/public/lead-submit`** (the customer-facing inbound). It does NOT apply to `/api/app/quote/send` — once a lead is in the inbox, the contractor can always send the estimate. Quote send is gated by credits (consumed at unlock time via `incrementUsageOnQuoteSend`), not by subscription status.

---

## Database

**Supabase project:** `upqvbdldoyiqqshxquxa`

**Key tables (non-exhaustive — verify schema for full picture):**
- `organizations` — org record, plan, `last_active_at`, `onboarding_completed`
- `organization_members` — role (OWNER | MEMBER), user linkage
- `contractor_profile` — `public_slug`, business info, notification settings, `travel_pricing_disabled`, `social_caption`, `estimate_send_email`, `estimate_send_text`
- `leads` — full lead record including AI estimate fields, `ai_status` (processing | ready | failed), `outOfServiceArea`
- `lead_photos` — photo storage paths; URLs are ephemeral signed URLs (1-hour TTL), not permanent
- `quotes` — status: DRAFT | SENT | VIEWED | ACCEPTED | EXPIRED. `public_id` is permanent. `sent_at` can be null.
- `lead_unlocks` — tracks which leads a contractor has unlocked
- `customers` — write-only for now; forward-looking CRM feature
- `audit_log` — audit actions including `lead.unlocked`, `quote.sent`, `account.deleted`, `member.self_removed`
- `iap_subscription_events` — RevenueCat webhook events

**Migrations applied through:** 0066
- 0051: `organizations.last_active_at` with descending index
- 0052: `get_org_analytics` RPC (SECURITY INVOKER + is_org_member gate)
- 0053: RPC service-role bypass (skips is_org_member when `auth.uid() IS NULL`)
- 0054: `estimated_price_low` / `estimated_price_high` → `numeric(12,2)`
- 0055: `refund_bonus_credits` RPC with FOR UPDATE row lock
- 0056: Reverted contractor_profile UPDATE to allow members (for delivery prefs) — file content RE-DEPLOYED on 2026-05-08 as `20260508233306_redeploy_contractor_profile_update_member_policy.sql` after Audit 9 C1 found the original 0056 had never reached prod. Live `pg_policies` post-fix confirms `contractor_profile_update_member` is in force.
- 0057: Supabase pg_cron rescue-stuck-leads cron (every 3 min) — applied to prod as 4 timestamped migrations (`20260419030653_enable_pg_net_for_cron`, `20260419030726_schedule_rescue_stuck_leads_cron`, `20260419030812_fix_rescue_stuck_leads_schema_qualifier`, `20260419031920_rescue_stuck_leads_use_www_host`).
- 0058: `idx_lead_photos_lead_id` index (dropped photo join from 148ms to 8.5ms) — index was applied out-of-band (via SQL editor) and had no migration log entry. Catch-up file `20260508233337_record_lead_photos_lead_id_index_in_log.sql` (idempotent `CREATE INDEX IF NOT EXISTS`) added on 2026-05-08 to restore file/log parity.
- 0059: `notifications_new_lead_dedup_idx` — partial unique index on (org_id, screen_params->>'id') WHERE type='NEW_LEAD' — file content RE-DEPLOYED on 2026-05-08 as `20260508233326_redeploy_notifications_new_lead_dedup_index.sql` after Audit 9 C2 found the original 0059 had never reached prod. Live verification post-fix: index exists; 0 dupes (3 stale rows cleaned by the migration's CTE before index creation).
- 0060: BUSINESS plan seat limit 4 → 5 in `accept_invite_token` and `handle_auth_user_pending_invites` RPCs
- 0061: E.164 phone backfill on `leads.customer_phone`, `customers.phone`, `contractor_profile.phone` (268+4 historical rows)
- 0062: `quotes.telnyx_message_id text` for post-hoc SMS lookup via `mcp__Telnyx__get_message`
- 0063: REVOKE EXECUTE on 7 SECURITY DEFINER RPCs from PUBLIC/anon/authenticated (`update_org_plan_credits`, `reset_org_credits`, `refund_bonus_credits`, `reset_due_solo_monthly_credits`, `trigger_rescue_stuck_leads`, `handle_auth_user_pending_invites`, `accept_invite_token`). Closes the anonymous credit-rewrite vulnerability surfaced by the May 1 pre-ship audit. service_role and postgres retain EXECUTE; `is_org_member` / `is_org_owner` deliberately untouched (used in RLS USING expressions, must stay callable by anon/auth).
- 0064: GRANT EXECUTE on `handle_auth_user_pending_invites()` to `supabase_auth_admin`. Regression hotfix — 0063's REVOKE FROM PUBLIC dropped supabase_auth_admin's implicit EXECUTE on the trigger function, which would have caused every new-user creation (Google/Apple/email signup) to fail with "permission denied for function" on the AFTER INSERT trigger. (Note: the 500 Cowork surfaced on `/callback` was actually a different bug — leading-space in Supabase Studio Site URL config — but 0064 was still required as defense for the post-config-fix path.)
- 0065: `leads.ai_retry_count integer NOT NULL DEFAULT 0`. Tracks how many times the rescue-stuck-leads cron has re-triggered the AI estimator on a given lead. Cron caps at 2 retries to avoid looping forever on a permanently-broken lead. Forward-only and idempotent (`ADD COLUMN IF NOT EXISTS`).
- 0066: `lead_photos UNIQUE (lead_id, storage_path)`. Required for the upload-as-picked customer-form pattern (fix #5) where two writers can race to insert the same `lead_photos` row: `/api/public/lead-submit` writes rows for paths the client claims are already done, and `/api/public/lead-photo-upload`'s auto-attach branch writes rows for uploads that finish AFTER lead-submit ran. Unique constraint + `INSERT ... ON CONFLICT DO NOTHING` makes the second writer a no-op rather than an error. Wrapped in DO/EXCEPTION block since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`.

**RLS:** Enabled. Multi-tenant isolation via `org_id`. Key RPC functions bypass PostgREST schema cache (established pattern — do not fight cache, write RPCs instead).

---

## Estimator Pipeline

> ⚠️ This section describes the current architecture as of April 18, 2026 after major overhaul. Verify in code.

**Flow:**
1. Customer submits lead via public form → `POST /api/public/lead-submit`
2. Lead + photos stored in DB/Storage
3. `lead-submit` fires async POST to **Supabase Edge Function** `run-estimator` (independent Deno runtime, not Vercel)
4. Edge Function POSTs `{leadId}` to `/api/internal/run-estimator` (shared-secret authenticated via `INTERNAL_API_SECRET`)
5. `generateEstimateAsync()` runs with full fresh 60s Vercel budget
6. AI interprets signals → deterministic estimator prices → result written to lead
7. Notifications fire after `ai_status` flips to `ready` OR `failed` (not at lead insert)

**Key design principle:** AI interprets. Logic prices. AI never generates final dollar amounts.

**AI layer (`lib/ai/estimate.ts`):**
- Extracts structured signals: scope, surfaces, quantity, subtype, materials, access difficulty, condition
- Job summary is now **fully deterministic** — built from questionnaire answers via `buildDeterministicJobSummary()`, then AI only polishes wording via `polishJobSummary()` (narrow 10s call, falls back to raw text on failure)
- Summary is never blank, never wrong service type
- `ai_draft_message` field: was written previously, now removed (dead)

**Regional pricing (unified system — replaces two conflicting prior systems):**
- City first → state fallback → national default (1.0)
- 37 city entries, 16 state entries above 1.0
- All multipliers floored at 1.0 (no sub-1.0 values)
- Travel: `miles × $2.50 × regionalMultiplier` as flat dollar line item. No adjustment under 10 miles. Capped at 200 miles.
- Clamp: `(1.00, 1.45)`

**Out-of-service-area behavior:** Travel multiplier caps at 200 miles. Leads still come in and estimates still generate normally. `outOfServiceArea` flag was previously broken (never set) — now fixed.

**Rescue cron:** Supabase pg_cron runs every 3 minutes. Three stages, each gated to keep a lead from being pulled into more than one bucket per tick:
1. Leads stuck "processing" past 15 min → flip to "failed" + send full notification chain.
2. Leads stuck "processing" 5–15 min → re-trigger via edge function. Row stays "processing".
3. Leads "failed" within the last 6 hours with `ai_retry_count < 2` → atomically transition back to "processing" (CAS on both `ai_status` and `ai_retry_count`), increment the counter, re-trigger via edge function. Hard cap of 2 retries per lead so a permanently-broken lead doesn't loop forever.

**Failure topology (May 4, 2026 — second fix):** AI timeout → in-pipeline heuristic fallback → catch-block fallback → rescue cron retry. The legacy outer wrapper around `generateEstimate` was removed because it killed the heuristic fallback alongside the AI call. Now each external boundary has its own narrow timeout instead:
1. **Property data lookup**: `PROPERTY_DATA_TIMEOUT_MS = 8000`. On timeout, falls back to a degraded `PropertyData` (all-null fields, `locationSource="unavailable"`) and the pipeline continues. `estimateEngine` then uses `NATIONAL_DEFAULT` cost model.
2. **AI call (`callOpenAI`)**: `STRUCTURED_AI_TIMEOUT_MS = 35000` per attempt, single attempt. On timeout/failure, `generateEstimate` falls through to the in-pipeline heuristic fallback at `lib/ai/estimate.ts:~4010`. The fallback runs unimpeded because no outer wrapper kills it.
3. **Polish summary**: 10s timeout. On timeout/failure, returns the deterministic raw summary. Does not gate the lead's appearance.
4. **In-pipeline heuristic fallback**: `inferSignalsFallback` + `fallbackEstimate` via `estimateEngine`. Always returns a valid `GeneratedLeadEstimate`. Marker: `"Estimator signal source: fallback."`
5. **Catch-block fallback** (in `generateEstimateAsync`): if anything inside the try block throws, the catch attempts the deterministic engine directly using the hoisted `EstimateInput` and a degraded `PropertyData`. Polish is skipped. Writes `ai_status="ready"` with the resulting price. Marker: `"Estimator origin: catch_fallback."` Sentry-tagged with `stage: "catch-fallback-recovered"`.
6. **Rescue cron** (last resort): if the function is hard-killed by Vercel's 60s ceiling before the catch can finish, the lead stays at `ai_status="processing"`; the pg_cron job picks it up within 3 minutes per stages 1-3 documented above.

**"AI estimate unavailable" is now structurally impossible** except in the corner case where Vercel hard-kills the function before the catch fallback can write — in which case the rescue cron retries within 3 minutes.

**`ai_estimator_notes` audit markers** (each pushed at its respective pipeline stage; grep these to answer "what fired?" for a given lead):
- `"Property data resolved: <city>, <state> (lot <sqft> sqft)."` / `"Property data lookup failed: <reason>; using degraded defaults."`
- `"Satellite image attached."` / `"Satellite image unavailable: no location coordinates|no Google Maps API key|fetch failed."` / `"Satellite image: skipped (estimator mode=off)."`
- `"Summary polish: applied."` / `"Summary polish: failed (<reason>); using raw deterministic summary."` / `"Summary polish: skipped (catch fallback|estimator mode=off|no OPENAI_API_KEY|empty raw summary)."`
- `"Estimator origin: catch_fallback."` and `"Catch fallback triggered by: <message>"` — only on the catch fallback path; distinguishes from `"Estimator signal source: fallback."` which is the in-pipeline path.
- Existing markers from `attachAiExtractionTrace`: `"Estimator AI mode: <auto|require|off>."`, `"Estimator signal source: <structured_ai|fallback>."`, `"Estimator AI execution: <execution>."`, plus `buildAiExtractionNotes` lines about attempt outcomes and failure categories.

**OpenAI request shape (`callOpenAI` in `lib/ai/estimate.ts`):**
- Model: `gpt-5-mini` (overridable via `OPENAI_MODEL`). Reasoning effort: `low`. Single attempt per invocation.
- Customer photos: `detail: "low"` (May 4, 2026 fix #3 — was `"high"`; tile-processing on multi-photo "high" calls was the dominant wall-clock cost pushing AI past the 35s timeout). Each photo now costs a flat 85 vision tokens with no per-tile preprocessing pass.
- Satellite tile (Google Static Maps, 600x400): `detail: "low"` (May 4, 2026 morning fix — the tile is property-context only).
- Summary polish: separate `gpt-5-mini` call with its own 10s timeout, falls back to deterministic raw text on failure.

**Photo-to-pricing dependency:** AI's photo analysis primarily contributes categorical signals (`condition`, `access`, `severity`, `materialClass`) and `estimatedQuantity` inference. The actual price math runs off `serviceQuestionAnswers` + `propertyData` + `regionalCostModel`. Per-service estimators have questionnaire-based fallbacks for every AI-derived input, so dropping vision detail trades a small amount of categorical refinement quality for a large latency win. **Pressure-washing is the one service where photo detail meaningfully affects price** (surface-area detection feeds `detectedSurfaces` → quoted scope sqft) — flagged in Pending Work as an A/B candidate when pressure-washing becomes a launch priority.

**Failed-lead UX:**
- `ai_status="failed"` leads ARE visible in the leads list and dashboard recent-leads (May 4, 2026 fix — list queries use `.in("ai_status", ["ready", "failed"])`, not `.eq("ready")`).
- `LeadCard` and dashboard recent-leads card render "AI estimate unavailable" in amber when failed, with sub-copy "Review and send a manual estimate."
- `ConfidenceMeter` is hidden entirely when neither `ai_confidence_score` nor `ai_confidence` is set (previously rendered a misleading "40% / Medium confidence" default).
- `QuoteComposer` receives sane fallback price values ($500–$2000 range, $1000 snap quote) when the lead has no AI estimate AND no existing draft/expired quote, so the slider works immediately for manual pricing instead of collapsing to $0–$25.

**Shared files between repos (`lib/`):**
- `plans.ts` — plan constants
- `socialCaption.ts` — caption max length, business name fallback, default template
- `analyticsTypes.ts` — analytics response shape (contract with RPC)
- `serviceColors.ts` — canonical service color palette
- `quoteStatus.ts` — all 5 quote statuses including DRAFT
- `quoteSendSchema.ts` — Zod validation for send endpoint
- `quoteExpiry.ts` — `computeEffectiveQuoteStatus` helper
- `quotePricing.ts` — `QUOTE_PRICE_STEP = 5`

---

## Authentication

- Supabase Auth (email+password + Sign in with Apple + Google)
- **Sign in with Apple:** Service ID `com.murdochmarcum.snapquote.web`, Key ID `4CD7K9KW62`, Team ID `U58KVR8LTA`. JWT regeneration needed ~Sept 2026.
- **Google sign-in:** Was accidentally removed from `LoginForm.tsx` by Codex and needs restoration. Apple button also needs to be added to the signup page.
- Multi-tenant: one org per contractor, OWNER + MEMBER roles
- `requireOwnerForApi` / `requireMemberForApi` helpers exist on web API routes
- Mobile: must pass Bearer token explicitly — no cookie-based auth fallback on native

**In-app browser auth flow (mobile → web):**
- `lib/utils/authBrowser.ts` appends tokens to URL hash
- Must route through entry page (e.g. `/credits`, `/plan`) NOT directly to `/app/...`
- Entry page reads hash, calls `supabase.auth.setSession()`, then redirects to app route

**Auth verification (web, post-2026-05-07):**

- `lib/auth/verifyJWT.ts` performs local JWT verification — no GoTrue round-trip. Tries ES256 against `{NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json` first, falls back to HS256 with `SUPABASE_JWT_SECRET` (legacy tokens still inside their exp window). Returns null on all-paths-failed, never throws.
- `lib/auth/requireRole.ts` calls `verifySupabaseJWT(bearer)` for the bearer path and `auth.getUser()` for the cookie path.
- **Observability (added 2026-05-07, observability-only deploy):** Sentry breadcrumbs at every step of the verify chain (verify start, ES256 success/failure, HS256 success/failure, final null) with bearer fingerprint + decoded header. `Sentry.captureMessage("auth.requireMember 401" | "auth.requireOwner 401")` + `Sentry.flush(2000)` at both 401 return points so the breadcrumb chain reaches Sentry. Tags low-cardinality (`auth_source`, `has_bearer`, `bearer_len_class`); high-cardinality data in `extra`. Bearer NEVER logged in full — fingerprint only (`first8...last8 (len=N)`). Sentry issue: [`SNAPQUOTE-WEB-9`](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-9). Diagnostic-only — meant to be removed/sampled-down once we root-cause the Build 13/14/15 mobile 401s.

---

## Customer lead submission (public form)

> Updated 2026-05-04 fix #5. Photo uploads now happen as the customer picks them, in parallel with form filling. Submit doesn't wait for in-flight uploads — they attach to the lead row in the background. Realistic customer wait at submit time is ~1–2s (Turnstile + DB writes), down from the prior ~3–8s floor that was dominated by photo uploads.

**Two endpoints + a client-generated tempLeadId.**

The client generates a v4 UUID (`tempLeadId`) when the form mounts. That UUID is the path segment under which all of this submission's photos upload to Storage AND it becomes the lead row's primary key when the form is finally submitted. No rename, no move — the storage paths created during form-filling already point at the right lead.

**Endpoint 1: `POST /api/public/lead-photo-upload`** — fires per-photo as soon as the customer picks a file. Multipart body: `photo` (File), `contractorSlug`, `tempLeadId`. Server:
- Rate limits per-IP (80/hour, well above any real customer's pick + retry pattern).
- Validates content-type (jpeg/png/heic/heif/webp), size (≤10MB), `tempLeadId` is v4 UUID.
- Resolves `contractorSlug` → `org_id`. Returns generic 400 on unknown slug (no slug-existence oracle).
- Uploads to `${orgId}/${tempLeadId}/${randomShort}.${ext}` with 3-attempt retry.
- Mints a 24h signed URL (`public_url`).
- Checks: does a `leads` row with `id = tempLeadId AND org_id = orgId` exist?
  - **Yes** (upload finished AFTER lead-submit ran): inserts the `lead_photos` row directly. Returns `{ storagePath, publicUrl, attached: true }`. The photo "attaches" automatically.
  - **No** (typical case — upload finished before submit): returns `{ storagePath, publicUrl, attached: false }`. Client passes the path to `/api/public/lead-submit` at submit time.
- No Turnstile (gating per-photo on Turnstile would defeat the upload-as-picked UX).

**Endpoint 2: `POST /api/public/lead-submit`** — JSON only (no more multipart, no files). Body: contractorSlug, **tempLeadId**, customer fields, services, address, **photoStoragePaths** (array of `{ storagePath, publicUrl }` for already-uploaded photos), turnstileToken. Server:
- Rate limits, verifies Turnstile.
- Validates payload via `leadSubmitSchema`. `tempLeadId` is enforced as a v4 UUID.
- Filters supplied storage paths through the prefix `${orgId}/${tempLeadId}/` — anything outside is silently dropped + Sentry-warned, so a malformed/spoofed path can't write a `lead_photos` row pointing at another customer's lead.
- Resolves contractor, plan-inactivity gate, customer dedup, customer insert.
- Inserts the lead row with `id = payload.tempLeadId` (overrides Postgres's `gen_random_uuid()` default).
- Upserts `lead_photos` rows for the supplied paths via `onConflict: "lead_id,storage_path", ignoreDuplicates: true`.
- Returns `{ success, leadId, received }` immediately (no `photoUpload` block — that's per-photo state on the client now).
- Defers via `after()`: AI estimator trigger + contractor SMS + customer SMS + customer email (Promise.allSettled, each with a per-call `.catch`). Notifications and AI both have provider-level timeouts from fix #4.

**Race protection** (`lead_photos` UNIQUE on `(lead_id, storage_path)` — migration 0066): the upload endpoint and lead-submit endpoint can both legitimately try to insert the same `lead_photos` row in a tight race when an upload finishes during the lead-submit transaction. The unique constraint + `INSERT ... ON CONFLICT DO NOTHING` (lead-submit) and `if (insertError.code === "23505") continue` (upload) make the second writer a no-op rather than an error.

**Customer wait floor: ~1–2s** at submit time, dominated by Turnstile + DB writes. Photo upload time is now hidden in the form-fill phase: most customers finish typing well after their photos finish uploading. If a customer hits submit fast (or has slow uploads), photos still attach in the background — submit doesn't wait.

**Failure modes:**
- Photo upload fails while customer is on the form → inline error on that photo, customer can retry or remove. Submit blocks until the failed photo is dealt with (so we don't silently drop a photo the customer thinks went up).
- Photo upload still in flight at submit → upload completes, sees the lead row exists via the auto-attach branch, inserts its own `lead_photos` row. Customer doesn't notice; lead lands with all photos.
- Customer abandons the form mid-upload → orphaned objects in `lead-photos` Storage bucket under `${orgId}/${tempLeadId}/...` with no corresponding `leads` row. Pending Work has an entry to add a TTL cleanup cron; current rate of abandonment is small enough to defer.
- Notification provider stalls → the 8s `AbortController` per attempt in `lib/notify.ts` (fix #4) caps the worst case; notifications run inside `after()` so they never gate the customer's response.

## Notifications

**Architecture:** In-app feed (bell icon dropdown, both platforms) + push (mobile only) + email + SMS. All contractor notifications fire together after `ai_status` flips, NOT at lead insert. Single shared `notifications` table backs web and mobile.

**In-app feed (bell icon dropdown):**
- Web: `components/TopBar.tsx` renders bell + badge + popover. Desktop popover auto-closes after 5s of no hover; mobile popover closes on outside click. Feed: `components/NotificationsFeed.tsx`. Hook: `hooks/useNotifications.ts`.
- Mobile: `components/navigation/TopBar.tsx` + `components/navigation/AccountPopover.tsx`. Badge caps at "9+" visually. Hook: `lib/hooks/useNotifications.tsx`.
- Realtime via Supabase channels — web subscribes to `notifications-${orgId}`, mobile to `mobile-notifications-${orgId}` (distinct names so both clients can coexist for the same user/org).
- Mark-all-read fires automatically when the popover opens — optimistic UI flip, then bulk `update({read:true}).eq("org_id", orgId).eq("read", false)`.
- Initial load: 50 rows, ordered newest first.

**`notifications` table (migration 0045):**
- Columns: `id`, `org_id` (FK cascade), `user_id` (nullable, currently unused — no per-user filtering), `type`, `title`, `body`, `screen`, `screen_params` (jsonb), `read`, `created_at`
- Indexes: `(org_id, created_at DESC)`, partial `(org_id) WHERE read = false`
- RLS: SELECT + UPDATE restricted via `organization_members` membership. No client INSERT/DELETE policies — backend admin client only.

**8 notification types:**
- `NEW_LEAD`, `ESTIMATE_VIEWED`, `ESTIMATE_ACCEPTED`, `ESTIMATE_NOT_VIEWED`, `ESTIMATE_EXPIRING_SOON`, `ESTIMATE_EXPIRED`, `TRIAL_EXPIRED`, `INVITE_ACCEPTED`
- Nudge, expiry, and trial notifications fire from daily Vercel crons; expiry + nudge are grouped per org.

**Lifecycle:**
- **50-per-org cap** via DB trigger `trg_prune_org_notifications` after every INSERT (keeps only newest 50 per org).
- **7-day rolling TTL** via daily cron `/api/cron/cleanup-notifications` — deletes rows with `created_at < now() - 7 days`.
- **NEW_LEAD dedup** via partial unique index `(org_id, (screen_params->>'id')) WHERE type='NEW_LEAD'` (migration 0059). The estimator insert wraps around the expected 23505 (unique_violation) so a second code path firing for the same lead is a soft success, not a warning log.
- **TRIAL_EXPIRED dedup** via `organizations.trial_ended_notified_at` (column added in migration 0046). `/api/cron/trial-expired/route.ts` filters by `trial_ended_notified_at IS NULL` and sets the marker with a CAS update after the email succeeds; Vercel retries within the 24h window skip already-notified orgs. Resend's idempotency key (`cron-trial-expired-${orgId}-${runDay}`) still layered on top at the provider level.
- **Toast burst coalescing** (web) — rapid realtime INSERTs within a 1.5s window fire one immediate toast + a trailing "N more notifications" summary, so bursts don't stack on screen.
- **Tap-handler logging** (web) — `components/TopBar.tsx` `handleNotificationClick` logs a `console.warn` (forwarded to Sentry via `captureConsoleIntegration`) for `screen='lead'` with no `screenParams.id` and for any unknown `screen` value. Malformed notifications are now traceable instead of being silent no-ops.
- Retention is a **rolling 7-day window** — rows older than that are swept by the daily cron. There is no calendar-based (midnight / end-of-day) wipe; age-based only.

**Push (mobile only) — `lib/notifications.ts` + `expo-notifications`:**
- Permission requested on mount. The Notifications settings screen (`app/(tabs)/more/notifications.tsx`) surfaces the current permission status as a badge (Enabled / Blocked / Not set / Not available) with contextual CTAs: "Open Settings" when blocked (routes to OS settings via `Linking.openSettings()`), "Enable push notifications" when undetermined (re-triggers `requestPermissionsAsync`), and a neutral badge when granted. Status is re-read via `useFocusEffect` whenever the screen regains focus so returning from the OS Settings app updates the badge immediately. Helpers: `getPushPermissionStatus()`, `requestPushPermission()`, `openSystemNotificationSettings()`.
- Stable `device_id` generated once and stored in AsyncStorage.
- Expo push tokens upserted to `push_tokens` table with composite key `(user_id, device_id)` (migration 0039 — replaced prior single-token-per-org model).
- Android channel "Default", max importance, 250ms vibration.
- Dead-token auto-cleanup server-side on terminal Expo errors (`DeviceNotRegistered`, `InvalidCredentials`, `MismatchSenderId`).
- Tap handler (`app/_layout.tsx`) reads `data.screen` + `data.id`, routes to lead / leads / quotes / team / settings — **pathname guard prevents duplicate screen stacking and Realtime channel collisions** when a user taps a notification while already on the target screen.

**Viewed notification:** `/api/public/quote/[publicId]/viewed` wrapped in compare-and-swap on `viewed_at IS NULL` — only the first viewer wins the CAS and fires push + in-app.

**SMS:** Telnyx. 10DLC campaign approved at the brand/campaign level on April 30, 2026, but **as of May 1, 2026 the production from-number `+17169938159` has `messaging_campaign_id: null` — the phone has NOT been bound to the campaign yet**. Carriers reject un-registered A2P traffic silently. Until that binding is done in the Telnyx portal (Messaging → 10DLC → Campaigns → SnapQuote → Phone Numbers → assign), every contractor SMS-send will record `sent_via=["text"]` because Telnyx's API returns 200 (message queued), but the message never reaches the customer's handset. This is an out-of-band Telnyx-portal action; the Telnyx MCP doesn't expose campaign binding. Once bound, verify via `mcp__Telnyx__get_phone_number`. 3 retries with 500ms/1s/1.5s backoff. Idempotency keys on all sends. `TELNYX_FROM_NUMBER` and `TELNYX_API_URL` are exported once from [`lib/telnyx.ts`](../lib/telnyx.ts) and re-imported by `lib/notify.ts` so the production sender is configured in exactly one place; both honor an optional `TELNYX_FROM_NUMBER` env override. **Per-quote message-id persistence:** `quotes.telnyx_message_id` (added in migration `0062_quote_telnyx_message_id.sql`) stores the id Telnyx returns from `POST /v2/messages` so any quote can be looked up post-hoc via `mcp__Telnyx__get_message`. NULL means SMS wasn't sent for that quote; non-NULL means Telnyx accepted the message — it does NOT mean the customer received it (carrier-side delivery requires a DLR webhook, see TODO below). **Phone normalization:** all `to` phones are normalized to E.164 via [`lib/phone.ts:toE164UsPhone`](../lib/phone.ts) at the Telnyx-handoff in both `sendQuoteSms` and `sendSms`, AND at the validation transform in `leadSubmitSchema.customerPhone` and `updateSettingsSchema.phone` so future writes land E.164 in `leads.customer_phone`, `customers.phone`, and `contractor_profile.phone`. Migration `0061_e164_phone_backfill.sql` backfilled the 268 + 4 historical rows that were stored as 10-digit / formatted phones — every one of those would have triggered Telnyx error `40310 Invalid 'to' address` on a contractor SMS send (which is exactly what happened on May 1, 2026; see `updates-log.md`). **Sentry visibility:** both senders `console.error` on terminal failure so the `captureConsoleIntegration` picks them up — previously `sendQuoteSms` threw silently and the route's catch block swallowed the error into a `warning` field returned in the API response, making this class of failure invisible in Sentry. **10DLC opt-out compliance:** `ensureSmsOptOutFooter()` is applied at the actual Telnyx-handoff in both senders (idempotent — won't double-append) so every outbound message ends with `Reply STOP to opt out.`. **Consent capture:** the public lead form (`components/PublicLeadForm.tsx`) shows a disclosure paragraph below the phone field stating that submitting the form constitutes consent to receive a confirmation SMS and a follow-up estimate SMS.

**Email:** Resend. Idempotency keys on all 5 cron email routes to handle Vercel retry deduplication.

---

## Quote Lifecycle

DRAFT → SENT → VIEWED → ACCEPTED | EXPIRED

- DRAFT: created at send-compose time, before contractor sends
- Expiry: computed via shared `computeEffectiveQuoteStatus()` helper — authoritative, not client-side
- Send: idempotent via CAS (compare-and-swap DRAFT→SENT). Concurrent double-sends resolve — loser re-fetches and returns idempotent success
- Edit-and-resend: EXPIRED quotes can be reopened in resend mode (amber banner), new `sent_at` written, `public_id` preserved
- `sent_via` field: "email" | "text" | null — displayed as "Email" / "SMS" / "—" in UI

**Public quote page (`/q/{publicId}`) — contractor self-accept guard (closed 2026-05-06):** The public page and `POST /api/public/quote/[publicId]/accept` stay anonymous-OK so customer email/SMS recipients can accept without signing in. But when the request carries an authenticated session whose user is a member of `quote.org_id`, the accept endpoint returns 403 ("Cannot accept your own estimate.") and the public page renders a "Preview mode" banner in place of the customer Accept button. Detection in both places uses the same shape: `createServerSupabaseClient` → `auth.getUser()` → `organization_members` lookup `eq(user_id).eq(org_id, quote.org_id).maybeSingle()`. Server guard is the load-bearing fix; UI hide is defense-in-depth + UX. Preview mode also skips the `/viewed` POST so the contractor previewing their own quote doesn't false-flip SENT → VIEWED. See `docs/demo-preview-link-diagnostic-2026-05-05.md` and `docs/contractor-self-accept-fix-comparison-2026-05-05.md` for the original bug write-up and option comparison.

---

## Settings & RBAC

**Web:** Server-side gating via `requireOwnerForApi`. Non-owners see read-only UI. Password change for members calls `supabase.auth.updateUser()` directly, bypasses settings endpoint.

**Mobile:** Owner-only sections gated in UI. Backend protection added (routes through web API, not direct Supabase write for owner-only actions). Delete Account uses bearer token and routes through `/api/app/account/delete`.

**Delete Account:**
- OWNER: cancels Stripe subscription, deletes push tokens by org, audit logs `account.deleted`, deletes organization (cascade), sends deletion email, deletes auth user
- MEMBER: deletes push tokens by user_id only, audit logs `member.self_removed`, removes from `organization_members`, sends email, deletes auth user — org stays intact
- ⚠️ Apple IAP / RevenueCat subscriptions not cancelled on delete (known gap)
- ⚠️ Lead photo blobs not removed from Storage on delete (known gap)

**Mobile contractor toggle:** Reads/writes `travel_pricing_disabled`. Previously was misaligned with web — now verify this is fixed in code.

---

## Analytics

Single `get_org_analytics` Postgres RPC (migration 0052) used by both web and mobile. Returns `{ totals, leadsOverTime, quotesOverTime, acceptanceRateOverTime, servicesBreakdown }`.

- Acceptance rate: sent-day aligned
- Avg response time: scoped to selected range (not all-time)
- Web: 4 date presets (30d, 90d, YTD, All). 5-min cache via `unstable_cache`.
- Mobile: same 4 presets, timezone-aware via `Intl.DateTimeFormat`

---

## Dashboard

**Web (`app/app/page.tsx`):** Async Server Component that `requireAuth()`s, then streams three independent async sub-components wrapped in `<Suspense>` boundaries — `DashboardSubtitle` (this-week lead count), `DashboardStats` (analytics + credits), `DashboardRecentLeads` (leads list). The shared leads query is deduped across Subtitle and RecentLeads via `React.cache()` so Supabase is hit only once per request. Each Suspense has its own skeleton fallback (`SubtitleSkeleton`, `StatsSkeleton` for 7 cards, `RecentLeadsSkeleton` for 6 cards). Segment-level `app/app/loading.tsx` handles navigation-time fallback; segment-level `app/app/error.tsx` catches thrown errors, calls `Sentry.captureException` explicitly, and surfaces `error.digest` as a support reference. `ActivityTracker` pings `/api/app/activity/touch` on mount (updates `organizations.last_active_at`).

**Mobile (`app/(tabs)/index.tsx`):** Client screen with 4 parallel hooks (`useLeads`, `useCredits`, `useAnalytics`, `useProfile`). SafeAreaView + native RefreshControl for pull-to-refresh. Full-screen `LoadingScreen` on initial cold launch when no cached data is available, `StatCardSkeleton × 7` while analytics loads, `<StaleDataBanner />` (`components/shared/StaleDataBanner.tsx`) above the content when any hook is serving cached-but-unrefreshed data. The full `ErrorScreen` with Retry now only fires when there's a fetch error AND no data anywhere — cache hits keep the dashboard rendered. `useAnalytics` retries with exponential backoff (max 2 retries, 400ms base) and aborts in-flight fetches on unmount.

**Seven stats (identical across platforms):**
Credits Remaining · Leads This Month · Estimates Sent · Estimates Accepted · Acceptance Rate % · Avg Estimate Value · Avg Response Time (hours)

**Data sources:**
- Credits: `get_org_credit_row` RPC (mobile falls back to direct `organizations` query on permission error)
- Analytics: `get_org_analytics` RPC (migration 0052/0053)
- Recent leads: direct `leads` query (`org_id`, `ai_status='ready'`, `submitted_at >= now() - 90 days`, ordered newest first, limit 20). The 90-day guardrail (`DASHBOARD_LEADS_WINDOW_DAYS` in `app/app/page.tsx`) keeps the Postgres planner from walking a huge index range for high-volume orgs; the "new leads this week" calculation is a 7-day window safely inside it.
- Lead unlocks: direct bulk `lead_unlocks` query

**Caching:**
- Web: `unstable_cache(getAnalytics)` 5-min TTL, tag `analytics:${orgId}`. Tag is invalidated via the `invalidateAnalytics(orgId)` helper (`lib/db.ts`) after: lead `ai_status='ready'` (in `lib/ai/estimate.ts`), quote SENT (`app/api/app/quote/send/route.ts`), quote ACCEPTED (`app/api/public/quote/[publicId]/accept/route.ts`), lazy per-read quote expire (`app/api/public/quote/[publicId]/route.ts`), and the auto-expire cron per affected org (`app/api/cron/auto-expire-stale-quotes/route.ts`).
- Mobile: module-level 5-min in-memory analytics cache + **AsyncStorage persistent cache per hook** (`cache:credits:${orgId}`, `cache:leads:${orgId}:${status}`, `cache:analytics:${orgId}:${range}`, `cache:profile:${orgId}`) that survives app relaunches so an offline cold start renders yesterday's dashboard instead of an error screen. Each hook exposes an `isStale` flag; on fetch failure with a cache on screen, the hook keeps the data visible and flips `isStale` instead of surfacing an error. Supabase Realtime `postgres_changes` still invalidates `leads` in the background (no polling).

**Cross-tab deps:** Pure URL navigation — no shared Zustand/Jotai/Context stores. Each tab re-fetches its own data. Dashboard and Notifications are **fully decoupled** — no shared queries, cache, or state.

**Mobile lead-list performance notes:**
- Batch photo signing (up to 2 preview photos per lead) in a single round-trip — prior 50 serial `createSignedUrl` calls were "the dominant contributor to the leads tab feeling slow/frozen" (see [lib/api/leads.ts](lib/api/leads.ts) comment).
- `LEAD_LIST_COLUMNS` (19 fields) projection avoids multi-KB JSONB (`ai_cost_breakdown`, `ai_service_estimates`, `ai_pricing_drivers`, `yard_layout`).
- `LeadCard` memoized with custom comparator that ignores callback identity and only tracks visible-change fields.

---

## Lead Photos

- Stored in Supabase Storage bucket `lead-photos`
- URLs are **ephemeral signed URLs (1-hour TTL)** — not permanent public URLs
- `createSignedUrls` batch call used on both web and mobile (was 50 serial calls, now 1 batch call)
- Mobile lead detail re-signs URLs on fetch
- Photo upload: parallel with concurrency cap of 3, 3 retries with exponential backoff, Sentry captures failures

---

## Leads Tab Speed

- Main DB query: fast (~22ms)
- Storage signing: collapsed from 50 serial round-trips to 1 batch call
- `lead_photos` index on `lead_id` (migration 0058): dropped join from 148ms to 8.5ms
- Mobile FlatList: virtualized (initialNumToRender=8, maxToRenderPerBatch=10, windowSize=10, removeClippedSubviews)
- Auto-pagination with onEndReached

---

## Mobile-Specific Architecture Notes

- Mobile is **display-only** for estimator — reads stored DB values, zero estimator logic
- Mobile estimates are **read-only** — no resend/mark-accepted/duplicate/delete on mobile (desktop-only management)
- `useLeadDetail`: module-level cache (5-min TTL), AbortController per fetch, retry with backoff, realtime channel with 3 postgres_changes filters (leads, lead_unlocks, quotes). Pull-to-refresh bypasses cache.
- `useOnlineStatus`: singleton hook via useSyncExternalStore. Reference-counted. Offline gates: UnlockButton, EstimateComposer send, IAP purchase, plan-switch.
- Photo viewer: full-screen modal inside leads stack (not (modals) group — that caused back-history bugs). Swipe navigation + dismiss.
- Realtime channel names include per-mount random suffix to prevent collision on overlapping mounts.
- Delivery prefs: `EstimateComposer` reads `estimate_send_email` / `estimate_send_text` from `contractor_profile` on mount.

---

## Onboarding Tour

- Web: DB-backed (`organizations.onboarding_completed`). Replay clears both DB flag AND localStorage (previously only DB — tour wouldn't replay for users with localStorage completion flag).
- Mobile: AsyncStorage-backed (`snapquote:onboarding-tour-completed:${userId}`). No server state.
- Replay link: inside "Need help?" card on both platforms. Owner-only on web.
- Onboarding complete endpoint: attaches access token (previously missing → caused render crash).

---

## Render Crash (Fixed — April 15, 2026)

Root cause: `OnboardingTour.finish()` called `/api/onboarding/complete` without an auth token → 401 → token refresh fired → `onAuthStateChange` → multiple rapid `syncAuthState` updates during navigation transition → React Navigation infinite render loop.

Fix: token attached, `parseJsonResponse` won't trigger auth refresh on 401 if no token was provided, `syncAuthState` batches all state updates synchronously at end (one React invalidation per auth event instead of 3–4).

---

## Infrastructure

**Vercel:** Hobby plan. Auto-deploy from GitHub `main`. Crons limited to daily — rescue cron moved to Supabase pg_cron.

**Supabase Edge Function:** `run-estimator` — deployed to project `upqvbdldoyiqqshxquxa`, version 2, ACTIVE. Authenticated via `INTERNAL_API_SECRET` shared secret.

**Sentry:**
- Web: `snapquote-web` (ID 4511244273123328). `captureConsoleIntegration`, `instrumentation.ts`. Added April 18, 2026.
- Mobile: `snapquote-mobile` (snapquota.sentry.io). `captureConsoleIntegration`, `ErrorBoundary`, `Sentry.wrap`. Added April 15, 2026.

**EAS:** Account `murdoch45`. Mobile build and deploy.

**App Store Connect:** App ID `6761979056`, Bundle ID `com.murdochmarcum.snapquote`. App listing name: "SnapQuote: Contractor Leads".

**RevenueCat:**
- iOS Public API Key: `appl_RVBUZxqwyBaKHbAcYesDOqxTCUd`
- Entitlements: `team`, `business`
- Offerings: `default`, `credits`
- 7 IAP products: 4 subscriptions + 3 credit packs

---

## Known Outstanding Issues (As of May 1, 2026 post-fix session)

**Closed in this session (May 1, 2026):**
- ~~**Anon-callable SECURITY DEFINER RPCs**~~ — closed via migration `0063`. 7 functions revoked from PUBLIC/anon/authenticated; service_role + postgres retain EXECUTE. Advisor went from 18 anon/auth-callable warnings down to 5 (all on legitimate RLS helpers).
- ~~**Google sign-in button removed from LoginForm.tsx**~~ — pre-ship audit confirmed already restored in commit `c6739ce`. Both web login + signup have the button; root cause of "broken Google sign-in" is the Supabase Auth provider not being enabled at the project level (separate fix, see remaining issues below).
- ~~**Apple sign-in on signup page**~~ — pre-ship audit confirmed already shipped (`SignupForm.tsx:190-195`).
- ~~**Anonymous-link invite consumes seat slot**~~ — closed: `lib/teamInvites.ts:assertSeatAvailable` now filters `pending_invites` count to `email IS NOT NULL`, so anonymous shareable-link rows no longer reserve a seat. Cap still fires correctly for directed email invites.
- ~~**`requireAuth` non-determinism for multi-org users**~~ — closed: `lib/auth/requireAuth.ts` + the two helpers in `lib/auth/requireRole.ts` now `.order("role", { ascending: false }).order("created_at", { ascending: true })` so users always resolve to their OWNER org first (alphabetical 'M' < 'O', descending puts OWNER ahead), then oldest membership as tiebreaker. The Plan vs Team tab mismatch goes away.
- ~~**Web Plan upgrade UI doesn't `router.refresh()`**~~ — closed: `components/plan/PlanOptionsSection.tsx:130-145` now calls `router.refresh()` after `router.replace("/app/plan")` on both upgrade-success and downgrade-scheduled paths. Server Component re-fetches; UI reflects post-upgrade state immediately.
- ~~**Subscriptions table has multiple rows per user_id**~~ — closed: 3 stale rows deleted for the developer's user_id (`sub_test_manual` BUSINESS active, `sub_1TCivOLT0JKiq1dxAkKl3uT5` TEAM trialing, `sub_1T9C4ZLT0JKiq1dxbiEJWEZO` SOLO trialing); only the real BUSINESS active sub `sub_1TCj32LT0JKiq1dxn5tGrGh2` remains. `lib/subscription.ts` read path also hardened to prefer `status='active'` first, then `'trialing'`, then most-recent fallback (replaces the prior `find(isActive)` which could return the most-recent trialing row even when an active row existed).
- ~~**Mobile Google OAuth flow-type mismatch**~~ — closed: `app/(auth)/login.tsx` and `app/(auth)/signup.tsx` Google handlers now parse `?code=` from the redirect URL and call `supabase.auth.exchangeCodeForSession(code)` (PKCE flow — Supabase JS v2 default). Implicit-flow fragment-parsing kept as a fallback for safety. Mobile Google login will work as soon as the Supabase Google provider is enabled at the project level.

**Remaining hard blockers (must fix before App Store submit):**
- **Telnyx 10DLC campaign-to-number binding** — `+17169938159` still shows `messaging_campaign_id: null` (re-confirmed via MCP May 1, 2026 18:00 UTC). Murdoch reportedly assigned the number in the Telnyx portal but the binding did not take effect. Likely causes (in order of probability): (a) wrong Telnyx organization context — the SnapQuote messaging profile lives under Telnyx org `44ea795f-672b-4bb4-9adb-f7e27e0bd3ad`, so the assignment must be made while that org is selected in the top-right org switcher in Mission Control; (b) the 10DLC campaign chosen is not in `ACTIVE` state (only ACTIVE campaigns can have phone numbers assigned); (c) campaign has reached its `maximum_phone_numbers` capacity. Re-attempt: portal.telnyx.com → top-right verify org is "SnapQuote" → Messaging → 10DLC → Campaigns → click the SnapQuote campaign (verify Status = ACTIVE) → Phone Numbers tab → Assign → select +17169938159 → Save. After: `mcp__Telnyx__get_phone_number({id: "2933798527966381131"})` should return non-null `messaging_campaign_id`. Until this is done, every contractor SMS-send is silently dropped at the carrier layer regardless of how clean the code path is.
- **Supabase Studio Redirect URLs allowlist doesn't match `/auth/callback`** — partially closed (code-side belt-and-suspenders landed; Studio fix still recommended). When the SDK sends `redirect_to=https://snapquote.us/auth/callback?next=/app` to GoTrue's /authorize, GoTrue validates against the Studio Redirect URLs allowlist. The current allowlist apparently only matches the bare origin (`https://snapquote.us`) — the path-bearing redirect_to is rejected and GoTrue falls back to Site URL. On /callback success, the browser is bounced to `https://snapquote.us?code=…` (origin only) instead of `/auth/callback`. The Vercel callback handler never runs; no exchangeCodeForSession; user lands on marketing page with no session. Confirmed live via auth log: post-fix /callback returned 302 four times, but /token (the exchangeCodeForSession path) was never called; user.last_sign_in_at stayed stale at 17:37; no new sessions created. **Code-side fix landed**: middleware now intercepts `/` with `?code=` and redirects to `/auth/callback?code=…&next=/app` so the OAuth flow completes even when the allowlist drifts. **Studio cleanup still recommended** for hygiene — Authentication → URL Configuration → Redirect URLs: add `https://snapquote.us/auth/callback` (or wildcard `https://snapquote.us/**`) and `snapquotemobile://*` (or `snapquotemobile://**`) so explicit redirect_to values are accepted directly without the middleware hop. Mobile OAuth specifically still needs `snapquotemobile://*` in the allowlist — without it, the in-app WebBrowser bounces to `https://snapquote.us` and the user never gets back into the app.
- ~~**Supabase Auth URL Configuration leading whitespace in Site URL**~~ — closed. Verified live: post-Murdoch-fix flow_state.referrer is `|https://snapquote.us|` length 20 (was 21 with leading space). GoTrue config-reload event landed at 2026-05-01 20:55:27Z. No new "first path segment" parse errors after that.
- **Supabase Google OAuth provider not enabled** — partially. Cowork enabled the provider (`auth.identities` now has 1 google row for the dev user since earlier today; flow_state has 5 successful authorize→callback rows from 21:01 onward). The provider works at the OAuth handshake layer; the user-experience problem is the post-callback redirect loop documented above. Once that's fixed (code-side fix landed), real users can complete sign-in.

**Remaining post-launch / non-blockers:**
- **Telnyx DLR webhook handler** — `quotes.telnyx_message_id` is persisted (migration `0062`); the natural follow-up is a `POST /api/public/telnyx/webhook` route that verifies the `Telnyx-Signature` header and updates a future `quotes.sms_delivery_status` column. Without it the app has no way to know whether a queued message actually delivered. Recommended sequence: (1) ship handler stub, (2) add `quotes.sms_delivery_status` column, (3) `mcp__Telnyx__update_messaging_profile({profile_id: "40019d6e-d8b1-447b-8d8b-bdc03ca9ceab", request: {webhook_url: "https://www.snapquote.us/api/public/telnyx/webhook"}})` to point Telnyx at the handler. Don't set the webhook_url before the handler exists — Telnyx will get 404s and may eventually disable the URL.
- **`subscriptions` UNIQUE constraint** — DB cleanup leaves the dev user with 1 sub row, but there's no constraint preventing future duplicates. Recommend `UNIQUE(stripe_subscription_id)` (or `UNIQUE(user_id)` with periodic dedup) in a follow-up migration. Read path is hardened in this session, so race conditions surface as "wrong sub picked" rather than "wrong plan returned" — graceful degradation.
- **RevenueCat 404 error** — "None of the products registered could be fetched from App Store Connect" — suspected App Store Connect product config issue, not yet confirmed resolved
- **Apple OAuth redirect flow** — full end-to-end test not yet completed
- **Stripe live mode** — still on test mode, must switch before launch
- **Mobile signup password 6 chars vs reset/web 8 chars** — `app/(auth)/signup.tsx:37` (mobile) accepts min:6; reset + web require 8. User signed up with 6-char password can't reset later.
- **Mobile `signOut` deletes ALL `push_tokens` for user_id** — should scope to current `device_id`. Multi-device push regression.
- **Light/dark mode (mobile)** — removed during render crash investigation, ready to re-implement cleanly
- **Delete Account cleanup gaps** — RevenueCat/Apple IAP subscriptions not cancelled, Storage blobs not removed
- **11 pre-existing failing tests** — 2 real bugs (out-of-service-area lawn quote, concrete repeatability), 6 stale plan-limit tests, 3 API contract fixtures
- **Sign in with Apple JWT** — regeneration needed ~Sept 2026
- **Google Play Store submission** — not started
- **No staging environment** — all migrations and pushes go directly to production
- **Web notifications popover 5s auto-close timer** — can fire while user is reading longer notification bodies; no pause on hover-within or scroll-within.
- ~~**No favicon at all on snapquote.us**~~ — closed 2026-05-06. App Router file-based icons shipped: `app/favicon.ico` (multi-size 16/32/48 PNG-encoded ICO), `app/icon.png` (512×512), `app/apple-icon.png` (180×180), all generated from `AppIcon-1024.png` via sharp. Next.js auto-injects `<link rel="icon">` and `<link rel="apple-touch-icon">` from these convention paths; `metadata.icons` deliberately left unset (file-based convention is the canonical path). Browser tabs, iOS home-screen pin, and the eventual Google SERP icon are now covered. Google Search will pick up the new icon on its next homepage recrawl + reindex (typically a few days; can be hinted via Search Console "Request Indexing").

---

## Design System

- Background: `#F8F9FC`
- White cards, 14px border radius
- Electric blue `#2563EB` accent
- Inter font
- 220px white sidebar (web)
- Stripe/Linear aesthetic
- UI language rule: Always "estimate" in user-facing text. "quote" acceptable internally in code only.

**Sidebar user menu (`components/Sidebar.tsx`):** desktop and mobile use different patterns by design. **Desktop:** user-info card + Sign Out button live inline at the bottom of the 220px sidebar (`DesktopUserMenu` component) — Sign Out is `bg-red-600` / `hover:bg-red-700` / `text-white` so it stands out as a destructive action against the otherwise-neutral sidebar palette. Clicking it signs out directly with no modal. **Mobile:** the existing `SidebarFooter` button at the bottom of the slide-out drawer opens the `AccountSheet` slide-up modal (full-width, thumb-friendly). Don't render `AccountSheet` on desktop — its `absolute inset-x-0 bottom-0` positioning made it span the full viewport bottom which looked oversized given the narrow sidebar.

**Credit-pack price labels (`lib/stripe.ts` → `app/app/credits/page.tsx`):** the user-visible "$X.XX" labels on the web credits page (and any future server-component surface that shows credit-pack prices) are sourced live from Stripe via `getStripeCreditPackPriceLabel(pack)`. The helper retrieves the actual `Price.unit_amount` for the env-configured price ID, divides by 100, and renders `$X.XX`. Wrapped in `React.cache` so a single Server Component request that needs all 3 packs only fires 3 Stripe API calls deduped within the request. On any failure (Stripe down, env var missing, price has no `unit_amount`) it falls back to the hardcoded `priceLabel` in `getStripeCreditPackConfig` and `console.warn`s — the page never blocks. Hardcoded labels are kept in sync with Stripe ($9.99 / $39.99 / $69.99 as of May 1, 2026); they exist only as a render-fallback. Mobile uses `pkg.product.priceString` from the RevenueCat SDK so it always shows the actual store price; no separate web-mobile sync needed.

**Stripe customer-id staleness recovery (`lib/stripe.ts`):** all three Stripe API routes that pass a stored `subscriptions.stripe_customer_id` to Stripe (`/api/stripe/credits`, `/api/stripe/checkout`, `/api/stripe/customer-portal`) wrap their Stripe calls in a `isStripeResourceMissingError(err, "customer" | "subscription")` check. If Stripe returns `resource_missing` (e.g. test → live mode swap, manual customer deletion in Stripe dashboard, account migration), the route calls `clearStaleStripeCustomerId(admin, userId)` which DELETEs the user's `subscriptions` row(s) (the column is NOT NULL so we can't null-out — DELETE is the cleanest path), and:
- credits + checkout retry the Stripe call with `customer_email` instead of `customer`, so Stripe creates a fresh customer on the user's behalf
- customer-portal returns a 404 with copy "We couldn't find your billing profile. Please re-subscribe from the Plan page" (the Customer Portal API can only OPEN existing customers, not create new ones)

The next successful webhook (`handleSubscriptionChanged` / `handleCheckoutCompleted`) re-inserts a `subscriptions` row with fresh IDs. `organizations.plan` is the canonical source of effective plan — set by the webhook on actual phase transitions — so deleting a `subscriptions` row doesn't affect plan-tier displays.

**Plan-display invariant:** the Stripe webhook's `setOrganizationPlan` is only invoked from `customer.subscription.updated` / `customer.subscription.created` / `invoice.paid` paths with a plan derived from the **current** subscription items (`subscription.items[0].price`), not from `subscription.pending_update` or any subscription_schedule phase. That means `organizations.plan` never reflects a queued/scheduled future plan — it only flips at the actual phase transition. Every UI consumer (`app/app/plan/page.tsx`, `app/app/team/page.tsx`, `components/SubscriptionStatusCard.tsx`, capability gates in `lib/teamInvites.ts:assertSeatAvailable`, demo builder in `lib/demo/server.ts`) reads `organizations.plan` (or the equivalent `subscriptions.plan` keyed off the active row) and routes through `getPlanSeatLimit(plan)` / `getPlanMonthlyCredits(plan)`. The hardcoded `PLAN_OPTIONS` constants in `components/plan/PlanOptionsSection.tsx` and mobile `app/(tabs)/more/plan.tsx` describe what each plan offers (intentionally hardcoded for the carousel cards) and the "Current Plan" badge is selected by `option.plan === currentPlan` from the user's actual current plan, not pending. **One historical exception fixed May 1, 2026:** `app/app/team/page.tsx`'s "You're flying solo" empty-state copy hardcoded `getPlanSeatLimit("TEAM")` regardless of the user's actual plan; now reads `seatLimit = getPlanSeatLimit(orgPlan)` and switches copy on `orgPlan` (SOLO sees an upgrade CTA; TEAM/BUSINESS see "Your {planName} plan includes up to {seatLimit} seats").

**Demo account constants:** `lib/demo/shared.ts` is the source of truth for the landing-page demo org identity (`DEMO_USER_EMAIL = "demo@snapquote.us"`, `DEMO_BUSINESS_NAME`, `DEMO_OWNER_NAME`, `DEMO_LOCATION_LABEL`, slugs). `lib/demo/server.ts` builds the `shell.ownerEmail` field directly from `DEMO_USER_EMAIL` — it intentionally ignores the stored `auth.users.email` / `contractor_profile.email` on the demo org so stale seed data can't leak a different address onto the landing page. `scripts/seedDemo.ts` creates and refreshes the demo user with `DEMO_USER_EMAIL`. The landing component (`components/landing/ProductDemo.tsx`) renders from the server payload and falls back to the same literal — keep all three in sync if the address ever changes.

**Landing navbar:** `<nav>` in `app/(public)/page.tsx` is static flow (no `fixed`/`sticky`) and sits **inside** the hero `<section>` (above the inner content container). It must stay inside the section so it inherits the radial-gradient background — hoisting it outside exposes the outer `#101320` solid and visibly breaks the top of the page. It scrolls away naturally with the page.

**Brand mark:** Blue chat bubble (`#3FA1F7` → `#174BB7` linear gradient) with a white lightning bolt inscribed, viewBox `0 0 104 92`. Source of truth is the inline SVG in `components/BrandLogo.tsx`; also mirrored as standalone vector at `AppIcon.svg` (repo root). Lightning-bolt path updated April 20, 2026 to a refined glyph (path `M51.49 15.33L39.40 38.73…`); bubble path and gradient unchanged. `AppIcon-1024.png` (the ASC upload) is a rasterization of an earlier stylized canvas and does not match the current glyph — re-render when the ASC icon is next shipped. **Web favicons (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`) are now rasterized directly from `BrandLogo.tsx`'s canonical SVG** (regenerated 2026-05-06 in commit following the May-6 favicon regen — see `updates-log.md`), so the web favicons carry the current refined glyph and do **not** inherit the ASC PNG's staleness. The wrapper SVG used for rasterization is a 104×104 square with `transform="translate(0 6)"` to vertical-center the original 104×92 viewBox; horizontal positioning preserves the BrandLogo's intentional "looks centered" framing (the chat-tail's down-left visual mass means the geometric center is offset right of the viewBox center by design). `gradientUnits="userSpaceOnUse"` is set explicitly on the gradient in the wrapper so librsvg/sharp render the (12,12)→(88,80) gradient coords as user-space (matching what browsers do for the live BrandLogo). When ASC eventually re-renders to match the refined glyph, no favicon regen is needed — favicons are already on the canonical source.

---

## Workflow (Permanent)

- **Murdoch** — states the goal
- **Claude** — coordinator, writes all prompts, makes all calls
- **Claude Code** — auditor/architect, reads/audits repo, reports findings; never commits
- **Cowork** — browser agent (Vercel dashboard, Supabase dashboard, App Store Connect, RevenueCat); cannot touch repo

**Prompt rules:**
- All Claude Code prompts in a code block
- Always specify reasoning level (Low / Medium / High / Extra High)
- Web repo Claude Code prompts end with 3-line git block (`git add .` / `git commit -m "..."` / `git push` — each on own line, never chained)
- Prompts are broad and goal-oriented — never specify file paths, line numbers, or where to look
- Combine related changes into single prompt
- Multi-part tasks: confirm understanding before writing prompts
