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

