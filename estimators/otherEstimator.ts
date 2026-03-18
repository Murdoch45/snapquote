import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  manualReviewFlags,
  normalizeBucket,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const fallbackRateMap: Record<string, Array<{ upto: number; rate: number }>> = {
  cleaning: [
    { upto: 800, rate: 0.55 },
    { upto: Number.POSITIVE_INFINITY, rate: 0.42 }
  ],
  repair: [
    { upto: 800, rate: 3.2 },
    { upto: Number.POSITIVE_INFINITY, rate: 2.45 }
  ],
  installation: [
    { upto: 800, rate: 4.8 },
    { upto: Number.POSITIVE_INFINITY, rate: 3.75 }
  ],
  removal: [
    { upto: 800, rate: 2.8 },
    { upto: Number.POSITIVE_INFINITY, rate: 2.2 }
  ],
  other: [
    { upto: 800, rate: 3.6 },
    { upto: Number.POSITIVE_INFINITY, rate: 2.8 }
  ]
};

export function estimateOther(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["other_work_type", "other_service_type"]).toLowerCase();
  const sizeAnswer = getAnswerByKeys(context.request.answers, ["other_size", "other_scope"]);
  const propertyType = getAnswerByKeys(context.request.answers, ["other_property_type", "other_property_area"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["other_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const normalizedWorkType =
    /clean/i.test(workType) ? "cleaning" :
    /repair/i.test(workType) ? "repair" :
    /install/i.test(workType) ? "installation" :
    /removal/i.test(workType) ? "removal" :
    "other";
  const scope =
    context.signals.serviceSignals?.Other?.estimatedQuantity && context.signals.serviceSignals.Other?.estimatedQuantity > 0
      ? context.signals.serviceSignals.Other?.estimatedQuantity ?? 0
      : normalizeBucket(sizeAnswer) === "small"
        ? 250
        : normalizeBucket(sizeAnswer) === "medium"
          ? 750
          : normalizeBucket(sizeAnswer) === "large"
            ? 1600
            : normalizeBucket(sizeAnswer) === "very_large"
              ? 3200
              : 900;
  const propertyMultiplier =
    /commercial/i.test(propertyType) ? 1.24 :
    /multi-unit/i.test(propertyType) ? 1.14 :
    /large home/i.test(propertyType) ? 1.08 :
    1;
  const accessMultiplier =
    resolveAccessMultiplierLabel(accessAnswer) === "difficult"
      ? 1.18
      : resolveAccessMultiplierLabel(accessAnswer) === "moderate"
        ? 1.08
        : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence,
    knownPath: false,
    usedFallbackFamily: true,
    customJob: true,
    needsManualReview: needsManualReview || true
  });

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "other",
    jobType: subtype && subtype !== "custom" ? subtype : `other_${normalizedWorkType}`,
    scope,
    unitLabel: "fallback project units",
    tieredRates: fallbackRateMap[normalizedWorkType],
    conditionMultiplier: propertyMultiplier * accessMultiplier,
    regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
    minimumJobPrice: 220,
    internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Fallback work-type table",
      "Target-family mapping",
      "Project size bucket",
      "Property and access complexity"
    ],
      estimatorNotes: [
        "Broad range due to custom or fallback-family pricing.",
        ...context.signals.estimatorNotes
      ],
      scopeReconciliation: context.signals.serviceSignals?.Other?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
