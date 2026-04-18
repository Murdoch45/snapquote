import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  directQuantityFromSignal,
  manualReviewFlags,
  normalizeBucket,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext,
  storyCountFromAnswersOrSignal,
  storyHeightMultiplier
} from "@/estimators/serviceEstimatorSupport";

function weightedWindowCount(countAnswer: string, targetAnswer: string, signalCount: number | null | undefined) {
  let base =
    signalCount ??
    (/1-10/.test(countAnswer) ? 8 :
    /11-25/.test(countAnswer) ? 18 :
    /26-50/.test(countAnswer) ? 36 :
    /50\+/.test(countAnswer) ? 58 :
    16);
  if (/large exterior windows|glass doors/.test(targetAnswer)) base *= 1.35;
  if (/second-story|hard-to-reach/.test(targetAnswer)) base *= 1.12;
  if (/skylights/.test(targetAnswer)) base *= 1.4;
  return base;
}

export function estimateWindowCleaning(context: EstimatorContext) {
  const targetAnswer = getAnswerByKeys(context.request.answers, ["window_target_type", "window_scope"]);
  const countAnswer = getAnswerByKeys(context.request.answers, ["window_count"]);
  const propertyType = getAnswerByKeys(context.request.answers, ["window_property_type"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["window_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const reconciledQuantity = directQuantityFromSignal(context, "weighted_count");
  const stories = storyCountFromAnswersOrSignal(context, [propertyType, targetAnswer]);
  const resolvedSubtype =
    subtype ??
    (/large exterior windows|glass doors/i.test(targetAnswer)
      ? "oversized_windows_or_glass_doors"
      : /second-story|hard-to-reach/i.test(targetAnswer)
        ? "second_story_hard_to_reach"
        : /skylights/i.test(targetAnswer)
          ? "skylights"
          : /commercial/i.test(propertyType)
            ? "small_commercial_glass"
            : /standard exterior/i.test(targetAnswer)
              ? "standard_exterior_windows"
              : "custom");
  const scope =
    reconciledQuantity.quantity ??
    weightedWindowCount(countAnswer, targetAnswer, context.signals.estimatedWindowCount);
  const accessLabel = resolveAccessMultiplierLabel(`${accessAnswer} ${propertyType}`);
  const heavySoilMultiplier =
    /mineral|spotting|hard water|very dirty/i.test(`${context.description} ${targetAnswer}`) ? 1.12 : 1;
  const subtypeMultiplier =
    resolvedSubtype === "skylights" ? 1.18 :
    resolvedSubtype === "small_commercial_glass" ? 1.15 :
    resolvedSubtype === "oversized_windows_or_glass_doors" ? 1.08 :
    1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence: reconciledQuantity.quantity != null ? reconciledQuantity.evidence : quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview
  });

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "cleaning",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "weighted window units",
    tieredRates: [
      { upto: 15, rate: 11.5 },
      { upto: 35, rate: 9.6 },
      { upto: Number.POSITIVE_INFINITY, rate: 8.1 }
    ],
    conditionMultiplier: heavySoilMultiplier * subtypeMultiplier,
    accessMultiplier:
      storyHeightMultiplier(stories) *
      (accessLabel === "difficult" ? 1.12 : accessLabel === "moderate" ? 1.06 : 1),
      regionalMultiplier: regionalMultiplier(context.regionalModel),
      minimumJobPrice: /commercial/i.test(propertyType) ? 200 : 125,
      internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Weighted window count",
      "Height and access difficulty",
      "Oversized glass and skylight weighting",
      "Minimum service floor"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(normalizeBucket(countAnswer) === "unknown" ? ["Window quantity was inferred from property context."] : []),
        ...(needsManualReview ? ["Custom glass scope widened the estimate range."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Window Cleaning"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
