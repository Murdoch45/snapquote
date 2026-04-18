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
  paintAreaFromScope,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext,
  storyCountFromAnswersOrSignal,
  storyHeightMultiplier
} from "@/estimators/serviceEstimatorSupport";

const surfaceMultiplierMap: Record<string, number> = {
  stucco: 1.06,
  wood: 1,
  siding: 1.02,
  "brick or masonry": 1.18
};

export function estimatePainting(context: EstimatorContext) {
  const target = getAnswerByKeys(context.request.answers, ["painting_target", "painting_surface"]);
  const surfaceType = getAnswerByKeys(context.request.answers, ["painting_surface_type", "painting_exterior_surface"]);
  const condition = getAnswerByKeys(context.request.answers, ["painting_condition"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["painting_scope", "painting_size"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["painting_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/full house exterior/i.test(target)
      ? "full_house_exterior"
      : /partial exterior/i.test(target)
        ? "partial_exterior"
        : /trim|doors|garage/i.test(target)
          ? "trim_doors_garage"
          : /fence|detached/i.test(target)
            ? "fence_or_detached_structure"
            : "custom");
  const scope =
    context.signals.serviceSignals?.["Exterior Painting"]?.estimatedQuantity &&
    context.signals.serviceSignals["Exterior Painting"]?.quantityUnit === "sqft"
      ? context.signals.serviceSignals["Exterior Painting"]?.estimatedQuantity ?? 0
      : paintAreaFromScope(context, target, normalizeBucket(scopeAnswer));
  const stories = storyCountFromAnswersOrSignal(context, [accessAnswer, target]);
  const prepMultiplier =
    /needs prep and repairs/i.test(condition) ? 1.26 :
    /heavy peeling|damage/i.test(condition) ? 1.2 :
    /minor peeling|wear/i.test(condition) ? 1.1 :
    1;
  const accessMultiplier =
    storyHeightMultiplier(stories) *
    (resolveAccessMultiplierLabel(accessAnswer) === "difficult"
      ? 1.12
      : resolveAccessMultiplierLabel(accessAnswer) === "moderate"
        ? 1.05
        : 1);
  const trimHeavyMultiplier = resolvedSubtype === "trim_doors_garage" ? 1.18 : 1;
  const detachedMultiplier = resolvedSubtype === "fence_or_detached_structure" ? 1.12 : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview
  });

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "other",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft of paintable surface",
    tieredRates: [
      { upto: 1200, rate: 2.9 },
      { upto: 3500, rate: 2.3 },
      { upto: Number.POSITIVE_INFINITY, rate: 1.9 }
    ],
    materialMultiplier:
      (surfaceMultiplierMap[surfaceType.toLowerCase()] ?? 1.05) * trimHeavyMultiplier * detachedMultiplier,
    conditionMultiplier: prepMultiplier,
    accessMultiplier,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "trim_doors_garage" ? 450 : 850,
    internalConfidence: confidenceTrace.finalScore,
      pricingDrivers: [
        "Paintable area",
        "Surface type",
        "Prep and repair severity",
        "Height and access difficulty"
      ],
      estimatorNotes: context.signals.estimatorNotes,
      scopeReconciliation:
        context.signals.serviceSignals?.["Exterior Painting"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
