# Audit 4 of 13 — Lead Lifecycle (READ-ONLY) — 2026-05-09

**Repos at HEAD:** web `eef6693` (post Audit 8 web infra hardening + AASA followup); mobile `8ed8eea` (post Audit 8 C2 / H10 leads_safe view).
**Live source:** Supabase project `upqvbdldoyiqqshxquxa` (snapquote prod), Sentry org `snapquote`.
**Mode:** READ-ONLY. No code or schema changed by this audit.
**Prior baseline:** Audit 4 (2026-05-08) found 28 items (3 Critical / 8 High / 10 Medium / 7 Low). This pass re-verifies prior findings against HEAD and surfaces fresh observations.

---

## Verdict

The lead lifecycle is functional end-to-end. **Zero findings rated Critical at HEAD.** Prior C1/C2/C3 items live in code paths that are mobile-side (out of this audit's primary repo) or have shifted since the prior pass; cross-flagged. The Vercel `after()` non-blocking pattern, the Edge-Function-decoupled estimator, the per-call AI timeouts + catch fallback, the publicId entropy on the unlock + send paths, the two-phase QuoteComposer flow, the quote-send CAS rollback, the public-quote view CAS, and the self-accept rejection on `/accept` all check out at HEAD.

Six **High** items survive from the prior pass (DRAFT staleness, ARCHIVED phantom enum, OPENED missing enum, lead-photos bucket missing MIME/size, unlock DRAFT-mint silent failure, lead-detail 48-bit publicId fallback) plus one **fresh High** (8 leads with `ai_status='ready'` but NULL estimate range — historical data inconsistency).

---

## Critical

None. Prior C1 (mobile useLeads channel race), C2 (mobile getLeads filter), C3 (mobile EstimateComposer "preview" link) are mobile-repo issues — out of this audit's scope. Cross-flagged.

---

## High

### H1 — DRAFT-quote staleness, no cleanup mechanism (STANDS from prior audit, slightly worse)
- **File:** No cleanup cron exists. DRAFTs only ever transition via `/api/app/quote/send` (DRAFT → SENT) or sit forever.
- **Live evidence (Supabase MCP, 2026-05-09):**
  - 35 DRAFTs total
  - 31/35 (89%) older than 7 days at the linked `lead.submitted_at`
  - 25/35 (71%) older than 30 days
  - 0/35 older than 90 days
  - Oldest = `2026-03-16 21:36 UTC` (~54 days)
- **Impact:** Each DRAFT represents a charged credit (the contractor unlocked but never sent). Either (a) auto-flip DRAFT → EXPIRED after N days, (b) surface a "Discard draft" action in QuoteComposer (with credit-refund policy decision), or (c) explicitly accept that DRAFTs are permanent until manually sent.

### H2 — `lead_status.ARCHIVED` is a phantom enum value (STANDS)
- **Live evidence:** `pg_enum` shows `lead_status` = `{NEW, QUOTED, ACCEPTED, ARCHIVED}`. `SELECT COUNT(*) FROM leads WHERE status='ARCHIVED'` returns 0. No code path writes ARCHIVED.
- **Background:** Migration 0031 (auto-archive) was a historical no-op (multiline dollar-quoted body parser issue) and the lead-archiving feature was subsequently removed from the product.
- **Impact:** Schema noise. Future enum-exhaustiveness checks (TS / Supabase types) will type-narrow against a value that can't exist live.

### H3 — `lead_status.OPENED` was never added to the live enum despite migration 0030 being recorded as applied (STANDS)
- **Live evidence:** `pg_enum` for `lead_status` does not contain `OPENED`. `supabase_migrations.schema_migrations` has the 0030 row recorded.
- **Impact:** Drift between recorded-migration history and live enum state. Either (a) re-apply 0030, (b) drop OPENED from the concept, or (c) write a follow-up migration that makes the live enum match the migration history.

### H4 — Storage bucket `lead-photos` has no MIME/size enforcement at the bucket level (STANDS)
- **Live evidence:** `SELECT id, public, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id='lead-photos'` → `{public:false, allowed_mime_types:NULL, file_size_limit:NULL}`.
- **Background:** All MIME/size validation lives in [`app/api/public/lead-photo-upload/route.ts:104-119`](app/api/public/lead-photo-upload/route.ts) (10MB cap, image/{jpeg,png,heic,heif,webp} allowlist).
- **Impact:** Defense-in-depth gap. A future code path that uploads to `lead-photos` while bypassing the route would not get MIME/size protection. Idempotent fix: bucket-level config.
- **Cross-flag:** Audit 8 owns storage hardening as L-rated (storage-bucket settings).

### H5 — Unlock route DRAFT-mint failure silently returns `publicId: null` with `ok: true` (STANDS)
- **File:** [`app/api/app/leads/unlock/route.ts:75-81`](app/api/app/leads/unlock/route.ts:75) at HEAD: catch block logs to console and sets `publicId = null`. The route returns `{ ok: true, alreadyUnlocked, remainingCredits, publicId: null }`. Credit is already spent.
- **Impact:** Contractor sees a successful unlock and no error UI; the lead-detail page falls back to a render-time `randomBytes(6)` (see H6) which produces a different publicId on every render. A future Send hits the H6 path. No telemetry on this failure mode.
- **Recommended:** (a) include `draftError` field in the response so client can surface a banner, OR (b) refund the credit + roll back the unlock if DRAFT creation fails, OR (c) one retry before giving up.

### H6 — Lead-detail page has a 48-bit publicId fallback (STANDS)
- **File:** [`app/app/leads/[id]/page.tsx:174`](app/app/leads/[id]/page.tsx:174) at HEAD: `const activePublicId = draftPublicId ?? randomBytes(6).toString("base64url");`
- **Live evidence (grep):** Only this one site uses 6 bytes. Both unlock route and quote-send route use 12 bytes (96 bits) — confirmed at [`app/api/app/leads/unlock/route.ts:19`](app/api/app/leads/unlock/route.ts:19) and [`app/api/app/quote/send/route.ts:21`](app/api/app/quote/send/route.ts:21).
- **Impact:** A render-time-generated 48-bit publicId could land on the persisted `quotes.public_id` if quote-send accepts the client-supplied `body.publicId ?? makePublicId()` (it does, [`app/api/app/quote/send/route.ts:193`](app/api/app/quote/send/route.ts:193)). Effective entropy on the customer-facing URL drops from 96 bits to 48 bits. 2^48 = 2.8×10^14 — guessable in milliseconds at scale.
- **Recommended:** Either don't render a preview when no DRAFT exists (force the unlock H5 path to be made user-visible) or use 12 bytes everywhere.

### H7 — 8 leads in `ai_status='ready'` with NULL `ai_estimate_low/high` (FRESH FINDING)
- **Live evidence:** SQL: `SELECT COUNT(*) FROM leads WHERE ai_status='ready' AND ai_estimate_low IS NULL` returns 8.
- **Sample:**
  - All 8 in org `8f939f96-7f92-4973-97f8-f08450ccb71f` (the same heavy-test org).
  - All processed `2026-03-09 16:41 — 23:34 UTC`.
  - All have `ai_suggested_price` populated; `ai_estimate_low/high` NULL.
  - All have `ai_estimator_notes` NULL.
  - All `services = ["Landscaping"]`.
- **Code at HEAD:** `lib/ai/estimate.ts:4738-4740` always writes `ai_estimate_low`, `ai_estimate_high`, `ai_suggested_price` together on the success path; the catch fallback (lines 4830-4832) does the same. So the live data has to predate the code that started writing the range.
- **Impact at HEAD:** [`app/api/app/leads/unlock/route.ts:57-60`](app/api/app/leads/unlock/route.ts:57) gracefully falls back to `ai_suggested_price` for both low/high — no crash. QuoteComposer's `originalRange` (components/QuoteComposer.tsx:61-64) does the same. The contractor sees a zero-width range, which is unusual UX. Mobile reads via `lib/api/leads.ts` (out of scope for web audit) would also see NULL ranges if it doesn't apply the same fallback.
- **Recommended:** One-time backfill — `UPDATE leads SET ai_estimate_low=ai_suggested_price, ai_estimate_high=ai_suggested_price WHERE ai_status='ready' AND ai_estimate_low IS NULL`.

---

## Medium

### M1 — `ai_estimator_notes` column shape inconsistency (FRESH FINDING)
- **Live evidence:** SQL `jsonb_typeof(ai_estimator_notes)` over recent failed leads returns mix of `'string'` and `'array'`.
  - 2 most-recent failed leads (`25d8964d`, `718642d6`, both 2026-04-18/19) have a JSON STRING: `"Estimator timed out before completing..."` (this is `STUCK_NOTE` from `app/api/cron/rescue-stuck-leads/route.ts:34-35`).
  - Older failed leads (`b8c773e4`, etc.) have a JSON ARRAY of audit-marker strings (this is from `lib/ai/estimate.ts` catch fallback / unsupported-request path).
- **Code at HEAD:** [`app/api/cron/rescue-stuck-leads/route.ts:86`](app/api/cron/rescue-stuck-leads/route.ts:86) writes `ai_estimator_notes: STUCK_NOTE` where `STUCK_NOTE` is a JS string constant. `lib/ai/estimate.ts:4640, 4828, 4914` write arrays via `buildEstimatorFailureNotes` / `catchNotes`. Both shapes coexist.
- **Impact:** Any reader treating `ai_estimator_notes` as `string[]` will fail on the 2 string rows. Web reads (e.g. lead-detail page rendering audit markers) — verify defensive parsing exists.
- **Recommended:** Normalise the rescue cron to write an array (`[STUCK_NOTE]`) so all consumers can iterate uniformly.

### M2 — Public quote /accept lead UPDATE missing org_id filter (cross-flag with Audit 8 M5 helper)
- **File:** [`app/api/public/quote/[publicId]/accept/route.ts:110`](app/api/public/quote/[publicId]/accept/route.ts:110): `await admin.from("leads").update({ status: "ACCEPTED" }).eq("id", acceptedQuote.lead_id);`
- **Background:** Audit 8 M5 added `requireOrgFilter` helper for admin-client tenant SELECTs. The post-acceptance lead READ at line 131 uses the helper. The status-flip UPDATE at line 110 does NOT.
- **Impact:** Defense-in-depth gap only — the `acceptedQuote.lead_id` was loaded via the publicId → quote chain (quote.lead_id → leads.id), so an attacker would need to know an unguessable 96-bit publicId to spoof a cross-tenant lead UPDATE. Not a practical exploit. But the helper convention exists and isn't being applied here.
- **Recommended:** Add `.eq("org_id", acceptedQuote.org_id)` to bring it in line with the Audit 8 M5 convention.

### M3 — `quote_events` ACCEPTED insert swallows ALL errors (STANDS)
- **File:** [`app/api/public/quote/[publicId]/accept/route.ts:117-125`](app/api/public/quote/[publicId]/accept/route.ts:117): `try { await admin.from("quote_events").insert(...) } catch (eventError) { console.warn(...) }`
- **Impact:** A duplicate-row violation (`23505`) is the expected case after the `quote_events_unique_quote_event_idx` (migration 0027); silencing it is correct. But any other DB error (RLS, FK, schema drift) is also silenced.
- **Recommended:** Narrow the catch to `error.code === '23505'`, capture other error shapes to Sentry. Same pattern PW-A4-15 from prior audit.

### M4 — `unopened-leads-reminder` threshold hardcoded `count >= 10` (STANDS)
- **File:** [`app/api/cron/unopened-leads-reminder/route.ts:37`](app/api/cron/unopened-leads-reminder/route.ts:37).
- **Impact:** Some orgs may want an earlier reminder. Move to `contractor_profile.unopened_lead_threshold` or per-plan default.

### M5 — QuoteComposer save-prefs effect fires on initial mount (STANDS)
- **File:** [`components/QuoteComposer.tsx:148-174`](components/QuoteComposer.tsx:148). `useEffect` on `[sendEmail, sendText, prefsLoaded, prefsOrgId]` triggers on first true-flip of `prefsLoaded`, writing back the freshly-loaded values. One wasted PATCH per composer mount.
- **Recommended:** Add a `firstLoadRef` to skip the first effect-fire after `prefsLoaded` flips true.

### M6 — PII can leak into Sentry via error MESSAGE bodies (cross-flag for Audit 8 H6 + Audit 12)
- **Live evidence:** Sentry `level:error` over 14d returns `Error: {"code":"42501","details":null,"hint":null,"message":"permission denied for organization 8f939f96-7f92-4973-97f8-f08450ccb71f"}` (4 occurrences).
- **Background:** Audit 8 H6 (deployed 2026-05-09) added `lib/sentryScrub.ts` to redact PII keys in `event.extra`, `event.contexts`, breadcrumbs, request bodies. The scrubber walks key NAMES looking for PII fragments; it does NOT redact org_id substrings inside an error message string.
- **Impact:** Org IDs leak into Sentry titles/messages. Org IDs are not strictly PII (no customer name/phone) but they are tenant identifiers. Out-of-scope for Audit 4; cross-flag for Audit 8 to extend the scrubber to message bodies, or for Audit 12 to redact at capture time.

---

## Low

### L1 — 17 Sentry events tagged `DEP0169 url.parse() deprecation` in last 14d (cross-flag for Audit 12)
Pollution of error stream; not a real lead-pipeline error. Likely from a bundled dependency. Filter out at `beforeSend` or upgrade source dep.

### L2 — Sentry custom-tag search returns no results (observability gap)
- **Live evidence:** `area:lead-submit OR area:lead-photo-upload OR area:estimator` returns 0 events over 14d.
- **Code at HEAD:** Multiple `Sentry.captureException(err, { tags: { area: "lead-submit", stage: "..." } })` calls in lead-submit, lead-photo-upload, and estimator. Should be searchable.
- **Hypothesis:** Either (a) the H6 PII scrubber accidentally drops tags during `beforeSend`, (b) tags are stored under a different field name than the search syntax expects, or (c) genuinely no errors hit those paths in the last 14d (the level:error search returns events tagged via title/message but not via the area tag, suggesting tags ARE being stripped).
- **Recommended:** Investigate `lib/sentryScrub.ts` — does it preserve `event.tags`? If yes, then no real errors flowed; if no, that's a regression in the scrubber that the H6 deployment introduced. Cross-flag for Audit 8 H6 follow-up.

### L3 — Estimator timeouts: 3 in 14 days (40000ms cap inside the AI call)
- **Live evidence:** Sentry shows 3 occurrences of `Error: Estimator timed out after 40000ms.`
- **Code at HEAD:** Inner-call timeout in `lib/ai/estimate.ts` (`STRUCTURED_AI_TIMEOUT_MS`). Heuristic fallback fires correctly per the catch-block design (line 4759-4865). No user-visible impact.
- **Note:** This is correct — the prior audit prompt asked about per-call timeouts (not an outer wrapper), and that's what's in place.

### L4 — Telnyx "Invalid phone number" 5 occurrences in 14 days
Customer-supplied phones rejected by carrier. Lead-submit's zod regex (`PHONE_REGEX = /^[+\d().\-\s]{7,20}$/`) catches some but not all carrier-rejectable formats. Acceptable.

### L5 — Telnyx DLR webhook still missing (STANDS)
- `quotes.telnyx_message_id` captured (migration 0062, [`app/api/app/quote/send/route.ts:296-301`](app/api/app/quote/send/route.ts:296)) but no inbound DLR endpoint exists. Without DLR we know Telnyx accepted the message but not whether the carrier delivered it. PW-A4-21 from prior audit STANDS.

### L6 — `quotes` historical-data fidelity: 27/30 EXPIRED + 4/15 ACCEPTED have empty `sent_via` (cosmetic)
Live evidence consistent with quotes sent before the `sent_via` column write was added/normalised. Doesn't affect HEAD writes; only relevant for historical analytics.

### L7 — Web QuoteComposer "Generate" → state flip is UI-only, no server roundtrip (correct)
Per the design doc, message preview is server-rendered at lead-detail page time. Phase 1 → Phase 2 is purely client. Verified at [`components/QuoteComposer.tsx:196-203`](components/QuoteComposer.tsx:196).

---

## Lead state machine — verified at HEAD

| Transition | Where it fires | Notes |
|---|---|---|
| `→ NEW` (initial) | [`app/api/public/lead-submit/route.ts:287-288`](app/api/public/lead-submit/route.ts:287) | Lead inserted with `status:'NEW', ai_status:'processing'`. |
| `NEW → QUOTED` | [`app/api/app/quote/send/route.ts:303-307`](app/api/app/quote/send/route.ts:303) | Always after a successful send (CAS guard via `.eq("status",...)` on the quote, but lead status update has no CAS). |
| `QUOTED → ACCEPTED` | [`app/api/public/quote/[publicId]/accept/route.ts:110`](app/api/public/quote/[publicId]/accept/route.ts:110) | After quote.status flips to ACCEPTED. No org_id filter (M2). |
| `QUOTED → NEW` (rollback) | [`app/api/app/quote/send/route.ts:406-411`](app/api/app/quote/send/route.ts:406) | On send failure; CAS-protected with `.eq("status","QUOTED")`. |
| `→ ARCHIVED` | nowhere | Phantom enum value (H2). |

**Live regression check:** No leads found in inconsistent state (e.g. lead.status='QUOTED' with no SENT-or-later quote, lead.status='ACCEPTED' with quote.status NOT IN ('ACCEPTED','EXPIRED'), lead.status='QUOTED' with quote.status='DRAFT'). Clean.

---

## AI estimator pipeline — verified at HEAD

**Trigger chain:**
1. [`app/api/public/lead-submit/route.ts:399-413`](app/api/public/lead-submit/route.ts:399): inside `after()`, calls `triggerEstimatorForLead(leadId)`.
2. [`lib/ai/triggerEstimator.ts:32-45`](lib/ai/triggerEstimator.ts:32): POSTs to Supabase Edge Function `run-estimator` with `apikey` + `Authorization: Bearer ${SERVICE_ROLE_KEY}`.
3. Edge function POSTs to [`/api/internal/run-estimator`](app/api/internal/run-estimator/route.ts) with `x-internal-secret`.
4. Route validates via `safeEqualSecret` (Audit 8 H3 fix), then calls `generateEstimateAsync(leadId)` ([`lib/ai/estimate.ts:4567`](lib/ai/estimate.ts:4567)).

**Per-call timeouts (no outer wrapper):**
- `STRUCTURED_AI_TIMEOUT_MS` (~35s) at [`lib/ai/estimate.ts:3757`](lib/ai/estimate.ts:3757), inside the `client.responses.parse` call.
- Property data 8s and polish 10s in their respective call sites (per the comment at lib/ai/estimate.ts:4710-4712).
- Confirmed by code comment: "No outer wrapper. The pipeline's per-call timeouts (property data 8s, AI 35s, polish 10s) plus the inline heuristic fallback at the bottom of generateEstimate guarantee a real estimate lands in ~normal cases."

**Model:** `gpt-5-mini` ([`lib/ai/estimate.ts:3762`](lib/ai/estimate.ts:3762) and [`:4366`](lib/ai/estimate.ts:4366)). Confirmed correct per persistent memory (NOT a typo for gpt-5).

**Catch-block fallback (lines 4759-4865):**
- Builds `degradedPropertyData`, runs deterministic `estimateEngine` directly, writes `catchNotes` audit markers to `ai_estimator_notes`, sets `ai_status: 'ready'`, fires `sendNewLeadNotifications`.
- Audit markers on the catch path: `["Estimator origin: catch_fallback.", "Catch fallback triggered by: <message>", "Summary polish: skipped (catch fallback).", "Property data: skipped (catch fallback uses degraded defaults)."]`.
- Captures original error to Sentry tagged `stage: "catch-fallback-recovered"`.

**Last-resort failure write (lines 4877-4931):**
- Reached only if `estimateInput` couldn't be built or the catch fallback itself threw. Writes `ai_status: 'failed'` with `failureNotes` (built via `buildEstimatorFailureNotes`).
- Calls `sendNewLeadNotifications` if `resolvedOrgId` is known, so the contractor isn't ghosted.

**ai_status state machine:** `processing → ready (success or catch fallback) → failed (last-resort) → processing (rescue cron stage 3 retry, ai_retry_count++) → ready/failed`. Correct.

**Live state (Supabase MCP, 2026-05-09):**
- 3473 leads total
- `ai_status='ready'`: 3310 (95.3%)
- `ai_status='failed'`: 163 (4.7%)
- `ai_status='processing'`: 0
- Stuck (`processing` >10min): 0
- `ai_retry_count > 0`: 3 leads (max=1; none hit the MAX_AI_RETRIES=2 cap)
- `null_ai_low / null_ai_high`: 171 each (matches `failed` count + 8 ready-but-null from H7)

**Falcon org pipeline (per audit prompt):** sampled 30 most recent. All complete in 21-96s except 3 outliers from `2026-05-04 20:06-20:14 UTC` that hit `ai_retry_count=1` and finished in 4390-5056s — clean rescue-cron behavior. 2 ancient `failed` leads from Apr 2026 sit beyond the 6h failed-retry window (correct).

---

## Cron job health

**Vercel daily crons** ([`vercel.json`](vercel.json)):
| Path | Schedule | Status |
|---|---|---|
| `/api/cron/unopened-leads-reminder` | `0 14 * * *` | ✓ |
| `/api/cron/estimate-expiry-warning` | `0 2 * * *` | ✓ |
| `/api/cron/auto-expire-stale-quotes` | `0 3 * * *` | ✓ |
| `/api/cron/trial-ending-soon` | `0 15 * * *` | ✓ |
| `/api/cron/cleanup-notifications` | `0 4 * * *` | ✓ |
| `/api/cron/trial-expired` | `0 16 * * *` | ✓ |
| `/api/cron/estimate-nudge-unviewed` | `0 17 * * *` | ✓ |

All 7 use `isAuthorizedBearer(authHeader, CRON_SECRET)` from `lib/auth/timingSafeBearer.ts` (Audit 8 H3 fix verified at every cron handler).

**Supabase pg_cron jobs** (`cron.job` query):
| jobid | schedule | command | active |
|---|---|---|---|
| 3 | `0 0 * * *` | reset-solo-credits (inline SQL, decrements `monthly_credits` for SOLO orgs) | true |
| 8 | `*/3 * * * *` | `SELECT public.trigger_rescue_stuck_leads();` (calls `pg_net.http_get` to `/api/cron/rescue-stuck-leads`) | true |

**Recent rescue-stuck-leads runs:** Last 20 (2026-05-09 17:03 → 18:00 UTC) all `succeeded`, return_message `"1 row"`, sub-100ms. Cadence holding.

---

## Notification dedup

- Index: `notifications_new_lead_dedup_idx` exists with shape `UNIQUE (org_id, screen_params->>'id') WHERE type='NEW_LEAD' AND screen_params->>'id' IS NOT NULL`.
- Historical duplicates (`COUNT(*)>1` GROUP BY org_id + screen_params->>'id'): 0.
- New `NEW_LEAD` inserts since the index deployed (2026-05-08 onwards): 0 (low traffic period — last NEW_LEAD was 2026-05-06 23:31 UTC, so the index hasn't been stress-tested by post-deploy traffic, but the index is correctly shaped).

---

## Quote send / view / accept flow — verified at HEAD

**Two-phase QuoteComposer ([`components/QuoteComposer.tsx`](components/QuoteComposer.tsx)):**
- Phase 1 (lines 376-385): PriceSlider on AI range, "Generate Estimate" button. Generate is a UI-only state flip.
- Phase 2 (lines 388-536): editable message + delivery toggles + Send / Copy / Edit. Inline customer-contact edit via PATCH `/api/app/leads/[id]/contact`.
- `isResend` prop (line 55, 72) skips Phase 1 for EXPIRED quotes.

**Delivery preferences:**
- Persisted on `contractor_profile.estimate_send_email` / `estimate_send_text` (lines 153-160).
- Both flags can't be off simultaneously (lines 176-185).

**Send path ([`app/api/app/quote/send/route.ts`](app/api/app/quote/send/route.ts)):**
- Two-path CAS:
  - Existing DRAFT or EXPIRED → UPDATE with `.eq("status", startingStatus)` (lines 131-153). Idempotent for double-clicks via the CAS losing-side branch (lines 157-188) which fetches the winner's row and returns its publicId.
  - No existing quote → fresh INSERT (lines 192-213) with `body.publicId ?? makePublicId()` (12 random bytes / 96 bits).
- Rollback (lines 374-412): DRAFT/EXPIRED revert preserves public_id (so any customer link already shared keeps working); fresh INSERT deletes the quote_events SENT row + the quote; reverts lead.status NEW with CAS on `.eq("status","QUOTED")`.
- Telnyx + Resend idempotency keys: `quote-send-${quoteId}-sms` / `quote-send-${quoteId}-email` (lines 34-39). Deterministic on quoteId — both providers dedupe at their end.
- After-block audit log (lines 343-362).

**View path ([`app/api/public/quote/[publicId]/viewed/route.ts`](app/api/public/quote/[publicId]/viewed/route.ts)):**
- Fast-path short-circuit if `viewed_at IS NOT NULL` (line 28). Saves a write on every repeat view.
- CAS update with `.is("viewed_at", null)` (line 48). Push notification + quote_events + in-app notification only fire for the CAS winner.
- Live: 21 quote_events VIEWED rows for 7 unique quotes ever opened.

**Accept path ([`app/api/public/quote/[publicId]/accept/route.ts`](app/api/public/quote/[publicId]/accept/route.ts)):**
- Self-accept rejection (lines 39-56): authenticated user who is a member of the quote's org gets 403. Anonymous customer flows through.
- Effective-status re-check via `computeEffectiveQuoteStatus` (lines 71-79): SENT/VIEWED past 7d gets lazily flipped to EXPIRED before deciding whether to accept.
- Lead `→ ACCEPTED` UPDATE (line 110): missing org_id filter (see M2). Acceptance itself is committed.
- `quote_events` ACCEPTED insert in try/catch swallows ALL errors (M3).
- Notifications: contractor SMS (`notification_accept_sms`), Expo push, in-app notification, OWNER email (`notification_accept_email`). All best-effort.

**Public quote page ([`app/(public)/q/[publicId]/page.tsx`](app/(public)/q/[publicId]/page.tsx)):**
- Three viewer states: anonymous customer, authenticated org-member (contractor preview, accept hidden), authenticated non-member (treated as anonymous).
- DRAFT quotes render with placeholder message "Your estimate is being prepared by ${businessName}." with far-future expiry.
- Per-read effective status calc (line 119) — SENT/VIEWED past 7d shows as EXPIRED on the page even before the cron runs.

---

## Stale Notion / docs entries flagged

The prior Audit 4 page (`[2026-05-08] Audit 4 (lead lifecycle): findings`, id `35a32498-a1cb-813d-ac59-fdf77b57fc9b`) and re-verification (`35a32498-a1cb-8143-b1a4-c4157f71109e`) remain accurate at HEAD for the items I re-verified. Audit 8 H1/H2/H3/H5 + H4/H6/H9/M5/M6/M7/M11/M12/L3 fixes have shipped between the prior audit and now; those are correctly logged in `docs/current-state.md` and `docs/updates-log.md`. No stale entries needed updating.

The Audit 4 to-dos page (id `35a32498-a1cb-817e-a12c-ee46934812bb`) entries PW-A4-1, PW-A4-2, PW-A4-3 (mobile fixes), PW-A4-5 (web LeadsRealtimeWatcher channel race) — out of audit scope, not re-verified at HEAD; these stand pending unless mobile-side audits update them.

PW-A4-11 (in-memory rate limiter) was CLOSED by Audit 8 H9 (Upstash Redis with in-memory fallback). Update on Pending Work: PW-A4-11 — DONE.

---

## Anything outside scope

- **Audit 8 cross-flag (M6 above):** PII scrubber (lib/sentryScrub.ts) doesn't redact org_id from error message bodies. 4 occurrences of `"permission denied for organization 8f939f96-..."` leaked to Sentry in the last 14d. Recommend extending the scrubber.
- **Audit 8 cross-flag (L2 above):** Custom Sentry tags (e.g. `area:lead-submit`) appear to be stripped or not surfacing in events search. Investigate scrubber's handling of `event.tags`.
- **Audit 11 cross-flag (H7 above):** 8 leads with `ai_status='ready'` but NULL estimate range. Recommend backfill migration.
- **Audit 11 cross-flag (M1 above):** `ai_estimator_notes` shape inconsistency (string vs array). Normalise rescue cron to write array.
- **Audit 12 cross-flag (M3 above):** quote_events ACCEPTED catch should narrow to 23505.
- **Audit 12 cross-flag (L1 above):** `DEP0169 url.parse()` warning ingested as Sentry error. Filter out or upgrade source dep.

---

## What's verified clean / unchanged at HEAD

- Turnstile server-side verification ([`app/api/public/lead-submit/route.ts:65-84`](app/api/public/lead-submit/route.ts:65)): correct.
- Customer dedup against `customers` by email then phone ([:213-243](app/api/public/lead-submit/route.ts:213)): correct, scoped to `org_id`.
- Solo plan 30-day inactivity gate ([:174-187](app/api/public/lead-submit/route.ts:174)): only fires for SOLO; TEAM/BUSINESS pass through.
- Photo upload begins on pick (PublicLeadForm.tsx:280-293), submit doesn't wait for in-flight (line 381-386).
- AI estimator runs out-of-band (Edge Function decoupled), no client loading spinner.
- Lead-photos `(lead_id, storage_path) UNIQUE` constraint (migration 0066) absorbs the dual-writer race.
- Quote `viewed_at IS NULL` CAS prevents double-firing the VIEWED push.
- `quote_events (quote_id, event_type) UNIQUE` index (migration 0027) absorbs duplicate ACCEPTED inserts.
- Self-accept rejection via `organization_members` lookup on `/accept` route.
- All cron handlers + run-estimator route use timing-safe bearer compare (Audit 8 H3 fix).
- `requireOrgFilter` helper applied at admin SELECTs in lead/unlock and quote/send (Audit 8 M5 fix).
- `getClientIp` over `x-real-ip` in lead-submit, lead-photo-upload, quote/send (Audit 8 M7 fix).

---

## Files touched by this audit

None. Read-only audit.
