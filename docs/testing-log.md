# SnapQuote Estimator Testing Log

This file records estimator testing runs, regression tests, and validation experiments.

Each entry must follow the format below.

---

## 2026-03-15

### Run 1 - Oklahoma baseline reproducibility

Goal
Validate that the full 15-service Oklahoma dataset is reproducible in non-AI mode across repeated seeded runs.

Services Tested
All 15 estimator services.

Properties Tested
* 424 NW 29th St, Oklahoma City, OK 73103
* 12924 Cedar Springs Rd, Oklahoma City, OK 73120
* 1202 Larchmont Ln, Nichols Hills, OK 73116

Seed Used
* Test 1: seed-a
* Test 2: seed-a
* Test 3: seed-b
* Test 4: seed-b

AI Mode
off

Rows Generated
180 total rows

Output Files
* `test-results/snapquote-test-results--run-1--test-1--seed-a.csv`
* `test-results/snapquote-test-results--run-1--test-2--seed-a.csv`
* `test-results/snapquote-test-results--run-1--test-3--seed-b.csv`
* `test-results/snapquote-test-results--run-1--test-4--seed-b.csv`

Summary of Results
Run 1 reproducibility passed. Test 1 matched Test 2 exactly, and Test 3 matched Test 4 exactly.

Observations
* 45 rows were generated per pass.
* The Oklahoma property lookup cache was created/reused successfully.
* Temporary app port used: `3030`

Next Steps
Run the AI warm and replay suite for the same Oklahoma dataset and confirm replay reproducibility.

---

## 2026-03-15

### Run 2 - Oklahoma AI warm and replay reproducibility

Goal
Validate that the full 15-service Oklahoma dataset is reproducible in AI-required replay mode after recording structured AI outputs once.

Services Tested
All 15 estimator services.

Properties Tested
* 424 NW 29th St, Oklahoma City, OK 73103
* 12924 Cedar Springs Rd, Oklahoma City, OK 73120
* 1202 Larchmont Ln, Nichols Hills, OK 73116

Seed Used
* Warm: seed-a
* Test 5: seed-a
* Test 6: seed-a

AI Mode
require

Rows Generated
135 total rows

Output Files
* `test-results/snapquote-test-results--run-2--warm--seed-a.csv`
* `test-results/snapquote-test-results--run-2--test-5--seed-a.csv`
* `test-results/snapquote-test-results--run-2--test-6--seed-a.csv`

Summary of Results
Run 2 reproducibility passed. The warm pass recorded structured AI results, and Test 5 matched Test 6 exactly in replay mode.

Observations
* 45 rows were generated per pass.
* All Run 2 rows reported `ai_mode=require`, `ai_signal_source=structured_ai`, and `ai_status=ready`.
* Temporary app ports used: `3031` for warm/record and `3032` for replay.
* Structured AI replay cache was reused successfully.

Next Steps
Use the Oklahoma baseline and replay outputs for comparison and future interpretation review before any tuning.

---

## 2026-03-15

### Oklahoma fence-only regression after repair premium guardrail

Goal
Validate a narrow fence-only AI interpretation change intended to keep repair jobs anchored to questionnaire-supported scope and material while suppressing unsupported premium-property or pool-driven inflation.

Services Tested
Fence Installation / Repair only.

Properties Tested
* 424 NW 29th St, Oklahoma City, OK 73103
* 12924 Cedar Springs Rd, Oklahoma City, OK 73120
* 1202 Larchmont Ln, Nichols Hills, OK 73116

Seed Used
* Baseline: seed-a
* AI Replay: seed-a

AI Mode
* Baseline: off
* AI Replay: require

Rows Generated
6 total rows

Output Files
* `test-results/snapquote-test-results--oklahoma-fence-regression--baseline--seed-a.csv`
* `test-results/snapquote-test-results--oklahoma-fence-regression--ai-replay--seed-a.csv`
* `test-results/estimator-report--oklahoma-fence-regression--baseline--seed-a.html`
* `test-results/estimator-report--oklahoma-fence-regression--ai-replay--seed-a.html`

Summary of Results
The Nichols Hills fence-repair row improved materially, dropping from the prior AI result of `9725.00` to `7200.00` against a baseline of `7425.00`. The two smaller gate-repair rows moved upward versus the earlier AI run and need follow-up review if fence tuning continues.

Observations
* Temporary app ports used: `3040` for baseline and `3041` for AI replay.
* Property lookup cache and structured AI replay cache were reused.
* Baseline rows remained `1400.00`, `1325.00`, and `7425.00`.
* AI replay rows were `1650.00`, `1600.00`, and `7200.00`.
* The main target row improved, but the other two fence rows became less aligned with baseline than before.

Next Steps
Use this result to decide whether fence tuning should continue or stop after the successful Nichols Hills correction and the new small-row drift.

---

## 2026-03-15

### Oklahoma fence-only regression after narrowed repair-only guardrail

Goal
Validate a narrower fence-only AI interpretation change that limits premium-property suppression to the large full-yard repair case while leaving gate rows on their prior AI subtype path.

Services Tested
Fence Installation / Repair only.

Properties Tested
* 424 NW 29th St, Oklahoma City, OK 73103
* 12924 Cedar Springs Rd, Oklahoma City, OK 73120
* 1202 Larchmont Ln, Nichols Hills, OK 73116

Seed Used
* Baseline: seed-a
* AI Replay: seed-a

AI Mode
* Baseline: off
* AI Replay: require

Rows Generated
6 total rows

Output Files
* `test-results/snapquote-test-results--oklahoma-fence-regression--baseline--seed-a.csv`
* `test-results/snapquote-test-results--oklahoma-fence-regression--ai-replay--seed-a.csv`
* `test-results/estimator-report--oklahoma-fence-regression--baseline--seed-a.html`
* `test-results/estimator-report--oklahoma-fence-regression--ai-replay--seed-a.html`

Summary of Results
The narrowed guardrail did not change the fence-only AI replay results from the prior attempt. The Nichols Hills repair row stayed improved at `7200.00` versus baseline `7425.00`, but the two smaller gate-repair rows remained elevated at `1650.00` and `1600.00`.

Observations
* Temporary app ports used: `3040` for baseline and `3041` for AI replay.
* Property lookup cache and structured AI replay cache were reused.
* Compared with the original Oklahoma AI run, the two gate-repair rows did not move back toward baseline.
* This suggests the remaining gate-row drift is not fixed by simply narrowing the premium-property suppression scope.

Next Steps
Do not keep the current fence tuning as a final solution without another targeted investigation into the gate-repair pricing path.

---

## 2026-03-15

### Oklahoma targeted Tree + Concrete regression after normalization tightening

Goal
Validate a narrow AI interpretation pass for Tree Service / Removal and Concrete only, focusing on the Oklahoma stump-grinding jump and the driveway/walkway concrete quantity inflation when size was marked `Not sure`.

Services Tested
* Tree Service / Removal
* Concrete

Properties Tested
* 424 NW 29th St, Oklahoma City, OK 73103
* 12924 Cedar Springs Rd, Oklahoma City, OK 73120
* 1202 Larchmont Ln, Nichols Hills, OK 73116

Seed Used
* Baseline: seed-a
* AI Replay: seed-a

AI Mode
* Baseline: off
* AI Replay: require

Rows Generated
12 total rows

Output Files
* `test-results/snapquote-test-results--oklahoma-tree-concrete--baseline--seed-a.csv`
* `test-results/snapquote-test-results--oklahoma-tree-concrete--ai-replay--seed-a.csv`
* `test-results/estimator-report--oklahoma-tree-concrete--baseline--seed-a.html`
* `test-results/estimator-report--oklahoma-tree-concrete--ai-replay--seed-a.html`

Summary of Results
The Tree target row fully converged to baseline after the subtype canon fix: `12924 Cedar Springs Rd / Tree Service / Removal` moved from `1325.00` down to `550.00`, matching baseline exactly. Concrete improved only marginally: `424 NW 29th St / Concrete` moved from `12650.00` to `12625.00` against baseline `11575.00`. No other Tree or Concrete rows regressed.

Observations
* Temporary AI replay app used port `3045`; fresh baseline app used port `3046`.
* A stale baseline temp app on `3044` produced fetch failures and was replaced by the clean `3046` rerun.
* Property lookup cache and structured AI replay cache were reused.
* All AI replay rows completed with `ai_mode=require`, `ai_signal_source=structured_ai`, and `ai_status=ready`.

Next Steps
Keep the tree subtype canon fix. Concrete may need a second pass later if tighter `Not sure` scope anchoring is still desired, but it is a smaller issue than the Tree drift was.

---

## 2026-03-15

### Bristol full reproducibility suite

Goal
Validate the new Bristol TN/VA estimator dataset with the same full reproducibility structure used for prior datasets: baseline fallback determinism across two seeds and structured-AI determinism in replay mode.

Services Tested
All 15 estimator services.

Properties Tested
* 1120 Barber Rd, Bristol, TN 37620
* 1216 Norway St, Bristol, VA 24201
* 2070 King College Rd, Bristol, TN 37620

Seed Used
* Run 1 Test 1: seed-a
* Run 1 Test 2: seed-a
* Run 1 Test 3: seed-b
* Run 1 Test 4: seed-b
* Run 2 Warm: seed-a
* Run 2 Test 5: seed-a
* Run 2 Test 6: seed-a

AI Mode
* Run 1: off
* Run 2 Warm/Test 5/Test 6: require

Rows Generated
315 total rows

Output Files
* `test-results/snapquote-test-results--bristol-run-1--test-1--seed-a.csv`
* `test-results/snapquote-test-results--bristol-run-1--test-2--seed-a.csv`
* `test-results/snapquote-test-results--bristol-run-1--test-3--seed-b.csv`
* `test-results/snapquote-test-results--bristol-run-1--test-4--seed-b.csv`
* `test-results/snapquote-test-results--bristol-run-2--warm--seed-a.csv`
* `test-results/snapquote-test-results--bristol-run-2--test-5--seed-a.csv`
* `test-results/snapquote-test-results--bristol-run-2--test-6--seed-a.csv`
* `test-results/estimator-report--bristol-run-1--test-1--seed-a.html`
* `test-results/estimator-report--bristol-run-1--test-2--seed-a.html`
* `test-results/estimator-report--bristol-run-1--test-3--seed-b.html`
* `test-results/estimator-report--bristol-run-1--test-4--seed-b.html`
* `test-results/estimator-report--bristol-run-2--warm--seed-a.html`
* `test-results/estimator-report--bristol-run-2--test-5--seed-a.html`
* `test-results/estimator-report--bristol-run-2--test-6--seed-a.html`

Summary of Results
Reproducibility passed cleanly for both Bristol suites. Run 1 Test 1 matched Test 2, Run 1 Test 3 matched Test 4, and Run 2 Test 5 matched Test 6 with zero substantive mismatches across address, service, selected answers, AI metadata, property metrics, and final estimate.

Observations
* Temporary app ports used: `3050` for baseline, `3051` for the AI warm record pass, and `3052` for AI replay.
* Property lookup cache and structured AI cache were reused and expanded for the Bristol addresses.
* All AI replay rows showed `ai_mode=require`, `ai_signal_source=structured_ai`, and `ai_status=ready`.
* Running three Next dev servers concurrently caused a `.next` manifest conflict, so the warm and replay phases were run sequentially on separate temporary ports after stopping the earlier temp apps.

Next Steps
Use `test-results/snapquote-test-results--bristol-run-1--test-1--seed-a.csv` as the trusted Bristol baseline file and `test-results/snapquote-test-results--bristol-run-2--test-5--seed-a.csv` as the trusted Bristol AI file for the next analysis pass.

---

## ENTRY TEMPLATE

Date
Test Name

Goal
Explain what the test was validating.

Services Tested

Properties Tested

Seed Used

AI Mode
(off / auto / require)

Rows Generated

Output Files
Paths to CSV files in `test-results/`

Summary of Results

Observations

Next Steps

---
