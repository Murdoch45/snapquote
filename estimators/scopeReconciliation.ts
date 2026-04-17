import type { PropertyData } from "@/lib/property-data";
import {
  clamp,
  estimateDrivewaySqft,
  estimateFenceLinearFt,
  estimateMowableArea,
  estimatePaintableArea,
  estimatePatioOrDeckSqft,
  estimateRoofArea,
  estimateRoofPerimeter,
  getAnswerSelections,
  getAnswerByKeys,
  roundCurrency,
  sumSurfaceMap,
  type AiEstimatorSignals,
  type CanonicalService,
  type NormalizedServiceSignal,
  type QuantityEvidence,
  type QuantityUnit,
  type ScopeReconciliationTrace,
  type ServiceRequest,
  type SizeBucket
} from "@/estimators/shared";
import { normalizeBucket, serviceComponentTraceFromAnswers } from "@/estimators/serviceEstimatorSupport";

type RangeBand = { min: number; max: number };
type QuantitySource = {
  quantity: number;
  unit: QuantityUnit;
  label: string;
  source: string;
  band?: RangeBand | null;
};
type ServiceProfile = {
  unit: QuantityUnit;
  questionnaireAnchor?: QuantitySource | null;
  propertyHint?: QuantitySource | null;
  sanityBand?: QuantitySource | null;
  fallbackQuantity?: number | null;
};
type ReconcileScopeInput = {
  request: ServiceRequest;
  propertyData: PropertyData;
  description: string;
  photoCount: number;
  signals: AiEstimatorSignals;
  signal?: NormalizedServiceSignal;
};

const SERVICE_EVENT_BAND: RangeBand = { min: 1, max: 1 };

function midpointBand(band: RangeBand) {
  return roundCurrency((band.min + band.max) / 2);
}

function roundBandValue(value: number, minFloor: number) {
  const clampedValue = Math.max(minFloor, value);
  return minFloor < 1 ? Number(clampedValue.toFixed(2)) : roundCurrency(clampedValue);
}

function bucketBand(
  bucket: SizeBucket,
  bands: Record<Exclude<SizeBucket, "unknown">, RangeBand>,
  fallback: RangeBand
) {
  return bucket === "unknown" ? fallback : bands[bucket];
}

function scaleBand(band: RangeBand, multiplier: number, minFloor = 1): RangeBand {
  return {
    min: roundBandValue(band.min * multiplier, minFloor),
    max: roundBandValue(band.max * multiplier, minFloor)
  };
}

function storyCountFromText(text: string, fallback = 1) {
  if (/three-story|three story|three-story or taller|three\+/.test(text)) return 3;
  if (/two-story|two story|two-story home/.test(text)) return 2;
  return fallback;
}

function factorForStories(stories: number) {
  if (stories >= 3) return 1.22;
  if (stories === 2) return 1.1;
  return 1;
}

function strengthFromEvidenceScore(score: number): ScopeReconciliationTrace["reconciliationStrength"] {
  if (score >= 82) return "strong";
  if (score >= 66) return "moderate";
  return "weak";
}

function quantityEvidenceBase(evidence: QuantityEvidence | null | undefined) {
  switch (evidence) {
    case "direct":
      return 90;
    case "strong_inference":
      return 74;
    case "weak_inference":
      return 58;
    default:
      return 46;
  }
}

function differencePct(base: number, candidate: number) {
  if (base <= 0 || candidate <= 0) return 0;
  return Math.abs(candidate - base) / Math.max(base, 1);
}

function stableCenter(profile: ServiceProfile) {
  if (profile.questionnaireAnchor && profile.propertyHint) {
    return roundCurrency(profile.questionnaireAnchor.quantity * 0.62 + profile.propertyHint.quantity * 0.38);
  }

  if (profile.questionnaireAnchor) return profile.questionnaireAnchor.quantity;
  if (profile.propertyHint) return profile.propertyHint.quantity;
  return null;
}

function stableQuantityStep(unit: QuantityUnit, quantity: number) {
  switch (unit) {
    case "sqft":
      if (quantity >= 12000) return 500;
      if (quantity >= 5000) return 250;
      if (quantity >= 1500) return 100;
      if (quantity >= 400) return 50;
      return 25;
    case "linear_ft":
      if (quantity >= 300) return 25;
      if (quantity >= 100) return 10;
      return 5;
    case "load":
      return 0.25;
    case "count":
    case "weighted_count":
    case "tree_count":
    case "stump_count":
    case "visit":
    case "fixture_count":
    case "zone_count":
    case "roof_square":
    case "section":
    case "component_count":
    case "service_event":
    default:
      return 1;
  }
}

function quantizeQuantity(value: number, unit: QuantityUnit) {
  const step = stableQuantityStep(unit, value);
  if (step < 1) {
    return Number((Math.round(value / step) * step).toFixed(2));
  }

  return roundCurrency(Math.round(value / step) * step);
}

function softClamp(
  value: number,
  band: RangeBand,
  strength: ScopeReconciliationTrace["reconciliationStrength"],
  evidenceScore: number
) {
  const span = Math.max(1, band.max - band.min);
  const expansion =
    span *
    (strength === "strong"
      ? evidenceScore >= 90
        ? 1.1
        : 0.7
      : strength === "moderate"
        ? 0.35
        : 0.14);
  return clamp(value, Math.max(0, band.min - expansion), band.max + expansion);
}

function inferredAiDamping(
  strength: ScopeReconciliationTrace["reconciliationStrength"],
  driftFromStableAnchor: number
) {
  if (strength === "strong") {
    return driftFromStableAnchor <= 0.28 ? 0.22 : 0.12;
  }
  if (strength === "moderate") {
    return driftFromStableAnchor <= 0.28 ? 0.14 : 0.08;
  }
  return 0.05;
}

function inferredAiDriftAllowance(
  profile: ServiceProfile,
  stableAnchor: number,
  strength: ScopeReconciliationTrace["reconciliationStrength"],
  evidenceScore: number
) {
  const anchoredSourceCount = Number(Boolean(profile.questionnaireAnchor)) + Number(Boolean(profile.propertyHint));
  const referenceBand = profile.questionnaireAnchor?.band ?? profile.sanityBand?.band ?? null;
  const referenceSpan = referenceBand ? Math.max(1, referenceBand.max - referenceBand.min) : 0;
  const basePct =
    anchoredSourceCount >= 2
      ? strength === "strong"
        ? 0.18
        : strength === "moderate"
          ? 0.12
          : 0.08
      : strength === "strong"
        ? 0.24
        : strength === "moderate"
          ? 0.16
          : 0.1;
  const spanBuffer = referenceSpan * (anchoredSourceCount >= 2 ? 0.18 : 0.28);
  const evidenceBuffer = evidenceScore >= 90 ? (profile.unit === "load" ? 0.05 : 0.5) : 0;
  const minBuffer = profile.unit === "load" ? 0.25 : 1;

  return Math.max(minBuffer, stableAnchor * basePct + spanBuffer + evidenceBuffer);
}

function selectAiProposal(input: ReconcileScopeInput, unit: QuantityUnit) {
  const signal = input.signal;
  if (signal?.estimatedQuantity != null && signal.estimatedQuantity > 0 && signal.quantityUnit === unit) {
    return {
      quantity: roundCurrency(signal.estimatedQuantity),
      unit,
      evidence: signal.quantityEvidence ?? "fallback",
      confidence: signal.aiConfidence ?? null
    };
  }
  if (input.request.service === "Window Cleaning" && unit === "weighted_count" && input.signals.estimatedWindowCount != null) {
    return {
      quantity: roundCurrency(input.signals.estimatedWindowCount),
      unit,
      evidence: "strong_inference" as const,
      confidence: signal?.aiConfidence ?? null
    };
  }
  if (
    input.request.service === "Outdoor Lighting Installation" &&
    unit === "fixture_count" &&
    input.signals.estimatedFixtureCount != null
  ) {
    return {
      quantity: roundCurrency(input.signals.estimatedFixtureCount),
      unit,
      evidence: "strong_inference" as const,
      confidence: signal?.aiConfidence ?? null
    };
  }
  return null;
}

function estimateConcreteHint(propertyData: PropertyData, subtype: string | null | undefined) {
  switch (subtype) {
    case "driveway":
      return roundCurrency(
        clamp(
          Math.max(
            estimateDrivewaySqft(propertyData),
            (propertyData.houseSqft ?? propertyData.lotSizeSqft ?? 1600) * 0.45
          ),
          220,
          2200
        )
      );
    case "patio":
      return estimatePatioOrDeckSqft(propertyData, 0.12, 120, 950);
    case "walkway":
      return roundCurrency(clamp((propertyData.houseSqft ?? 1800) * 0.09, 90, 420));
    default:
      return roundCurrency(
        clamp((propertyData.estimatedBackyardSqft ?? propertyData.lotSizeSqft ?? 2400) * 0.1, 120, 900)
      );
  }
}

function estimatePressureHint(input: ReconcileScopeInput, subtype: string | null | undefined) {
  const quoted = input.signal?.quotedSurfaces ?? input.signals.quotedSurfaces;
  switch (subtype) {
    case "driveway":
      return roundCurrency(Math.max(quoted?.driveway ?? 0, estimateDrivewaySqft(input.propertyData)));
    case "patio_porch":
      return roundCurrency(
        Math.max(quoted?.patio ?? 0, estimatePatioOrDeckSqft(input.propertyData, 0.12, 120, 900))
      );
    case "house_exterior":
      return roundCurrency(clamp(estimatePaintableArea(input.propertyData) * 0.42, 600, 3800));
    case "fence":
      return roundCurrency(clamp(estimateFenceLinearFt(input.propertyData) * 6.5, 180, 2400));
    case "roof":
      return roundCurrency(clamp(estimateRoofArea(input.propertyData) * 0.72, 900, 4200));
    default:
      return roundCurrency(
        Math.max(
          sumSurfaceMap(quoted),
          estimateDrivewaySqft(input.propertyData) +
            estimatePatioOrDeckSqft(input.propertyData, 0.1, 120, 700)
        )
      );
  }
}

function mergeComponentQuantities(values: number[], overlapPerExtra: number, minFactor = 0.72) {
  if (values.length === 0) return 0;
  if (values.length === 1) return roundCurrency(values[0]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const factor = Math.max(minFactor, 1 - overlapPerExtra * (values.length - 1));
  return roundCurrency(total * factor);
}

function buildServiceProfile(input: ReconcileScopeInput): ServiceProfile {
  const subtype = input.signal?.jobSubtype ?? null;

  switch (input.request.service) {
    case "Pressure Washing": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["pressure_washing_size"]));
      const selectedTargets = getAnswerSelections(input.request.answers, "pressure_washing_target");
      const pressureComponents =
        selectedTargets.length > 0 ? selectedTargets.map((option) => option.toLowerCase()) : [subtype ?? "custom"];
      const familyBands =
        subtype === "roof"
          ? {
              small: { min: 700, max: 1200 },
              medium: { min: 1200, max: 2200 },
              large: { min: 2200, max: 3600 },
              very_large: { min: 3600, max: 5200 }
            }
          : subtype === "house_exterior" || subtype === "fence"
            ? {
                small: { min: 250, max: 700 },
                medium: { min: 700, max: 1600 },
                large: { min: 1600, max: 3000 },
                very_large: { min: 3000, max: 4600 }
              }
            : {
                small: { min: 180, max: 500 },
                medium: { min: 500, max: 1200 },
                large: { min: 1200, max: 2500 },
                very_large: { min: 2500, max: 4500 }
              };
      const band = bucketBand(bucket, familyBands, familyBands.medium);
      const componentHints = pressureComponents.map((component) =>
        estimatePressureHint(
          input,
          /driveway/.test(component)
            ? "driveway"
            : /patio|porch/.test(component)
              ? "patio_porch"
              : /house exterior/.test(component)
                ? "house_exterior"
                : /fence/.test(component)
                  ? "fence"
                  : /roof/.test(component)
                    ? "roof"
                    : subtype
        )
      );
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "pressure washing anchor",
          source: "questionnaire_size_bucket",
          band
        },
        propertyHint: {
          quantity:
            selectedTargets.length > 1
              ? mergeComponentQuantities(componentHints, 0.1, 0.76)
              : estimatePressureHint(input, subtype),
          unit: "sqft",
          label: "surface/property hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 150)),
          unit: "sqft",
          label: "pressure washing sanity band",
          source: "service_family",
          band: scaleBand(band, 1.2, 150)
        }
      };
    }
    case "Gutter Cleaning": {
      const building = getAnswerByKeys(input.request.answers, ["gutter_building_type"]);
      const stories = storyCountFromText(building, input.signal?.stories ?? 1);
      const band =
        /detached garage|shed/i.test(building)
          ? { min: 45, max: 90 }
          : stories >= 3
            ? { min: 210, max: 360 }
            : stories === 2
              ? { min: 150, max: 260 }
              : { min: 110, max: 180 };
      return {
        unit: "linear_ft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "linear_ft",
          label: "gutter length anchor",
          source: "questionnaire_building_type",
          band
        },
        propertyHint: {
          quantity: roundCurrency(estimateRoofPerimeter(input.propertyData) * factorForStories(stories)),
          unit: "linear_ft",
          label: "roofline perimeter hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.15, 35)),
          unit: "linear_ft",
          label: "gutter sanity band",
          source: "property_scale",
          band: scaleBand(band, 1.15, 35)
        }
      };
    }
    case "Window Cleaning": {
      const countAnswer = getAnswerByKeys(input.request.answers, ["window_count"]);
      const targetAnswer = getAnswerByKeys(input.request.answers, ["window_target_type"]);
      const propertyType = getAnswerByKeys(input.request.answers, ["window_property_type"]);
      const stories = storyCountFromText(`${propertyType} ${targetAnswer}`, input.signal?.stories ?? 1);
      let band =
        /1-10/.test(countAnswer)
          ? { min: 6, max: 12 }
          : /11-25/.test(countAnswer)
            ? { min: 14, max: 28 }
            : /26-50/.test(countAnswer)
              ? { min: 30, max: 60 }
              : /50\+/.test(countAnswer)
                ? { min: 54, max: 90 }
                : { min: 12, max: 24 };
      if (/large exterior windows|glass doors/i.test(targetAnswer)) band = scaleBand(band, 1.3, 4);
      if (/skylights/i.test(targetAnswer)) band = scaleBand(band, 1.4, 4);
      if (/second-story|hard-to-reach/i.test(targetAnswer)) band = scaleBand(band, 1.1, 4);
      const commercial = /commercial/i.test(propertyType);
      const sanityBand = commercial
        ? { min: 20, max: 120 }
        : scaleBand({ min: 8, max: 48 }, factorForStories(stories), 8);
      return {
        unit: "weighted_count",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "weighted_count",
          label: "window count anchor",
          source: "questionnaire_count_band",
          band
        },
        propertyHint: {
          quantity: commercial
            ? 42
            : roundCurrency(clamp((input.propertyData.houseSqft ?? 1800) / 110, 8, 46) * factorForStories(stories)),
          unit: "weighted_count",
          label: "property window-count hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(sanityBand),
          unit: "weighted_count",
          label: "window sanity band",
          source: "property_type",
          band: sanityBand
        }
      };
    }
    case "Pool Service / Cleaning":
      return {
        unit: "service_event",
        questionnaireAnchor: {
          quantity: 1,
          unit: "service_event",
          label: "single service event",
          source: "service_model",
          band: SERVICE_EVENT_BAND
        },
        propertyHint: {
          quantity: 1,
          unit: "service_event",
          label: "service event",
          source: "service_model"
        },
        sanityBand: {
          quantity: 1,
          unit: "service_event",
          label: "service-event sanity band",
          source: "service_model",
          band: SERVICE_EVENT_BAND
        },
        fallbackQuantity: 1
      };
    case "Lawn Care / Maintenance": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["lawn_area_size"]));
      const propertyType = getAnswerByKeys(input.request.answers, ["lawn_property_type"]);
      let band = bucketBand(
        bucket,
        {
          small: { min: 500, max: 2000 },
          medium: { min: 2000, max: 5000 },
          large: { min: 5000, max: 10000 },
          very_large: { min: 10000, max: 18000 }
        },
        { min: 1800, max: 5000 }
      );
      if (/front yard only/i.test(propertyType)) band = scaleBand(band, 0.45, 250);
      if (/backyard only/i.test(propertyType)) band = scaleBand(band, 0.62, 250);
      if (/multi-area/i.test(propertyType)) band = scaleBand(band, 1.15, 350);
      const multiplier =
        /front yard only/i.test(propertyType)
          ? 0.48
          : /backyard only/i.test(propertyType)
            ? 0.62
            : /multi-area/i.test(propertyType)
              ? 1.12
              : 1;
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "lawn area anchor",
          source: "questionnaire_size_bucket",
          band
        },
        propertyHint: {
          quantity: roundCurrency(estimateMowableArea(input.propertyData, 0.1) * multiplier),
          unit: "sqft",
          label: "maintainable turf hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.15, 250)),
          unit: "sqft",
          label: "lawn sanity band",
          source: "property_layout",
          band: scaleBand(band, 1.15, 250)
        }
      };
    }
    case "Landscaping / Installation": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["landscape_area_size"]));
      const workSelections = getAnswerSelections(input.request.answers, "landscape_work_type");
      const band = bucketBand(
        bucket,
        {
          small: { min: 180, max: 500 },
          medium: { min: 700, max: 1500 },
          large: { min: 1800, max: 4000 },
          very_large: { min: 4200, max: 9000 }
        },
        { min: 700, max: 1800 }
      );
      const workType = getAnswerByKeys(input.request.answers, ["landscape_work_type"]);
      const backyard = input.propertyData.estimatedBackyardSqft ?? input.propertyData.lotSizeSqft ?? 1600;
      const multiplier =
        /yard makeover/i.test(workType)
          ? 0.72
          : /sod|lawn installation/i.test(workType)
            ? 0.55
            : 0.38;
      const blendedWorkAdjustment =
        workSelections.length >= 3 ? 1.16 : workSelections.length === 2 ? 1.08 : 1;
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "landscape area anchor",
          source: "questionnaire_area_band",
          band
        },
        propertyHint: {
          quantity: roundCurrency(clamp(backyard * multiplier * blendedWorkAdjustment, 220, 9000)),
          unit: "sqft",
          label: "usable yard install-area hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 200)),
          unit: "sqft",
          label: "landscape sanity band",
          source: "property_scale",
          band: scaleBand(band, 1.2, 200)
        }
      };
    }
    case "Tree Service / Removal": {
      const workType = getAnswerByKeys(input.request.answers, ["tree_work_type"]);
      const stumpWork = /stump grinding/i.test(workType) || subtype === "stump_grinding";
      const band =
        /remove one tree/i.test(workType)
          ? { min: 1, max: 1.2 }
          : /remove multiple trees/i.test(workType)
            ? { min: 2, max: 5 }
            : /trim|cut back/i.test(workType)
              ? { min: 1, max: 4 }
              : stumpWork
                ? { min: 1, max: 4 }
                : { min: 1, max: 3 };
      const unit = stumpWork ? "stump_count" : "tree_count";
      return {
        unit,
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit,
          label: "tree-count anchor",
          source: "questionnaire_work_type",
          band
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.25, 1)),
          unit,
          label: "tree-count sanity band",
          source: "service_family",
          band: scaleBand(band, 1.25, 1)
        }
      };
    }
    case "Fence Installation / Repair": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["fence_scope"]));
      const band = bucketBand(
        bucket,
        {
          small: { min: 15, max: 30 },
          medium: { min: 35, max: 85 },
          large: { min: 90, max: 220 },
          very_large: { min: 200, max: 380 }
        },
        { min: 40, max: 120 }
      );
      const base = estimateFenceLinearFt(input.propertyData);
      const propertyQuantity =
        bucket === "small"
          ? roundCurrency(clamp(base * 0.24, 15, 35))
          : bucket === "medium"
            ? roundCurrency(clamp(base * 0.55, 35, 95))
            : bucket === "large"
              ? roundCurrency(clamp(base * 0.95, 95, 220))
              : bucket === "very_large"
                ? roundCurrency(Math.max(base, 220))
                : base;
      return {
        unit: "linear_ft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "linear_ft",
          label: "fence scope anchor",
          source: "questionnaire_scope_band",
          band
        },
        propertyHint: {
          quantity: propertyQuantity,
          unit: "linear_ft",
          label: "yard-boundary hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 12)),
          unit: "linear_ft",
          label: "fence sanity band",
          source: "property_boundary",
          band: scaleBand(band, 1.2, 12)
        }
      };
    }
    case "Concrete": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["concrete_scope"]));
      const concreteSelections = getAnswerSelections(input.request.answers, "concrete_project_type");
      const bandMap =
        subtype === "walkway"
          ? {
              small: { min: 80, max: 180 },
              medium: { min: 180, max: 420 },
              large: { min: 420, max: 900 },
              very_large: { min: 900, max: 1500 }
            }
          : subtype === "driveway"
            ? {
                small: { min: 150, max: 300 },
                medium: { min: 300, max: 700 },
                large: { min: 700, max: 1400 },
                very_large: { min: 1400, max: 2600 }
              }
            : subtype === "slab_pad"
              ? {
                  small: { min: 100, max: 220 },
                  medium: { min: 220, max: 600 },
                  large: { min: 600, max: 1200 },
                  very_large: { min: 1200, max: 2200 }
                }
              : {
                  small: { min: 120, max: 220 },
                  medium: { min: 220, max: 600 },
                  large: { min: 600, max: 1400 },
                  very_large: { min: 1400, max: 2600 }
              };
      const band = bucketBand(bucket, bandMap, bandMap.medium);
      const componentHints = concreteSelections.map((component) =>
        estimateConcreteHint(
          input.propertyData,
          /driveway/i.test(component)
            ? "driveway"
            : /patio/i.test(component)
              ? "patio"
              : /walkway/i.test(component)
                ? "walkway"
                : /slab|pad/i.test(component)
                  ? "slab_pad"
                  : subtype
        )
      );
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "concrete size anchor",
          source: "questionnaire_scope_band",
          band
        },
        propertyHint: {
          quantity:
            concreteSelections.length > 1
              ? mergeComponentQuantities(componentHints, 0.12, 0.74)
              : estimateConcreteHint(input.propertyData, subtype),
          unit: "sqft",
          label: "property/footprint hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 80)),
          unit: "sqft",
          label: "concrete sanity band",
          source: "subtype_expectation",
          band: scaleBand(band, 1.2, 80)
        }
      };
    }
    case "Deck Installation / Repair": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["deck_scope"]));
      const band = bucketBand(
        bucket,
        {
          small: { min: 90, max: 160 },
          medium: { min: 160, max: 350 },
          large: { min: 350, max: 700 },
          very_large: { min: 700, max: 1300 }
        },
        { min: 160, max: 350 }
      );
      const areaType = getAnswerByKeys(input.request.answers, ["deck_area_type"]);
      const multiplier = /multi-level/i.test(areaType) ? 1.22 : /raised deck/i.test(areaType) ? 1.1 : 1;
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "deck size anchor",
          source: "questionnaire_scope_band",
          band
        },
        propertyHint: {
          quantity: roundCurrency(estimatePatioOrDeckSqft(input.propertyData, 0.14, 140, 900) * multiplier),
          unit: "sqft",
          label: "deck-footprint hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 90)),
          unit: "sqft",
          label: "deck sanity band",
          source: "structure_type",
          band: scaleBand(band, 1.2, 90)
        }
      };
    }
    case "Exterior Painting": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["painting_scope"]));
      const target = getAnswerByKeys(input.request.answers, ["painting_target"]);
      const band =
        /trim|doors|garage/i.test(target)
          ? { min: 180, max: 650 }
          : /fence|detached/i.test(target)
            ? { min: 250, max: 950 }
            : bucketBand(
                bucket,
                {
                  small: { min: 180, max: 550 },
                  medium: { min: 500, max: 1800 },
                  large: { min: 1800, max: 4200 },
                  very_large: { min: 3200, max: 6200 }
                },
                { min: 750, max: 2200 }
              );
      const paintable = estimatePaintableArea(input.propertyData);
      const propertyQuantity =
        /trim|doors|garage/i.test(target)
          ? roundCurrency(clamp(paintable * 0.22, 180, 650))
          : /fence|detached/i.test(target)
            ? roundCurrency(clamp(estimateFenceLinearFt(input.propertyData) * 6.5, 250, 950))
            : bucket === "small"
              ? roundCurrency(clamp(paintable * 0.16, 180, 550))
              : bucket === "medium"
                ? roundCurrency(clamp(paintable * 0.42, 500, 1800))
                : bucket === "large"
                  ? roundCurrency(clamp(paintable * 0.75, 1800, 4200))
                  : bucket === "very_large"
                    ? paintable
                    : roundCurrency(paintable * 0.52);
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "painting scope anchor",
          source: "questionnaire_scope_band",
          band
        },
        propertyHint: {
          quantity: propertyQuantity,
          unit: "sqft",
          label: "paintable-area hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 180)),
          unit: "sqft",
          label: "painting sanity band",
          source: "surface_family",
          band: scaleBand(band, 1.2, 180)
        }
      };
    }
    case "Roofing": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["roofing_scope"]));
      const band = bucketBand(
        bucket,
        {
          small: { min: 120, max: 350 },
          medium: { min: 350, max: 900 },
          large: { min: 900, max: 2200 },
          very_large: { min: 1800, max: 4200 }
        },
        { min: 350, max: 900 }
      );
      const fullRoof = estimateRoofArea(input.propertyData);
      const propertyQuantity =
        bucket === "small"
          ? roundCurrency(clamp(fullRoof * 0.12, 120, 350))
          : bucket === "medium"
            ? roundCurrency(clamp(fullRoof * 0.28, 320, 900))
            : bucket === "large"
              ? roundCurrency(clamp(fullRoof * 0.55, 900, 2200))
              : bucket === "very_large"
                ? fullRoof
                : roundCurrency(fullRoof * 0.35);
      return {
        unit: "sqft",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "sqft",
          label: "roof scope anchor",
          source: "questionnaire_scope_band",
          band
        },
        propertyHint: {
          quantity: propertyQuantity,
          unit: "sqft",
          label: "roof-area hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.28, 100)),
          unit: "sqft",
          label: "roofing sanity band",
          source: "roof_scale",
          band: scaleBand(band, 1.28, 100)
        }
      };
    }
    case "Junk Removal": {
      const amount = getAnswerByKeys(input.request.answers, ["junk_amount"]);
      const band =
        /few items/i.test(amount)
          ? { min: 0.25, max: 0.5 }
          : /small load/i.test(amount)
            ? { min: 0.8, max: 1.2 }
            : /medium load/i.test(amount)
              ? { min: 1.4, max: 2.2 }
              : /large load/i.test(amount)
                ? { min: 2.6, max: 4.2 }
                : { min: 0.8, max: 1.8 };
      return {
        unit: "load",
        questionnaireAnchor: {
          quantity: Number(((band.min + band.max) / 2).toFixed(2)),
          unit: "load",
          label: "junk load anchor",
          source: "questionnaire_load_band",
          band
        },
        sanityBand: {
          quantity: Number(((band.min + band.max) / 2).toFixed(2)),
          unit: "load",
          label: "junk load sanity band",
          source: "debris_family",
          band: scaleBand(band, 1.22, 0.25)
        }
      };
    }
    case "Outdoor Lighting Installation": {
      const scope = getAnswerByKeys(input.request.answers, ["lighting_scope"]);
      const band =
        /one small area/i.test(scope)
          ? { min: 3, max: 5 }
          : /one medium-sized area/i.test(scope)
            ? { min: 6, max: 10 }
            : /one large area/i.test(scope)
              ? { min: 8, max: 12 }
              : /multiple areas/i.test(scope)
                ? { min: 12, max: 18 }
                : /several areas on part of the property/i.test(scope)
            ? { min: 6, max: 10 }
            : /most of the front or backyard/i.test(scope)
              ? { min: 8, max: 12 }
              : /large portion of the property or long runs/i.test(scope)
                ? { min: 12, max: 18 }
                : /small job/i.test(scope)
          ? { min: 3, max: 5 }
          : /medium job/i.test(scope)
            ? { min: 7, max: 11 }
            : /large job/i.test(scope)
              ? { min: 12, max: 18 }
              : /very large job/i.test(scope)
              ? { min: 20, max: 36 }
              : { min: 6, max: 10 };
      const propertyQuantity =
        input.propertyData.lotSizeSqft && input.propertyData.lotSizeSqft > 12000
          ? 12
          : 8;
      return {
        unit: "fixture_count",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "fixture_count",
          label: "lighting fixture anchor",
          source: "questionnaire_fixture_band",
          band
        },
        propertyHint: {
          quantity: propertyQuantity,
          unit: "fixture_count",
          label: "property lighting-system hint",
          source: "property_context"
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 2)),
          unit: "fixture_count",
          label: "lighting sanity band",
          source: "property_context",
          band: scaleBand(band, 1.2, 2)
        }
      };
    }
    case "Other": {
      const bucket = normalizeBucket(getAnswerByKeys(input.request.answers, ["other_size"]));
      const band = bucketBand(
        bucket,
        {
          small: { min: 200, max: 400 },
          medium: { min: 550, max: 950 },
          large: { min: 1200, max: 2000 },
          very_large: { min: 2200, max: 3800 }
        },
        { min: 550, max: 950 }
      );
      return {
        unit: "count",
        questionnaireAnchor: {
          quantity: midpointBand(band),
          unit: "count",
          label: "generic size anchor",
          source: "questionnaire_size_band",
          band
        },
        sanityBand: {
          quantity: midpointBand(scaleBand(band, 1.2, 200)),
          unit: "count",
          label: "fallback sanity band",
          source: "fallback_pricing",
          band: scaleBand(band, 1.2, 200)
        }
      };
    }
  }

  return {
    unit: (input.signal?.quantityUnit as QuantityUnit | null | undefined) ?? "count",
    fallbackQuantity: input.signal?.estimatedQuantity ?? 1
  };
}

function computeEvidenceScore(
  input: ReconcileScopeInput,
  profile: ServiceProfile,
  aiProposal: ReturnType<typeof selectAiProposal>
) {
  const propertyQuality = input.signals.propertyResolutionQuality ?? 55;
  const consistency = clamp(input.signal?.consistencyScore ?? input.signals.scopeMatchConfidence ?? 60, 0, 100);
  let score = quantityEvidenceBase(aiProposal?.evidence);
  score += input.photoCount >= 4 ? 9 : input.photoCount >= 2 ? 6 : input.photoCount === 1 ? 3 : 0;
  score += propertyQuality >= 88 ? 7 : propertyQuality >= 72 ? 5 : propertyQuality >= 56 ? 2 : 0;
  score += input.signal?.jobSubtype ? 5 : input.signal?.fallbackFamily ? 2 : 0;
  score += clamp((consistency - 55) / 5, -6, 8);
  score += input.description.trim().length >= 80 ? 5 : input.description.trim().length >= 20 ? 2 : 0;
  score += profile.questionnaireAnchor ? 4 : 0;
  score += profile.propertyHint ? 3 : 0;
  if (profile.questionnaireAnchor && aiProposal) {
    const drift = differencePct(profile.questionnaireAnchor.quantity, aiProposal.quantity);
    score += drift <= 0.15 ? 8 : drift <= 0.35 ? 4 : drift >= 0.85 ? -10 : drift >= 0.55 ? -5 : 0;
  }
  if (profile.propertyHint && aiProposal) {
    const drift = differencePct(profile.propertyHint.quantity, aiProposal.quantity);
    score += drift <= 0.18 ? 6 : drift <= 0.35 ? 3 : drift >= 1 ? -8 : drift >= 0.7 ? -4 : 0;
  }
  if (input.signal?.customJobSignal) score -= 5;
  if (input.signal?.needsManualReview) score -= 5;
  return clamp(score, 42, 94);
}

function withReconciledSignal(input: ReconcileScopeInput, signal: NormalizedServiceSignal): NormalizedServiceSignal {
  const profile = buildServiceProfile(input);
  const aiProposal = selectAiProposal(input, profile.unit);
  const parsedAnswers = Object.fromEntries(
    Object.keys(input.request.answers)
      .filter((key) => !key.endsWith("_other_text"))
      .map((key) => [key, getAnswerSelections(input.request.answers, key)])
  );
  const componentTrace = serviceComponentTraceFromAnswers({ request: input.request });
  const evidenceScore = computeEvidenceScore(input, profile, aiProposal);
  const strength = strengthFromEvidenceScore(evidenceScore);
  const stableAnchor = stableCenter(profile);
  let candidate = profile.fallbackQuantity ?? 1;
  let sanityBandApplied = false;
  const notes: string[] = [];

  if (aiProposal?.evidence === "direct") {
    const deckAnchorQuantity = profile.questionnaireAnchor?.quantity ?? 0;
    const deckBandMax = profile.questionnaireAnchor?.band?.max ?? 0;
    const deckPropertyHint = profile.propertyHint?.quantity ?? 0;
    const deckAreaType = getAnswerByKeys(input.request.answers, ["deck_area_type"]);
    const deckRooftopMismatchBoost =
      input.request.service === "Deck Installation / Repair" &&
      deckBandMax > 0 &&
      deckBandMax <= 350 &&
      deckAnchorQuantity > 0 &&
      Boolean(profile.propertyHint) &&
      /rooftop|specialty/i.test(deckAreaType) &&
      deckPropertyHint >= deckAnchorQuantity * 2.6 &&
      aiProposal.quantity <= deckAnchorQuantity * 1.45;
    const landscapeAnchorQuantity = profile.questionnaireAnchor?.quantity ?? 0;
    const landscapeBandMax = profile.questionnaireAnchor?.band?.max ?? 0;
    const landscapePropertyHint = profile.propertyHint?.quantity ?? 0;
    const landscapeAiQuantity = aiProposal.quantity;
    const smallSectionLandscapeBoost =
      input.request.service === "Landscaping / Installation" &&
      landscapeBandMax <= 500 &&
      Boolean(profile.propertyHint) &&
      landscapePropertyHint >= landscapeAnchorQuantity * 2;
    const nearSmallLandscapeBoost =
      input.request.service === "Landscaping / Installation" &&
      !smallSectionLandscapeBoost &&
      landscapeBandMax > 500 &&
      landscapeBandMax <= 900 &&
      landscapeAnchorQuantity > 0 &&
      landscapePropertyHint >= landscapeAnchorQuantity * 2.8 &&
      landscapeAiQuantity <= landscapeAnchorQuantity * 1.35;
    const weights = smallSectionLandscapeBoost
      ? { anchor: 0.2, ai: 0.4, property: 0.4 }
      : nearSmallLandscapeBoost
        ? { anchor: 0.24, ai: 0.44, property: 0.32 }
        : deckRooftopMismatchBoost
          ? { anchor: 0.22, ai: 0.48, property: 0.3 }
        : { anchor: 0.28, ai: 0.54, property: 0.18 };
    const weightedSources: Array<{ quantity: number; weight: number }> = [];
    if (profile.questionnaireAnchor) {
      weightedSources.push({ quantity: profile.questionnaireAnchor.quantity, weight: weights.anchor });
    }
    if (aiProposal) {
      weightedSources.push({ quantity: aiProposal.quantity, weight: weights.ai });
    }
    if (profile.propertyHint) {
      weightedSources.push({ quantity: profile.propertyHint.quantity, weight: weights.property });
    }
    const totalWeight = weightedSources.reduce((sum, item) => sum + item.weight, 0) || 1;
    candidate =
      weightedSources.length > 0
        ? weightedSources.reduce((sum, item) => sum + item.quantity * item.weight, 0) / totalWeight
        : profile.fallbackQuantity ?? 1;
    if (smallSectionLandscapeBoost) {
      notes.push("Landscaping small-section scope was rebalanced toward property context before anchoring.");
    } else if (nearSmallLandscapeBoost) {
      notes.push("Landscaping near-small scope was modestly rebalanced toward property context before anchoring.");
    } else if (deckRooftopMismatchBoost) {
      notes.push("Deck rooftop/specialty scope was modestly rebalanced toward property context before anchoring.");
    }
  } else if (aiProposal && stableAnchor != null) {
    const driftFromStableAnchor = differencePct(stableAnchor, aiProposal.quantity);
    const damping = inferredAiDamping(strength, driftFromStableAnchor);

    if (driftFromStableAnchor <= 0.15) {
      candidate = stableAnchor;
      notes.push("Indirect AI quantity stayed inside the stable anchor band, so the stable center was used.");
    } else {
      candidate = stableAnchor + (aiProposal.quantity - stableAnchor) * damping;
      const driftAllowance = inferredAiDriftAllowance(profile, stableAnchor, strength, evidenceScore);
      const cappedCandidate = clamp(candidate, stableAnchor - driftAllowance, stableAnchor + driftAllowance);
      if (Math.abs(cappedCandidate - candidate) >= (profile.unit === "load" ? 0.01 : 1)) {
        notes.push("Indirect AI quantity was capped to stay close to the questionnaire/property center.");
      }
      candidate = cappedCandidate;
      notes.push(
        driftFromStableAnchor <= 0.28
          ? "Indirect AI quantity only modestly refined the stable anchor."
          : "Large inferred AI drift was heavily damped to keep repeat runs stable."
      );
    }
  } else {
    const weightedSources: Array<{ quantity: number; weight: number }> = [];
    if (profile.questionnaireAnchor) weightedSources.push({ quantity: profile.questionnaireAnchor.quantity, weight: 0.7 });
    if (profile.propertyHint) weightedSources.push({ quantity: profile.propertyHint.quantity, weight: 0.3 });
    const totalWeight = weightedSources.reduce((sum, item) => sum + item.weight, 0) || 1;
    candidate =
      weightedSources.length > 0
        ? weightedSources.reduce((sum, item) => sum + item.quantity * item.weight, 0) / totalWeight
        : profile.fallbackQuantity ?? 1;
  }

  if (profile.questionnaireAnchor?.band) {
    const anchored = softClamp(candidate, profile.questionnaireAnchor.band, strength, evidenceScore);
    if (Math.abs(anchored - candidate) >= 1) {
      sanityBandApplied = true;
      notes.push("Questionnaire anchor kept the estimate from drifting too far.");
    }
    candidate = anchored;
  }
  if (profile.sanityBand?.band) {
    const constrained = softClamp(candidate, profile.sanityBand.band, strength, evidenceScore);
    if (Math.abs(constrained - candidate) >= 1) {
      sanityBandApplied = true;
      notes.push("Service sanity band trimmed an unsupported scope jump.");
    }
    candidate = constrained;
  }

  if (aiProposal?.evidence !== "direct") {
    const quantizedCandidate = quantizeQuantity(candidate, profile.unit);
    if (Math.abs(quantizedCandidate - candidate) >= (profile.unit === "load" ? 0.01 : 1)) {
      notes.push("Final inferred quantity was snapped to a stable pricing increment.");
    }
    candidate = quantizedCandidate;
  }

  const finalQuantity = profile.unit === "load" ? Number(candidate.toFixed(2)) : roundCurrency(candidate);
  const anchorDriftPct = profile.questionnaireAnchor ? differencePct(profile.questionnaireAnchor.quantity, finalQuantity) : null;
  const propertyDriftPct = profile.propertyHint ? differencePct(profile.propertyHint.quantity, finalQuantity) : null;
  const manualReviewRecommended =
    Boolean(signal.needsManualReview) ||
    (strength === "weak" && Boolean(aiProposal) && (anchorDriftPct ?? 0) >= 0.55) ||
    (strength === "weak" && (propertyDriftPct ?? 0) >= 0.85);

  if (profile.questionnaireAnchor && aiProposal) {
    if ((anchorDriftPct ?? 0) <= 0.2) notes.push("AI quantity stayed close to the questionnaire anchor.");
    else if ((anchorDriftPct ?? 0) >= 0.5) notes.push("AI quantity diverged materially from the questionnaire anchor, so the result was pulled back.");
  }
  if (profile.propertyHint) {
    if ((propertyDriftPct ?? 0) <= 0.2) notes.push("Property-scale evidence corroborated the chosen quantity.");
    else if ((propertyDriftPct ?? 0) >= 0.55) notes.push("Property-scale evidence did not fully support a larger scope.");
  }

  const trace: ScopeReconciliationTrace = {
    reconciledQuantity: finalQuantity,
    reconciledQuantityUnit: profile.unit,
    reconciliationReason: `${strength} reconciliation using ${[
      profile.questionnaireAnchor ? "questionnaire anchor" : null,
      aiProposal ? "AI quantity" : null,
      profile.propertyHint ? "property/photo hint" : null
    ].filter(Boolean).join(", ")}.`,
    reconciliationStrength: strength,
    evidenceScore,
    questionnaireAnchorUsed: Boolean(profile.questionnaireAnchor),
    aiEstimateUsed: Boolean(aiProposal),
    propertyHintUsed: Boolean(profile.propertyHint),
    sanityBandApplied,
    manualReviewRecommended,
    anchorDriftPct,
    propertyDriftPct,
    confidenceImpact: strength === "strong" ? 6 : strength === "moderate" ? 2 : -2,
    questionnaireAnchor: profile.questionnaireAnchor ? {
      quantity: profile.questionnaireAnchor.quantity,
      unit: profile.questionnaireAnchor.unit,
      label: profile.questionnaireAnchor.label,
      source: profile.questionnaireAnchor.source,
      bandMin: profile.questionnaireAnchor.band?.min ?? null,
      bandMax: profile.questionnaireAnchor.band?.max ?? null
    } : null,
    aiProposal: aiProposal ? {
      quantity: aiProposal.quantity,
      unit: aiProposal.unit,
      evidence: aiProposal.evidence,
      confidence: aiProposal.confidence
    } : null,
    propertyHint: profile.propertyHint ? {
      quantity: profile.propertyHint.quantity,
      unit: profile.propertyHint.unit,
      label: profile.propertyHint.label
    } : null,
    sanityBand: profile.sanityBand ? {
      min: profile.sanityBand.band?.min ?? profile.sanityBand.quantity,
      max: profile.sanityBand.band?.max ?? profile.sanityBand.quantity,
      unit: profile.sanityBand.unit,
      label: profile.sanityBand.label
    } : null,
    parsedAnswers,
    componentTrace,
    notes
  };

  return {
    ...signal,
    estimatedQuantity: trace.reconciledQuantity,
    quantityUnit: trace.reconciledQuantityUnit ?? signal.quantityUnit ?? profile.unit,
    quantityEvidence:
      aiProposal?.evidence ??
      (trace.questionnaireAnchorUsed && trace.propertyHintUsed ? "strong_inference" : signal.quantityEvidence ?? "fallback"),
    consistencyScore: clamp(
      roundCurrency(
        ((signal.consistencyScore ?? input.signals.scopeMatchConfidence ?? 60) * 0.55 + trace.evidenceScore * 0.45)
      ),
      40,
      96
    ),
    needsManualReview: signal.needsManualReview || trace.manualReviewRecommended,
    scopeReconciliation: trace,
    notes: Array.from(new Set([...(signal.notes ?? []), ...trace.notes, trace.reconciliationReason]))
  };
}

function syncTopLevelQuantities(
  signals: AiEstimatorSignals,
  serviceSignals: Partial<Record<CanonicalService, NormalizedServiceSignal>>
) {
  const windowSignal = serviceSignals["Window Cleaning"];
  const lightingSignal = serviceSignals["Outdoor Lighting Installation"];
  return {
    ...signals,
    estimatedWindowCount:
      windowSignal?.quantityUnit === "weighted_count"
        ? windowSignal.estimatedQuantity ?? signals.estimatedWindowCount
        : signals.estimatedWindowCount,
    estimatedFixtureCount:
      lightingSignal?.quantityUnit === "fixture_count"
        ? lightingSignal.estimatedQuantity ?? signals.estimatedFixtureCount
        : signals.estimatedFixtureCount
  };
}

export function reconcileServiceSignals(input: {
  requests: ServiceRequest[];
  propertyData: PropertyData;
  description: string;
  photoCount: number;
  signals: AiEstimatorSignals;
}) {
  const serviceSignals = Object.fromEntries(
    input.requests.map((request) => {
      const signal = input.signals.serviceSignals?.[request.service] ?? { serviceType: request.service };
      return [
        request.service,
        withReconciledSignal(
          {
            request,
            propertyData: input.propertyData,
            description: input.description,
            photoCount: input.photoCount,
            signals: input.signals,
            signal
          },
          signal
        )
      ];
    })
  ) as Partial<Record<CanonicalService, NormalizedServiceSignal>>;

  return syncTopLevelQuantities(
    {
      ...input.signals,
      serviceSignals
    },
    serviceSignals
  );
}
