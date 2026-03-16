import {
  baseInternalConfidence,
  buildConfidenceTrace,
  clamp,
  estimateDrivewaySqft,
  estimateFenceLinearFt,
  estimateMowableArea,
  estimatePaintableArea,
  estimatePatioOrDeckSqft,
  estimateRoofArea,
  estimateRoofPerimeter,
  getAnswerSelections,
  getAnswerSelectionsByKeys,
  getAnswerByKeys,
  getServiceSignal,
  roundCurrency,
  sumSurfaceMap,
  type CanonicalService,
  type ConfidenceFactorTrace,
  type EstimatorContext,
  type HardSurfaceMap,
  type QuantityEvidence,
  type ServiceComponentTrace,
  type SizeBucket
} from "@/estimators/shared";
import type { ServiceQuestionAnswers } from "@/lib/serviceQuestions";

type RangeBand = {
  min: number;
  max: number;
};

const SIZE_BUCKET_ORDER: SizeBucket[] = ["small", "medium", "large", "very_large"];

export function midpointBand(band: RangeBand): number {
  return roundCurrency((band.min + band.max) / 2);
}

export function normalizeBucket(value: string): SizeBucket {
  const normalized = value.toLowerCase();
  if (/very large|whole property|entire roof|full yard|resort/.test(normalized)) return "very_large";
  if (/large|50\+|200\+|full exterior|most of exterior|most of front or backyard|1,500-4,000/.test(normalized)) return "large";
  if (/medium|11-25|25-75|500-1,500|200-600|150-350/.test(normalized)) return "medium";
  if (/small|1-10|up to|few items|small section/.test(normalized)) return "small";
  return "unknown";
}

export function bucketBand(bucket: SizeBucket, bands: Record<Exclude<SizeBucket, "unknown">, RangeBand>, fallback: RangeBand) {
  if (bucket === "unknown") return fallback;
  return bands[bucket];
}

export function answerBucket(
  answers: ServiceQuestionAnswers,
  primaryKeys: readonly string[],
  fallbackKeys: readonly string[] = []
): SizeBucket {
  const answer = getAnswerByKeys(answers, [...primaryKeys, ...fallbackKeys]);
  return normalizeBucket(answer);
}

export function directQuantityFromSignal(
  context: EstimatorContext,
  unit: string
): { quantity: number | null; evidence: QuantityEvidence } {
  const signal = getServiceSignal(context.signals, context.request.service);
  if (signal?.estimatedQuantity != null && signal.estimatedQuantity > 0 && signal.quantityUnit === unit) {
    return {
      quantity: roundCurrency(signal.estimatedQuantity),
      evidence: signal.quantityEvidence ?? "strong_inference"
    };
  }
  return { quantity: null, evidence: "fallback" };
}

export function resolveServiceSignalContext(context: EstimatorContext) {
  const signal = getServiceSignal(context.signals, context.request.service);
  return {
    signal,
    subtype: signal?.jobSubtype ?? null,
    workType: signal?.workType ?? null,
    sizeBucket: signal?.sizeBucket ?? "unknown",
    quantityEvidence: signal?.quantityEvidence ?? "fallback",
    fallbackFamily: signal?.fallbackFamily ?? null
  };
}

export function confidenceFromContext(
  context: EstimatorContext,
  options: {
    quantityEvidence?: QuantityEvidence | null;
    knownPath?: boolean;
    usedFallbackFamily?: boolean;
    customJob?: boolean;
    needsManualReview?: boolean;
    conflictingSignals?: boolean;
    consistencyScore?: number | null;
  }
) {
  return baseInternalConfidence(context, options);
}

export function confidenceTraceFromContext(
  context: EstimatorContext,
  options: {
    quantityEvidence?: QuantityEvidence | null;
    knownPath?: boolean;
    usedFallbackFamily?: boolean;
    customJob?: boolean;
    needsManualReview?: boolean;
    conflictingSignals?: boolean;
    consistencyScore?: number | null;
  }
): ConfidenceFactorTrace {
  return buildConfidenceTrace(context, options);
}

function normalizePressureComponent(option: string): string {
  if (/driveway/i.test(option)) return "driveway";
  if (/patio|porch/i.test(option)) return "patio_porch";
  if (/house exterior/i.test(option)) return "house_exterior";
  if (/fence/i.test(option)) return "fence";
  if (/roof/i.test(option)) return "roof";
  return "custom";
}

function normalizeConcreteComponent(option: string): string {
  if (/driveway/i.test(option)) return "driveway";
  if (/patio/i.test(option)) return "patio";
  if (/walkway/i.test(option)) return "walkway";
  if (/slab|pad/i.test(option)) return "slab_pad";
  return "custom";
}

function normalizeLandscapeWorkComponent(option: string): string {
  if (/plants|garden beds/i.test(option)) return "new_plants_beds";
  if (/rock|mulch/i.test(option)) return "rock_or_mulch_install";
  if (/sod|lawn installation/i.test(option)) return "sod_or_lawn_install";
  if (/yard makeover/i.test(option)) return "yard_makeover";
  return "custom";
}

function normalizeLandscapeMaterialComponent(option: string): string {
  if (/plants/i.test(option)) return "plants";
  if (/mulch|rock/i.test(option)) return "mulch_or_rock";
  if (/sod|turf/i.test(option)) return "sod_or_turf";
  if (/mixed/i.test(option)) return "mixed_materials";
  return "unknown_material";
}

export function serviceComponentTraceFromAnswers(
  context: Pick<EstimatorContext, "request">
): ServiceComponentTrace[] {
  switch (context.request.service) {
    case "Pressure Washing": {
      const selections = getAnswerSelectionsByKeys(context.request.answers, ["pressure_washing_target", "pressure_area"]);
      if (selections.length === 0) return [];
      return [
        {
          questionKey: "pressure_washing_target",
          selectedOptions: selections,
          normalizedComponents: Array.from(new Set(selections.map(normalizePressureComponent))),
          combinationMode: selections.length > 1 ? "split_scope" : "single"
        }
      ];
    }
    case "Concrete": {
      const selections = getAnswerSelections(context.request.answers, "concrete_project_type");
      if (selections.length === 0) return [];
      return [
        {
          questionKey: "concrete_project_type",
          selectedOptions: selections,
          normalizedComponents: Array.from(new Set(selections.map(normalizeConcreteComponent))),
          combinationMode: selections.length > 1 ? "split_scope" : "single"
        }
      ];
    }
    case "Landscaping / Installation": {
      const workSelections = getAnswerSelections(context.request.answers, "landscape_work_type");
      const materialSelections = getAnswerSelections(context.request.answers, "landscape_materials");
      return [
        ...(workSelections.length > 0
          ? [
              {
                questionKey: "landscape_work_type",
                selectedOptions: workSelections,
                normalizedComponents: Array.from(new Set(workSelections.map(normalizeLandscapeWorkComponent))),
                combinationMode: workSelections.length > 1 ? "blended_scope" : "single"
              } satisfies ServiceComponentTrace
            ]
          : []),
        ...(materialSelections.length > 0
          ? [
              {
                questionKey: "landscape_materials",
                selectedOptions: materialSelections,
                normalizedComponents: Array.from(new Set(materialSelections.map(normalizeLandscapeMaterialComponent))),
                combinationMode: materialSelections.length > 1 ? "attribute_blend" : "single"
              } satisfies ServiceComponentTrace
            ]
          : [])
      ];
    }
    default:
      return [];
  }
}

export function detectConflict(answer: string, ...keywords: string[]): boolean {
  if (!answer) return false;
  const normalized = answer.toLowerCase();
  return keywords.every((keyword) => !normalized.includes(keyword.toLowerCase()));
}

export function storyCountFromAnswersOrSignal(context: EstimatorContext, answers: string[]): number {
  const answerBlob = answers.join(" ").toLowerCase();
  const signal = getServiceSignal(context.signals, context.request.service);
  if (signal?.stories && signal.stories > 0) return signal.stories;
  if (/three-story|three story|three-story or taller|three\+/.test(answerBlob)) return 3;
  if (/two-story|two story|two-story home/.test(answerBlob)) return 2;
  return 1;
}

export function storyHeightMultiplier(stories: number): number {
  if (stories >= 3) return 1.35;
  if (stories === 2) return 1.15;
  return 1;
}

export function resolveAccessMultiplierLabel(answer: string): "easy" | "moderate" | "difficult" {
  const normalized = answer.toLowerCase();
  if (/very difficult|tight|difficult|steep|power lines|hard-to-reach|hard access/.test(normalized)) return "difficult";
  if (/moderate|some|ladder|two-story|partly/.test(normalized)) return "moderate";
  return "easy";
}

export function pressureWashingAreaFromContext(context: EstimatorContext, target: string) {
  const signal = getServiceSignal(context.signals, "Pressure Washing");
  const quoted = signal?.quotedSurfaces ?? context.signals.quotedSurfaces;
  const detected = context.signals.detectedSurfaces;
  const targetText = target.toLowerCase();

  if (/driveway/.test(targetText)) {
    return quoted?.driveway ?? detected?.driveway ?? estimateDrivewaySqft(context.propertyData);
  }
  if (/patio|porch/.test(targetText)) {
    return quoted?.patio ?? detected?.patio ?? estimatePatioOrDeckSqft(context.propertyData, 0.12, 120, 850);
  }
  if (/house exterior/.test(targetText)) {
    return roundCurrency(estimatePaintableArea(context.propertyData) * 0.42);
  }
  if (/roof/.test(targetText)) {
    return roundCurrency(estimateRoofArea(context.propertyData) * 0.72);
  }
  if (/fence/.test(targetText)) {
    return roundCurrency(estimateFenceLinearFt(context.propertyData) * 6.5);
  }
  const quotedSqft = sumSurfaceMap(quoted);
  if (quotedSqft > 0) return quotedSqft;
  return roundCurrency(
    estimateDrivewaySqft(context.propertyData) +
      estimatePatioOrDeckSqft(context.propertyData, 0.1, 120, 700) +
      280
  );
}

export function fenceLengthFromBucket(context: EstimatorContext, bucket: SizeBucket): number {
  const base = estimateFenceLinearFt(context.propertyData);
  if (bucket === "small") return roundCurrency(clamp(base * 0.22, 15, 30));
  if (bucket === "medium") return roundCurrency(clamp(base * 0.5, 40, 80));
  if (bucket === "large") return roundCurrency(clamp(base * 0.9, 90, 200));
  if (bucket === "very_large") return roundCurrency(Math.max(base, 220));
  return base;
}

export function roofPerimeterFromStories(context: EstimatorContext, stories: number): number {
  return roundCurrency(estimateRoofPerimeter(context.propertyData) * (stories >= 3 ? 1.18 : stories === 2 ? 1.08 : 1));
}

export function roofAreaFromScope(context: EstimatorContext, scopeBucket: SizeBucket): number {
  const base = estimateRoofArea(context.propertyData);
  if (scopeBucket === "small") return roundCurrency(clamp(base * 0.12, 120, 350));
  if (scopeBucket === "medium") return roundCurrency(clamp(base * 0.28, 320, 900));
  if (scopeBucket === "large") return roundCurrency(clamp(base * 0.55, 900, 2200));
  if (scopeBucket === "very_large") return base;
  return roundCurrency(base * 0.35);
}

export function paintAreaFromScope(context: EstimatorContext, target: string, scope: SizeBucket): number {
  const base = estimatePaintableArea(context.propertyData);
  if (/trim|doors|garage/.test(target.toLowerCase())) return roundCurrency(clamp(base * 0.2, 180, 650));
  if (/fence|detached/.test(target.toLowerCase())) return roundCurrency(clamp(base * 0.28, 250, 900));
  if (scope === "small") return roundCurrency(clamp(base * 0.15, 180, 550));
  if (scope === "medium") return roundCurrency(clamp(base * 0.4, 500, 1800));
  if (scope === "large") return roundCurrency(clamp(base * 0.75, 1800, 4200));
  if (scope === "very_large") return base;
  return roundCurrency(base * 0.5);
}

export function lawnAreaFromBucket(context: EstimatorContext, bucket: SizeBucket): number {
  const base = estimateMowableArea(context.propertyData, 0.1);
  if (bucket === "small") return roundCurrency(clamp(base, 500, 2000));
  if (bucket === "medium") return roundCurrency(clamp(base, 2000, 5000));
  if (bucket === "large") return roundCurrency(clamp(Math.max(base, 5000), 5000, 10000));
  if (bucket === "very_large") return roundCurrency(Math.max(base, 10000));
  return base;
}

export function hardSurfaceScopeNotes(detected: HardSurfaceMap | undefined, quoted: HardSurfaceMap | undefined) {
  const notes: string[] = [];
  const detectedTotal = sumSurfaceMap(detected);
  const quotedTotal = sumSurfaceMap(quoted);
  if (detectedTotal > 0) notes.push(`Detected hard surfaces total ${detectedTotal} sqft.`);
  if (quotedTotal > 0 && detectedTotal > quotedTotal) {
    notes.push(`Quoted customer scope narrowed hard-surface pricing to ${quotedTotal} sqft.`);
  }
  return notes;
}

export function isCommercialProperty(context: EstimatorContext): boolean {
  const signal = getServiceSignal(context.signals, context.request.service);
  return Boolean(signal?.commercialSignal || context.signals.commercialSignal);
}

export function isPremiumProperty(context: EstimatorContext): boolean {
  const signal = getServiceSignal(context.signals, context.request.service);
  return Boolean(signal?.premiumPropertySignal || context.signals.premiumPropertySignal);
}

export function manualReviewFlags(context: EstimatorContext): { customJob: boolean; needsManualReview: boolean } {
  const signal = getServiceSignal(context.signals, context.request.service);
  return {
    customJob: Boolean(signal?.customJobSignal || context.signals.customJobSignal),
    needsManualReview: Boolean(signal?.needsManualReview || context.signals.needsManualReview)
  };
}

export function serviceSummaryFallback(service: CanonicalService, scope: number, unitLabel: string) {
  return `${service} estimate based on ${roundCurrency(scope)} ${unitLabel}.`;
}
