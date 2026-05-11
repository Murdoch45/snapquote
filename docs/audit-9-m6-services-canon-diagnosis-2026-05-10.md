# Audit 9 M6 / Audit 11 H5 — Services canonicalization diagnosis (read-only)

**Date:** 2026-05-10
**Source:** Claude Code
**Scope:** Read-only diagnostic of the display-form vs slug-form vocabulary mismatch between `contractor_profile.services` (display strings: "Concrete", "Lawn Care / Maintenance", etc.) and `leads.service_category` (slugs: "hardscape", "softscape", etc.). No code, schema, or data changes.

> Every claim below is grounded in a live source citation: file:line at HEAD, MCP query result, or live DB constraint. Notion/docs are referenced only as historical hints after the live finding is formed.

---

## 1. The data — what's actually stored

### 1a. Distinct values in `contractor_profile.services` (display-form, live)

Supabase MCP: `SELECT DISTINCT unnest(services) FROM contractor_profile ORDER BY 1`:

```
Concrete
Deck Installation / Repair
Exterior Painting
Fence Installation / Repair
Gutter Cleaning
Junk Removal
Landscaping / Installation
Lawn Care / Maintenance
Other
Outdoor Lighting Installation
Pool Service / Cleaning
Pressure Washing
Roofing
Tree Service / Removal
Window Cleaning
```

**15 distinct values. All 15 match the canon `SERVICE_OPTIONS` exactly** ([lib/services.ts:1-17](lib/services.ts:1)).

### 1b. Distinct values in `leads.service_category` (slug-form, live)

Supabase MCP: `SELECT DISTINCT service_category, count(*) FROM leads GROUP BY 1 ORDER BY 1`:

| service_category | rows |
|---|---|
| `cleaning` | 679 |
| `deck` | 228 |
| `demolition` | 202 |
| `fencing` | 220 |
| `hardscape` | 239 |
| `other` | 1 080 |
| `pool` | 198 |
| `softscape` | 440 |
| `null` | 181 |

**8 distinct non-null slugs, plus 181 NULL rows (legacy / pre-engine leads).** All 8 slugs are in the canon `SERVICE_CATEGORIES` ([lib/types.ts:21-32](lib/types.ts:21)).

### 1c. Canonical slug + display constants in code

- **Display canon:** `SERVICE_OPTIONS` ([lib/services.ts:1-17](lib/services.ts:1)) — 15 display strings.
- **Slug canon:** `SERVICE_CATEGORIES` ([lib/types.ts:21-32](lib/types.ts:21)) — 10 slugs: `hardscape, softscape, fencing, cleaning, demolition, grading, pool, deck, irrigation, other`.
- **Live CHECK constraint** (Supabase MCP `pg_constraint`): `leads_service_category_check CHECK (((service_category IS NULL) OR (service_category = ANY (ARRAY['hardscape'::text, 'softscape'::text, 'fencing'::text, 'cleaning'::text, 'demolition'::text, 'grading'::text, 'pool'::text, 'deck'::text, 'irrigation'::text, 'other'::text]))))`. Enforces slug canon at DB level.
- **`contractor_profile.services` has NO CHECK constraint** (same MCP query returned no constraint matching `services`). Display-form validation is application-side only via Zod `z.enum(SERVICE_OPTIONS)` at [app/api/public/onboard/route.ts:12](app/api/public/onboard/route.ts:12) and [app/api/app/settings/patch/route.ts:21](app/api/app/settings/patch/route.ts:21).
- **Phantom canon slugs** (in `SERVICE_CATEGORIES` + CHECK constraint, but **never produced live**): `grading`, `irrigation`. Verified live by the distinct query in §1b returning 0 rows for either.

### 1d. Side-by-side mapping

The deterministic engine writes `service_category` based on which per-service estimator handled the lead. Each per-service estimator hardcodes its slug. Sources: grep `serviceCategory: "..."` in `estimators/*Estimator.ts`:

| `contractor_profile.services` (display) | → engine routes via `serviceAliases` ([estimators/estimateEngine.ts:35-55](estimators/estimateEngine.ts:35)) → per-service estimator | `leads.service_category` (slug, hardcoded in that estimator file) |
|---|---|---|
| `Pressure Washing` | `estimatePressureWashing` | `cleaning` ([estimators/pressureWashingEstimator.ts:166](estimators/pressureWashingEstimator.ts:166)) |
| `Gutter Cleaning` | `estimateGutterCleaning` | `cleaning` ([estimators/gutterCleaningEstimator.ts:75](estimators/gutterCleaningEstimator.ts:75)) |
| `Window Cleaning` | `estimateWindowCleaning` | `cleaning` ([estimators/windowCleaningEstimator.ts:75](estimators/windowCleaningEstimator.ts:75)) |
| `Pool Service / Cleaning` | `estimatePoolService` | `pool` ([estimators/poolServiceEstimator.ts:83](estimators/poolServiceEstimator.ts:83)) |
| `Lawn Care / Maintenance` | `estimateLawnCare` | `softscape` ([estimators/lawnCareEstimator.ts:97](estimators/lawnCareEstimator.ts:97)) |
| `Landscaping / Installation` | `estimateLandscaping` | `softscape` ([estimators/landscapingEstimator.ts:94](estimators/landscapingEstimator.ts:94)) |
| `Tree Service / Removal` | `estimateTreeService` | `other` ([estimators/treeServiceEstimator.ts:81](estimators/treeServiceEstimator.ts:81)) |
| `Fence Installation / Repair` | `estimateFence` | `fencing` ([estimators/fenceEstimator.ts:74](estimators/fenceEstimator.ts:74)) |
| `Concrete` | `estimateConcrete` | `hardscape` ([estimators/concreteEstimator.ts:188](estimators/concreteEstimator.ts:188)) |
| `Deck Installation / Repair` | `estimateDeck` | `deck` ([estimators/deckEstimator.ts:82](estimators/deckEstimator.ts:82)) |
| `Exterior Painting` | `estimatePainting` | `other` ([estimators/paintingEstimator.ts:74](estimators/paintingEstimator.ts:74)) |
| `Roofing` | `estimateRoofing` | `other` ([estimators/roofingEstimator.ts:75](estimators/roofingEstimator.ts:75)) |
| `Junk Removal` | `estimateJunkRemoval` | `demolition` ([estimators/junkRemovalEstimator.ts:64](estimators/junkRemovalEstimator.ts:64)) |
| `Outdoor Lighting Installation` | `estimateLighting` | `other` ([estimators/lightingEstimator.ts:152](estimators/lightingEstimator.ts:152)) |
| `Other` | `estimateOther` | `other` ([estimators/otherEstimator.ts:84](estimators/otherEstimator.ts:84)) |

**Multi-service leads:** `aggregateEngineEstimate` at [estimators/shared.ts:1361-1362](estimators/shared.ts:1361) writes `service_category = "other"` when more than one service was requested:

```ts
serviceCategory:
  luxuryAdjustedServiceEstimates.length === 1
    ? luxuryAdjustedServiceEstimates[0].serviceCategory
    : "other",
```

Coarse-mapping observation (cross-flag with Audit 11 M1): four single-service categories — Roofing, Tree Service, Exterior Painting, Outdoor Lighting Installation — collapse to `service_category = "other"` along with the literal `"Other"` service. Filtering by `service_category = 'other'` cannot distinguish among them. This is a category-granularity issue independent of the display-vs-slug mismatch.

### 1e. Row counts and orphans

Supabase MCP queries:

- `contractor_profile` total: **66 rows**. 1 row with NULL/empty services. Average services array length: **2.23**. Min 1, max 15.
- **Orphans in `contractor_profile.services`**: SQL anti-join against `SERVICE_OPTIONS` canon returned **0 rows**. Every stored display string is canonical.
- **Orphans in `leads.service_category`**: SQL anti-join against `SERVICE_CATEGORIES` canon returned **0 rows**. CHECK constraint enforces this at the DB level.

---

## 2. Where contractors set their services

### 2a. The picker components

- **`components/ServiceMultiSelectField.tsx`** ([component, full file](components/ServiceMultiSelectField.tsx)): imports `SERVICE_OPTIONS` at line 3, renders `SERVICE_OPTIONS.map(...)` at line 25, click handler `onToggle(service)` passes the canonical display string itself. Button label is the same display string at line 39 (`{service}`).
- **`components/forms/ServiceSelector.tsx`**: imports `SERVICE_OPTIONS` at line 4, renders `SERVICE_OPTIONS.map(...)` at line 32. Same pattern.
- **`components/onboarding/OnboardingWizard.tsx`**: imports `SERVICE_OPTIONS` at line 12, maps it into `serviceOptions: ServiceOption[]` at line 24, manages `services: useState<ServiceType[]>` at line 34, posts the array to `/api/public/onboard` at line 116.

### 2b. Vocabulary

**Picker shows display labels AND stores display strings.** No display↔slug conversion at the UI layer.

### 2c. The dropdown options source

Single source of truth: `SERVICE_OPTIONS` in [lib/services.ts:1-17](lib/services.ts:1).

---

## 3. Where lead `service_category` is set

### 3a. Public lead form trace

- **Customer form** at /[contractorSlug] uses `PublicLeadForm` which posts to `/api/public/lead-submit`. Server-side validation via `normalizeServiceTypes` ([app/api/public/lead-submit/route.ts:86-88](app/api/public/lead-submit/route.ts:86)) filters to canonical display strings only.
- **Lead row INSERT** at [app/api/public/lead-submit/route.ts:284](app/api/public/lead-submit/route.ts:284) writes `services: payload.services` (display strings). **`service_category` is NOT written here.** Initial row state has `service_category = NULL`.

### 3b. Customer's selection vocabulary

Customer's per-service questionnaire selection writes `services` (display-form) into `leads.services`. The customer never picks a `service_category` slug directly.

### 3c. Slug derivation

`service_category` is filled in **later, by the deterministic estimator engine**, only at the AI terminal write paths. Grep `service_category` in [lib/ai/estimate.ts](lib/ai/estimate.ts) returns just two hits:
- Line 4940 — `runFallbackEstimate`'s UPDATE: `service_category: fallbackResult.serviceCategory as ServiceCategory`
- Line 5226 — `generateEstimateAsync`'s success UPDATE: `service_category: estimate.serviceCategory as ServiceCategory`

Both pull from `aggregateEngineEstimate`'s output ([estimators/shared.ts:1361](estimators/shared.ts:1361)).

The 181 NULL rows in §1b are legacy — they predate the engine writing this column, OR they never reached the engine because the rescue cron's give-up branch (pre-Audit-11-C2 fix) wrote `ai_status='failed'` without touching the engine.

---

## 4. Where the two are compared

**Live grep across all `.ts`/`.tsx` files in [C:\Users\murdo\SnapQuote](.) for `service_category.*contractor` / `contractor.*service_category` / `services.*includes.*service_category` / `service_category.*in.*services` returned ZERO matches.**

**There is no place in the codebase where `contractor_profile.services` is compared with `leads.service_category`.** No filter, no routing decision, no fan-out logic touches both columns.

### 4a. Lead routing

- **Lead-submit flow** posts to /[contractorSlug] → resolves contractor by `public_slug` ([app/api/public/lead-submit/route.ts:113-119](app/api/public/lead-submit/route.ts:113)) → writes the lead under that contractor's `org_id`. No "does this contractor offer this category?" check. **One contractor per lead, scoped by URL slug.**
- **No marketplace-style fan-out.** The codebase has no "find contractors offering category X" path.

### 4b. Notification fan-out

- `sendNewLeadNotifications` ([lib/ai/estimate.ts:4663-4713](lib/ai/estimate.ts:4663)): fires push + in-app + email exclusively to `params.orgId` (the one contractor the lead was submitted under). No category filter.
- `notifications` row INSERT (line 4681-4688): just `org_id`, `type='NEW_LEAD'`, `screen_params: { id: leadId }`. No service/category fields read.

### 4c. The two vocabularies coexist with zero interaction

`contractor_profile.services` exists for:
1. Settings/onboarding UI display ([components/SettingsForm.tsx:26](components/SettingsForm.tsx:26), [components/onboarding/OnboardingWizard.tsx:34](components/onboarding/OnboardingWizard.tsx:34)).
2. Future search/filter UI — **not implemented**. Grep returns no consumer reading `services` for routing or filtering.
3. Implicit "what does this contractor advertise" metadata — not currently rendered to customers ([app/(public)/[contractorSlug]/page.tsx:14-18](app/(public)/[contractorSlug]/page.tsx:14) selects only `business_name, public_slug`).

`leads.service_category` exists for:
1. Engine output / analytics signal (not currently surfaced in any UI grep'd at HEAD).
2. The Audit-8 `leads_safe` view re-projects it for org members ([supabase/migrations/20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views.sql:308,349](supabase/migrations/20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views.sql:308)) — but no code consumer queries it via that view.

---

## 5. Where the AI estimator uses service_category

This is the question Murdoch specifically flagged.

### 5a. AI prompt builder

The structured-AI prompt at [lib/ai/estimate.ts:3452-3471](lib/ai/estimate.ts:3452) (inside `buildSignalPrompt`) embeds a JSON blob of fields. **Line 3455 sends `services: input.services` — display strings.** `service_category` is **not in the prompt at all**.

```ts
JSON.stringify(
  {
    businessName: input.businessName,
    services: input.services,           // ← display-form strings (line 3455)
    serviceQuestionAnswers: sanitizeServiceQuestionBundlesForModeling(input.serviceQuestionAnswers),
    address: propertyData.formattedAddress,
    ...
  },
  null,
  2
)
```

### 5b. Is the prompt category-aware?

**No.** Same system prompt regardless of category. The category-specific logic lives entirely in the deterministic engine (per-service estimator files: `estimatePressureWashing`, `estimateConcrete`, etc.) — those are NOT in the AI's view.

The AI sees the display string, returns generic signals (condition, access, severity, photo evidence, etc.). The engine then routes by display-string `switch (request.service)` at [estimators/estimateEngine.ts:78-110](estimators/estimateEngine.ts:78) to pick the right per-service estimator.

### 5c. Unknown-category behavior

The AI cannot encounter an unknown `service_category` because the slug is never in the prompt. For the display-form `services` it does see:

- Unknown display strings get normalized to `"Other"` via the `??` fallback at [estimators/estimateEngine.ts:57-59](estimators/estimateEngine.ts:57): `serviceAliases[service] ?? "Other"`.
- Unknown then routes to `estimateOther` (line 108: `default: return estimateOther(context)`).
- `estimateOther` hardcodes `serviceCategory: "other"` ([estimators/otherEstimator.ts:84](estimators/otherEstimator.ts:84)).

**No throw. No worse estimate from "unknown category" — there is no "unknown category" code path.** Display-string `Other` is the legitimate canonical bucket for anything outside the 14 mapped services.

### 5d. Live sample (10 recent leads, post-Audit-11-F5)

Supabase MCP query joining lead row to `ai_estimator_notes` first/last phase markers:

| id (truncated) | submitted_at | services | service_category | first_phase | first_ts |
|---|---|---|---|---|---|
| `a469701b…` | 2026-05-10 19:56:16 | `["Tree Service / Removal"]` | `other` | `pipeline_start` | `2026-05-10T19:56:16.872Z` |
| `8787abb6…` | 2026-05-10 19:53:09 | `["Fence Installation / Repair"]` | `fencing` | `pipeline_start` | `2026-05-10T19:53:10.392Z` |
| `e5d1eeb3…` | 2026-05-06 23:31:22 | `["Tree Service / Removal"]` | `other` | (legacy string note) | — |
| `700f7729…` | 2026-05-06 22:40:36 | `["Landscaping / Installation"]` | `softscape` | (legacy string note) | — |
| `0e6bec58…` | 2026-05-06 22:38:50 | `["Fence Installation / Repair"]` | `fencing` | (legacy string note) | — |
| `37b83c63…` | 2026-05-05 23:44:28 | `["Pressure Washing"]` | `cleaning` | (legacy string note) | — |
| `61fe634f…` | 2026-05-05 23:39:09 | `["Tree Service / Removal"]` | `other` | (legacy string note) | — |
| `eac1e1db…` | 2026-05-05 23:34:34 | `["Roofing"]` | `other` | (legacy string note) | — |
| `baa58680…` | 2026-05-05 23:14:50 | `["Outdoor Lighting Installation"]` | `other` | (legacy string note) | — |
| `5cba5e91…` | 2026-05-05 23:12:47 | `["Window Cleaning"]` | `cleaning` | (legacy string note) | — |

Every row's `service_category` matches the per-service estimator's hardcoded slug from §1d. **Mapping is correct end-to-end.** Two newest leads (post-F5 fix) have structured `{phase, ts, ...}` notes; older legacy notes are array-of-strings.

### 5e. AI sees display, not slug — confirmed

For each distinct `contractor_profile.services` value: when a lead is processed, the AI receives `input.services` (the lead's services, which are also display strings from the customer's form selection — same `SERVICE_OPTIONS` set). The AI **never** sees the contractor's services list, and **never** sees the slug.

---

## 6. Other reads of `contractor_profile.services`

Live grep (full files inspected):

| Site | Purpose | Vocabulary read |
|---|---|---|
| [components/SettingsForm.tsx:26](components/SettingsForm.tsx:26) | Render contractor's settings page service list | display |
| [components/onboarding/OnboardingWizard.tsx:34](components/onboarding/OnboardingWizard.tsx:34) | Onboarding picker | display |
| [app/app/settings/page.tsx:15](app/app/settings/page.tsx:15) | SELECT for settings page | display |
| [app/api/public/onboard/route.ts:12,63](app/api/public/onboard/route.ts:12) | Onboarding write | display (Zod-validated) |
| [app/api/app/settings/patch/route.ts:21,82](app/api/app/settings/patch/route.ts:21) | Settings update | display (Zod-validated) |
| [lib/onboarding.ts:144,181](lib/onboarding.ts:144) | Programmatic onboarding (test scripts) | display |
| [lib/serviceColors.ts:31](lib/serviceColors.ts:31) | Cross-repo color theming (keyed by display) | display |
| `scripts/seed*.ts`, `scripts/run-estimator-tests.ts`, `scripts/run-confidence-consistency.ts`, `scripts/generate-cheyenne-dataset-report.ts` | Test/seed data writers | display |
| [lib/ai/estimate.ts:4720,5015,5097](lib/ai/estimate.ts:4720) | Selects `business_name, business_address_full, business_lat, business_lng` only — does NOT select `services` | n/a |

**No reader anywhere consumes the `services` column for routing, filtering, or comparison.** Settings/onboarding UIs read & write it; that's it.

### 6a. Public contractor page

[app/(public)/[contractorSlug]/page.tsx:14-18](app/(public)/[contractorSlug]/page.tsx:14): SELECT is `business_name, public_slug` only. **Services list is NOT displayed to customers** on the public contractor request page. The customer picks their own service from the in-form dropdown (`SERVICE_OPTIONS`), independent of the contractor's profile.

### 6b. Search/filter

No contractor search functionality found at HEAD. No category filter.

---

## Risk assessment

### A. Is there an actual current bug?

**No.** Live evidence:
- Zero comparison points between `contractor_profile.services` and `leads.service_category` (live grep).
- Lead submission flow does not check whether the contractor "offers" the requested service — it's a per-contractor URL, one contractor per lead.
- Notification fan-out is single-org, no service filter.
- AI prompt receives display-form `services`, never the slug.
- Engine routes via display-string switch, hardcoded slug-per-estimator. Bidirectional consistency verified live (§5d).
- Zero orphans in either column.

The "mismatch" is internal vocabulary inconsistency with no user-visible impact.

### B. Worst current scenario

Contractor profile `services = ["Concrete"]`, lead comes in with `service_category = "hardscape"`:

1. Customer submits lead at `/<contractor-slug>` picking "Concrete" from the form. `lead-submit` validates against `SERVICE_OPTIONS`, writes `services: ["Concrete"]` to the lead row.
2. AI estimator fires. Prompt receives `services: ["Concrete"]` (display-form). AI extracts signals.
3. Engine `serviceAliases["Concrete"] = "Concrete"`, routes to `estimateConcrete`, which hardcodes `serviceCategory: "hardscape"`.
4. Terminal write: `leads.service_category = "hardscape"`.
5. Notification fires for the contractor (single-org, no filter).
6. Contractor opens lead detail. UI renders `lead.services` badge "Concrete" ([app/app/leads/[id]/page.tsx:261](app/app/leads/[id]/page.tsx:261)). Estimate range shown.
7. No code anywhere reads `service_category` to make a decision about the contractor.

**Outcome: contractor sees the lead, unlocks, quotes. The "mismatch" never matters because nothing compares the two.**

### C. AI prompt behavior on unknown categories

Per §5c live code citation: there is no "unknown category" code path. The AI never sees `service_category`. Unknown display-form services fall through to `"Other"` → `estimateOther` → `serviceCategory: "other"`. No worse estimate emerges from this branch (other than the well-known coarseness of the "Other" bucket, flagged separately as Audit 11 M1).

### D. Migration scope (if we decide to canonicalize)

To fully unify the vocabulary, the scope is large:

- **Data migration:** 66 `contractor_profile` rows. Convert each display string in `services[]` to its slug counterpart (15-row map). Idempotent UPDATE on the column. Trivial size.
- **Code touch points** (live-grep'd):
  - `lib/services.ts` — entire constants file.
  - `lib/types.ts` — `SERVICE_CATEGORIES` constants + types.
  - `lib/serviceColors.ts` — **cross-repo file**, must edit BOTH SnapQuote and SnapQuote-mobile in lock-step (per comment at lines 1-7).
  - `lib/onboarding.ts`, `lib/validations.ts`.
  - `components/ServiceMultiSelectField.tsx`, `components/forms/ServiceSelector.tsx`, `components/SettingsForm.tsx`, `components/onboarding/OnboardingWizard.tsx`.
  - `app/api/public/onboard/route.ts`, `app/api/app/settings/patch/route.ts`.
  - All 15 files in `estimators/` (canonical name + serviceAliases map + every per-service estimator that hardcodes display-string routing identity).
  - `app/app/leads/[id]/page.tsx` (badge renderer reads `lead.services` as display).
  - 6 `scripts/*.ts` files.
  - Test files referencing `SERVICE_OPTIONS`.
  - Mobile repo: matching `lib/serviceColors.ts` + likely service constants.
- **Atomic?** No. Code must ship before data migration (or with backward-compat), or risk readers seeing a value they don't recognize during the deploy window.
- **Risk of breaking onboarding:** HIGH if not done in lock-step. The Zod enum on `onboard`/`settings/patch` would reject any half-migrated value.
- **Risk of breaking AI estimator for live leads:** MEDIUM. The engine's `serviceAliases` map and per-service switch would need a coordinated rename. A multi-deploy migration could leave a window where leads route to `estimateOther` because the lookup mismatched.
- **Phantom-canon slugs.** `grading` and `irrigation` exist in `SERVICE_CATEGORIES` + the live CHECK constraint but no estimator produces them. Live zero rows for either. **Cleanup is a separate, much smaller change** — could drop them or keep them as forward-looking.

### E. Cost/benefit verdict

**Pre-launch:** **DEFER.**

Reasons:
1. Live state has **zero functional bug**. No code path is broken by the mismatch.
2. No customer- or contractor-facing surface depends on the two vocabularies matching.
3. The current "two independent enums" design is actually defensible: display strings are UI-facing copy (with "/", spaces, punctuation), slugs are analytical buckets that group multiple display strings (e.g. three cleaning-type services all → `cleaning`). They model different things, even if they overlap.
4. Migration is invasive across 20+ files including a cross-repo file, with a non-trivial risk of breaking onboarding or the estimator during deploy.
5. **Pre-launch focus is shipping; this is a refactor without a fix attached.**

**Specific recommendation:**

1. **Document the design** in `lib/types.ts` — add a comment block explaining that `SERVICE_CATEGORIES` (slug) is intentionally a coarser analytical bucket distinct from `SERVICE_OPTIONS` (display). Cross-link to the per-estimator `serviceCategory:` hardcoded map. Stops future audits from re-flagging it as a "bug".
2. **Drop phantom-canon slugs** `grading` and `irrigation` from `SERVICE_CATEGORIES` + the live CHECK constraint **if** the product roadmap doesn't have those services queued. Tiny migration, removes the dangling declaration. (Skip if they're planned for an upcoming feature.)
3. **Separate ticket (cross-flag with Audit 11 M1):** the coarse-mapping of Roofing / Tree Service / Exterior Painting / Outdoor Lighting all → `other` is a category-expansion question, not a canonicalization question. Decide whether to add `roofing`, `tree`, `painting`, `lighting` slugs based on analytics needs — that's a feature-set decision.

**This audit-9-M6 finding can be marked resolved as "intentional design, not a bug".**

---

## Notion / docs stale-entry flagging

- **Audit 9 M6 (Notion Bugs & Fixes, 2026-05-08)** — flagged the contractor_profile.services CHECK constraint as a hygiene item, ultimately SKIPPED because "the CHECK is not a hygiene fix here, it's a canonicalization decision (consolidate display→slug? introduce a bridge table? add a separate `service_category_slugs` column?)". That entry remains correct; this audit confirms the SKIP was the right call.
- **Audit 11 H5 / M1** (docs/audit-11-ai-estimator-2026-05-09.md) — flagged the mismatch + the coarse-mapping as separate concerns. This diagnosis closes H5 ("display vs slug mismatch") as **intentional design / no bug**. M1 (coarse mapping for Roofing/Tree/Painting/Lighting) remains open as a category-expansion question.

---

## Source citations index

- `lib/services.ts:1-17` (SERVICE_OPTIONS, normalizeServiceTypes)
- `lib/types.ts:21-32` (SERVICE_CATEGORIES, ServiceCategory)
- `lib/ai/estimate.ts:3452-3471, 4720, 4940, 5015, 5097, 5226` (prompt builder, contractor SELECTs, service_category writes)
- `estimators/estimateEngine.ts:35-110` (serviceAliases + switch routing)
- `estimators/shared.ts:1361-1362` (aggregate service_category logic)
- `estimators/*Estimator.ts:serviceCategory:` (15 hardcoded slug assignments)
- `components/ServiceMultiSelectField.tsx:3,25,39`
- `components/forms/ServiceSelector.tsx:4,32`
- `components/SettingsForm.tsx:19,26`
- `components/onboarding/OnboardingWizard.tsx:12,24,34,116`
- `app/api/public/onboard/route.ts:12,63`
- `app/api/app/settings/patch/route.ts:21,82`
- `app/api/public/lead-submit/route.ts:86-88,284`
- `app/(public)/[contractorSlug]/page.tsx:14-18`
- `lib/serviceColors.ts:1-13,31`
- `lib/onboarding.ts:144,181`
- `supabase/migrations/0009_contractor_services.sql:1-2` (column DDL, no CHECK)
- `supabase/migrations/20260509000001_audit8_pii_gating_…sql:308,349` (leads_safe view passthrough)
- Supabase MCP project `upqvbdldoyiqqshxquxa`: distinct-values queries, anti-join orphan checks, pg_constraint introspection, sample of 10 recent ai_estimator_notes-bearing leads.
