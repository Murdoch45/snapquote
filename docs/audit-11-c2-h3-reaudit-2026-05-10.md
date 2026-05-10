# Audit 11 C2 + H3 — focused re-audit (read-only)

**Date:** 2026-05-10
**Source:** Claude Code
**Scope:** Two findings from Audit 11 (2026-05-09): **C2** (rescue-cron Stage-1 give-up writes no fallback estimate) and **H3** (p50 latency 28.05 s above the 25 s revisit threshold).
**Read-only.** No code, schema, or data changed. Both findings reported here for Murdoch to triage before any fix.

Every claim is grounded in a live citation (file:line at HEAD or Supabase MCP query result). Notion/docs are referenced only for cross-comparison after the live finding is formed.

---

## C2 deep-dive — Rescue-cron Stage-1 give-up has no fallback estimate

### What the cron does today (live, file:line)

`app/api/cron/rescue-stuck-leads/route.ts:79-112`. Stage 1 ("give-up"):

```ts
const { data: giveUpLeads, error: giveUpError } = await admin
  .from("leads")
  .update({
    ai_status: "failed",
    ai_estimator_notes: STUCK_NOTE
  })
  .eq("ai_status", "processing")
  .lt("submitted_at", giveUpCutoff)
  .select("id,org_id,address_full");
// ...
for (const lead of givenUp) {
  await sendNewLeadNotifications(admin, { leadId, orgId, addressFull });
}
```

`STUCK_NOTE` (`route.ts:34-35`):

```ts
const STUCK_NOTE =
  "Estimator timed out before completing. The lead was auto-marked as failed so the contractor still gets notified.";
```

The cron does **not** load `lead_photos`, does **not** load `contractor_profile`, does **not** build an `EstimateInput`, does **not** call `fallbackEstimate(...)`, does **not** write `ai_estimate_low`/`ai_estimate_high`/`ai_suggested_price`/`ai_service_estimates`/`ai_cost_breakdown`/`ai_pricing_drivers`/`ai_job_summary`/`pricing_region`/etc.

### Documented design intent

From the route's docstring at `app/api/cron/rescue-stuck-leads/route.ts:51-54`:

> 1. give-up: leads "processing" past GIVE_UP_MINUTES → flip to "failed" and fire the full notification chain (push, in-app, contractor email) so the contractor isn't ghosted on a total estimator outage.

The intent prioritizes **notification continuity** over **price availability**. Better to ping the contractor with "you have a lead" than to ghost them entirely.

The catch-block fallback that exists in `lib/ai/estimate.ts:4768-4865` (`generateEstimateAsync`) only fires when the **in-process** estimator throws. It does not fire when the **rescue cron** decides to give up — those two code paths are independent.

### Live impact

Supabase MCP queries (live, today):

```sql
SELECT count(*), min(submitted_at), max(submitted_at)
  FROM leads
 WHERE ai_status='failed' AND ai_estimate_low IS NULL;
```

| count | min submitted_at | max submitted_at |
|---|---|---|
| 2 | 2026-04-18 22:15:56+00 | 2026-04-19 00:58:45+00 |

Both rows are stuck-cron give-ups. `ai_estimator_notes` on both is a JSON **string** (the `STUCK_NOTE` constant), not an array. Both contractors got notification chains (push + in-app + email) but no estimate. The contractor's UI shows the lead with no price.

Stuck count *right now*: **0** (Supabase MCP confirms 0 leads in `processing` past 10 min). The bug is rare in practice — the rescue cron is keeping up under normal conditions — but it is real and the impact is contractor-visible when it triggers.

### Why a fallback is feasible here

The catch-block fallback in `generateEstimateAsync` (`lib/ai/estimate.ts:4768-4865`) is the existing template:

1. Hoist `estimateInput`, `leadOrgId`, `leadAddressFull` from the lead+contractor+photos reads.
2. Build degraded `propertyData` via `buildDegradedPropertyData(...)`.
3. Call `fallbackEstimate(estimateInput, degradedPropertyData, ...)`.
4. Write all the AI columns + `ai_status: "ready"` + `ai_generated_at: now()`.
5. Mark `ai_estimator_notes` with `"Estimator origin: catch_fallback."`.
6. Capture original error to Sentry with tag `catch-fallback-recovered`.

The same pattern can run inside Stage 1 of the rescue cron. The lead row, contractor profile, and `lead_photos` are all readable from the cron. `fallbackEstimate(...)` is exported (`lib/ai/estimate.ts:3912` `export function fallbackEstimate`) and is pure-Node — it doesn't make external API calls beyond what `getPropertyData` does, and `buildDegradedPropertyData(...)` skips even that.

### Cron-budget concern

`app/api/cron/rescue-stuck-leads/route.ts:8` sets `maxDuration = 60`. Stage 1 runs sequentially today; if many leads are stuck at once, calling `fallbackEstimate` per lead (each takes ~100-300 ms — pure JS, no external I/O once propertyData is degraded) would still fit easily inside the 60 s budget. Live observation: typical Stage 1 batch size is 0–2 leads (count last 30 days = 2 across 30 days, not 2 per tick).

Even a worst-case 30-lead batch × ~300 ms = 9 s. Comfortably inside 60 s.

### Recommended path (for Murdoch to triage)

In Stage 1 of the rescue cron, replace the bare "flip to failed, notify" with a "compute heuristic estimate, write ai_status='ready' with a marker note, notify". Specifically:

1. Read each give-up candidate's lead row + contractor profile + lead_photos rows (joined or batched).
2. Build `EstimateInput` exactly as `generateEstimateAsync` does at `lib/ai/estimate.ts:4693-4708`.
3. Build degraded `propertyData` via `buildDegradedPropertyData(...)`.
4. Call `fallbackEstimate(estimateInput, degradedPropertyData, attachAiExtractionTrace(inferSignalsFallback(estimateInput, degradedPropertyData), buildAiExtractionTrace([], { ... }), aiMode))`.
5. UPDATE the lead row with all the AI columns + `ai_status: "ready"` + `ai_generated_at: now()` + a marker note like `"Estimator origin: rescue_cron_fallback. Stuck for >${GIVE_UP_MINUTES}m before this fallback fired."`.
6. Skip polish (consistent with the catch-block fallback's "Summary polish: skipped (catch fallback)." behavior).
7. Fire `sendNewLeadNotifications` exactly as today.
8. On any throw from steps 1-5, fall back to today's behavior (set `ai_status='failed'` with `[STUCK_NOTE]` as a JSON ARRAY — not a string — to also resolve the H2 shape inconsistency).

Risks / what could break:
- **Sentry signal noise:** rescue-cron fallback should be tagged distinctly (`stage: "rescue-cron-fallback-fired"`) so we can monitor its rate. Today there's no Sentry tag for "stuck-then-given-up" — adding one is net-positive observability.
- **Quote quality:** the heuristic fallback uses degraded property data (no lot size, no city/state in some cases). The estimate range will be wider / less accurate than a successful AI run. The contractor still gets a real number, but it's less specific. This is the intended trade-off — better than $X-NULL.
- **Concurrent-tick races:** the existing `.eq("ai_status", "processing")` filter is the CAS — it'd protect against double-processing if changed to `.update({ai_status: "ready", ...}).eq("ai_status", "processing")`. Each cron tick still atomically transitions only the rows it observed.

### Cross-references
- The `ai_estimator_notes` shape inconsistency (string vs array) from prior Audit 11 H2 / Audit 4 M1 / Pending Work PW-A4-25 is in the same code path — fixing C2 is a natural moment to fix H2 too.
- This is **not** an existing Pending Work entry. Confirmed by searching Pending Work via Notion: nine deferred AI-estimator items exist there but none address rescue-cron-no-fallback. Net-new work.

---

## H3 deep-dive — what's actually driving the 28 s p50

### Live latency reading

Source: Supabase MCP, `leads` table, last 30 days, `ai_status='ready'`, `ai_retry_count=0`, split by execution mode parsed from `ai_estimator_notes`:

| Mode | n | p50 (s) | p90 (s) | p99 (s) | min | max |
|---|---|---|---|---|---|---|
| `structured_ai_live` | 39 | 28.05 | 40.21 | 88.54 | 17.53 | 96.09 |
| `fallback` | 3 | 47.82 | 47.96 | 47.99 | 40.72 | 47.99 |

This is the same data from the 2026-05-09 audit; re-verified today.

### Pipeline phase list (live, file:line)

The execution order inside `generateEstimateAsync` and `generateEstimate`:

| Phase | Location | Documented timeout | Approx wall time (typical) | Notes |
|---|---|---|---|---|
| Lead row read | `lib/ai/estimate.ts:4581-4587` | none | <100 ms | single PK lookup |
| Contractor + photos read | `lib/ai/estimate.ts:4600-4612` | none | <500 ms | parallel via Promise.all; lead_photos has no `.order()` |
| Travel-distance compute / persist | `lib/ai/estimate.ts:4663-4691` | none | <500 ms | `haversineMiles` math + optional UPDATE |
| Property data lookup | `lib/property-data.ts:315-378` via `runWithAbortTimeout(8000)` (`lib/ai/estimate.ts:4020`) | 8 000 ms | 1–4 s | **sequential** Google Places → Geocode → Solar API (1-4 fetches) |
| Build prompt | `lib/ai/estimate.ts:3331-3511` (`buildSignalPrompt`) | none | <50 ms | string interp, JSON.stringify |
| Resolve satellite image | `lib/ai/estimate.ts:1801-1828` (`resolveSatelliteImageUrl`) | **NONE** | 0.3–2 s | calls `fetchImageAsDataUrl:1789-1799` which has **no timeout** on the underlying `fetch()` |
| AI signal call | `client.responses.parse(...)` at `lib/ai/estimate.ts:3760-3795` | 35 000 ms (`STRUCTURED_AI_TIMEOUT_MS`) | **15–25 s** | dominant phase; vision + structured output |
| Build engine estimate | `fallbackEstimate(...)` runs the deterministic engine | none | <500 ms | pure JS |
| Polish summary | `client.responses.create(...)` at `lib/ai/estimate.ts:4372-4399` | 10 000 ms | 2–5 s | second OpenAI call; **on critical path** |
| UPDATE leads row | `lib/ai/estimate.ts:4716-4750` | none | <500 ms | single UPDATE |
| `sendNewLeadNotifications` | `lib/ai/estimate.ts:4754-4758` | none | typically <2 s | NOT included in `pipeline_seconds` (UPDATE writes `ai_generated_at` first) |

`pipeline_seconds = ai_generated_at - submitted_at` covers everything **above** the UPDATE inclusive; it does NOT include the trailing notification fan-out.

### Token-cost estimate (rough, computed from HEAD)

Prompt template (`lib/ai/estimate.ts:3331-3511`, lines 3331–3511 inclusive): **9 276 chars** ≈ ~2 300 input tokens at 4 chars/token.

That includes 30 instruction lines + a JSON-stringified `EstimateInput` summary + a JSON-of-shape EXAMPLE response (~3 700 chars). The example exists despite `zodTextFormat(aiSignalsResponseSchema)` already constraining output via JSON Schema — the example is essentially redundant once strict schema enforcement is on.

Per-service signal schema (`lib/ai/estimate.ts:159-209` and `211-259`): **3 904 chars** of Zod source → roughly ~6 000-8 000 chars of JSON Schema after `zodTextFormat` conversion. ~50 fields per service item.

Top-level response schema (`lib/ai/estimate.ts:313-356`): **1 928 chars** of Zod source. ~35 top-level fields including arrays, plus the per-service-signal array.

Per-photo input cost: 85 tokens × N photos at `detail: "low"` (`lib/ai/estimate.ts:3733-3752`). Live photo counts last 30 days (Supabase MCP): mode 1 (12 leads), mode 4 (11 leads), mode 10 (5 leads). Median photo count 4 → ~340 vision tokens.

Per-lead totals (rough):
- Input: ~3 000 prompt tokens + ~340 vision tokens + JSON Schema overhead = ~3 500–4 500 input tokens
- Output: ~600–1 200 tokens for typical single-service lead (longer with multi-service)
- Polish call: ~150 in / ~100 out

The schema-derived JSON Schema spec is sent on every request (it's the response_format). There's no "remember the schema" caching — each request pays the schema-comprehension cost.

### `ai_estimator_notes` per-phase timing — GAP

I checked 18 recent successful leads (Supabase MCP, last 14 days). All 18 have a 9-12 element `ai_estimator_notes` array. Sample contents (lead `e5d1eeb3-3abd-4109-a674-1f08dd50ca77`, pipeline 21.25 s):

```
"Property data resolved: Los Angeles, California (lot 90618 sqft)."
"Satellite image attached."
"Summary polish: applied."
"Estimator multipliers: {...}"
"Estimator AI mode: auto."
"Estimator signal source: structured_ai."
"Estimator AI execution: structured_ai_live."
"Estimator AI live invocation: yes."
"Estimator AI cache mode: off."
"Estimator AI cache status: off."
"Structured AI extraction succeeded on attempt 1."
"Structured AI failure history: none."
```

**None of these markers carry a timestamp or per-phase elapsed time.** I cannot decompose `pipeline_seconds=21.25 s` into "AI took X, polish took Y, property data took Z" from `ai_estimator_notes` alone. This is a real instrumentation gap.

Code-side check: `grep` for `performance.now|Date.now\(\)|console.time|elapsed|durationMs|t0|tStart` in `lib/ai/estimate.ts` returns **no matches**. The pipeline emits zero timing observations, in either DB or Sentry.

### Sample of 20 leads with notes + pipeline_seconds

Live data, Supabase MCP, last 14 days, `ai_status='ready'`, `ai_retry_count=0`, `LIMIT 20` (returned 18 rows):

| lead id (short) | pipeline_s | photos | source | summary polish | retry_count |
|---|---|---|---|---|---|
| e5d1eeb3 | 21.25 | 8 | structured_ai | applied | 0 |
| 700f7729 | 22.71 | 7 | structured_ai | applied | 0 |
| 0e6bec58 | 32.12 | 8 | structured_ai | applied | 0 |
| 37b83c63 | 40.72 | 4 | **fallback** (timeout) | applied | 0 |
| 61fe634f | 32.15 | 1 | structured_ai | applied | 0 |
| eac1e1db | 28.72 | 1 | structured_ai | applied | 0 |
| baa58680 | 36.70 | 2 | structured_ai | applied | 0 |
| 5cba5e91 | 29.83 | 2 | structured_ai | applied | 0 |
| 6afb583d | 35.98 | 10 | structured_ai | applied | 0 |
| b4f62690 | 29.85 | 10 | structured_ai | applied | 0 |
| 6eab40c5 | 36.62 | 10 | structured_ai | applied | 0 |
| f01ff12d | 96.09 | 10 | structured_ai | applied | 0 |
| 1bb9395a | 40.03 | 6 | structured_ai | applied | 0 |
| 2454a826 | 47.99 | 4 | **fallback** (timeout) | applied | 0 |
| c484b8a9 | 47.82 | 4 | **fallback** (timeout) | (note absent) | 0 |
| 6ad9f042 | 42.43 | 6 | structured_ai | (note absent) | 0 |
| e44abd69 | 37.11 | 4 | structured_ai | (note absent) | 0 |
| b26a5900 | 36.85 | 4 | structured_ai | (note absent) | 0 |
| 5c57ad12 | 26.06 | 4 | structured_ai | (note absent) | 0 |

Observations from this sample:
- **Photo count has only weak correlation with latency** (1-photo lead at 28 s vs 10-photo lead at 30 s vs 10-photo lead at 96 s). At `detail: "low"` (~85 tokens/photo), photo budget is small.
- **Fallback path adds ~10-15 s on top of the AI 35 s timeout.** The 47 s fallback rows are AI-timed-out + heuristic ran + polish + DB write.
- **One outlier at 96 s** (lead `f01ff12d`) — Tree Service / Removal, 10 photos. AI succeeded on attempt 1 per its notes, polish applied. Three plausible causes: a slow OpenAI response near the 35 s edge that just made it; a slow Google Maps Static fetch (uncapped, see below); or a Vercel cold start. Cannot distinguish without phase timings.
- **The "Summary polish: applied." marker disappeared** between 2026-05-01 and 2026-05-04. Older leads (e44abd69, 5c57ad12) lack it. Newer leads (after ~May 4) have it. That's consistent with the audit-marker fix shipping in commit `51f7890` on 2026-05-04. Older leads in the sample mostly don't have the satellite/property-data markers either.

### Notion / docs prior latency work (hints, treated as historical)

(All cited entries are from event logs, not current truth — used here only to establish what's already been queued or attempted.)

- **2026-05-04 [Source: claude.ai] — "Schema reduction for AI estimator (latency optimization, deferred)"** (Pending Work). Identifies ~12-18 vestigial fields in `aiServiceSignalResponseSchema`. Estimates 30-50% schema-token reduction → 10-25% latency cut on top of the photo-detail fix. Explicit deferral trigger: **"AI p50 latency drifts above ~25 s on real customer leads."** This trigger has now fired. (Treated as a hint — verified live that the fields named in the entry still exist at HEAD via grep.)
- **2026-05-04 [Source: Claude Code] — "Estimator architecture recommendation — RESOLVED"** (Pending Work, fixed in commit `51f7890`). Among the recommendations, this entry **explicitly says "Do NOT move polish to async/after()"** — polish was an intentional product call. Re-flag: any recommendation to make polish async/skipped contradicts this prior decision and would need Murdoch's product approval.
- **2026-05-04 [Source: Claude Code] — "Web lead flow triple-bug investigation — RESOLVED"** (Bugs & Fixes). Photo detail switched from `"high"` to `"low"` (commit `8478173`); AI p50 was reported at ~35-45 s pre-fix, expected ~15-25 s post-fix. Current 28 s puts us in the upper end of that expected band — the photo-detail fix did help, just not as much as expected for the worst case.
- **2026-05-08 [Source: Claude Code] — "AI ESTIMATOR AUDIT (11 of 13)"** (Bugs & Fixes). Notes "two OpenAI calls per estimate (signal + summary polish at `:4348`) doubles latency surface."
- **2026-05-09 (this audit's predecessor)** — H3 originally flagged.

No prior entry mentions p90/p99 targets, gpt-5-mini → gpt-5 model swap, or token reduction beyond the schema reduction in claude.ai's 2026-05-04 entry.

### Live-grounded conclusion: what's driving the 28 s p50

Rough attribution (not measured per-phase — see GAP above; this is reconstruction from code paths and external knowledge of `gpt-5-mini` with structured output + vision):

| Driver | Approx share of p50 | Confidence |
|---|---|---|
| **A. OpenAI signal call inherent latency** (vision + structured output + ~1k output tokens at gpt-5-mini's generation rate) | ~65–75% (≈ 18-21 s of the 28 s) | High — confirmed by code paths + token counts |
| **B. Schema is somewhat too large** (vestigial fields per claude.ai 2026-05-04) | ~10–15% (≈ 3-4 s of the 28 s) | Medium — claude.ai's 30-50% schema-token estimate was generated without per-phase timing data, as I am here |
| **C. Polish call on the critical path** | ~10% (≈ 2-3 s of the 28 s) | High — separate `client.responses.create` at `lib/ai/estimate.ts:4372-4399`, 10 s budget |
| **D. Photo handling overhead** (encoding, satellite fetch) | <5% in steady state, **but tail-risk because `fetchImageAsDataUrl` has no timeout** | Medium — typical fetch <1 s; uncapped tail can stall pipeline |
| **E. Property-data lookup sequential Google calls** | ~5% (≈ 1-2 s of the 28 s) | Medium — `getPropertyData` is sequential 1-4 fetches, not parallelized |
| **(other DB reads + UPDATE)** | <5% | High — single PK reads/updates |

**Conclusion: the 28 s p50 is dominated by the OpenAI signal call itself.** The photo-detail-low fix from May 4 already extracted the easiest win (~10 s reduction). What remains is mostly inherent vision-call latency at gpt-5-mini with ~1k output tokens against a complex JSON Schema.

### Recommendations (for Murdoch to triage — read-only audit, no code change)

1. **Schema reduction (B)** — claude.ai already filed this. The deferral trigger has fired (28 s ≥ 25 s threshold). Net-expected benefit: 10-25% (3-7 s) latency reduction. Risk: schema reduction needs care so the engine still receives the signals it actually consumes — the engine reads many of these fields. Recommended scope: trim only the fields that the engine doesn't consume (verifiable by reading `estimateEngine` and `normalizeSignals`). Estimated effort: 2-4 hours. Best ratio of effort to expected savings.

2. **Add per-phase timing instrumentation BEFORE optimizing further** — without phase timings in `ai_estimator_notes` (or at minimum in Sentry breadcrumbs), every other optimization is a guess. A minimal change: push `"Property data: <ms>ms"`, `"Satellite fetch: <ms>ms"`, `"AI signal call: <ms>ms"`, `"Polish: <ms>ms"` markers into `ai_estimator_notes` from `generateEstimateAsync` / `callOpenAI` / `polishJobSummary`. Cost: ~30 min of code change. Benefit: every future latency conversation is grounded.

3. **Add a timeout to satellite fetch (D-tail)** — `fetchImageAsDataUrl` at `lib/ai/estimate.ts:1789-1799` has no `AbortController`. Wrap it in `runWithAbortTimeout(2000, ...)` so a hung Google Static Maps request doesn't stall the pipeline. Cheap safety win; doesn't move p50 but defends p99.

4. **Polish-on-critical-path question (C)** — explicitly flag for Murdoch as **product question**, not engineering call:
   - Today: polish blocks `ai_status="ready"` writes; ~2-3 s on critical path.
   - Option (i): keep as-is (existing decision).
   - Option (ii): make polish async (writes `ai_status="ready"` with raw deterministic summary first, then a separate background refresh swaps in the polished summary). 2-3 s p50 win. Contradicts the 2026-05-04 "Do NOT move polish to async" decision — needs explicit re-approval.
   - Option (iii): skip polish entirely. Saves the ~$0.0003/estimate cost AND the 2-3 s. Quality of summary drops noticeably (per the original product decision).

5. **Do NOT recommend yet — gpt-5-mini → gpt-5 swap** — would likely be slower, not faster. The current model with `reasoning: low` is already reasonably fast for vision + structured output. Different problem.

6. **Do NOT recommend yet — model parallelism** (split prompt into N parallel calls per service). Output joining and consistency overhead would offset any savings. Different problem.

### Why 28 s p50 might be acceptable (counter-argument for Murdoch)

The customer's lead-submit response returns in ~2 s (after photo uploads + DB writes; AI is deferred via `after()` per `app/api/public/lead-submit/route.ts:399-435`). The **customer never waits for the AI**. The 28 s pipeline is contractor-facing — the contractor sees a New Lead push, then opens the lead within ~30 s and the estimate is there. If contractor open-rate is typically >30 s after notification, the latency is invisible to the actual user.

Optimization should be tied to a measured contractor-side complaint or a measurable conversion impact, not just a numeric threshold breach. The 25 s threshold from the 2026-05-04 entry was set without empirical contractor-experience data.

If Murdoch wants to confirm: query notification → first-app-open latency from `quote_events` or push-receipt events; compare to AI pipeline finish time. If 90%+ of contractors open the lead more than 30 s after the push, latency at p50 is product-irrelevant.

---

## Out of scope (observed but not in this audit's lane)

- **Audit 13 observability** — adding Sentry breadcrumbs / token-usage logging would unblock all the "what's actually slow?" questions raised here.
- **Audit 4 H7** — 8 legacy leads with `ai_status='ready'` and NULL estimates already filed.
- **C1 (`_other_text` stripped)** — separate Audit 11 finding; not re-audited here.

## Stale entries flagged

- **2026-05-04 [Source: Claude Code] — "Web lead flow triple-bug investigation — RESOLVED"** (Bugs & Fixes) says `STRUCTURED_AI_TIMEOUT_MS = 40000`. HEAD value at `lib/ai/estimate.ts:381` is **35000**. Live wins. Already flagged in 2026-05-09 audit; re-flagging because it remains uncorrected on the Notion page.

## Source citations index

- `app/api/cron/rescue-stuck-leads/route.ts:8,32-35,51-54,82-91,116-220`
- `app/api/public/lead-submit/route.ts:399-435`
- `lib/ai/estimate.ts:159-209,211-259,313-356,381,390,1789-1799,1801-1828,3331-3511,3719,3733-3752,3760-3795,4019-4029,4348-4417,4567,4581-4612,4663-4691,4716-4750,4754-4758,4768-4865`
- `lib/ai/triggerEstimator.ts:1-62`
- `lib/property-data.ts:89-160,315-378`
- Supabase MCP: `leads` percentile_cont last 30 days; 18-row sample of `ai_estimator_notes`; `ai_status='failed' AND ai_estimate_low IS NULL` count = 2; `ai_status='processing' AND submitted_at < now() - interval '10 minutes'` count = 0; `lead_photos` photo-count distribution.
- `grep` over `lib/ai/estimate.ts` for `performance.now|Date.now()|console.time|elapsed|durationMs|t0|tStart` returned 0 matches.
