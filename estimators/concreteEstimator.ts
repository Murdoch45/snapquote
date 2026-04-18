import {
  finalizeEstimate,
  getAnswerByKeys,
  getAnswerSelections,
  getServiceSignal,
  progressiveTieredBase,
  regionalMultiplier,
  terrainMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  manualReviewFlags,
  midpointBand,
  normalizeBucket,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const sizeBands = {
  small: { min: 120, max: 220 },
  medium: { min: 260, max: 600 },
  large: { min: 650, max: 1500 },
  very_large: { min: 1500, max: 2600 }
};

const subtypeRateMap: Record<string, { tiers: Array<{ upto: number; rate: number }>; minimum: number }> = {
  driveway: {
    tiers: [
      { upto: 500, rate: 18 },
      { upto: 1600, rate: 14.5 },
      { upto: Number.POSITIVE_INFINITY, rate: 12 }
    ],
    minimum: 1600
  },
  patio: {
    tiers: [
      { upto: 400, rate: 16.5 },
      { upto: 1200, rate: 13.2 },
      { upto: Number.POSITIVE_INFINITY, rate: 11 }
    ],
    minimum: 900
  },
  walkway: {
    tiers: [
      { upto: 250, rate: 18.5 },
      { upto: 600, rate: 15.5 },
      { upto: Number.POSITIVE_INFINITY, rate: 13.5 }
    ],
    minimum: 750
  },
  slab_pad: {
    tiers: [
      { upto: 300, rate: 15.5 },
      { upto: 1000, rate: 12.8 },
      { upto: Number.POSITIVE_INFINITY, rate: 10.8 }
    ],
    minimum: 780
  },
  repair_resurfacing: {
    tiers: [
      { upto: 250, rate: 9.8 },
      { upto: 800, rate: 8.6 },
      { upto: Number.POSITIVE_INFINITY, rate: 7.4 }
    ],
    minimum: 650
  },
  extension_addition: {
    tiers: [
      { upto: 250, rate: 17.5 },
      { upto: 900, rate: 14.4 },
      { upto: Number.POSITIVE_INFINITY, rate: 12.4 }
    ],
    minimum: 820
  },
  mixed: {
    tiers: [
      { upto: 500, rate: 17.2 },
      { upto: 1400, rate: 14.4 },
      { upto: Number.POSITIVE_INFINITY, rate: 12.2 }
    ],
    minimum: 950
  },
  custom: {
    tiers: [
      { upto: 500, rate: 16.8 },
      { upto: 1400, rate: 13.9 },
      { upto: Number.POSITIVE_INFINITY, rate: 11.8 }
    ],
    minimum: 950
  }
};

function baseQuantityFromScope(scopeAnswer: string) {
  const bucket = normalizeBucket(scopeAnswer);
  if (bucket === "unknown") return 420;
  return midpointBand(sizeBands[bucket]);
}

export function estimateConcrete(context: EstimatorContext) {
  const projectType = getAnswerByKeys(context.request.answers, ["concrete_project_type"]);
  const workType = getAnswerByKeys(context.request.answers, ["concrete_work_type", "concrete_timing"]);
  const materialAnswer = getAnswerByKeys(context.request.answers, ["concrete_material"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["concrete_scope"]);
  const siteAnswer = getAnswerByKeys(context.request.answers, ["concrete_site_condition", "concrete_timing"]);
  const signal = getServiceSignal(context.signals, context.request.service);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const selectedProjects = getAnswerSelections(context.request.answers, "concrete_project_type");
  const normalizedComponents =
    signal?.scopeReconciliation?.componentTrace?.find((component) => component.questionKey === "concrete_project_type")
      ?.normalizedComponents ?? [];
  const resolvedSubtype =
    subtype ??
    (/repair|resurfac/i.test(workType)
      ? "repair_resurfacing"
      : /extension|addition/i.test(workType)
        ? "extension_addition"
        : /driveway/i.test(projectType)
      ? "driveway"
      : /patio/i.test(projectType)
        ? "patio"
        : /walkway/i.test(projectType)
          ? "walkway"
          : /slab|pad/i.test(projectType)
            ? "slab_pad"
            : /other/i.test(projectType)
                  ? "custom"
                  : "mixed");
  const rateProfile = subtypeRateMap[resolvedSubtype] ?? subtypeRateMap.custom;
  let scope =
    signal?.estimatedQuantity && signal.quantityUnit === "sqft"
      ? signal.estimatedQuantity
      : baseQuantityFromScope(scopeAnswer);

  if (resolvedSubtype === "walkway" && scope < 180) scope = 180;
  if (resolvedSubtype === "driveway" && scope < 500) scope = 500;
  if (resolvedSubtype === "repair_resurfacing") scope *= 0.82;
  if (resolvedSubtype === "extension_addition") scope *= 0.9;

  const materialMultiplier =
    /stamped|decorative/i.test(materialAnswer) ? 1.24 :
    /brick|stone/i.test(materialAnswer) ? 1.35 :
    /exposed aggregate|specialty/i.test(materialAnswer) ? 1.2 :
    1;
  const removalMultiplier = /replacement|removal|old concrete/i.test(`${workType} ${siteAnswer}`) ? 1.16 : 1;
  const prepMultiplier = /grading|prep|dirt/i.test(siteAnswer) ? 1.12 : 1;
  const accessMultiplier =
    resolveAccessMultiplierLabel(siteAnswer) === "difficult"
      ? 1.14
      : resolveAccessMultiplierLabel(siteAnswer) === "moderate"
        ? 1.06
        : 1;
  const extensionMultiplier = resolvedSubtype === "extension_addition" ? 1.08 : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const componentBaseScope =
    normalizedComponents.length > 1 && !["repair_resurfacing", "extension_addition"].includes(resolvedSubtype)
      ? (() => {
          const weightMap: Record<string, number> = {
            driveway: 1,
            patio: 0.85,
            walkway: 0.42,
            slab_pad: 0.55,
            custom: 0.65
          };
          const totalWeight =
            normalizedComponents.reduce((sum, component) => sum + (weightMap[component] ?? 0.65), 0) ||
            normalizedComponents.length;
          return normalizedComponents.reduce((sum, component) => {
            const componentWeight = weightMap[component] ?? 0.65;
            const componentScope = scope * (componentWeight / totalWeight);
            const componentProfile = subtypeRateMap[component] ?? subtypeRateMap.custom;
            return sum + progressiveTieredBase(componentScope, componentProfile.tiers);
          }, 0);
        })()
      : undefined;
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence,
    knownPath: !["mixed", "custom"].includes(resolvedSubtype),
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview,
    conflictingSignals: Boolean(projectType) && resolvedSubtype === "custom" && !/other/i.test(projectType)
  });
  const internalConfidence = confidenceTrace.finalScore;

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "hardscape",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft of concrete scope",
    tieredRates: rateProfile.tiers,
    materialMultiplier: materialMultiplier * removalMultiplier * prepMultiplier * extensionMultiplier,
    conditionMultiplier: /repair|resurfac/i.test(workType) ? 0.86 : 1,
    terrainMultiplier: context.signals.terrainMultiplier ?? terrainMultiplier(context.signals.terrainType),
    accessMultiplier,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: rateProfile.minimum,
    internalConfidence,
    pricingDrivers: [
      "Concrete subtype pricing",
      "Area-based production rate",
      "Finish and material class",
      "Removal and prep requirements",
      ...(selectedProjects.length > 1 ? ["Multi-component concrete scope reconciled across selected project types"] : [])
    ],
    estimatorNotes: [
      ...context.signals.estimatorNotes,
      ...(normalizedComponents.length > 1
        ? [`Concrete components: ${normalizedComponents.join(", ")}.`]
        : []),
      ...(needsManualReview ? ["Complex concrete scope widened the estimate range."] : [])
    ],
    scopeReconciliation: signal?.scopeReconciliation ?? null,
    confidenceTrace,
    baseScopeOverride: componentBaseScope
  });
}
