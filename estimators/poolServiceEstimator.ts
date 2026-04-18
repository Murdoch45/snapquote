import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  manualReviewFlags,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

function poolSizeFactor(sizeAnswer: string) {
  if (/extra large|resort/i.test(sizeAnswer)) return 1.5;
  if (/large/i.test(sizeAnswer)) return 1.2;
  if (/small|spa only/i.test(sizeAnswer)) return 0.82;
  return 1;
}

export function estimatePoolService(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["pool_work_type", "pool_service_type"]);
  const poolType = getAnswerByKeys(context.request.answers, ["pool_type", "pool_size"]);
  const condition = getAnswerByKeys(context.request.answers, ["pool_condition"]);
  const sizeAnswer = getAnswerByKeys(context.request.answers, ["pool_size"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["pool_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const accessLabel = /^no$/i.test(accessAnswer.trim()) ? "difficult" : resolveAccessMultiplierLabel(accessAnswer);
  const resolvedSubtype =
    subtype ??
    (/routine/i.test(workType)
      ? "routine_cleaning"
      : /green or dirty pool cleanup/i.test(workType)
        ? /green|neglected/i.test(condition)
          ? "green_pool_recovery"
          : "dirty_pool_cleanup"
        : /opening|startup/i.test(workType)
          ? "opening_startup"
          : /closing|winterizing/i.test(workType)
            ? "closing_winterizing"
            : /spa only/i.test(poolType)
              ? "spa_only"
              : /pool and spa/i.test(poolType)
                ? "pool_and_spa"
                : "custom");
  const sizeFactor = poolSizeFactor(sizeAnswer);
  const spaAddOn = /pool and spa|spa only/i.test(poolType) ? 1.18 : 1;
  const conditionFactor =
    /green|neglected/i.test(condition) ? 1.42 :
    /very dirty/i.test(condition) ? 1.25 :
    /needs normal cleaning/i.test(condition) ? 1.08 :
    1;
  const accessFactor =
    accessLabel === "difficult"
      ? 1.12
      : accessLabel === "moderate"
        ? 1.05
        : 1;
  const scope = 1;
  const tiers =
    /opening|closing/.test(resolvedSubtype)
      ? [{ upto: Number.POSITIVE_INFINITY, rate: 260 }]
      : /green_pool_recovery|dirty_pool_cleanup/.test(resolvedSubtype)
        ? [{ upto: Number.POSITIVE_INFINITY, rate: 340 }]
        : [{ upto: Number.POSITIVE_INFINITY, rate: 145 }];
  const minimumJobPrice =
    resolvedSubtype === "green_pool_recovery" ? 450 :
    resolvedSubtype === "dirty_pool_cleanup" ? 320 :
    /opening|closing/.test(resolvedSubtype) ? 240 :
    135;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const commercialSignal = Boolean(context.signals.commercialSignal || context.signals.estimatedPoolSqft && context.signals.estimatedPoolSqft > 1600);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence: context.signals.estimatedPoolSqft != null ? "strong_inference" : quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob: customJob || commercialSignal,
    needsManualReview: needsManualReview || commercialSignal
  });

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "pool",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "pool service events",
    tieredRates: tiers,
    conditionMultiplier: sizeFactor * spaAddOn * conditionFactor * (commercialSignal ? 1.2 : 1),
    accessMultiplier: accessFactor,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice,
    internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Service-event pricing",
      "Pool size and spa configuration",
      "Current pool condition",
      "Startup or cleanup complexity"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(commercialSignal ? ["Large or resort-style pool signals widened the estimate range."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Pool Service / Cleaning"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
