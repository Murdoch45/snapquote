# Estimator System

## Estimator Pipeline

Customer request form
-> service questions
-> property lookup
-> AI interpretation
-> signal normalization
-> deterministic estimator
-> estimate output

## Key Components

AI Interpretation
`lib/ai/estimate.ts`

Deterministic Estimator
`estimators/estimateEngine.ts`

Service Question Configuration
`lib/serviceQuestions.ts`

Test Runner
`scripts/run-estimator-tests.ts`

## Design Principles

* Pricing must remain deterministic
* AI is used only as an interpretation layer
* AI signals must be normalized and capped
* Estimator results must remain reproducible through testing
