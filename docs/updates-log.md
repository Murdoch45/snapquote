# SnapQuote — Updates Log

> ⚠️ **FOR REFERENCE ONLY — DO NOT TREAT AS GROUND TRUTH.**
> Always verify against the actual codebase before acting on anything here.

This file is append-only. Every session, every meaningful fix, finding, or decision gets logged here in order. Nothing is ever edited or removed.

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

