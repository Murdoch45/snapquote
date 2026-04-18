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

function loadCount(amount: string, signalQuantity: number | null | undefined) {
  if (signalQuantity != null && signalQuantity > 0) return signalQuantity;
  if (/few items/i.test(amount)) return 0.35;
  if (/small load/i.test(amount)) return 1;
  if (/medium load/i.test(amount)) return 1.8;
  if (/large load/i.test(amount)) return 3;
  return 1.2;
}

export function estimateJunkRemoval(context: EstimatorContext) {
  const junkType = getAnswerByKeys(context.request.answers, ["junk_type"]);
  const amount = getAnswerByKeys(context.request.answers, ["junk_amount", "junk_volume"]);
  const location = getAnswerByKeys(context.request.answers, ["junk_location"]);
  const heavyItems = getAnswerByKeys(context.request.answers, ["junk_heavy_items"]);
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const resolvedSubtype =
    subtype ??
    (/household junk/i.test(junkType)
      ? "household_junk"
      : /furniture/i.test(junkType)
        ? "furniture"
        : /yard debris/i.test(junkType)
          ? "yard_debris"
          : /construction debris/i.test(junkType)
            ? "construction_debris"
            : "custom");
  const scope = loadCount(amount, context.signals.serviceSignals?.["Junk Removal"]?.estimatedQuantity);
  const heavyMultiplier =
    /yes, many/i.test(heavyItems) ? 1.22 :
    /yes, a few/i.test(heavyItems) ? 1.12 :
    1;
  const densityMultiplier = resolvedSubtype === "construction_debris" ? 1.2 : 1;
  const extractionMultiplier =
    /inside the home|backyard|hard-to-reach/i.test(location)
      ? 1.18
      : /garage|driveway/i.test(location)
        ? 1.08
        : 1;
  const curbsideDiscount = /curbside/i.test(location) ? 0.96 : 1;
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
    serviceCategory: "demolition",
    jobType: resolvedSubtype,
    scope,
    unitLabel: "junk loads",
    tieredRates: [
      { upto: 1, rate: 230 },
      { upto: 2, rate: 205 },
      { upto: Number.POSITIVE_INFINITY, rate: 190 }
    ],
    conditionMultiplier: heavyMultiplier * densityMultiplier * extractionMultiplier * curbsideDiscount,
    regionalMultiplier: regionalMultiplier(context.regionalModel),
    minimumJobPrice: 160,
    internalConfidence: confidenceTrace.finalScore,
      pricingDrivers: [
        "Load size band",
        "Debris density",
        "Heavy item handling",
        "Extraction difficulty"
      ],
    estimatorNotes: context.signals.estimatorNotes,
    scopeReconciliation: context.signals.serviceSignals?.["Junk Removal"]?.scopeReconciliation ?? null,
    confidenceTrace
  });
}
