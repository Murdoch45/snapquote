# SnapQuote — Current State

> ⚠️ **FOR REFERENCE ONLY — DO NOT TREAT AS GROUND TRUTH.**
> This document is maintained by hand and may lag behind the actual codebase.
> Always verify against the real code before acting on anything here.
> The audit session content (April 15–20, 2026) is the most reliable portion.
> Older sections carry more uncertainty.

---

## What SnapQuote Is

SnapQuote is an AI-powered quoting and lead management SaaS for outdoor service contractors (landscaping, lawn care, fence, roofing, pressure washing). Contractors share a public link. Customers submit job requests. The AI generates an estimate range. The contractor reviews and sends it. The customer accepts or not.

---

## Repos

- **Web:** `C:\Users\murdo\SnapQuote` → github.com/Murdoch45/snapquote → auto-deploys to snapquote.us via Vercel
- **Mobile:** `C:\Users\murdo\SnapQuote-mobile` → github.com/Murdoch45/SnapQuote-mobile → built via EAS

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
| Solo | Free | (to be verified) | 1 |
| Team | $19.99/mo or $15.99/mo (billed $191.99/yr) | (to be verified) | Up to 5 |
| Business | $39.99/mo or $33.99/mo (billed $383.99/yr) | (to be verified) | Up to 10 |

> ⚠️ Exact monthly credit counts per plan: verify in `lib/plans.ts` — not confirmed here.
> BUSINESS plan is capped at **100 sends/month** (not unlimited as originally designed).

**Apple IAP prices (RevenueCat):**
- Team Monthly: $19.99 | Team Annual: $189.99
- Business Monthly: $39.99 | Business Annual: $389.99

**Credit packs (both platforms):** 10 for $9.99 | 50 for $39.99 | 100 for $69.99

**Solo inactivity gate:** Solo plan orgs that have been inactive for 30+ days stop receiving new leads (402 `SUBSCRIPTION_INACTIVE`). "Active" = opened web or mobile app. Tracked via `organizations.last_active_at` (migration 0051). Team and Business always accept leads regardless of activity.

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

**Migrations applied through:** 0059
- 0051: `organizations.last_active_at` with descending index
- 0052: `get_org_analytics` RPC (SECURITY INVOKER + is_org_member gate)
- 0053: RPC service-role bypass (skips is_org_member when `auth.uid() IS NULL`)
- 0054: `estimated_price_low` / `estimated_price_high` → `numeric(12,2)`
- 0055: `refund_bonus_credits` RPC with FOR UPDATE row lock
- 0056: Reverted contractor_profile UPDATE to allow members (for delivery prefs)
- 0057: Supabase pg_cron rescue-stuck-leads cron (every 3 min)
- 0058: `idx_lead_photos_lead_id` index (dropped photo join from 148ms to 8.5ms)
- 0059: `notifications_new_lead_dedup_idx` — partial unique index on (org_id, screen_params->>'id') WHERE type='NEW_LEAD'

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

**Rescue cron:** Supabase pg_cron runs every 3 minutes. Leads stuck 5–15 min → retry via edge function. Leads stuck 15+ min → flip to failed + send full notification chain.

**AbortController timeout:** `generateEstimate()` wrapped in `Promise.race` against 40s abort. On timeout, existing catch block writes `ai_status="failed"` and fires notifications.

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

---

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
- *Note: there is no "midnight clear" — retention is a rolling 7-day window, not a daily wipe.*

**Push (mobile only) — `lib/notifications.ts` + `expo-notifications`:**
- Permission requested on mount; returns null silently if denied (no UI feedback).
- Stable `device_id` generated once and stored in AsyncStorage.
- Expo push tokens upserted to `push_tokens` table with composite key `(user_id, device_id)` (migration 0039 — replaced prior single-token-per-org model).
- Android channel "Default", max importance, 250ms vibration.
- Dead-token auto-cleanup server-side on terminal Expo errors (`DeviceNotRegistered`, `InvalidCredentials`, `MismatchSenderId`).
- Tap handler (`app/_layout.tsx`) reads `data.screen` + `data.id`, routes to lead / leads / quotes / team / settings — **pathname guard prevents duplicate screen stacking and Realtime channel collisions** when a user taps a notification while already on the target screen.

**Viewed notification:** `/api/public/quote/[publicId]/viewed` wrapped in compare-and-swap on `viewed_at IS NULL` — only the first viewer wins the CAS and fires push + in-app.

**SMS:** Telnyx. 10DLC campaign registered. 3 retries with 500ms/1s/1.5s backoff. Idempotency keys on all sends.

**Email:** Resend. Idempotency keys on all 5 cron email routes to handle Vercel retry deduplication.

---

## Quote Lifecycle

DRAFT → SENT → VIEWED → ACCEPTED | EXPIRED

- DRAFT: created at send-compose time, before contractor sends
- Expiry: computed via shared `computeEffectiveQuoteStatus()` helper — authoritative, not client-side
- Send: idempotent via CAS (compare-and-swap DRAFT→SENT). Concurrent double-sends resolve — loser re-fetches and returns idempotent success
- Edit-and-resend: EXPIRED quotes can be reopened in resend mode (amber banner), new `sent_at` written, `public_id` preserved
- `sent_via` field: "email" | "text" | null — displayed as "Email" / "SMS" / "—" in UI

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

**Mobile (`app/(tabs)/index.tsx`):** Client screen with 4 parallel hooks (`useLeads`, `useCredits`, `useAnalytics`, `useProfile`). SafeAreaView + native RefreshControl for pull-to-refresh. Full-screen `LoadingScreen` on initial load, `StatCardSkeleton × 7` while analytics loads, `ErrorScreen` with Retry if any hook fails. `useAnalytics` retries with exponential backoff (max 2 retries, 400ms base) and aborts in-flight fetches on unmount.

**Seven stats (identical across platforms):**
Credits Remaining · Leads This Month · Estimates Sent · Estimates Accepted · Acceptance Rate % · Avg Estimate Value · Avg Response Time (hours)

**Data sources:**
- Credits: `get_org_credit_row` RPC (mobile falls back to direct `organizations` query on permission error)
- Analytics: `get_org_analytics` RPC (migration 0052/0053)
- Recent leads: direct `leads` query (`org_id`, `ai_status='ready'`, limit 20)
- Lead unlocks: direct bulk `lead_unlocks` query

**Caching:**
- Web: `unstable_cache(getAnalytics)` 5-min TTL, tag `analytics:${orgId}`. Tag is invalidated via the `invalidateAnalytics(orgId)` helper (`lib/db.ts`) after: lead `ai_status='ready'` (in `lib/ai/estimate.ts`), quote SENT (`app/api/app/quote/send/route.ts`), quote ACCEPTED (`app/api/public/quote/[publicId]/accept/route.ts`), lazy per-read quote expire (`app/api/public/quote/[publicId]/route.ts`), and the auto-expire cron per affected org (`app/api/cron/auto-expire-stale-quotes/route.ts`).
- Mobile: module-level 5-min analytics cache + Supabase Realtime `postgres_changes` subscription on `leads` for invalidation (no polling).

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

## Known Outstanding Issues (As of April 18, 2026)

- **RevenueCat 404 error** — "None of the products registered could be fetched from App Store Connect" — suspected App Store Connect product config issue, not yet confirmed resolved
- **Google sign-in button** — accidentally removed from `LoginForm.tsx` by Codex, needs restoration
- **Apple sign-in on signup page** — button exists on login page, needs to be added to signup page
- **Apple OAuth redirect flow** — full end-to-end test not yet completed
- **Stripe live mode** — still on test mode, must switch before launch
- **Twilio/Telnyx SMS full verification** — 10DLC registered, full notification flow needs end-to-end verification
- **Light/dark mode (mobile)** — removed during render crash investigation, ready to re-implement cleanly
- **Delete Account cleanup gaps** — RevenueCat/Apple IAP subscriptions not cancelled, Storage blobs not removed
- **11 pre-existing failing tests** — 2 real bugs (out-of-service-area lawn quote, concrete repeatability), 6 stale plan-limit tests, 3 API contract fixtures
- **Sign in with Apple JWT** — regeneration needed ~Sept 2026
- **Google Play Store submission** — not started
- **No staging environment** — all migrations and pushes go directly to production
- **Silent push-permission denial on mobile** — `lib/notifications.ts` returns `null` with no UI feedback when the user denies push permission; no Settings surface indicator.
- **No offline cache on mobile dashboard** — all 4 dashboard hooks error on offline → full ErrorScreen with no degraded view. AsyncStorage is only used for Stripe-return detection, not data caching.
- **Web notifications popover 5s auto-close timer** — can fire while user is reading longer notification bodies; no pause on hover-within or scroll-within.

---

## Design System

- Background: `#F8F9FC`
- White cards, 14px border radius
- Electric blue `#2563EB` accent
- Inter font
- 220px white sidebar (web)
- Stripe/Linear aesthetic
- UI language rule: Always "estimate" in user-facing text. "quote" acceptable internally in code only.

**Demo account constants:** `lib/demo/shared.ts` is the source of truth for the landing-page demo org identity (`DEMO_USER_EMAIL = "demo@snapquote.us"`, `DEMO_BUSINESS_NAME`, `DEMO_OWNER_NAME`, `DEMO_LOCATION_LABEL`, slugs). The landing demo component (`components/landing/ProductDemo.tsx`) renders the email from its data payload but falls back to the same `demo@snapquote.us` literal — keep the two in sync if the address ever changes.

**Landing navbar:** `<nav>` in `app/(public)/page.tsx` is static flow (no `fixed`/`sticky`) and sits **inside** the hero `<section>` (above the inner content container). It must stay inside the section so it inherits the radial-gradient background — hoisting it outside exposes the outer `#101320` solid and visibly breaks the top of the page. It scrolls away naturally with the page.

**Brand mark:** Blue chat bubble (`#3FA1F7` → `#174BB7` linear gradient) with a white lightning bolt inscribed, viewBox `0 0 104 92`. Source of truth is the inline SVG in `components/BrandLogo.tsx`; also mirrored as standalone vector at `AppIcon.svg` (repo root). Lightning-bolt path updated April 20, 2026 to a refined glyph (path `M51.49 15.33L39.40 38.73…`); bubble path and gradient unchanged. `AppIcon-1024.png` (the ASC upload) is a rasterization of an earlier stylized canvas and does not match the current glyph — re-render when the ASC icon is next shipped.

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
