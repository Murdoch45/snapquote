# SnapQuote — Archive

> ⚠️ **LOWER RELIABILITY — FOR REFERENCE ONLY. DO NOT TREAT AS GROUND TRUTH.**
> This file is a consolidation of older documentation files accumulated over the course of the project. Much of this content predates the April 2026 audit and may no longer reflect how the app actually works. Treat every section here with skepticism and verify in the actual codebase.
> For current project state, refer to `docs/current-state.md`.

---

## Original Build Prompt (snapquote_architecture.md)

This was the original Codex master prompt used to bootstrap SnapQuote from scratch. It describes the initial MVP spec — not the current app.

Notable divergences from current reality:
- References Telnyx only (Twilio also used now)
- References `gpt-4.1-mini` (current model is `gpt-5-mini`)
- Describes quote limit system (current system is credit-based)
- No mention of mobile app, RevenueCat, credit packs, or Apple IAP
- No mention of Sentry, Supabase Edge Functions, or pg_cron
- Plan limits, seat counts, and feature gates described here may not match current implementation

---

## Original MVP Plan (snapquote_mvp_plan.md)

Summary-level companion to the build prompt. Describes the intended implementation plan at project start. Same caveats apply — this is the original design, not the current system.

---

## README (original)

Stack listed:
- Next.js (App Router) + TypeScript
- TailwindCSS + reusable UI components
- Supabase (Postgres, Auth, Storage, Realtime)
- OpenAI Responses API (`gpt-4.1-mini` default) — ⚠️ now `gpt-5-mini`
- Telnyx (SMS notifications) — ⚠️ may also use Twilio/Telnyx; verify
- Resend (email notifications)
- Recharts (analytics charts)
- Zod (validation)

Features listed at time of writing:
- Public contractor request page at `/{contractorSlug}`
- Lead submission with address/services/description/photos/contact validation
- AI estimate generation (range + suggested price + draft message) on lead creation — ⚠️ draft message field now removed
- Contractor dashboard with leads, quotes, customers, analytics, team, settings
- Manual quote approval and send flow only (AI never auto-sends)
- Public quote page at `/q/[publicId]` with viewed + accept lifecycle
- Team invite/remove (owner only) with plan seat enforcement
- Monthly quote usage enforcement — ⚠️ now credit-based system; verify
- Supabase RLS-based multi-tenant org isolation

Usage limits as originally written (⚠️ likely outdated — verify in `lib/plans.ts`):
- SOLO: 50 quotes/month (+5 grace)
- TEAM: 150 quotes/month (+5 grace)
- BUSINESS: unlimited — ⚠️ now capped at 100/month

Environment variables listed (reference only — verify `.env.local` for current set):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
TELNYX_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## AI Workflow Rules (docs/ai-workflow.md)

These rules were written for Codex. Codex is no longer used. Claude Code is the executor. This content is preserved for historical reference only.

Key rules that were in place:
- Test runs logged to `docs/testing-log.md`
- Estimator logic changes logged to `docs/change-log.md`
- Documentation must remain lightweight
- Codex must not reorganize source folders

---

## Change Log (docs/change-log.md)

Recorded estimator changes made in March 2026 during Oklahoma and Bristol testing phases.

### 2026-03-15 — Oklahoma estimator test dataset setup
Updated hardcoded test property list to Oklahoma City / Nichols Hills dataset. Test contractor profile updated to `2728 SW 2nd St, Oklahoma City, OK 73108, USA`.

### 2026-03-15 — Fence repair premium-context guardrail
Added fence-specific AI normalization guardrail for repair and gate-work jobs. Anchors subtype and site-access interpretation to fence questionnaire answers. Suppresses unsupported premium-property or pool-driven luxury assumptions for repair-oriented fence jobs.

### 2026-03-15 — Fence guardrail narrowing
Narrowed fence guardrail so premium suppression only applies to very-large repair cases. Gate rows keep their original AI subtype path.

### 2026-03-15 — Oklahoma tree and concrete normalization tightening
Added tree-specific subtype canon step (stump-grinding stays on `stump_grinding` path). Added conservative concrete quantity cap for `concrete_scope = Not sure`.

### 2026-03-15 — Bristol TN/VA estimator test dataset setup
Replaced test property list with Bristol dataset: `1120 Barber Rd, Bristol, TN 37620`, `1216 Norway St, Bristol, VA 24201`, `2070 King College Rd, Bristol, TN 37620`. Contractor origin: `313 Belmont Dr, Bristol, TN 37620, USA`.

---

## Estimator Playbook (docs/estimator-playbook.md)

⚠️ This describes the estimator architecture before the April 2026 major overhaul. The pipeline has since changed significantly (Supabase Edge Function, deterministic job summary, unified regional pricing). Use as background context only.

Core rule that remains true: **AI interprets. Logic prices.** AI layer outputs structured normalized signals only. Dollar pricing stays in estimator code.

Files listed (paths may still be valid — verify):
- `lib/ai/estimate.ts`
- `estimators/shared.ts`
- `estimators/serviceEstimatorSupport.ts`
- `estimators/estimateEngine.ts`
- `lib/serviceQuestions.ts`

---

## Estimator Rules (docs/estimator-rules.md)

Records estimator assumptions and normalization safeguards. Examples of rules that existed:
- Quantity caps
- Subtype anchoring
- Scope bucket limits
- Surface filtering
- Premium property suppression
- Access difficulty anchors

⚠️ Specific rules are not enumerated here — they were never fully documented. Verify in `lib/ai/estimate.ts` and `estimators/`.

---

## Estimator System (docs/estimator-system.md)

Pipeline as originally described (pre-April 2026 overhaul):

```
Customer request form
-> service questions
-> property lookup
-> AI interpretation
-> signal normalization
-> deterministic estimator
-> estimate output
```

Key components (file paths may still be valid — verify):
- AI Interpretation: `lib/ai/estimate.ts`
- Deterministic Estimator: `estimators/estimateEngine.ts`
- Service Question Configuration: `lib/serviceQuestions.ts`
- Test Runner: `scripts/run-estimator-tests.ts`

Design principles (still valid):
- Pricing must remain deterministic
- AI is used only as an interpretation layer
- AI signals must be normalized and capped
- Estimator results must remain reproducible through testing

---

## Project Overview (docs/project-overview.md)

Original high-level description. Analytics tool listed as Metabase — ⚠️ verify if this is still in use or was dropped.

Core estimation flow (original):
```
Customer request form
-> lead created
-> property data lookup
-> AI interpretation layer
-> deterministic estimator
-> estimate stored
-> review in analytics tools (Metabase)
```

Important architecture rule that remains true: **Pricing is deterministic. AI does NOT generate final prices.**

---

## Testing Log (docs/testing-log.md)

Records estimator test runs from March 2026. All tests run in Oklahoma City and Bristol TN/VA datasets.

### 2026-03-15 — Oklahoma baseline reproducibility (Run 1)
- All 15 services, 3 properties (OKC + Nichols Hills)
- AI mode: off. Seed: seed-a and seed-b. 180 rows total.
- Result: PASSED. Test 1 matched Test 2, Test 3 matched Test 4.

### 2026-03-15 — Oklahoma AI warm and replay reproducibility (Run 2)
- All 15 services, same 3 properties
- AI mode: require. 135 rows total.
- Result: PASSED. Warm pass recorded, Test 5 matched Test 6 in replay.

### 2026-03-15 — Oklahoma fence-only regression (fence repair guardrail)
- Fence only. 3 properties. 6 rows.
- Nichols Hills repair: $9725 → $7200 (baseline $7425). Gate rows drifted upward.
- Next: gate rows need follow-up investigation.

### 2026-03-15 — Oklahoma fence-only regression (narrowed guardrail)
- Same configuration. No change from prior attempt.
- Gate-row drift not resolved by narrowing suppression scope.

### 2026-03-15 — Oklahoma Tree + Concrete targeted regression
- Tree + Concrete only. 3 properties. 12 rows.
- Tree (Cedar Springs stump): $1325 → $550 (matched baseline exactly).
- Concrete (NW 29th): $12650 → $12625 (baseline $11575, minor improvement only).

### 2026-03-15 — Bristol full reproducibility suite
- All 15 services. 3 Bristol properties.
- Run 1 (off): PASSED. Run 2 (require): PASSED.
- 315 rows total. Zero substantive mismatches.
