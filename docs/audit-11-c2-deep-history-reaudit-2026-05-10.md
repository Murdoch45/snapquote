# Audit 11 C2 — deep history re-audit (read-only)

**Date:** 2026-05-10
**Source:** Claude Code
**Scope:** Read-only history deep-dive on Audit 11 finding C2 (rescue-cron Stage-1 give-up writes no fallback estimate). No code, schema, or data changed by this Part B work. Murdoch wanted to confirm this hasn't already been fixed before any fix is considered.

> **Per Part B exception in the task: Notion / docs are explicitly in scope as evidence to gather here, but every claim is also paired with a live citation (file:line at HEAD or Supabase MCP query). When Notion/docs and live state disagree, live wins.**

---

## Notion entries (verbatim, by date, every relevant entry)

Dated entries from the SnapQuote Notion workspace — quoted verbatim from search highlights and page reads. The Bugs & Fixes page (~310k chars) and Pending Work page exceed the 25k token MCP fetch limit for full reads; the entries below come from `notion-search` highlights for the relevant query terms (`rescue-stuck-leads`, `STUCK_NOTE`, `fallback estimator`, `give up`, `GIVE_UP_MINUTES`, `catch fallback`, `rescue cron`, `ai_status failed`).

**[2026-05-08, "Lead lifecycle pipeline (Audit 4 truths)"]**
> "lib/ai/estimate.ts's terminal paths (success / catch fallback / rescue-stuck give-up). If the estimator's terminal path doesn't fire (e.g. Vercel kills the function before catch..."

This entry treats the rescue-stuck give-up as a *separate* terminal path from the catch fallback — independent, not shared. Confirms the architectural separation that's the root of C2.

**[2026-05-08, "Audit 4 (lead lifecycle): findings"]**
> "On success: ai_status='ready' + ai_suggested_price + ranges │ - On AI fail: heuristic fallback writes ai_status='ready'..."

Confirms the *in-process* heuristic fallback writes `ready` — but this entry is only about `lib/ai/estimate.ts`, not the cron.

**[2026-05-08, "Audit 4 (lead lifecycle): re-verified at HEAD"]**
> "pg_cron: 2 active jobs — rescue-stuck-leads (*/3 * * * *), reset-solo-credits (0 0 * * *). No auto-archive."

Confirms cron is healthy in production.

**[Pending Work, last edited 2026-05-09]**
> "Change #2 alone (catch fallback) gives you the 'never $0' guarantee"

Critical: prior reasoning treats Change #2 (the in-process catch fallback in `lib/ai/estimate.ts:4768-4865`) as the source of the "never $0" guarantee. The rescue-cron Stage-1 give-up is NOT covered by that change. Pending Work has nine deferred AI-estimator items but **no entry mentioning rescue-cron-no-fallback**.

**[Architecture & Stack]**
> "rescue-stuck-leads every */3 * * * * — calls public.trigger_rescue_stuck_leads()"
> "catch_fallback. + Catch fallback triggered by: <message> — only on catch-block path; distinguishes..."

Architecture page explicitly distinguishes catch-block from rescue-cron, treating them as different code paths.

**[Bugs & Fixes, last edited 2026-05-09]**
> "pg_cron jobid=8 (rescue-stuck-leads, every 3 min)"

Bugs & Fixes mentions cron operationally; **no entry was found that claims a fix to the rescue-cron-no-fallback path.** Searched terms exhaustively: `STUCK_NOTE`, `rescue-stuck-leads`, `fallback estimator`, `give up`, `GIVE_UP_MINUTES`, `catch fallback`, `rescue cron`, `ai_status failed`. The only entries that touch this code path are descriptive ("here's what it does") not corrective ("here's the fix").

---

## docs/*.md entries (verbatim, by date)

**docs/audit-4-lead-lifecycle-2026-05-09.md:80-82**
> "2 most-recent failed leads (`25d8964d`, `718642d6`, both 2026-04-18/19) have a JSON STRING: `\"Estimator timed out before completing...\"` (this is `STUCK_NOTE` from `app/api/cron/rescue-stuck-leads/route.ts:34-35`). Older failed leads (`b8c773e4`, etc.) have a JSON ARRAY of audit-marker strings (this is from `lib/ai/estimate.ts` catch fallback / unsupported-request path)."
>
> "**Code at HEAD:** `app/api/cron/rescue-stuck-leads/route.ts:86` writes `ai_estimator_notes: STUCK_NOTE` where `STUCK_NOTE` is a JS string constant. `lib/ai/estimate.ts:4640, 4828, 4914` write arrays via `buildEstimatorFailureNotes` / `catchNotes`. Both shapes coexist."

This 2026-05-09 audit flagged the *shape* mismatch (M1) but did not yet flag the missing-fallback-estimate (later C2).

**docs/audit-11-ai-estimator-2026-05-09.md:142-148** (the originating C2 finding)
> "## C2 — Stuck-given-up leads have NO fallback estimate
> **Live source:** `app/api/cron/rescue-stuck-leads/route.ts:82-91`; Supabase live data.
> Stage 1 of the rescue cron flips long-stuck leads (`> 15 min` in `processing`) to `ai_status='failed'` and writes only the give-up note. It does NOT compute a fallback estimate. The 2 failed leads in the last 30 days both came from this branch (`25d8964d`, `718642d6`) and both have `ai_estimate_low IS NULL` / `ai_estimate_high IS NULL`.
> This contradicts the documented 'guaranteed catch-block fallback' promise. The catch-block fallback in `generateEstimateAsync` only fires when the in-process estimator throws — it does not fire when the rescue cron decides to give up. End result: a contractor sees a New Lead notification with no estimate at all."

**docs/audit-11-c2-h3-reaudit-2026-05-10.md:51** (the immediately-prior re-verification)
> "The catch-block fallback that exists in `lib/ai/estimate.ts:4768-4865` (`generateEstimateAsync`) only fires when the **in-process** estimator throws. It does not fire when the **rescue cron** decides to give up — those two code paths are independent."

**docs/audit-11-c2-h3-reaudit-2026-05-10.md:110**
> "This is **not** an existing Pending Work entry. Confirmed by searching Pending Work via Notion: nine deferred AI-estimator items exist there but none address rescue-cron-no-fallback. Net-new work."

**docs/current-state.md:22**
> "**C2 — Rescue-cron Stage-1 give-up writes no fallback estimate.** `app/api/cron/rescue-stuck-leads/route.ts:82-91` flips `ai_status` past 15 min without computing a price. Live: 2 affected leads in last 30d (`25d8964d`, `718642d6`) — both NULL estimates, contractor sees New Lead notification with no price."

**No prior docs entry attempts a fix for this** — only descriptions and the two audit findings (2026-05-09 + 2026-05-10).

---

## Git log — `app/api/cron/rescue-stuck-leads/route.ts`

Five commits ever touched this file. Each diff inspected via `git show <sha> -- app/api/cron/rescue-stuck-leads/route.ts`:

| SHA | Date | Message | Substantive change |
|---|---|---|---|
| `d5991c6` | 2026-04-18 | "AbortController timeout, stuck lead rescue cron, and deterministic job summary" | **File created.** 59-line single-stage cron: read leads stuck >5min, UPDATE `ai_status='failed'`, set `ai_estimator_notes = STUCK_NOTE` (string), call `sendNewLeadNotifications`. **No fallback estimate from day one.** |
| `db5b158` | 2026-04-18 | "Decouple estimator via Supabase Edge Function and add server Sentry" | Two-stage: 5-15 min retry via edge function, >15 min give-up. **Give-up path still writes no estimate.** Commit message line: "5–15 min stuck: re-trigger... >15 min stuck: flip to 'failed' and send the full notification chain". Fallback estimate not in scope. |
| `a11fb9c` | 2026-04-18 | "Move rescue-stuck-leads cron from Vercel to Supabase pg_cron" | Scheduler move only. Commit message: **"The rescue logic itself — the two-stage retry then give-up flow in app/api/cron/rescue-stuck-leads/route.ts — is unchanged; only the scheduler moves."** |
| `4346563` | 2026-05-04 | "fix: AI estimator timeout + failed lead visibility + retry cron" | Added Stage 3 (retry recently-failed leads, `MAX_AI_RETRIES=2`). Stage 1 give-up logic untouched. **No fallback estimate added to give-up.** |
| `63afe5c` | 2026-05-09 | "fix(auth): RS256-only JWT + iss validation + timing-safe cron bearer..." | Auth-only: replaced bearer-string-comparison with `isAuthorizedBearer`. Stage 1 logic unchanged. |

**No commit ever attempted to add a fallback-estimate computation to Stage 1.** Confirmed by inspecting the actual diffs of all five commits against this file.

(Today's branch `claude/audit-11-fixes-and-c2-deep-reaudit` adds H2's shape fix to Stage 1 — wraps `STUCK_NOTE` in a `[{phase, ts, message}]` array — but per Murdoch's deferral does NOT add the missing fallback estimate.)

---

## Git log — `lib/ai/estimate.ts` (fallback/rescue/give-up commits)

Searched with `git log --grep='fallback|rescue|give.up|stuck|NULL.estimate|STUCK|ai_status'` over `lib/ai/estimate.ts`. Most-relevant commits:

- **`51f7890` (2026-05-04) — "fix: remove outer estimator timeout, guarantee catch-block fallback, property data timeout, pipeline audit markers".**
  Commit message excerpt: *"Added a guaranteed catch-block fallback in generateEstimateAsync. Hoisted estimateInput, leadOrgId, leadAddressFull from inside the try... If anything inside the try throws, the catch attempts the deterministic engine directly with buildDegradedPropertyData... Polish is skipped on the catch path. Writes ai_status='ready' with the resulting price... After this commit 'AI estimate unavailable' is structurally impossible except in the corner case where Vercel hard-kills the function at 60s before the catch can finish — **in which case the rescue cron retries within 3 minutes per the prior commit's failed-retry stage.**"*
  This commit ADDED the in-process catch-block fallback at `lib/ai/estimate.ts:4768-4865` but explicitly only handles in-process throws; the rescue cron's own give-up branch was not touched. The commit message implicitly assumes Stage 3 (failed-retry) will eventually re-trigger the estimator and that the estimator's catch-block fallback will then fire — but that chain breaks if the rescue cron gives up at Stage 1 BEFORE the lead has had any opportunity to enter the catch-block path with a successful retry.

- **`8478173` (2026-05-04) — "perf: drop customer photo detail to low for AI estimator latency".**
  Latency only. No fallback semantics.

- **`4346563` (2026-05-04) — added Stage 3 retry.** Touched `estimate.ts` for `org_id` filter on failure-path UPDATE only.

- **`db5b158` (2026-04-18) — added contractor-email send to `sendNewLeadNotifications`** so it fires from "success path AND failure catch-block AND rescue-cron give-up path"; **fallback price NOT added to cron path here**.

**No commit ever exported a shared "give up and write fallback" helper from `lib/ai/estimate.ts` for the cron to consume.** `fallbackEstimate(...)` is exported (`lib/ai/estimate.ts:3912`) but the rescue cron does not import it.

---

## Code map — rescue cron at HEAD

`app/api/cron/rescue-stuck-leads/route.ts` — single `GET` handler, ~220 lines:

- **Constants:** `STUCK_THRESHOLD_MINUTES=5`, `GIVE_UP_MINUTES=15`, `FAILED_RETRY_WINDOW_HOURS=6`, `MAX_AI_RETRIES=2`, `STUCK_NOTE` (string constant).
- **Auth:** `isAuthorizedBearer(...)` (timing-safe).
- **Stage 1 — give-up (lines 82-112):**
  - `UPDATE leads SET ai_status='failed', ai_estimator_notes=<note> WHERE ai_status='processing' AND submitted_at < giveUpCutoff RETURNING id,org_id,address_full`. **Single UPDATE statement.** Writes `ai_status` and `ai_estimator_notes` only. **No `ai_estimate_low`, `ai_estimate_high`, `ai_suggested_price`, `ai_service_estimates`, `ai_cost_breakdown`, `ai_pricing_drivers`, `ai_job_summary`, etc. are written.** (Today's branch updates the note's shape but does not add estimate columns.)
  - For each row: `await sendNewLeadNotifications(admin, {leadId, orgId, addressFull})`.
- **Stage 2 — processing-retry (lines 116-144):**
  - `SELECT id WHERE ai_status='processing' AND submitted_at < retryCutoff AND submitted_at >= giveUpCutoff`.
  - For each row: `await triggerEstimatorForLead(lead.id)`. Row stays `processing`. Trigger fires the edge function which calls `generateEstimateAsync`, whose terminal write either lands `ai_status='ready'` (with estimate) or `ai_status='failed'` (with array notes from `buildEstimatorFailureNotes`).
- **Stage 3 — failed-retry (lines 146-213):**
  - `SELECT id,org_id,ai_retry_count WHERE ai_status='failed' AND ai_retry_count<MAX_AI_RETRIES AND submitted_at >= failedRetryWindowStart`.
  - For each: per-row CAS `UPDATE...SET ai_status='processing', ai_retry_count=currentCount+1 ...`, then `triggerEstimatorForLead(...)`. **Status flips from `failed` to `processing` without writing an estimate** — but this is correct: the estimator is being re-triggered.

**Every place where `ai_status` is written without `ai_estimate_low/high`:**
1. **Stage 1 give-up (lines 82-87): writes `ai_status='failed'` directly. C2 root cause.** No estimate columns written.
2. Stage 3 CAS update (lines 176-186): writes `ai_status='processing'` (not terminal — re-triggers estimator). Acceptable.

The cron does NOT call `fallbackEstimate`, does NOT call `inferSignalsFallback`, does NOT call `buildDegradedPropertyData`. It does NOT load `lead_photos` or `contractor_profile`. There is no shared helper imported from `lib/ai/estimate.ts` that would compute and persist a heuristic price from cron context.

---

## Code map — catch-block fallback at HEAD

`lib/ai/estimate.ts:4567-4933` (`generateEstimateAsync`):

**Try block (4578-4758):** loads lead + contractor + photos, builds `estimateInput` (hoisted at function scope: lines 4574-4576 — `let estimateInput`, `let leadOrgId`, `let leadAddressFull`), checks unsupported request, computes travel distance, calls `generateEstimate(estimateInput)`, writes the full success UPDATE with `ai_status='ready'` + all 19 AI columns, invalidates analytics, fires notifications.

**Catch block (4759-4932):**
- **Catch-block fallback (4763-4865):** `if (estimateInput && leadOrgId)` — only fires if the pipeline got far enough to build `estimateInput`. Builds `degradedPropertyData` via `buildDegradedPropertyData(...)`, calls `fallbackEstimate(estimateInput, degradedPropertyData, attachAiExtractionTrace(inferSignalsFallback(...), catchTrace, aiModeForCatch))`, writes a **full UPDATE with all 19 AI columns** including `ai_estimate_low`, `ai_estimate_high`, `ai_suggested_price`. Sets `ai_status='ready'`. Adds 4 markers including `"Estimator origin: catch_fallback."`. Captures original error to Sentry tagged `stage='catch-fallback-recovered'`. **Writes `ai_estimate_low/high` from the heuristic engine.**
- **Last-resort failure write (4867-4923):** reached only if `estimateInput`/`leadOrgId` weren't set (lead row load failed) or the catch fallback itself threw. Writes `ai_status='failed'` with `failureNotes` (an array via `buildEstimatorFailureNotes`). Sentry tagged `stage='catch-fallback-unreachable'`. **Does NOT write `ai_estimate_low/high`** — but in this branch the input data needed to even *attempt* a fallback is missing.

**Conditions that fire the catch fallback:** ANY throw inside the try block AFTER `estimateInput` and `leadOrgId` are populated.

---

## Mapping between the two paths

**Are they connected?**
- Stage 2 of the rescue cron calls `triggerEstimatorForLead(leadId)` (`route.ts:134`) which POSTs to the Supabase Edge Function `run-estimator`, which POSTs to `/api/internal/run-estimator` (`triggerEstimator.ts:30-44`), which calls `generateEstimateAsync(leadId)`. So Stage 2 **does inherit** the in-process catch-block fallback because the entire `generateEstimateAsync` runs on a fresh Vercel invocation with full 60s budget.
- Stage 3 (failed-retry) similarly re-triggers via `triggerEstimatorForLead`, so it also inherits the catch-block fallback.
- **Stage 1 (give-up) does NOT call `triggerEstimatorForLead`. It does its own UPDATE inline at `route.ts:82-91` and never invokes the estimator pipeline.** The catch-block fallback is unreachable from this path.

**Shared helper for "give up and write fallback"?** None. The catch-block fallback's body is inlined inside `generateEstimateAsync`'s catch — not extracted into a reusable function. The cron has no equivalent. `fallbackEstimate(...)` is exported (`lib/ai/estimate.ts:3912`), as is `inferSignalsFallback(...)` and `buildDegradedPropertyData(...)` (from `lib/property-data.ts`), but the cron doesn't import any of them.

**Is the main estimator's catch block ever invoked from a cron context?** Yes — indirectly via Stage 2 / Stage 3 → `triggerEstimatorForLead` → edge function → `/api/internal/run-estimator` → `generateEstimateAsync`. But Stage 1 give-up bypasses this entirely.

---

## Live analysis of the 2 (now 7) NULL leads

Supabase MCP query (project `upqvbdldoyiqqshxquxa`):

```sql
SELECT id, ai_status, ai_estimate_low, ai_estimate_high,
       jsonb_typeof(ai_estimator_notes) AS shape, ai_estimator_notes,
       services
  FROM leads
 WHERE ai_status='failed' AND ai_estimate_low IS NULL
 ORDER BY submitted_at DESC;
```

Original report cited 2 rows. A wider re-query today returned **7 rows** with `jsonb_typeof = 'string'`, all with the byte-identical `STUCK_NOTE` constant from `app/api/cron/rescue-stuck-leads/route.ts:34-35`. (Today's H2 backfill migration converted them to single-element arrays, but they're still `ai_status='failed'` with NULL estimates — H2 fixed the shape, not the missing fallback.) Examples (id / submitted_at / org name):

- `399ebb27-375e-4c64-91ff-35351a85904b`
- `25d8964d-718a-4743-ac64-0f01cb046e5c` — 2026-04-19 — falconn
- `718642d6-9f9b-4b64-b71e-a80b7412a69d` — 2026-04-18 — falconn
- `2aa738db-c38d-49c5-bb53-77f8616bb098`
- `23bd4dd5-3ae9-4cbd-b339-730905c796ae`
- `d83ef396-6e8d-4600-bde6-b160a20b98b7`
- `891b9d7b-8f64-4906-8e75-4009a52c9896`

All:
- `ai_generated_at IS NULL`.
- `ai_retry_count = 0` (never retried — most pre-date the `ai_retry_count` column shipping in migration `0065` on 2026-05-04 + the Stage-3 retry logic in commit `4346563`).
- `ai_estimator_notes` was the literal `STUCK_NOTE` string (matches `app/api/cron/rescue-stuck-leads/route.ts:34-35` byte-for-byte; today's H2 migration wrapped these into single-element arrays).
- `jsonb_typeof = 'string'` pre-migration — only the rescue-cron Stage-1 give-up writes a string into this jsonb column; every other writer uses an array. Live re-query post-migration: 0 rows of type 'string', all 'array'.

**Pipeline reconstruction:** Each lead was submitted before the catch-block fallback shipped on 2026-05-04 (`51f7890`). At submit time, the architecture was: `lead-submit/route.ts` triggered `generateEstimateAsync` via the edge function (added 2026-04-18 in `db5b158`), and the rescue cron's two-stage retry/give-up was already live (also from `db5b158`). The estimator was hitting the 40s outer timeout (Sentry SNAPQUOTE-WEB-4, cited in commit `4346563`'s message). Their pipelines exceeded `GIVE_UP_MINUTES=15`, the rescue cron's Stage-1 UPDATE flipped them to `failed` with `STUCK_NOTE`, and `sendNewLeadNotifications` fired.

**These rows are unambiguous evidence of the C2 bug.** They are NOT manual edits, NOT race conditions, NOT broken FKs, NOT some unrelated code path. The `ai_estimator_notes` value is byte-identical to the `STUCK_NOTE` constant; the shape was a JSONB string (the cron is the only writer that produced this shape pre-fix); the timestamps fall after `db5b158` shipped (Apr 18) and before `51f7890`'s catch-block fallback shipped (May 4).

**Why they're still NULL today:** They were submitted before the `ai_retry_count` column existed (migration `0065`, May 4) and before Stage-3 failed-retry logic shipped (also May 4). Their `submitted_at` is now well past the `FAILED_RETRY_WINDOW_HOURS=6` window, so even if Stage 3 existed when they failed, they'd no longer be eligible for retry.

---

## Final conclusion: **A — Bug exists, never previously fixed.**

Evidence summary:

1. **Code at HEAD confirms it.** `app/api/cron/rescue-stuck-leads/route.ts:82-91` writes `ai_status='failed'` + `ai_estimator_notes=<note>` only — no estimate columns. The catch-block fallback at `lib/ai/estimate.ts:4768-4865` is in-process only and unreachable from the cron's Stage 1 path. Verified by reading both files top to bottom.
2. **All 5 commits to this file inspected.** Every diff is consistent with the current bug's presence. The original commit (`d5991c6`, 2026-04-18) introduced the give-up UPDATE without an estimate. The decouple commit (`db5b158`, 2026-04-18) added Stage 2 retry but didn't change Stage 1. The pg_cron-move commit (`a11fb9c`, 2026-04-18) explicitly says *"The rescue logic itself... is unchanged."* The retry-cron commit (`4346563`, 2026-05-04) added Stage 3 but didn't touch Stage 1's give-up. The auth commit (`63afe5c`, 2026-05-09) only changed the bearer compare. **No commit ever attempted to add fallback-estimate computation to Stage 1.**
3. **The catch-block fallback (`51f7890`, 2026-05-04) was scoped explicitly to in-process throws.** Its commit message implicitly defers the cron-give-up case: *"in which case the rescue cron retries within 3 minutes per the prior commit's failed-retry stage"* — i.e. relies on Stage 3 retry, but Stage 3 only handles `failed` rows that DID enter via `generateEstimateAsync`'s normal failure-write path; Stage 1 give-up rows are eligible for Stage 3 retry but if those retries also exhaust (`ai_retry_count >= 2`), or if the lead is older than `FAILED_RETRY_WINDOW_HOURS=6`, no fallback estimate is ever written.
4. **No Notion / docs entry records a fix attempt.** Every entry that mentions this code path is descriptive ("here's what give-up does") or audit-flagging ("this is broken"). No "RESOLVED" entry, no Bugs & Fixes entry that touches Stage 1's UPDATE shape with an estimate.
5. **The 7 NULL leads are exactly as the bug predicts.** Byte-identical `STUCK_NOTE` string in `ai_estimator_notes`; `org_id` for the most-recent two = `8f939f96` (Murdoch's falconn test org); all submitted in the window when the rescue cron existed but the catch-block fallback did not (Apr 18-19, before May 4). They are not artifacts of any other code path.
6. **Notion / docs and live state agree.** Both treat catch-block and rescue-cron-give-up as independent paths; live code at HEAD confirms.

**Recommendation context (from prior 2026-05-10 audit):** the fix path is to replicate the catch-block pattern inside Stage 1: load lead+contractor+photos, build `EstimateInput`, call `fallbackEstimate(...)` with `buildDegradedPropertyData(...)`, write `ai_status='ready'` with a `"Estimator origin: rescue_cron_fallback"` marker. Feasible inside the 60s cron budget (typical Stage 1 batch is 0-2 leads; worst-case 30-lead batch × ~300ms = 9s). Net-new ticket; not in Pending Work. Murdoch's instinct that this *might* have been investigated is correct — it has been *audited* twice (2026-05-09 + 2026-05-10) — but it has never been *fixed*.

---

## Source citations index

- `app/api/cron/rescue-stuck-leads/route.ts:8,32-35,51-54,82-91,116-220` (HEAD as of 2026-05-10 includes today's H2 shape fix; C2 fallback gap unchanged)
- `lib/ai/estimate.ts:381,1885,1889,3331-3511,3719-3795,4348-4417,4567-4933` (catch-block fallback, signal/polish call)
- `lib/ai/triggerEstimator.ts:1-62`
- `app/api/internal/run-estimator/route.ts:1-58`
- Supabase MCP project `upqvbdldoyiqqshxquxa`: pre-migration `jsonb_typeof = 'string'` count = 7; post-migration count = 0
- Git: `d5991c6`, `db5b158`, `a11fb9c`, `4346563`, `63afe5c` (rescue cron commits); `51f7890` (catch-block fallback shipped)
- Notion: Bugs & Fixes (35432498-a1cb-8132-a2c5-f2f5505b6d90), Pending Work (35432498-a1cb-8154-8fbe-e691c798b0f9), Architecture & Stack (35432498-a1cb-81a7-8cde-f5d93878042b), Lead lifecycle pipeline 2026-05-08 (35a32498-a1cb-8118-bd4a-eb1fb24efa7b), Audit 4 findings 2026-05-08 (35a32498-a1cb-813d-ac59-fdf77b57fc9b), Audit 4 re-verified 2026-05-08 (35a32498-a1cb-8143-b1a4-c4157f71109e)
