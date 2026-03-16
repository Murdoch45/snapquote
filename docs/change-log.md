# SnapQuote Change Log

This file records important system changes.

Examples include:

* estimator logic updates
* AI interpretation tightening
* normalization rule changes
* service question updates

---

## 2026-03-15

### Oklahoma estimator test dataset setup

Files Modified
* `scripts/test-properties.ts`
* `scripts/run-estimator-tests.ts`

Description
Updated the hardcoded estimator test property list to the Oklahoma City and Nichols Hills dataset and made the runner's property messaging generic instead of Los Angeles-specific. The local test contractor profile was also updated in Supabase to use `2728 SW 2nd St, Oklahoma City, OK 73108, USA` as the business address for travel-pricing runs.

Reason for Change
To establish a new full reproducibility dataset in the Oklahoma City area without changing estimator pricing logic.

Expected Impact
Future estimator runs using the default test dataset will submit the Oklahoma properties and calculate travel distance from the Oklahoma business address.

---

## 2026-03-15

### Fence repair premium-context guardrail

Files Modified
* `lib/ai/estimate.ts`

Description
Added a fence-specific AI normalization guardrail for repair and gate-work jobs. The guardrail now anchors subtype and site-access interpretation to the fence questionnaire answers, preserves direct large-scope repair signals and explicit premium-material requests, and suppresses unsupported premium-property or pool-driven luxury assumptions for repair-oriented fence jobs.

Reason for Change
Oklahoma AI regression review showed that fence repair pricing could stack estate-style premium context on top of a questionnaire-supported repair job, especially for the Nichols Hills full-yard repair case.

Expected Impact
Fence repair and gate-work AI runs should stay closer to the questionnaire-supported repair scope while avoiding unsupported luxury-style inflation. Replacement and new-install fence paths remain unchanged.

---

## 2026-03-15

### Fence guardrail narrowing attempt

Files Modified
* `lib/ai/estimate.ts`

Description
Narrowed the fence guardrail so premium-property and pool-context suppression only applies to very-large repair cases, while gate rows keep their original AI subtype instead of being forced into the same normalization path as large repair jobs.

Reason for Change
The broader fence repair/gate suppression improved the Nichols Hills full-yard repair row but made the two small gate-repair rows worse, so the logic was narrowed around the large repair-style inflation case only.

Expected Impact
Large full-yard repair jobs should retain the premium-context suppression, while small gate-repair rows should stay closer to their original AI behavior.

---

## 2026-03-15

### Oklahoma tree and concrete normalization tightening

Files Modified
* `lib/ai/estimate.ts`

Description
Added a tree-specific subtype canon step so structured AI stump-grinding requests normalize to the estimator's existing `stump_grinding` path, and added a conservative concrete quantity cap for `concrete_scope = Not sure` so mixed driveway/walkway replacement jobs stay closer to the questionnaire-supported unknown-size band.

Reason for Change
Oklahoma regression review showed one stump-grinding row jumping from the stump-pricing path onto the heavier general tree-work pricing path due to a subtype alias mismatch, and one concrete row inflating from imagery-based quantity inference when the questionnaire did not provide dimensions.

Expected Impact
Simple stump-grinding AI runs should stay aligned with baseline unless the questionnaire explicitly supports a harder tree-removal path. Concrete jobs with known project types but unknown size should still infer legitimate replacement scope, but with a tighter cap when the questionnaire does not confirm larger area.

---

## 2026-03-15

### Bristol TN/VA estimator test dataset setup

Files Modified
* `scripts/test-properties.ts`

Description
Replaced the default estimator test property list with the Bristol TN/VA dataset: `1120 Barber Rd, Bristol, TN 37620`, `1216 Norway St, Bristol, VA 24201`, and `2070 King College Rd, Bristol, TN 37620`. The local test contractor profile used by the estimator runner was also updated in Supabase so `falcon-vhnf` resolves travel pricing from `313 Belmont Dr, Bristol, TN 37620, USA`.

Reason for Change
To create a new full reproducibility dataset for Bristol that can be compared against the prior Los Angeles/Beverly Hills and Oklahoma datasets without changing estimator pricing logic.

Expected Impact
Future default estimator test runs will submit the Bristol properties and calculate travel distance from the Bristol contractor origin.

---

## ENTRY TEMPLATE

Date

Change Name

Files Modified

Description

Reason for Change

Expected Impact

---
