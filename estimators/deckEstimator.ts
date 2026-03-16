import {
  estimatePatioOrDeckSqft,
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  manualReviewFlags,
  normalizeBucket,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const materialMultiplierMap: Record<string, number> = {
  wood: 1,
  composite: 1.24,
  "pvc or premium material": 1.34
};

export function estimateDeck(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["deck_work_type"]);
  const material = getAnswerByKeys(context.request.answers, ["deck_material"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["deck_scope", "deck_size"]);
  const areaType = getAnswerByKeys(context.request.answers, ["deck_area_type"]);
  const repairCondition = getAnswerByKeys(context.request.answers, ["deck_repair_condition"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/new deck/i.test(workType)
      ? "new_deck"
      : /replace existing/i.test(workType)
        ? "replace_existing"
        : /repair existing/i.test(workType)
          ? "repair_existing"
          : /stairs|railing/i.test(workType)
            ? "stairs_railing_work"
            : "custom");
  const scope =
    context.signals.serviceSignals?.["Deck Installation / Repair"]?.estimatedQuantity &&
    context.signals.serviceSignals["Deck Installation / Repair"]?.quantityUnit === "sqft"
      ? context.signals.serviceSignals["Deck Installation / Repair"]?.estimatedQuantity ?? 0
      : normalizeBucket(scopeAnswer) === "small"
        ? 140
        : normalizeBucket(scopeAnswer) === "medium"
          ? 260
          : normalizeBucket(scopeAnswer) === "large"
            ? 500
            : normalizeBucket(scopeAnswer) === "very_large"
              ? 820
              : estimatePatioOrDeckSqft(context.propertyData, 0.14, 140, 820);
  const structureMultiplier =
    /rooftop|specialty/i.test(areaType) ? 1.3 :
    /multi-level/i.test(areaType) ? 1.22 :
    /raised deck/i.test(areaType) ? 1.12 :
    1;
  const conditionMultiplier =
    resolvedSubtype === "repair_existing"
      ? /not applicable|not a repair/i.test(repairCondition)
        ? 1
        : /major deterioration/i.test(repairCondition)
        ? 0.92
        : /structural/i.test(repairCondition)
          ? 0.88
          : /damaged boards/i.test(repairCondition)
            ? 0.82
            : 0.74
      : 1;
  const removalMultiplier = resolvedSubtype === "replace_existing" ? 1.14 : 1;
  const stairsMultiplier = resolvedSubtype === "stairs_railing_work" ? 1.24 : 1;
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
    serviceCategory: "deck",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "sqft-equivalent deck scope",
    tieredRates: [
      { upto: 180, rate: 34 },
      { upto: 500, rate: 27 },
      { upto: Number.POSITIVE_INFINITY, rate: 21 }
    ],
    materialMultiplier:
      (materialMultiplierMap[material.toLowerCase()] ?? 1.1) * structureMultiplier * removalMultiplier * stairsMultiplier,
    conditionMultiplier,
    regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "stairs_railing_work" ? 650 : 900,
    internalConfidence: confidenceTrace.finalScore,
      pricingDrivers: [
        "Deck size",
        "Material class",
        "Raised or multi-level structure complexity",
        "Repair vs rebuild path"
      ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(resolvedSubtype === "replace_existing" ? ["Replacement path includes demolition allowance."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Deck Installation / Repair"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
