import {
  finalizeEstimate,
  getAnswerByKeys,
  getAnswerSelections,
  getServiceSignal,
  hardSurfaceAccessMultiplier,
  hardSurfaceMaterialMultiplier,
  progressiveTieredBase,
  regionalMultiplier,
  sumSurfaceMap,
  terrainMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  directQuantityFromSignal,
  hardSurfaceScopeNotes,
  manualReviewFlags,
  pressureWashingAreaFromContext,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const subtypeRates: Record<string, { tiers: Array<{ upto: number; rate: number }>; minimum: number; family: string }> = {
  driveway: {
    tiers: [
      { upto: 1000, rate: 0.34 },
      { upto: 2500, rate: 0.27 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.21 }
    ],
    minimum: 140,
    family: "flat_hardscape"
  },
  patio_porch: {
    tiers: [
      { upto: 600, rate: 0.42 },
      { upto: 1800, rate: 0.34 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.28 }
    ],
    minimum: 150,
    family: "flat_hardscape"
  },
  house_exterior: {
    tiers: [
      { upto: 1800, rate: 0.56 },
      { upto: 4200, rate: 0.48 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.4 }
    ],
    minimum: 280,
    family: "vertical_exterior_surface"
  },
  fence: {
    tiers: [
      { upto: 600, rate: 0.52 },
      { upto: 1800, rate: 0.43 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.36 }
    ],
    minimum: 180,
    family: "vertical_exterior_surface"
  },
  roof: {
    tiers: [
      { upto: 1800, rate: 0.82 },
      { upto: 3500, rate: 0.7 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.6 }
    ],
    minimum: 420,
    family: "roof_like_surface"
  },
  custom: {
    tiers: [
      { upto: 1200, rate: 0.5 },
      { upto: 3000, rate: 0.4 },
      { upto: Number.POSITIVE_INFINITY, rate: 0.33 }
    ],
    minimum: 220,
    family: "mixed_custom"
  }
};

export function estimatePressureWashing(context: EstimatorContext) {
  const targetAnswer = getAnswerByKeys(context.request.answers, ["pressure_washing_target", "pressure_area"]);
  const sizeAnswer = getAnswerByKeys(context.request.answers, ["pressure_washing_size", "pressure_size"]);
  const conditionAnswer = getAnswerByKeys(context.request.answers, ["pressure_washing_condition", "pressure_condition"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["pressure_washing_access"]);
  const signal = getServiceSignal(context.signals, context.request.service);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const reconciledQuantity = directQuantityFromSignal(context, "sqft");
  const selectedTargets = getAnswerSelections(context.request.answers, "pressure_washing_target");
  const componentTrace = signal?.scopeReconciliation?.componentTrace ?? [];
  const normalizedComponents =
    componentTrace.find((component) => component.questionKey === "pressure_washing_target")?.normalizedComponents ??
    [];
  const resolvedSubtype =
    subtype ??
    (/driveway/i.test(targetAnswer)
      ? "driveway"
      : /patio|porch/i.test(targetAnswer)
        ? "patio_porch"
        : /house exterior/i.test(targetAnswer)
          ? "house_exterior"
          : /fence/i.test(targetAnswer)
            ? "fence"
            : /roof/i.test(targetAnswer)
              ? "roof"
              : "custom");
  const pricingProfile = subtypeRates[resolvedSubtype] ?? subtypeRates.custom;
  let scope =
    reconciledQuantity.quantity ??
    pressureWashingAreaFromContext(context, targetAnswer || resolvedSubtype.replace(/_/g, " "));
  const hasQuotedSurfaceScope = sumSurfaceMap(signal?.quotedSurfaces ?? context.signals.quotedSurfaces) > 0;

  if (!hasQuotedSurfaceScope) {
    if (/small/i.test(sizeAnswer)) scope *= 0.72;
    if (/medium/i.test(sizeAnswer)) scope *= 0.95;
    if (/large/i.test(sizeAnswer)) scope *= 1.16;
    if (/whole property|very large/i.test(sizeAnswer)) scope *= 1.45;
  }

  const conditionMultiplier =
    /oil|rust|deep stains/i.test(conditionAnswer) ? 1.26 :
    /heavy staining|moss/i.test(conditionAnswer) ? 1.18 :
    /moderate/i.test(conditionAnswer) ? 1.08 :
    1;
  const accessLabel = resolveAccessMultiplierLabel(`${accessAnswer} ${signal?.accessDifficulty ?? ""}`);
  const accessMultiplier =
    accessLabel === "difficult"
      ? 1.18
      : accessLabel === "moderate"
        ? 1.08
        : context.signals.accessTypeMultiplier ?? hardSurfaceAccessMultiplier(context.signals.accessType);
  const materialMultiplier =
    pricingProfile.family === "roof_like_surface"
      ? 1.08
      : context.signals.materialMultiplier ?? hardSurfaceMaterialMultiplier(context.signals.materialType);
  const mixedJobMultiplier =
    signal?.customJobSignal || fallbackFamily === "mixed_custom" || /other/i.test(targetAnswer) ? 1.08 : 1;
  const delicateSurfacePremium =
    signal?.surfaceFamily === "delicate_specialty_surface" ? 1.12 : 1;
  const { customJob, needsManualReview } = manualReviewFlags(context);
  const componentBaseScope =
    normalizedComponents.length > 1
      ? (() => {
          const componentLabels = normalizedComponents.map((component) => component.replace(/_/g, " "));
          const weights = componentLabels.map((label) => pressureWashingAreaFromContext(context, label));
          const weightTotal = weights.reduce((sum, value) => sum + Math.max(value, 1), 0) || normalizedComponents.length;
          return normalizedComponents.reduce((sum, component, index) => {
            const componentScope = scope * (Math.max(weights[index] ?? 1, 1) / weightTotal);
            const componentProfile = subtypeRates[component] ?? subtypeRates.custom;
            return sum + progressiveTieredBase(componentScope, componentProfile.tiers);
          }, 0);
        })()
      : undefined;
  const confidenceTrace = confidenceTraceFromContext(context, {
    quantityEvidence: reconciledQuantity.quantity != null ? reconciledQuantity.evidence : quantityEvidence,
    knownPath: resolvedSubtype !== "custom",
    usedFallbackFamily: Boolean(fallbackFamily),
    customJob,
    needsManualReview,
    conflictingSignals: Boolean(targetAnswer) && resolvedSubtype === "custom" && !/other/i.test(targetAnswer)
  });
  const internalConfidence = confidenceTrace.finalScore;

  return finalizeEstimate({
    service: context.request.service,
    serviceCategory: "cleaning",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft of cleaned surface",
    tieredRates: pricingProfile.tiers,
    conditionMultiplier: conditionMultiplier * mixedJobMultiplier * delicateSurfacePremium,
    terrainMultiplier: context.signals.terrainMultiplier ?? terrainMultiplier(context.signals.terrainType),
    accessMultiplier,
    materialMultiplier,
      regionalMultiplier: regionalMultiplier(context.regionalModel),
      minimumJobPrice: pricingProfile.minimum,
    internalConfidence,
    pricingDrivers: [
      "Surface family pricing",
      "Area-based wash scope",
      "Staining severity",
      "Access and safety complexity",
      ...(selectedTargets.length > 1 ? ["Multi-surface scope blended across selected components"] : [])
    ],
    estimatorNotes: [
      ...hardSurfaceScopeNotes(context.signals.detectedSurfaces, signal?.quotedSurfaces ?? context.signals.quotedSurfaces),
      ...context.signals.estimatorNotes,
      ...(normalizedComponents.length > 1
        ? [`Pressure-wash components: ${normalizedComponents.join(", ")}.`]
        : []),
      ...(needsManualReview ? ["Custom or mixed wash scope widened the estimate range."] : [])
    ],
    terrain: context.signals.terrainType ?? null,
    access: context.signals.accessType ?? null,
      material: context.signals.materialType ?? null,
      region: context.signals.region ?? null,
      washSurfaceSqft: Math.round(scope),
      detectedSurfaces: context.signals.detectedSurfaces,
      quotedSurfaces: signal?.quotedSurfaces ?? context.signals.quotedSurfaces,
      scopeReconciliation: signal?.scopeReconciliation ?? null,
      confidenceTrace,
      baseScopeOverride: componentBaseScope
    });
}
