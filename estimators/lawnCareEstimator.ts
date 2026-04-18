import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  roundCurrency,
  roundToNearestTwentyFive,
  type EstimatorContext,
  type ServiceEstimate
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  isPremiumProperty,
  lawnAreaFromBucket,
  manualReviewFlags,
  normalizeBucket,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";
import { TRAVEL_DISTANCE_CAP_MILES } from "@/lib/ai/cost-models";

function applyEdgingAdjustment(estimate: ServiceEstimate): ServiceEstimate {
  const snapQuote = roundToNearestTwentyFive(estimate.snapQuote + 25);
  const lowEstimate = roundToNearestTwentyFive(Math.max(estimate.lowEstimate, snapQuote - 50));
  const highEstimate = roundToNearestTwentyFive(Math.max(estimate.highEstimate, snapQuote + 50));

  return {
    ...estimate,
    snapQuote,
    lowEstimate,
    highEstimate,
    lineItems: {
      ...estimate.lineItems,
      edging_adjustment: roundCurrency(snapQuote - estimate.snapQuote)
    }
  };
}

export function estimateLawnCare(context: EstimatorContext) {
  const travelDistanceMiles = context.propertyData.travelDistanceMiles ?? null;
  const workType = getAnswerByKeys(context.request.answers, ["lawn_work_type", "lawn_edging"]);
  const areaAnswer = getAnswerByKeys(context.request.answers, ["lawn_area_size", "lawn_grass_area_size"]);
  const conditionAnswer = getAnswerByKeys(context.request.answers, ["lawn_condition", "lawn_height"]);
  const propertyType = getAnswerByKeys(context.request.answers, ["lawn_property_type"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);

  const resolvedSubtype =
    subtype ??
    (/mowing only/i.test(workType)
      ? "mowing_only"
      : /mowing and edging/i.test(workType)
        ? "mowing_and_edging"
        : /full lawn maintenance/i.test(workType)
          ? "full_lawn_maintenance"
          : /overgrown cleanup/i.test(workType)
            ? "overgrown_cleanup"
            : "custom");
  const reconciledLawnSignal = context.signals.serviceSignals?.["Lawn Care / Maintenance"];
  const hasReconciledScope =
    Boolean(reconciledLawnSignal?.scopeReconciliation) &&
    reconciledLawnSignal?.quantityUnit === "sqft" &&
    (reconciledLawnSignal?.estimatedQuantity ?? 0) > 0;
  let scope =
    hasReconciledScope
      ? reconciledLawnSignal?.estimatedQuantity ?? 0
      : lawnAreaFromBucket(context, normalizeBucket(areaAnswer));

  // Reconciliation already applies property-area adjustments (front/back/multi-area).
  // Keep legacy scaling only for non-reconciled fallback paths.
  if (!hasReconciledScope) {
    if (/front yard only/i.test(propertyType)) scope *= 0.45;
    if (/backyard only/i.test(propertyType)) scope *= 0.6;
    if (/multi-area/i.test(propertyType)) scope *= 1.15;
  }

  const conditionMultiplier =
    /thick weeds|neglected/i.test(conditionAnswer) ? 1.32 :
    /very overgrown/i.test(conditionAnswer) ? 1.22 :
    /slightly overgrown/i.test(conditionAnswer) ? 1.1 :
    1;
  const serviceMultiplier =
    resolvedSubtype === "mowing_and_edging" ? 1.12 :
    resolvedSubtype === "full_lawn_maintenance" ? 1.22 :
    resolvedSubtype === "overgrown_cleanup" ? 1.26 :
    resolvedSubtype === "custom" ? 1.08 :
    1;
  const estateMultiplier = isPremiumProperty(context) ? 1.12 : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview
  });

  const estimate = finalizeEstimate({
    service: context.request.service,
    serviceCategory: "softscape",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft of maintainable lawn",
    tieredRates: [
      { upto: 2500, rate: 0.085 },
      { upto: 7000, rate: 0.064 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.05 }
    ],
    conditionMultiplier: conditionMultiplier * serviceMultiplier * estateMultiplier,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "overgrown_cleanup" ? 95 : 60,
    internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Maintainable turf area",
      "Service bundle",
      "Overgrowth severity",
      "Property scale and fragmentation"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(travelDistanceMiles != null && travelDistanceMiles > TRAVEL_DISTANCE_CAP_MILES
          ? [
              `Travel distance ${travelDistanceMiles} miles exceeds the ${TRAVEL_DISTANCE_CAP_MILES}-mile cap; travel multiplier held at the ${TRAVEL_DISTANCE_CAP_MILES}-mile rate.`
            ]
          : []),
        ...(isPremiumProperty(context) ? ["Large-lot or estate-scale lawn complexity applied."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Lawn Care / Maintenance"]?.scopeReconciliation ?? null,
      confidenceTrace
    });

  return resolvedSubtype === "mowing_and_edging" ? applyEdgingAdjustment(estimate) : estimate;
}
