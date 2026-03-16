# SnapQuote AI Development Workflow

Codex must follow these workflow rules when working in this repository.

---

## TESTING RULE

Whenever a task involves running tests, Codex must automatically log the results.

Triggers include prompts containing words such as:

* test
* testing
* run estimator tests
* regression
* validation run
* run test script
* targeted regression

When such tasks occur, Codex must:

1. Execute the requested test script.
2. Store output CSV files in the `test-results/` folder.
3. Append a structured entry to:

`docs/testing-log.md`

The entry must follow the testing log template.

Never overwrite existing entries.
Always append a new entry.

---

## LOGGING TEST DETAILS

Each logged test entry must include:

* date
* test name
* goal of the test
* services tested
* properties tested
* seed used
* AI mode
* number of rows generated
* paths to CSV output files
* summary of results
* observations
* next steps

---

## CHANGE TRACKING RULE

Whenever estimator logic or AI interpretation behavior is modified, Codex must append an entry to:

`docs/change-log.md`

Examples include:

* AI interpretation normalization changes
* estimator pricing logic updates
* service question modifications

---

## DOCUMENTATION SAFETY RULES

Codex must NOT:

* modify estimator pricing logic unless explicitly requested
* reorganize application source folders
* create unnecessary documentation complexity

Documentation must remain lightweight and readable.
