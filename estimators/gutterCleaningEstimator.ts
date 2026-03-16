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
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext,
  roofPerimeterFromStories,
  storyCountFromAnswersOrSignal,
  storyHeightMultiplier
} from "@/estimators/serviceEstimatorSupport";

export function estimateGutterCleaning(context: EstimatorContext) {
  const buildingType = getAnswerByKeys(context.request.answers, ["gutter_building_type", "gutter_home_size"]);
  const workType = getAnswerByKeys(context.request.answers, ["gutter_work_type", "gutter_issue"]);
  const fillLevel = getAnswerByKeys(context.request.answers, ["gutter_fill_level", "gutter_issue"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["gutter_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const reconciledQuantity = directQuantityFromSignal(context, "linear_ft");
  const stories = storyCountFromAnswersOrSignal(context, [buildingType]);
  const accessLabel =
    /landscaping or obstacles/i.test(accessAnswer) ? "moderate" : resolveAccessMultiplierLabel(accessAnswer);
  const resolvedSubtype =
    subtype ??
    (/downspout/i.test(workType)
      ? "clean_and_downspouts"
      : /repair/i.test(workType)
        ? "minor_repair"
        : /guard/i.test(workType)
          ? "gutter_guard_cleaning"
          : /clean gutters only/i.test(workType)
            ? "clean_only"
            : "custom");
  let scope = reconciledQuantity.quantity ?? roofPerimeterFromStories(context, stories);

  if (/detached garage|shed/i.test(buildingType)) scope = Math.max(40, scope * 0.35);
  const debrisMultiplier =
    /plants|heavy buildup/i.test(fillLevel) ? 1.32 :
    /overflowing|very full/i.test(fillLevel) ? 1.18 :
    /moderate/i.test(fillLevel) ? 1.08 :
    1;
  const heightMultiplier = storyHeightMultiplier(stories);
  const accessMultiplier =
    accessLabel === "difficult"
      ? 1.16
      : accessLabel === "moderate"
        ? 1.08
        : 1;
  const addOnMultiplier =
    resolvedSubtype === "clean_and_downspouts" ? 1.12 :
    resolvedSubtype === "minor_repair" ? 1.18 :
    resolvedSubtype === "gutter_guard_cleaning" ? 1.14 :
    resolvedSubtype === "custom" ? 1.08 :
    1;
  const minimumJobPrice =
    stories >= 3 ? 220 :
    stories === 2 ? 165 :
    125;
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
    unitLabel: "linear ft of gutters",
    tieredRates: [
      { upto: 160, rate: 1.85 },
      { upto: 280, rate: 1.48 },
      { upto: Number.POSITIVE_INFINITY, rate: 1.22 }
    ],
    conditionMultiplier: debrisMultiplier * addOnMultiplier,
    accessMultiplier: heightMultiplier * accessMultiplier,
      regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
      minimumJobPrice,
      internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Estimated gutter length",
      "Story height and ladder time",
      "Debris severity",
      "Downspout or repair add-ons"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(stories >= 3 ? ["Three-story or taller access increased pricing."] : []),
        ...(needsManualReview ? ["Complex gutter scope widened the range."] : [])
      ],
      scopeReconciliation: context.signals.serviceSignals?.["Gutter Cleaning"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
