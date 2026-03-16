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
  roofAreaFromScope
} from "@/estimators/serviceEstimatorSupport";

const roofMaterialMultiplierMap: Record<string, number> = {
  shingle: 1,
  tile: 1.26,
  metal: 1.2,
  "flat roof": 1.14
};

export function estimateRoofing(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["roofing_work_type", "roofing_service_type"]);
  const roofType = getAnswerByKeys(context.request.answers, ["roofing_type", "roofing_material"]);
  const problem = getAnswerByKeys(context.request.answers, ["roofing_problem", "roofing_issue"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["roofing_scope"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["roofing_access"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const reconciledQuantity = directQuantityFromSignal(context, "sqft");
  const resolvedSubtype =
    subtype ??
    (/minor repair/i.test(workType)
      ? "minor_repair"
      : /leak repair/i.test(workType)
        ? "leak_repair"
        : /partial replacement/i.test(workType)
          ? "partial_replacement"
          : /full roof replacement/i.test(workType)
            ? "full_replacement"
            : "custom");
  const scope = reconciledQuantity.quantity ?? roofAreaFromScope(context, normalizeBucket(scopeAnswer));
  const accessMultiplier =
    resolveAccessMultiplierLabel(accessAnswer) === "difficult"
      ? 1.18
      : resolveAccessMultiplierLabel(accessAnswer) === "moderate"
        ? 1.08
        : 1;
  const severityMultiplier =
    /storm|major damage/i.test(problem) ? 1.28 :
    /leak|water/i.test(problem) ? 1.16 :
    /old roof/i.test(problem) ? 1.1 :
    1;
  const repairPathMultiplier =
    resolvedSubtype === "minor_repair"
      ? 0.2
      : resolvedSubtype === "leak_repair"
        ? 0.26
        : resolvedSubtype === "partial_replacement"
          ? 0.55
          : 1;
  const emergencyMultiplier = /storm|active leak/i.test(`${problem} ${context.description}`) ? 1.08 : 1;
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
    serviceCategory: "other",
    jobType: resolvedSubtype,
    scope: scope * repairPathMultiplier,
    unitLabel: resolvedSubtype === "full_replacement" ? "sqft of roof area" : "sqft-equivalent roof scope",
    tieredRates: [
      { upto: 900, rate: 5.6 },
      { upto: 2500, rate: 4.8 },
      { upto: Number.POSITIVE_INFINITY, rate: 4.1 }
    ],
    materialMultiplier: (roofMaterialMultiplierMap[roofType.toLowerCase()] ?? 1.08) * emergencyMultiplier,
    conditionMultiplier: severityMultiplier,
    accessMultiplier,
      regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
      minimumJobPrice:
        resolvedSubtype === "minor_repair"
        ? 425
        : resolvedSubtype === "leak_repair"
          ? 550
          : resolvedSubtype === "partial_replacement"
            ? 1400
            : 4500,
      internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Roof area or affected section",
      "Repair vs replacement path",
      "Roof material class",
      "Slope and access difficulty"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(resolvedSubtype !== "full_replacement" ? ["Partial-scope roofing uses a wider section-based uncertainty band."] : [])
      ],
      scopeReconciliation: context.signals.serviceSignals?.Roofing?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
