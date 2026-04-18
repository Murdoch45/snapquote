import {
  finalizeEstimate,
  getAnswerByKeys,
  getAnswerSelections,
  regionalMultiplier,
  roundCurrency,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  isPremiumProperty,
  manualReviewFlags,
  midpointBand,
  normalizeBucket,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const areaBands = {
  small: { min: 180, max: 500 },
  medium: { min: 700, max: 1500 },
  large: { min: 1800, max: 4000 },
  very_large: { min: 4200, max: 9000 }
};

export function estimateLandscaping(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["landscape_work_type", "landscape_project_type"]);
  const areaAnswer = getAnswerByKeys(context.request.answers, ["landscape_area_size"]);
  const jobType = getAnswerByKeys(context.request.answers, ["landscape_job_type", "landscape_existing_condition"]);
  const materials = getAnswerByKeys(context.request.answers, ["landscape_materials"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["landscape_access"]);
  const workSelections = getAnswerSelections(context.request.answers, "landscape_work_type");
  const materialSelections = getAnswerSelections(context.request.answers, "landscape_materials");
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/new plants|garden beds/i.test(workType)
      ? "new_plants_beds"
      : /rock|mulch/i.test(workType)
        ? "rock_or_mulch_install"
        : /sod|lawn installation/i.test(workType)
          ? "sod_or_lawn_install"
          : /yard makeover/i.test(workType)
            ? "yard_makeover"
            : /refresh existing/i.test(jobType)
              ? "refresh_existing"
              : /replace old/i.test(jobType)
                ? "replace_old"
                : /major redesign/i.test(jobType)
                  ? "major_redesign"
                  : "custom");
  const bucket = normalizeBucket(areaAnswer);
  let scope =
    context.signals.serviceSignals?.["Landscaping / Installation"]?.estimatedQuantity &&
    context.signals.serviceSignals["Landscaping / Installation"]?.quantityUnit === "sqft"
      ? context.signals.serviceSignals["Landscaping / Installation"]?.estimatedQuantity ?? 0
      : bucket === "unknown"
        ? roundCurrency(context.propertyData.estimatedBackyardSqft ?? 1200)
        : midpointBand(areaBands[bucket]);

  const materialMultiplier =
    /mixed/i.test(materials) ? 1.18 :
    /sod|turf/i.test(materials) ? 1.14 :
    /rock|mulch/i.test(materials) ? 1.1 :
    /mostly plants/i.test(materials) ? 1.04 :
    1;
  const redesignMultiplier =
    /major redesign|yard makeover/i.test(`${workType} ${jobType}`) ? 1.24 :
    /replace old/i.test(jobType) ? 1.12 :
    /new installation on bare area/i.test(jobType) ? 1.06 :
    1;
  const tearOutMultiplier = /replace old|remove|tear-out/i.test(jobType) ? 1.14 : 1;
  const blendedWorkMultiplier = workSelections.length >= 3 ? 1.14 : workSelections.length === 2 ? 1.08 : 1;
  const blendedMaterialMultiplier = materialSelections.length >= 2 ? 1.06 : 1;
  const accessMultiplier =
    resolveAccessMultiplierLabel(accessAnswer) === "difficult"
      ? 1.16
      : resolveAccessMultiplierLabel(accessAnswer) === "moderate"
        ? 1.08
        : 1;
  const premiumMultiplier = isPremiumProperty(context) ? 1.1 : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview: needsManualReview || resolvedSubtype === "major_redesign"
  });
  const internalConfidence = confidenceTrace.finalScore;

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "softscape",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft of installation area",
    tieredRates: [
      { upto: 800, rate: 5.2 },
      { upto: 2500, rate: 4.1 },
      { upto: Number.POSITIVE_INFINITY, rate: 3.15 }
    ],
    materialMultiplier:
      materialMultiplier *
      redesignMultiplier *
      tearOutMultiplier *
      premiumMultiplier *
      blendedWorkMultiplier *
      blendedMaterialMultiplier,
    accessMultiplier,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "major_redesign" ? 1200 : 350,
    internalConfidence,
    pricingDrivers: [
      "Install area sizing",
      "Material composition",
      "Refresh vs replacement scope",
      "Material-haul and site access",
      ...(workSelections.length > 1 ? ["Blended landscaping work types"] : []),
      ...(materialSelections.length > 1 ? ["Mixed landscaping materials"] : [])
    ],
    estimatorNotes: [
      ...context.signals.estimatorNotes,
      ...(workSelections.length > 1 ? [`Landscaping work types: ${workSelections.join(", ")}.`] : []),
      ...(materialSelections.length > 1 ? [`Landscape materials: ${materialSelections.join(", ")}.`] : []),
      ...(isPremiumProperty(context) ? ["Premium yard signals increased installation complexity."] : [])
    ],
    scopeReconciliation:
      context.signals.serviceSignals?.["Landscaping / Installation"]?.scopeReconciliation ?? null,
    confidenceTrace
  });
}
