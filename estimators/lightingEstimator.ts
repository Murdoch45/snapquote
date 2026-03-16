import {
  finalizeEstimate,
  getAnswerByKeys,
  regionalMultiplier,
  type EstimatorContext
} from "@/estimators/shared";
import {
  confidenceTraceFromContext,
  directQuantityFromSignal,
  isPremiumProperty,
  manualReviewFlags,
  resolveServiceSignalContext
} from "@/estimators/serviceEstimatorSupport";

type LightingScopeBucket = "small" | "medium" | "large" | "multi_area";
type LightingInstallBucket = "customer_supplied" | "basic_new" | "full_new" | "add_on" | "repair";

const LIGHTING_BASE_PRICE_MATRIX: Record<LightingInstallBucket, Record<LightingScopeBucket, number>> = {
  customer_supplied: {
    small: 420,
    medium: 650,
    large: 900,
    multi_area: 1250
  },
  basic_new: {
    small: 625,
    medium: 925,
    large: 1275,
    multi_area: 1725
  },
  full_new: {
    small: 825,
    medium: 1200,
    large: 1650,
    multi_area: 2200
  },
  add_on: {
    small: 500,
    medium: 760,
    large: 1025,
    multi_area: 1400
  },
  repair: {
    small: 260,
    medium: 390,
    large: 540,
    multi_area: 720
  }
};

function resolveLightingScopeBucket(
  scopeAnswer: string,
  reconciledQuantity: number | null | undefined
): LightingScopeBucket {
  if (/one small area|small job/i.test(scopeAnswer)) return "small";
  if (/one medium-sized area|several areas on part of the property|medium job/i.test(scopeAnswer)) return "medium";
  if (/one large area|most of the front or backyard/i.test(scopeAnswer)) return "large";
  if (/multiple areas|large portion of the property or long runs|large job|very large job/i.test(scopeAnswer)) {
    return "multi_area";
  }

  if (reconciledQuantity != null && reconciledQuantity > 0) {
    if (reconciledQuantity <= 5) return "small";
    if (reconciledQuantity <= 9) return "medium";
    if (reconciledQuantity <= 12) return "large";
    return "multi_area";
  }

  return "medium";
}

function scopeUnitsForBucket(scopeBucket: LightingScopeBucket) {
  switch (scopeBucket) {
    case "small":
      return 4;
    case "medium":
      return 8;
    case "large":
      return 10;
    case "multi_area":
      return 15;
  }
}

function resolveLightingInstallBucket(workContext: string): LightingInstallBucket {
  if (/repair existing/i.test(workContext)) return "repair";
  if (/add to (an )?existing/i.test(workContext)) return "add_on";
  if (/replace existing/i.test(workContext)) return "add_on";
  if (/install lights i already have|yes, i already have the lights\/materials/i.test(workContext)) {
    return "customer_supplied";
  }
  if (/install a full new lighting system|new installation/i.test(workContext)) return "full_new";
  return "basic_new";
}

export function estimateLighting(context: EstimatorContext) {
  const lightingType = getAnswerByKeys(context.request.answers, ["lighting_type"]);
  const scopeAnswer = getAnswerByKeys(context.request.answers, ["lighting_scope"]);
  const workType = getAnswerByKeys(context.request.answers, ["lighting_work_type", "lighting_power"]);
  const materialsProvided = getAnswerByKeys(context.request.answers, ["lighting_property_type"]);
  const powerAnswer = getAnswerByKeys(context.request.answers, ["lighting_power"]);
  const installDifficulty = getAnswerByKeys(context.request.answers, ["lighting_install_difficulty"]);
  const workContext = `${workType} ${materialsProvided}`;
  const { subtype, quantityEvidence, fallbackFamily } = resolveServiceSignalContext(context);
  const reconciledQuantity = directQuantityFromSignal(context, "fixture_count");
  const resolvedSubtype =
    subtype ??
    (/(pathway|driveway)/i.test(lightingType)
      ? "pathway_lights"
      : /accent|landscape/i.test(lightingType)
        ? "accent_landscape_lights"
        : /patio|string/i.test(lightingType)
          ? "patio_string_lights"
          : /security|flood/i.test(lightingType)
            ? "security_flood_lights"
            : /replace existing/i.test(workContext)
              ? "replace_existing"
              : /add to (an )?existing/i.test(workContext)
                ? "add_to_existing"
                : /repair existing/i.test(workContext)
                  ? "repair_existing"
                  : "custom");
  const scopeBucket = resolveLightingScopeBucket(scopeAnswer, reconciledQuantity.quantity);
  const installBucket = resolveLightingInstallBucket(workContext);
  const scope = scopeUnitsForBucket(scopeBucket);
  const baseScopePrice = LIGHTING_BASE_PRICE_MATRIX[installBucket][scopeBucket];
  const powerMultiplier =
    /no/i.test(powerAnswer) ? 1.24 :
    /partly/i.test(powerAnswer) ? 1.12 :
    1;
  const propertyMultiplier =
    isPremiumProperty(context) ? 1.18 :
    1;
  const difficultyMultiplier =
    /easy access, simple install/i.test(installDifficulty) ? 0.96 :
    /some wiring or layout work needed/i.test(installDifficulty) ? 1.04 :
    /new wiring or trenching likely needed/i.test(installDifficulty) ? 1.08 :
    /complex or large-property installation/i.test(installDifficulty) ? 1.1 :
    1;
  const securityMultiplier = /security|flood/i.test(lightingType) ? 1.1 : 1;
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
    scope,
    unitLabel: "lighting scope units",
    tieredRates: [
      { upto: Number.POSITIVE_INFINITY, rate: 1 }
    ],
      baseScopeOverride: baseScopePrice,
      conditionMultiplier:
        powerMultiplier *
        propertyMultiplier *
        difficultyMultiplier *
        securityMultiplier,
      regionalMultiplier: context.signals.regionMultiplier ?? regionalMultiplier(context.regionalModel),
      minimumJobPrice: installBucket === "repair" ? 240 : 420,
      internalConfidence: confidenceTrace.finalScore,
    pricingDrivers: [
      "Scope bucket",
      "Install type bucket",
      "Power availability",
      "Difficulty and access profile",
      ...(installDifficulty ? ["Lighting-install difficulty"] : [])
    ],
      estimatorNotes: Array.from(
        new Set([
          ...context.signals.estimatorNotes,
          `Outdoor Lighting pricing used the ${scopeBucket.replace("_", "-")} scope bucket and ${installBucket.replace("_", "-")} install bucket.`
        ])
      ),
      scopeReconciliation:
        context.signals.serviceSignals?.["Outdoor Lighting Installation"]?.scopeReconciliation ?? null,
      confidenceTrace
    });
}
