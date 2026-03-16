# Estimator Playbook

This is the current estimator architecture reference for SnapQuote.

## Live Backbone

1. `POST /api/public/lead-submit` stores the lead, `service_question_answers`, photos, and schedules `generateEstimateAsync()`.
2. `generateEstimateAsync()` loads the lead, contractor profile, and photos, then calls `generateEstimate()`.
3. `generateEstimate()` resolves property data with `getPropertyData()`, calls OpenAI for structured signals when available, and falls back to deterministic heuristic signals when not.
4. `estimateEngine()` routes each requested service into its deterministic service estimator.
5. Shared aggregation applies region/luxury/global confidence logic and writes the estimate fields back onto the lead.

## Core Rule

- AI interprets.
- Logic prices.

The AI layer should output structured normalized signals only. Dollar pricing stays in estimator code.

## Current Shared Files

- [estimate.ts](/c:/Users/murdo/SnapQuote/lib/ai/estimate.ts)
- [shared.ts](/c:/Users/murdo/SnapQuote/estimators/shared.ts)
- [serviceEstimatorSupport.ts](/c:/Users/murdo/SnapQuote/estimators/serviceEstimatorSupport.ts)
- [estimateEngine.ts](/c:/Users/murdo/SnapQuote/estimators/estimateEngine.ts)
- [serviceQuestions.ts](/c:/Users/murdo/SnapQuote/lib/serviceQuestions.ts)

## Current Expectations

- Use the canonical 15-service question sets in `lib/serviceQuestions.ts`.
- Keep `service_question_answers` backward-compatible: support legacy keys in estimator logic when practical.
- Feed questionnaire answers, `*_other_text`, description, uploaded photos, property data, and satellite context into signal extraction.
- Prefer known subtype pricing paths first, then fallback-family pricing paths.
- Use quantity units that match the service instead of forcing everything into square feet.
- Keep confidence deterministic and evidence-based.

## Obsolete References

Older estimator-template guidance and the previous lawn-centric instructions were removed during the refactor because they no longer match the live execution path.
