import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  fenceLengthFromBucket,
  manualReviewFlags,
  normalizeBucket,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

const materialMultiplierMap: Record<string, number> = {
  wood: 1.08,
  vinyl: 1.16,
  "chain link": 0.96,
  "metal or aluminum": 1.22
};

export function estimateFence(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["fence_work_type"]);
  const material = getAnswerByKeys(context.request.answers, ["fence_material"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["fence_scope", "fence_length"]);
  const siteAnswer = getAnswerByKeys(context.request.answers, ["fence_site"]);
  const repairCondition = getAnswerByKeys(context.request.answers, ["fence_repair_condition"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/new fence installation/i.test(workType)
      ? "new_install"
      : /replacement/i.test(workType)
        ? "replacement"
        : /repair/i.test(workType)
          ? "repair"
          : /gate/i.test(workType)
            ? "gate_work"
            : "custom");
  const bucket = normalizeBucket(scopeAnswer);
  const scope =
    context.signals.serviceSignals?.["Fence Installation / Repair"]?.estimatedQuantity &&
    context.signals.serviceSignals["Fence Installation / Repair"]?.quantityUnit === "linear_ft"
      ? context.signals.serviceSignals["Fence Installation / Repair"]?.estimatedQuantity ?? 0
      : fenceLengthFromBucket(context, bucket);
  const materialMultiplier = materialMultiplierMap[material.toLowerCase()] ?? 1.06;
  const terrainMultiplier =
    /heavy slope|obstacles/i.test(siteAnswer) ? 1.2 :
    /some slope|tight access/i.test(siteAnswer) ? 1.1 :
    1;
  const repairMultiplier =
    resolvedSubtype === "repair"
      ? /not applicable|not a repair/i.test(repairCondition)
        ? 1
        : /falling|missing sections/i.test(repairCondition)
        ? 0.88
        : /major/i.test(repairCondition)
          ? 0.82
          : 0.74
      : 1;
  const removalMultiplier = resolvedSubtype === "replacement" ? 1.14 : 1;
  const gateMultiplier = resolvedSubtype === "gate_work" ? 1.24 : 1;
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
    serviceCategory: "fencing",
    jobType: resolvedSubtype,
    scope,
    unitLabel: resolvedSubtype === "gate_work" ? "linear-ft equivalent gate work" : "linear ft of fence work",
    tieredRates: [
      { upto: 60, rate: 38 },
      { upto: 180, rate: 31 },
      { upto: Number.POSITIVE_INFINITY, rate: 26 }
    ],
    materialMultiplier: materialMultiplier * terrainMultiplier * removalMultiplier * gateMultiplier,
    conditionMultiplier: repairMultiplier,
    regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "gate_work" ? 450 : 350,
    internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Fence length",
      "Material class",
      "Install vs repair path",
      "Slope, access, and gate complexity"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(resolvedSubtype === "replacement" ? ["Replacement path includes removal and disposal allowance."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Fence Installation / Repair"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
