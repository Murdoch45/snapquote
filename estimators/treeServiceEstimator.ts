import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  manualReviewFlags,
  resolveAccessMultiplierLabel,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

function treeCount(workType: string, signalQuantity: number | null | undefined) {
  if (signalQuantity != null && signalQuantity > 0) return signalQuantity;
  if (/remove one tree/i.test(workType)) return 1;
  if (/remove multiple trees/i.test(workType)) return 3;
  return 2;
}

function sizeMultiplier(sizeAnswer: string) {
  if (/very large/i.test(sizeAnswer)) return 2.2;
  if (/large/i.test(sizeAnswer)) return 1.7;
  if (/medium/i.test(sizeAnswer)) return 1.25;
  return 1;
}

export function estimateTreeService(context: EstimatorContext) {
  const workType = getAnswerByKeys(context.request.answers, ["tree_work_type", "tree_service_type"]);
  const sizeAnswer = getAnswerByKeys(context.request.answers, ["tree_size"]);
  const location = getAnswerByKeys(context.request.answers, ["tree_location", "tree_access"]);
  const accessAnswer = getAnswerByKeys(context.request.answers, ["tree_access"]);
  const haulAway = getAnswerByKeys(context.request.answers, ["tree_haul_away"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/trim|cut back/i.test(workType)
      ? "trim_cut_back"
      : /remove one tree/i.test(workType)
        ? "remove_one_tree"
        : /remove multiple trees/i.test(workType)
          ? "remove_multiple_trees"
          : /stump grinding/i.test(workType)
            ? "stump_grinding"
            : "custom");
  const count = treeCount(workType, context.signals.serviceSignals?.["Tree Service / Removal"]?.estimatedQuantity);
  const scope = count * sizeMultiplier(sizeAnswer);
  const riskMultiplier =
    /power lines/i.test(location) ? 1.32 :
    /near fence|structure/i.test(location) ? 1.18 :
    1;
  const accessMultiplier =
    resolveAccessMultiplierLabel(`${location} ${accessAnswer}`) === "difficult"
      ? 1.22
      : resolveAccessMultiplierLabel(`${location} ${accessAnswer}`) === "moderate"
        ? 1.1
        : 1;
  const haulAwayMultiplier = /yes/i.test(haulAway) ? 1.12 : 1;
  const serviceRate =
    resolvedSubtype === "stump_grinding"
      ? [
          { upto: 3, rate: 180 },
          { upto: Number.POSITIVE_INFINITY, rate: 150 }
        ]
      : [
          { upto: 2, rate: 460 },
          { upto: 6, rate: 390 },
          { upto: Number.POSITIVE_INFINITY, rate: 340 }
        ];
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
    unitLabel: resolvedSubtype === "stump_grinding" ? "stump-equivalent units" : "tree work units",
    tieredRates: serviceRate,
    conditionMultiplier: riskMultiplier * haulAwayMultiplier,
    accessMultiplier,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: resolvedSubtype === "stump_grinding" ? 250 : 350,
    internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Tree count and size",
      "Removal vs trimming path",
      "Risk proximity to structures or power lines",
      "Haul-away and extraction difficulty"
    ],
      estimatorNotes: [
        ...context.signals.estimatorNotes,
        ...(/power lines/i.test(location) ? ["Power-line proximity increased hazard pricing."] : [])
      ],
      scopeReconciliation:
        context.signals.serviceSignals?.["Tree Service / Removal"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
