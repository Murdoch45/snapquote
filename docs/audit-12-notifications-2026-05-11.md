# Audit 12 — Notifications (push, email, SMS, in-app realtime) — 2026-05-11

**Source:** Claude Code (Opus 4.7)
**Scope:** every channel SnapQuote uses to notify a contractor or customer — mobile push (expo-notifications), email (Resend), SMS (Telnyx), and in-app realtime (Supabase realtime + `notifications` table). Web + mobile repos. Read-only diagnosis.
**Mode:** READ-ONLY. No code changes. No fixes.
**Live HEAD (web):** `35e4da2` on `claude/confident-poincare-21e120` worktree (parity with `main`).
**Live HEAD (mobile):** same — both repos audited side by side from this worktree.

---

## Executive summary

Notifications are end-to-end functional today. Resend is sending from a verified `snapquote.us` domain. Telnyx is sending 10DLC-compliant SMS with idempotency on the quote-send path. Expo push, in-app realtime, and the per-org `notifications` feed all work and dedupe correctly.

The audit surfaced **0 critical** issues (no broken delivery path), **4 high** issues, **9 medium**, and **5 low**. The most actionable items are:

- **No Telnyx DLR webhook handler.** `quotes.telnyx_message_id` is captured but nothing consumes carrier delivery receipts; SMS that's accepted by Telnyx but rejected by the carrier is silently dropped. (Was Audit 4 PW-A4-21; still open.)
- **RevenueCat RENEWAL fires "🎉 You're on the Business plan" email on every renewal cycle**, unlike Stripe which gates on `isRenewalCycle`. Existing customers will get this every billing month.
- **Customer name appears in lock-screen push previews** on ESTIMATE_ACCEPTED and ESTIMATE_NOT_VIEWED nudges — minimum-necessary PII exposure.
- **Push dispatch and mobile push registration have zero explicit Sentry instrumentation.** Push send failures (entire-org fan-out failed, Expo 5xx) and registration failures (RLS denial, network error) only surface via `captureConsoleIntegration`.

All deliverables are docs-only. No code changes.

---

## How I verified everything

Every finding below cites a live source:

- File path + line at HEAD (via Read tool on local repo at SHA `35e4da2`).
- Supabase MCP `execute_sql` for `pg_proc`, `pg_indexes`, `pg_policy`, `cron.job`, and live row counts.
- Supabase MCP `list_tables` for the `notifications` and `push_tokens` schemas.
- Resend MCP `list-domains` for production domain auth.
- `git log -1` to confirm HEAD SHA matches `main` at the time of audit.

Notion and prior docs were consulted as hints only. Where they disagree with live state, live state is canonical and I flag the docs entry as stale (lane rule — I do not edit other agents' entries).

---

## Section 1 — Notification taxonomy (event → channel → recipient)

### 1.1 In-app feed (`notifications` table)

Schema via Supabase MCP `list_tables` (live):
- Columns: `id`, `org_id`, `user_id` (nullable), `type`, `title`, `body`, `screen`, `screen_params` (jsonb, default `{}`), `read` (default false), `created_at`.
- Indexes (`pg_indexes` query): `notifications_pkey`, `notifications_new_lead_dedup_idx` (partial unique on `(org_id, screen_params->>'id') WHERE type='NEW_LEAD' AND screen_params->>'id' IS NOT NULL`), `notifications_org_created_idx`, `notifications_org_unread_idx`, `notifications_user_id_idx`.
- RLS (`pg_policy` query): `Members can read own org notifications` (SELECT) and `Members can update own org notifications` (UPDATE), both gated on `org_id IN (SELECT om.org_id FROM organization_members om WHERE om.user_id = auth.uid())`. No INSERT or DELETE policy — admin-only writes via the service role; users can mark as read but cannot delete or insert.

Trigger (`pg_trigger` + `pg_proc` query):
- `trg_prune_org_notifications` AFTER INSERT — calls `prune_org_notifications()`, which deletes everything past offset 50 ordered by `created_at DESC` for the affected org. Live verified.

Live distribution by type at 2026-05-11 (Supabase MCP `SELECT type, COUNT(*) ... FROM notifications GROUP BY type`):

| Type | Rows | First seen | Last seen |
|---|---|---|---|
| NEW_LEAD | 20 | 2026-05-04 | 2026-05-10 |
| ESTIMATE_VIEWED | 4 | 2026-05-05 | 2026-05-06 |
| ESTIMATE_NOT_VIEWED | 4 | 2026-05-08 | 2026-05-10 |
| ESTIMATE_ACCEPTED | 3 | 2026-05-05 | 2026-05-06 |
| ESTIMATE_EXPIRED | 2 | 2026-05-08 | 2026-05-09 |
| ESTIMATE_EXPIRING_SOON | 2 | 2026-05-07 | 2026-05-08 |

`TRIAL_EXPIRED` and `INVITE_ACCEPTED` types exist in code but have no rows in the window — explainable by the fact that no real trials expired and no team invites were accepted in this period.

### 1.2 Push tokens (`push_tokens` table)

- Columns: `user_id`, `device_id`, `org_id`, `expo_push_token`, `updated_at`. Composite PK `(user_id, device_id)`.
- RLS: all CRUD scoped to `auth.uid() = user_id`. Live verified.
- Indexes: `push_tokens_pkey` (composite), `idx_push_tokens_org_id`, `idx_push_tokens_token`.
- Live state: 5 rows across 3 distinct orgs (Supabase MCP `SELECT COUNT(*), COUNT(DISTINCT org_id), MAX(updated_at) FROM push_tokens`).

### 1.3 Dispatch matrix (event → channels at HEAD)

For every event that triggers any channel at HEAD:

| Event | In-app row type | Push body | Email subject | SMS body | Recipient | Trigger location |
|---|---|---|---|---|---|---|
| New lead arrival (success) | NEW_LEAD | "You have a new lead in {city}! Tap to unlock." | "New lead request from {firstName}" (`buildNewLeadNotificationEmail`) | "New estimate request: {services} at {address}. Open: {leadLink}" | Contractor org | `lib/ai/estimate.ts:4663-4713` (`sendNewLeadNotifications`) called from estimator success + catch fallback + last-resort failure + rescue-cron stage-1 give-up (4 call sites; partial unique index dedupes); SMS from `app/api/public/lead-submit/route.ts:417` |
| New lead arrival (customer receipt) | — | — | "{businessName} received your estimate request" | "We received your request. You will get your estimate shortly. - {businessName}" | Customer | `app/api/public/lead-submit/route.ts:420-432` |
| Estimate sent | — (lifecycle event tracked in `quote_events`, not `notifications`) | — | "You have a new estimate from {businessName}" | Customer-supplied template, rendered with quote URL | Customer | `app/api/app/quote/send/route.ts:247-289` via `sendQuoteSms` (Telnyx) + `sendEmail` (Resend), both with idempotency keys keyed on quote id |
| Estimate viewed (by customer) | ESTIMATE_VIEWED | "A customer is viewing your estimate." | — | — | Contractor org | `app/api/public/quote/[publicId]/viewed/route.ts:72-87` (CAS-protected, only fires for the row-flip winner) |
| Estimate accepted (by customer) | ESTIMATE_ACCEPTED | "{customerName} accepted your estimate for {service} in {city}." | "{customerName} accepted your estimate" (only if `notification_accept_email`) | "Estimate accepted: {services} at {address}. View: {quoteLink}" (only if `notification_accept_sms`) | Contractor org | `app/api/public/quote/[publicId]/accept/route.ts:166-220` |
| Estimate not viewed nudge (day 2-3) | ESTIMATE_NOT_VIEWED | "{customerFirstName} hasn't opened your estimate. A quick follow-up usually does the trick." | "{customerName} hasn't opened your estimate yet" | — | Contractor org | `app/api/cron/estimate-nudge-unviewed/route.ts:72-112` (daily cron 17:00 UTC) |
| Estimate expiring soon (day 6) | ESTIMATE_EXPIRING_SOON | "An estimate expires in 24 hours. Follow up before it's too late." | "Your estimate is expiring soon" | — | Contractor org | `app/api/cron/estimate-expiry-warning/route.ts:76-112` (daily cron 02:00 UTC) |
| Estimate expired (day 7+) | ESTIMATE_EXPIRED | "An estimate just expired. Tap to follow up before the customer cools off." | "Your estimate has expired" | — | Contractor org | `app/api/cron/auto-expire-stale-quotes/route.ts:77-126` (daily cron 03:00 UTC) |
| Unopened leads reminder (>=10 NEW) | **NONE** (push-only, see M4) | "You've Got Leads — You have {N} unopened leads. Don't keep them waiting!" | — | — | Contractor org | `app/api/cron/unopened-leads-reminder/route.ts:30-46` (daily cron 14:00 UTC); threshold hardcoded at 10, see M3 |
| Trial ending soon (T-48h) | **NONE** (email-only, see M5) | **NONE** | "Your free trial ends in 48 hours" | — | Org owner | `app/api/cron/trial-ending-soon/route.ts:56-79` (daily cron 15:00 UTC) |
| Trial expired (T-0+) | TRIAL_EXPIRED | "You're back on the Solo plan with 5 credits per month. Tap to upgrade." | "Your SnapQuote trial has ended" | — | Org owner | `app/api/cron/trial-expired/route.ts:65-117` (daily cron 16:00 UTC). `trial_ended_notified_at` marker set via CAS at line 82-93 (refutes prior stale doc claim L2). |
| Team invite accepted | INVITE_ACCEPTED | "Team Member Joined — A team member accepted your invite." | "A teammate just joined your SnapQuote workspace" | — | Org (existing members) | `app/api/public/invite/accept/route.ts:86-120` |
| Account deletion confirmation | — | — | "Your SnapQuote account has been deleted" | — | The deleted user's address | `app/api/app/account/delete/route.ts:332-346` |
| Email verification | — | — | "Verify your SnapQuote email" (inline-built shell) | — | Target email | `app/api/app/settings/verify-email/route.ts:91-104` |
| Password reset | — | — | "Reset your SnapQuote password" (inline-built shell) | — | Target email (gated by rate limit) | `app/api/public/auth/forgot-password/route.ts:71-77` |
| Welcome (first-time bootstrap) | — | — | "Welcome to SnapQuote 👋" | — | New user's email | `lib/onboarding.ts:124-135` |
| Plan upgraded (Stripe checkout / cycle) | — | — | "You're on the {plan} plan 🎉" | — | Org owner | `app/api/stripe/webhook/route.ts:288, 394` (the 394 site correctly gates on `isRenewalCycle`) |
| Plan upgraded (RC INITIAL_PURCHASE / RENEWAL) | — | — | "You're on the {plan} plan 🎉" | — | Org owner | `app/api/revenuecat/webhook/route.ts:314, 331` (**both** sites fire — see H2) |
| Plan ended (Stripe / RC) | — | — | "Your SnapQuote plan has changed" | — | Org owner | `app/api/stripe/webhook/route.ts:336, 439`; `app/api/revenuecat/webhook/route.ts:412, 451` |
| Payment failed (Stripe / RC BILLING_ISSUE) | — | — | "Your SnapQuote payment failed" | — | Org owner | `app/api/stripe/webhook/route.ts:468`; `app/api/revenuecat/webhook/route.ts:208` |
| Credit purchase confirmation (Stripe / RC NON_RENEWING_PURCHASE) | — | — | "{N} bonus credits added to your account" | — | Org owner | `app/api/stripe/webhook/route.ts:225`; `app/api/iap/sync/route.ts:261` |

### 1.4 Cron schedules — verified

Vercel crons (`vercel.json`):
- `unopened-leads-reminder` — `0 14 * * *` (14:00 UTC daily)
- `estimate-expiry-warning` — `0 2 * * *`
- `auto-expire-stale-quotes` — `0 3 * * *`
- `trial-ending-soon` — `0 15 * * *`
- `cleanup-notifications` — `0 4 * * *`
- `trial-expired` — `0 16 * * *`
- `estimate-nudge-unviewed` — `0 17 * * *`

Supabase pg_cron (Supabase MCP `SELECT * FROM cron.job`):
- `reset-solo-credits` — `0 0 * * *`
- `reset-paid-credits` — `0 0 * * *`
- `rescue-stuck-leads` — `*/3 * * * *` (every 3 minutes — explains why it's not in `vercel.json`)

---

## Section 2 — Findings

Severity rubric:
- **Critical**: notifications not delivered at all to a real user. (0 today.)
- **High**: delivered but PII-leaking, missing-on-failure, or cost-runaway.
- **Medium**: edge case or recovery gap.
- **Low**: cosmetic / hygiene.

---

### H1 — Telnyx DLR webhook missing; carrier delivery failure invisible

**Severity:** High
**Live evidence:**
- `grep -r "telnyx.*webhook\|DLR\|message\.delivered"` across web repo: **no `app/api/webhooks/telnyx/route.ts` or any handler exists** at HEAD.
- `public.quotes.telnyx_message_id` column comment (Supabase MCP `list_tables` verbose): *"A non-NULL value here means Telnyx accepted the message — it does NOT mean the customer received it. Carrier-level delivery status would require a DLR webhook handler (not yet wired)."*
- Migration `supabase/migrations/0062_quote_telnyx_message_id.sql` exists (per grep) and persists the message id, ready to be correlated with a DLR webhook, but no consumer.

**Root cause:** Telnyx returns HTTP 200 the moment a message is queued for carrier hand-off, well before the carrier reports delivery (or rejection — invalid handset, blocked number, full inbox, T-Mobile spam filter). Without a DLR webhook the app cannot tell a quote that reached the customer apart from one that bounced at the carrier. The cost is on the contractor: they sent it, it shows "sent" in the UI, the customer never got it, the contractor loses the bid.

**Suggested fix approach:** Add `app/api/webhooks/telnyx/route.ts` that verifies the Telnyx webhook signature, looks up the quote by `telnyx_message_id`, and records the carrier-reported state on the quote (`delivered_at`, `delivery_failed_at`, `delivery_failure_reason`). Surface failed deliveries in the in-app feed so the contractor can retry. Telnyx's Mission Control portal also lets you configure a DLR endpoint per messaging profile.

**Conflicts / supersedes:** Confirms Audit 4 PW-A4-21 entry. Same status at HEAD — still open.

---

### H2 — RevenueCat RENEWAL fires "plan upgraded" email every cycle

**Severity:** High
**Live evidence:**
- `app/api/revenuecat/webhook/route.ts:318-333` — RENEWAL case calls `void sendPlanUpgradedEmail(orgId, plan);` unconditionally on every RENEWAL event after `setOrganizationPlan` and `resetOrganizationCredits`.
- Contrast with `app/api/stripe/webhook/route.ts:392-395` which correctly gates on `isRenewalCycle`: `if (isRenewalCycle && (effectivePlan === "TEAM" || effectivePlan === "BUSINESS")) { void sendPlanUpgradedEmail(orgId, effectivePlan); }` — but the RC handler lacks this gate.
- `lib/planChangeEmails.ts:21-52` builds the actual "You're on the {plan} plan 🎉" email — subject and body congratulate the user on a new plan, which is the wrong tone on a routine renewal.

**Root cause:** When the original `sendPlanUpgradedEmail` was added to the RC webhook, the renewal-vs-fresh-upgrade distinction was not encoded. Stripe later fixed this by reading `invoice.billing_reason === "subscription_cycle"`; RC needs an equivalent heuristic. RC RENEWAL events do not have a direct "is-fresh" flag, but you can compare the org's current plan to the new plan, or check `iap_subscription_events` for prior INITIAL_PURCHASE/RENEWAL rows for the same org.

**Suggested fix approach:** Skip `sendPlanUpgradedEmail` on RENEWAL when the org was already on the same paid plan (i.e., this is a true renewal, not a tier change). PRODUCT_CHANGE events handle the tier-change case separately (line 369-380). Only INITIAL_PURCHASE should fire the celebratory email.

**Conflicts / supersedes:** `SnapQuote/docs/current-state.md:246` and `updates-log.md:724` both flag this as "H1 NEW" / "spam." STILL OPEN at HEAD — those entries are historically accurate, not superseded.

---

### H3 — Customer name PII in push body visible on lock-screen previews

**Severity:** High
**Live evidence:**
- `app/api/public/quote/[publicId]/accept/route.ts:176-185` builds the ESTIMATE_ACCEPTED push: `body: \`${customerName} accepted your estimate${locationSuffix}.\`` where `locationSuffix` includes the city if available.
- `app/api/cron/estimate-nudge-unviewed/route.ts:62-75` — first name extracted from `lead.customer_name.split(" ")[0]` and pushed: `body: \`${customerName} hasn't opened your estimate. A quick follow-up usually does the trick.\``
- Compare with `lib/ai/estimate.ts:4667-4674` (NEW_LEAD): `body: \`You have a new lead in ${city}! Tap to unlock.\`` — correctly **omits** customer name. The right pattern exists; just not consistently applied.
- iOS default for unlocked phones is "Show Previews: Always" — lock-screen banner and Notification Center both render the body text. Android default is similar (full text on lock screen unless app-level "hide sensitive content" is on).

**Root cause:** The contractor-facing copy for "customer accepted" was written with the customer's name embedded to make the alert more meaningful at a glance. But push notifications surface in places where the contractor isn't the only viewer — a shared phone at a job site, a screen-projection on a truck dashboard, an Apple Watch tap that pre-prints the customer's name. SnapQuote stores customers' names as PII; pushing them through the OS's notification system without redaction is a "minimum necessary" violation under most privacy frameworks.

**Suggested fix approach:** Use the city / service / dollar amount instead of the customer name. "Your $5,400 estimate for paver patio in Cleveland was accepted." carries the same actionable signal without naming the person. For the nudge: "An estimate hasn't been opened yet." or "1 of your estimates is going stale." If the contractor wants to see the customer's name, they can tap into the in-app feed (auth-gated).

**Conflicts / supersedes:** Audit 8 (security & privacy) mentioned PII handling broadly but does not have a specific finding on push payloads. New finding.

---

### H4 — Push dispatch and mobile push registration have zero explicit Sentry capture

**Severity:** High
**Live evidence:**
- `lib/pushNotifications.ts` — grep for `Sentry|captureException|addBreadcrumb`: **no matches**. All failures go to `console.error` (line 71, 102, 109).
- `SnapQuote-mobile/lib/notifications.ts` — same grep: **no matches**. Push token upsert failure at line 170 (`console.error("Push token upsert failed:", error)`) and registration throw at line 177 (`console.error("Push token registration failed:", error)`) are console-only.
- Compare with `lib/notify.ts:92` and `lib/telnyx.ts:97` which correctly call `Sentry.captureMessage` at warning level for Telnyx user-input errors (Audit 13 M4 fix).

**Root cause:** Push is the only customer-facing channel that bypasses the Sentry instrumentation pass done in Audit 13. `captureConsoleIntegration` (enabled per `instrumentation-client.ts`) will forward console.error events to Sentry as warning-level events without stack tags. That means:
- An entire org's push fan-out failing (Expo 5xx, network outage) appears as a generic "Expo push HTTP error: 500" in Sentry — no `org_id`, no `event_type`, no token count.
- A mobile push registration RLS denial (the exact failure mode documented in `mobile/docs/build-10-auth-regression-diagnostic-2026-05-06.md` — Postgres code 42501) appears as "Push token upsert failed: [object Object]" with no `org_id` and no decoded error payload.

**Suggested fix approach:** Add `Sentry.captureException` calls to the catch blocks in `lib/pushNotifications.ts:sendBatch` (network failure) and `sendPushToOrg` (tokens-fetch failure, batch failure, terminal-token cleanup failure), tagged `area: "push"` + `org_id`. Add `Sentry.captureException` on the mobile registration failure path tagged `area: "push-register"` + `user_id` + `org_id`, with the Postgres error code extracted into the tag bucket (parity with `lib/sentryScrub.ts`). Optionally add a Sentry breadcrumb on successful sends with `{sent, cleanedUp}` counts for dispatch debugging.

**Conflicts / supersedes:** Audit 13 H4 added explicit `captureException` to 8 revenue/auth handlers but did not include the push dispatch path. New extension of that work, not a supersession.

---

### M1 — Push payload omits `badge` field; mobile badge count drifts

**Severity:** Medium
**Live evidence:**
- `lib/pushNotifications.ts:80-90` builds messages with `{to, title, body, data, sound, priority}`. **No `badge` field.**
- `SnapQuote-mobile/lib/notifications.ts:11-19` sets `shouldSetBadge: true` in `setNotificationHandler` — the OS will update the app icon badge per the *payload's* `badge` field, but if the field is absent the badge stays at whatever it was.
- Grep across mobile repo for `setBadgeCountAsync|setBadgeCount|setApplicationIconBadge`: **no matches**. There is no client-side badge management either.

**Root cause:** The Expo Push API supports a `badge: <number>` payload field on iOS. Without it the badge is never set, never cleared, and never resynced with the actual unread count from the `notifications` table.

**Suggested fix approach:** Either set the badge on the server (read `SELECT COUNT(*) FROM notifications WHERE org_id = $1 AND read = false` and put it on the payload), or let the client own the badge — call `Notifications.setBadgeCountAsync(unreadCount)` from `useNotifications` whenever `unreadCount` changes, and reset to 0 on the `markAllRead` mutation and on app foregrounding. Picking client-side is simpler and avoids a DB lookup on the push send path; do it from the mobile `NotificationsProvider`.

---

### M2 — Push tap target ≠ in-app feed tap target for the same event

**Severity:** Medium
**Live evidence:**
- ESTIMATE_VIEWED push: `data: { screen: "lead", id: quote.lead_id as string }` (`app/api/public/quote/[publicId]/viewed/route.ts:72-76`).
- ESTIMATE_VIEWED in-app row: `screen: "quotes", screen_params: { id: quote.id as string }` (line 78-86 of same file).
- Same inconsistency for ESTIMATE_ACCEPTED in `accept/route.ts:181-195`. Push routes to lead detail; in-app feed routes to quotes list.

**Root cause:** Push payload was designed around "what's the most useful destination when the user taps a banner" (the lead's full detail page). In-app feed was designed around "what's the most useful destination from a notifications dropdown" (the quotes list). Both make sense in isolation but contradict each other for the same event.

**Suggested fix approach:** Pick one canonical target per event-type and use it everywhere. ESTIMATE_VIEWED → lead detail makes more sense (you'd want to follow up). ESTIMATE_ACCEPTED → lead detail likewise (you'd want to start the job). Change the in-app row's `screen`+`screen_params` to match the push payload. This also lets the `TopBar.handleNotificationClick` and mobile `_layout` tap handler share one routing map.

---

### M3 — `unopened-leads-reminder` threshold hardcoded at 10

**Severity:** Medium
**Live evidence:**
- `app/api/cron/unopened-leads-reminder/route.ts:37` — `if (!count || count < 10) continue;`. Magic number.

**Root cause:** When the cron was authored, "10 unopened" was a reasonable proxy for "this contractor has a real backlog." But it doesn't scale — a high-volume contractor doing 50 leads/day will trigger the reminder daily; a one-person SOLO will never trigger it. Either move the threshold to org-level configuration (`organizations.unopened_lead_reminder_threshold`) or make it relative (e.g., 2× the contractor's 30-day average).

**Suggested fix approach:** For pre-launch, push the threshold into a `lib/notifications/thresholds.ts` constants file so it can be tuned without redeploying app code. Post-launch, add it to the contractor's notification preferences UI.

**Conflicts / supersedes:** Audit 4 PW-A4-16 flagged this. Same status at HEAD — still open.

---

### M4 — `unopened-leads-reminder` writes no in-app feed row

**Severity:** Medium
**Live evidence:**
- `app/api/cron/unopened-leads-reminder/route.ts` — grep for `notifications.*insert` against this file: **no matches**. The cron only calls `sendPushToOrg`; it does not insert into `notifications`.
- Every other cron-driven push (`estimate-expiry-warning`, `estimate-nudge-unviewed`, `auto-expire-stale-quotes`, `trial-expired`) DOES insert a feed row — verified in the dispatch matrix above.

**Root cause:** The unopened-leads cron was the first contractor-nudge built; the in-app feed table was added later and the other crons were retrofitted but this one wasn't.

**Suggested fix approach:** Add an `UNOPENED_LEADS` type with `screen: "lead"` (no `id` — it's a list-scoped reminder) or `screen: "leads"`. Insert the row inside the same `for (orgId of uniqueOrgIds)` loop, right next to the `sendPushToOrg` call. The partial unique index on `(org_id, screen_params->>'id')` only applies to NEW_LEAD, so no constraint violation.

---

### M5 — Trial-ending-soon (T-48h) is email-only — no push, no in-app feed

**Severity:** Medium
**Live evidence:**
- `app/api/cron/trial-ending-soon/route.ts` — grep this file for `sendPushToOrg`, `notifications.*insert`: **no matches**. Email-only.
- Same file's trial-expired sibling (`trial-expired/route.ts:96-117`) sends email + in-app + push.

**Root cause:** Trial-ending-soon is a high-stakes plan-state change — the org owner has 48h to upgrade or get auto-downgraded. Email alone is fragile: it can land in spam, the user may not check email between when the cron fires and when the trial actually ends.

**Suggested fix approach:** Match the trial-expired pattern. Add a `TRIAL_ENDING_SOON` notification row with `screen: "settings"` and an Expo push with the same body text. Re-use the existing `trial_ending_notified_at` marker for idempotency.

---

### M6 — Realtime channel name not per-mount unique (mobile only — web mitigates via singleton)

**Severity:** Medium
**Live evidence:**
- Mobile `lib/hooks/useNotifications.tsx:103`: `.channel(\`mobile-notifications-${orgId}\`)` — no per-mount suffix.
- Web `hooks/useNotifications.ts:171-172`: `.channel(\`notifications-${orgId}\`)` — also no per-mount suffix BUT wrapped in a module-singleton store at lines 48-79 that guarantees only one channel per orgId regardless of mount count.

**Root cause:** Mobile's `NotificationsProvider` is mounted once high in the tree (`app/_layout.tsx`), so in practice only one instance exists. But React Strict Mode (which Expo enables in dev for new SDKs) double-invokes effects, and a fast-refresh in development with the same `orgId` will create a second channel with the same name. Supabase realtime channels are keyed by name — the second subscribe call rejoins the same channel, but the cleanup paths can collide and silently break realtime updates for the rest of the session.

**Suggested fix approach:** Append a per-mount UUID to the channel name. `useRef(() => crypto.randomUUID())` or `Math.random().toString(36).slice(2,10)` is sufficient since the name only needs to be unique within one client. Same pattern as the audit-recommended fix for other realtime channels in the mobile codebase.

---

### M7 — Two SMS dispatch paths with overlapping responsibilities

**Severity:** Medium
**Live evidence:**
- `lib/notify.ts:75-168` — `sendSms(to, body)`: retry/timeout/E.164-normalize/footer-append, used by `notifyContractor` and `notifyCustomer` (called from `app/api/public/lead-submit/route.ts:417, 420` and `app/api/public/quote/[publicId]/accept/route.ts:166`).
- `lib/telnyx.ts:79-186` — `sendQuoteSms({to, body, idempotencyKey})`: same retry/timeout/E.164 logic, plus an `Idempotency-Key` header. Used only by `app/api/app/quote/send/route.ts:247-251`.
- Two near-identical Telnyx user-input-error tables (`TELNYX_USER_INPUT_ERROR_CODES = ["10002", "40310"]` in both files).

**Root cause:** When the quote-send path was hardened for idempotency (Audit 4), a new function was added rather than extending the existing `sendSms`. Both files now duplicate the retry policy, timeout values, and Sentry user-input-error classification. A bug fixed in one will not propagate to the other (e.g., if the Telnyx error code list changes, both must be updated).

**Suggested fix approach:** Collapse to a single `sendSms({to, body, idempotencyKey?})` in `lib/telnyx.ts`. Have `notify.ts` re-export the wrapper. Keep the convenience helpers `notifyContractor` / `notifyCustomer` in `notify.ts` but have them call through to the unified primitive. Optionally add idempotency keys to the lead-submit dispatch (keyed on lead id) so an after()-retry doesn't re-text the contractor or customer.

---

### M8 — Push send doesn't chunk for Expo's 100-per-batch limit

**Severity:** Medium
**Live evidence:**
- `lib/pushNotifications.ts:78-99` — `sendBatch` builds `tokens.map(...)` and sends them all in a single POST to `https://exp.host/--/api/v2/push/send`. No length check, no chunking.
- Expo's documented limit: 100 messages per HTTP request.
- Live state: only 5 push tokens across 3 orgs (Supabase MCP `SELECT COUNT FROM push_tokens`) — so the limit isn't reached today. Forward-looking.

**Root cause:** Designed assuming small team sizes (`Org → handful of devices`). A future BUSINESS-tier org with >100 team members would silently truncate or get a 4xx response. Even without 100 devices in one org, the cron handlers (`unopened-leads-reminder`, `trial-expired`) iterate every org, but each push is per-org so the limit isn't violated by the cron pattern — it's only `sendPushToOrg` itself that can hit it.

**Suggested fix approach:** Wrap `sendBatch` in a `for (let i = 0; i < tokens.length; i += 100)` chunk loop, dispatch each chunk, and merge the tickets. Adds maybe 5 lines.

---

### M9 — Mobile push registration failure has no Sentry instrumentation (subset of H4)

Listed separately because the audit rubric calls out registration as its own concern. Same evidence and remediation as H4, mobile half. If H4 lands, M9 lands.

---

### L1 — `TopBar.handleNotificationClick` no-op for unknown screen values

**Severity:** Low
**Live evidence:** `components/TopBar.tsx:66-71` — falls through to `console.warn` with no fallback navigation. User tap does nothing visible.
**Suggested fix:** Either route unknown screen to `/app/notifications` (a notifications-index page, if one existed) or default to the dashboard. A silent click is the worst outcome.

---

### L2 — STALE DOC: `trial_ended_notified_at` is now used (was flagged as unused)

**Live evidence:** Prior `SnapQuote/docs/updates-log.md:1429` claims the column was added in migration 0046 but never read/written. Live HEAD `app/api/cron/trial-expired/route.ts:79-93` writes it via CAS after the email succeeds. This is a stale-docs entry — the wiring caught up. Flag the prior entry as historical-but-superseded.

---

### L3 — STALE DOC: `TopBar.handleNotificationClick` handles "settings"

**Live evidence:** Prior `SnapQuote/docs/updates-log.md:1428` says "Web `TopBar.handleNotificationClick` only handles `lead | quotes | team`". Live HEAD `components/TopBar.tsx:59-65` handles `lead | quotes | team | settings` — settings → `/app/plan`. TRIAL_EXPIRED notifications route correctly on web now. Stale-docs only.

---

### L4 — Expo push uses legacy `exp.host` URL

**Severity:** Low
**Live evidence:** `lib/pushNotifications.ts:9` — `EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"`.
Expo's canonical host as of 2025 is `https://api.expo.dev/v2/push/send`. Both work; `exp.host` is documented as legacy. Hygiene fix.

---

### L5 — All pushes use `priority: "high"` + `sound: "default"`

**Severity:** Low
**Live evidence:** `lib/pushNotifications.ts:88-89` — every push gets `sound: "default"` and `priority: "high"`. Includes soft nudges like "estimate not viewed in 2 days" and time-critical events like "customer accepted your estimate."
**Suggested fix:** Plumb a `priority` option through `PushPayload` and downgrade soft nudges to `priority: "normal"` and `sound: null` (or a quieter sound channel). Keeps urgent events disruptive and routine events polite.

---

## Section 3 — Verified-clean items (no finding)

These were audited and found correct at HEAD. Listed so future audits don't re-investigate.

1. **Resend domain auth** — Resend MCP `list-domains` shows `snapquote.us` verified, sending enabled, us-east-1 region, created 2026-03-25. No DKIM/SPF/DMARC issues at the Resend layer (DNS verification status is "verified").
2. **From-address envelope policy** — `lib/notify.ts:170-180` resolves `transactional` → `estimates@snapquote.us` (customer-facing) and `noreply` → `noreply@snapquote.us` (contractor lifecycle). All contractor-lifecycle cron emails pass `sender: "noreply"`. Customer-facing emails default to `transactional`.
3. **Reply-To routing** — `app/api/app/quote/send/route.ts:280-281` sets `replyTo: contractorReplyEmail` so customer replies route back to the contractor's own inbox, not to `estimates@`. `app/api/public/lead-submit/route.ts:393-394` likewise. Good UX.
4. **Plain-text fallback on every email** — `lib/emailTemplates.ts` — every builder returns `{subject, text, html}` with a real `text` field. No HTML-only sends.
5. **Email idempotency keys** — quote send (`quote-send-${quoteId}-email`), nudge cron (`cron-nudge-${quoteId}`), expiry warning (`cron-expiry-warning-${orgId}-${runDay}`), auto-expire (`cron-expire-${orgId}-${runDay}`), trial-ending (`cron-trial-ending-${orgId}`), trial-expired (`cron-trial-expired-${orgId}-${runDay}`). Verified in code.
6. **Telnyx idempotency key on quote send** — `quote-send-${quoteId}-sms` via the `Idempotency-Key` header. `lib/telnyx.ts:108-110`.
7. **50-per-org cap** — DB trigger `trg_prune_org_notifications` AFTER INSERT. Function: `prune_org_notifications()` — deletes anything past offset 50 ordered by `created_at DESC`. Verified via Supabase MCP `SELECT pg_get_functiondef`.
8. **7-day TTL** — `app/api/cron/cleanup-notifications/route.ts:13-31` — daily cron deletes rows with `created_at < now() - 7 days`. Scheduled in `vercel.json` at 04:00 UTC.
9. **NEW_LEAD dedup** — partial unique index `notifications_new_lead_dedup_idx ON (org_id, screen_params->>'id') WHERE type='NEW_LEAD'`. Live verified. `sendNewLeadNotifications` (`lib/ai/estimate.ts:4693`) treats SQLSTATE 23505 as soft success.
10. **CAS-protected ESTIMATE_VIEWED** — `app/api/public/quote/[publicId]/viewed/route.ts:41-61` only fires push + in-app for the row-flip winner. Concurrent customer double-taps don't duplicate the event.
11. **CAS-protected accept idempotency** — `app/api/public/quote/[publicId]/accept/route.ts:88-108` — concurrent accept calls return idempotent success rather than spuriously erroring.
12. **Push token dedup per device** — composite PK `(user_id, device_id)` + `onConflict: "user_id,device_id"` on upsert (`SnapQuote-mobile/lib/notifications.ts:166`). One row per (user, device install).
13. **Mobile signOut scopes token delete to current device** — `SnapQuote-mobile/lib/auth.tsx:313-323` deletes `eq("user_id", userId).eq("device_id", deviceId)`. A user signed in on iPhone A and iPhone B who signs out on A keeps notifications on B. Matches the audit-1 fix.
14. **Push token rotation on foreground** — `SnapQuote-mobile/app/_layout.tsx:198, 208` calls `refreshPushToken()` on mount and on AppState 'active'. Token rotation is handled.
15. **RLS on notifications and push_tokens** — both tables enforce per-user / per-org scoping. Service-role admin client is the only writer for `notifications`.
16. **Realtime channel filter** — both web and mobile subscribe with `filter: \`org_id=eq.${orgId}\`` so members of an org get realtime updates only for their org's rows. Matches RLS policy.
17. **Notification dedup on web realtime** — `hooks/useNotifications.ts:48-79` uses a module-level singleton store so multiple component mounts share one channel. Toast-burst window (1500ms) collapses bursts of inserts into a single follow-up toast.
18. **Idempotent webhook events** — `claimWebhookEvent` on both Stripe and RC webhook handlers (`webhook_events` table) prevents re-processing. Notification emails fired inside those handlers inherit the idempotency.
19. **Auto-expire writes feed entry + push + email** — `app/api/cron/auto-expire-stale-quotes/route.ts:85-122` does all three.
20. **Welcome email** — fires on first-time bootstrap (`lib/onboarding.ts:124-135`) using `sendEmail` with `sender: "noreply"`.
21. **Stripe webhook correctly gates renewal email** — `app/api/stripe/webhook/route.ts:393` — `if (isRenewalCycle && ...)`. Unlike RC (H2), Stripe does not spam.
22. **Lead-submit decouples notifications from response** — `app/api/public/lead-submit/route.ts:399-435` runs estimator trigger + contractor SMS + customer SMS + customer email inside `after()`. Customer's HTTP response returns immediately after DB writes. Telnyx / Resend latency does not block the form submission.

---

## Section 4 — To-do list (suggested priorities)

For each finding above, the "Suggested fix approach" is one-line. This block lists them in priority order so a future implementation pass can grab one off the top.

1. **H1 — Add Telnyx DLR webhook handler.** Endpoint `app/api/webhooks/telnyx/route.ts`. Verify Telnyx signature, look up quote by `telnyx_message_id`, persist delivery state. Configure DLR URL in Telnyx Mission Control per messaging profile.
2. **H2 — Gate RC `sendPlanUpgradedEmail` on non-renewal.** Check the org's current plan against the incoming plan; only fire if it's a tier change or initial purchase. Pattern parity with Stripe webhook.
3. **H3 — Remove customer name from push bodies.** `app/api/public/quote/[publicId]/accept/route.ts:181-184` and `app/api/cron/estimate-nudge-unviewed/route.ts:72-75`. Replace with non-PII alternatives (service, city, count).
4. **H4 — Add explicit `Sentry.captureException` to push dispatch and mobile push registration.** `lib/pushNotifications.ts` (catches in `sendBatch` and `sendPushToOrg`); `SnapQuote-mobile/lib/notifications.ts:169-178` upsert catch. Tag `area: "push"` and `org_id` / `user_id`. Decode Postgres error code where present (parity with `lib/sentryScrub.ts`).
5. **M1 — Wire mobile badge count.** Client-side: `Notifications.setBadgeCountAsync(unreadCount)` from `useNotifications` on mount and on every realtime delta; reset to 0 on `markAllRead` and on app foreground.
6. **M2 — Pick canonical tap target per event-type.** Update both push payload and in-app feed row's `screen`/`screen_params` to agree. Recommend `screen: "lead", id: lead_id` for ESTIMATE_VIEWED and ESTIMATE_ACCEPTED.
7. **M3 — Move unopened-leads threshold to a constant or org setting.** Currently hardcoded at 10 in `app/api/cron/unopened-leads-reminder/route.ts:37`.
8. **M4 — Add `notifications` row to unopened-leads-reminder cron.** Parity with the other crons.
9. **M5 — Add push + in-app row to trial-ending-soon cron.** Currently email-only.
10. **M6 — Make mobile realtime channel name per-mount unique.** Append a per-mount UUID in `useNotifications.tsx:103`.
11. **M7 — Collapse `sendSms` + `sendQuoteSms` to one primitive.** Move shared retry/timeout/error-classification into `lib/telnyx.ts`; `lib/notify.ts` re-exports.
12. **M8 — Chunk push sends at 100 tokens per batch.** Wrap `sendBatch` in `lib/pushNotifications.ts`.
13. **L1 — Add fallback navigation for unknown screen values.** `components/TopBar.tsx:66-71` — default to `/app` or `/app/notifications`.
14. **L4 — Switch Expo push URL to `api.expo.dev`.** One-line constant change.
15. **L5 — Plumb priority/sound through push payload.** Soft nudges → `priority: "normal"`, urgent events keep `"high"`.

Stale-doc cleanup (lane rule — not touched in this audit, listed for whoever owns those entries):
- `SnapQuote/docs/updates-log.md:1429` — `trial_ended_notified_at` is now wired (L2).
- `SnapQuote/docs/updates-log.md:1428` — TopBar handles `settings` (L3).

---

## Section 5 — Cross-flags to Audit 13 (observability)

- **H4** (push dispatch + mobile registration Sentry gap) is a natural extension of Audit 13 H4. The 8 revenue/auth handlers got `captureException` coverage; the push dispatch path was not in scope.
- **M9** (mobile registration Sentry gap) is a subset of H4 — listed separately because the audit rubric breaks it out.
- The Telnyx user-input error classification (Audit 13 M4) is correctly implemented at HEAD — `lib/notify.ts:88-96, 146-158` and `lib/telnyx.ts:88-101, 164-176` both use `Sentry.captureMessage` at warning level for codes 10002/40310. Confirmed during this audit, no regression.

---

## Section 6 — What I did not verify live

Disclosed in the spirit of the citation rule:

- **Telnyx 10DLC campaign status** — User memory says "Active". No Telnyx MCP available to confirm via dashboard. Could not verify live. Suggest checking the Telnyx portal directly.
- **Vercel env vars for `TELNYX_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_EMAIL_NOREPLY`** — No Vercel MCP. Code paths check via `Boolean(process.env.X)` and gracefully no-op when missing, so live behavior would surface as "skipped: missing" warnings. Could not verify the actual values are populated; the dispatching code is correct either way.
- **Resend domain DNS records (SPF / DKIM / DMARC)** — Resend MCP shows the domain as `verified`, which implies DKIM at minimum is in place, but I did not query DNS directly. The Resend dashboard is the canonical source.
- **iOS / Android lock-screen preview defaults** for H3 — relied on platform documentation, did not test on a real device.
- **Customer SMS deliverability** — relies on H1's missing DLR webhook; the actual delivery rate is unknown to the app.
