import { getTravelAdjustmentPct, type RegionalCostModel } from "@/lib/ai/cost-models";
import type { PropertyData } from "@/lib/property-data";
import {
  parseQuestionAnswer,
  serviceQuestions,
  type ServiceQuestionAnswerValue,
  type ServiceQuestionAnswers
} from "@/lib/serviceQuestions";
import type { ServiceType } from "@/lib/services";
import type { LeadConfidence, ServiceCategory } from "@/lib/types";

export const HARD_SURFACE_TYPES = [
  "driveway",
  "motor_court",
  "parking_pad",
  "walkway",
  "patio"
] as const;

export const QUANTITY_UNITS = [
  "sqft",
  "linear_ft",
  "count",
  "weighted_count",
  "tree_count",
  "stump_count",
  "visit",
  "load",
  "fixture_count",
  "zone_count",
  "roof_square",
  "section",
  "component_count",
  "service_event"
] as const;

export const FALLBACK_FAMILIES = [
  "flat_hardscape",
  "vertical_exterior_surface",
  "roof_like_surface",
  "delicate_specialty_surface",
  "yard_area",
  "linear_boundary",
  "window_group",
  "pool_service_event",
  "tree_work",
  "debris_load",
  "lighting_system",
  "exterior_finish_surface",
  "repair_section",
  "install_area",
  "mixed_custom"
] as const;

export type HardSurfaceType = (typeof HARD_SURFACE_TYPES)[number];
export type HardSurfaceMap = Partial<Record<HardSurfaceType, number>>;
export type TerrainType = "flat" | "moderate_slope" | "steep_hillside";
export type AccessType = "easy_access" | "tight_access" | "gated_estate";
export type SurfaceMaterialType = "concrete" | "asphalt" | "pavers" | "brick" | "stone";
export type PricingRegionKey =
  | "los_angeles"
  | "san_francisco"
  | "new_york"
  | "miami"
  | "chicago"
  | "default";
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
export type QuantityEvidence = "direct" | "strong_inference" | "weak_inference" | "fallback";
export type SizeBucket = "small" | "medium" | "large" | "very_large" | "unknown";
export type ReconciliationStrength = "weak" | "moderate" | "strong";
export type WorkType =
  | "clean"
  | "repair"
  | "replace"
  | "install"
  | "remove"
  | "maintain"
  | "resurface"
  | "extend"
  | "service"
  | "custom";
export type AccessDifficulty = "easy" | "moderate" | "difficult" | "very_difficult" | "unknown";
export type ObstructionLevel = "low" | "moderate" | "high" | "unknown";
export type HeightClass =
  | "ground_level"
  | "single_story"
  | "two_story"
  | "three_plus"
  | "roof_level"
  | "mixed_height"
  | "unknown";
export type SlopeClass = "flat" | "some_slope" | "steep" | "unknown";
export type FallbackFamily = (typeof FALLBACK_FAMILIES)[number];

export type CanonicalService =
  | "Pressure Washing"
  | "Gutter Cleaning"
  | "Window Cleaning"
  | "Pool Service / Cleaning"
  | "Lawn Care / Maintenance"
  | "Landscaping / Installation"
  | "Tree Service / Removal"
  | "Fence Installation / Repair"
  | "Concrete"
  | "Deck Installation / Repair"
  | "Exterior Painting"
  | "Roofing"
  | "Junk Removal"
  | "Outdoor Lighting Installation"
  | "Other";

export type ServiceRequest = {
  service: CanonicalService;
  answers: ServiceQuestionAnswers;
};

export type ServiceComponentTrace = {
  questionKey: string;
  selectedOptions: string[];
  normalizedComponents: string[];
  combinationMode: "single" | "split_scope" | "blended_scope" | "attribute_blend";
};

export type ScopeReconciliationTrace = {
  reconciledQuantity: number | null;
  reconciledQuantityUnit?: QuantityUnit | null;
  reconciliationReason: string;
  reconciliationStrength: ReconciliationStrength;
  evidenceScore: number;
  questionnaireAnchorUsed: boolean;
  aiEstimateUsed: boolean;
  propertyHintUsed: boolean;
  sanityBandApplied: boolean;
  manualReviewRecommended: boolean;
  anchorDriftPct?: number | null;
  propertyDriftPct?: number | null;
  confidenceImpact: number;
  questionnaireAnchor?: {
    quantity: number;
    unit: QuantityUnit;
    label: string;
    source: string;
    bandMin?: number | null;
    bandMax?: number | null;
  } | null;
  aiProposal?: {
    quantity: number;
    unit: QuantityUnit;
    evidence: QuantityEvidence;
    confidence?: number | null;
  } | null;
  propertyHint?: {
    quantity: number;
    unit: QuantityUnit;
    label: string;
  } | null;
  sanityBand?: {
    min: number;
    max: number;
    unit: QuantityUnit;
    label: string;
  } | null;
  parsedAnswers?: Record<string, string[]>;
  componentTrace?: ServiceComponentTrace[];
  notes: string[];
};

export type ConfidenceFactorTrace = {
  baseFloor: number;
  requiredInputs: number;
  photoEvidence: number;
  descriptionUsefulness: number;
  propertyEvidence: number;
  crossInputAgreement: number;
  quantityEvidence: number;
  estimatorPath: number;
  reconciliation: number;
  ambiguityPenalty: number;
  finalScore: number;
  displayScore: number;
  maxScoreEligible: boolean;
  notes: string[];
};

export type NormalizedServiceSignal = {
  serviceType: CanonicalService;
  jobSubtype?: string | null;
  jobSubtypeLabel?: string | null;
  workType?: WorkType | null;
  fallbackFamily?: FallbackFamily | null;
  surfaceFamily?: string | null;
  targetObjectFamily?: string | null;
  sizeBucket?: SizeBucket | null;
  estimatedQuantity?: number | null;
  quantityUnit?: QuantityUnit | null;
  quantityEvidence?: QuantityEvidence | null;
  materialClass?: string | null;
  materialSubtype?: string | null;
  conditionClass?: string | null;
  severityClass?: string | null;
  accessDifficulty?: AccessDifficulty | null;
  obstructionLevel?: ObstructionLevel | null;
  heightClass?: HeightClass | null;
  stories?: number | null;
  slopeClass?: SlopeClass | null;
  removalNeeded?: boolean | null;
  prepNeeded?: boolean | null;
  haulAwayNeeded?: boolean | null;
  poolPresent?: boolean | null;
  fencePresent?: boolean | null;
  deckPresent?: boolean | null;
  roofType?: string | null;
  surfaceDetections?: Array<{
    surface_type: HardSurfaceType;
    surface_area_sqft: number;
    confidence: number;
  }>;
  quotedSurfaces?: HardSurfaceMap;
  premiumPropertySignal?: boolean | null;
  luxuryHardscapeSignal?: boolean | null;
  commercialSignal?: boolean | null;
  customJobSignal?: boolean | null;
  needsManualReview?: boolean | null;
  aiConfidence?: number | null;
  aiConfidenceReasons?: string[];
  consistencyScore?: number | null;
  notes?: string[];
  summary?: string | null;
  scopeReconciliation?: ScopeReconciliationTrace | null;
};

export type AiEstimatorSignals = {
  summary: string;
  condition: "light" | "moderate" | "heavy";
  access: "easy" | "moderate" | "difficult";
  severity: "minor" | "moderate" | "major";
  debris: "none" | "light" | "moderate" | "heavy";
  multipleAreas: boolean;
  materialHint: string | null;
  inferredScope: string | null;
  treeSize: "small" | "medium" | "large";
  estimatedWindowCount: number | null;
  estimatedPoolSqft: number | null;
  estimatedFixtureCount: number | null;
  estimatedJunkCubicYards: number | null;
  internalConfidence: number;
  pricingDrivers: string[];
  estimatorNotes: string[];
  serviceSignals?: Partial<Record<CanonicalService, NormalizedServiceSignal>>;
  surfaceDetections?: Array<{
    surface_type: HardSurfaceType;
    surface_area_sqft: number;
    confidence: number;
  }>;
  surfaceDetectionConfidence?: number;
  satelliteClarity?: number;
  imageQuality?: number;
  scopeMatchConfidence?: number;
  propertyResolutionQuality?: number;
  detectedSurfaces?: HardSurfaceMap;
  quotedSurfaces?: HardSurfaceMap;
  terrainType?: TerrainType;
  terrainMultiplier?: number;
  accessType?: AccessType;
  accessTypeMultiplier?: number;
  materialType?: SurfaceMaterialType;
  materialMultiplier?: number;
  region?: PricingRegionKey;
  regionMultiplier?: number;
  luxuryScore?: number;
  luxuryMultiplier?: number;
  estateScore?: number;
  premiumPropertySignal?: boolean;
  commercialSignal?: boolean;
  customJobSignal?: boolean;
  needsManualReview?: boolean;
  aiConfidenceReasons?: string[];
};

export type EstimatorContext = {
  request: ServiceRequest;
  propertyData: PropertyData;
  regionalModel: RegionalCostModel;
  description: string;
  photoCount: number;
  signals: AiEstimatorSignals;
};

export type ServiceEstimate = {
  service: CanonicalService;
  lowEstimate: number;
  highEstimate: number;
  snapQuote: number;
  confidenceScore: number;
  internalConfidence: number;
  scopeSummary: string;
  pricingDrivers: string[];
  estimatorNotes: string[];
  serviceCategory: ServiceCategory;
  jobType: string;
  lineItems: Record<string, number>;
  terrain?: TerrainType | null;
  access?: AccessType | null;
  material?: SurfaceMaterialType | null;
  region?: PricingRegionKey | null;
  wash_surface_sqft?: number | null;
  detected_surfaces?: HardSurfaceMap;
  quoted_surfaces?: HardSurfaceMap;
  luxury_score?: number;
  luxury_multiplier?: number;
  outOfServiceArea?: boolean;
  appliedMultipliers?: {
    condition: number;
    terrain: number;
    access: number;
    material: number;
    regional: number;
    luxury: number;
  };
  scope_reconciliation?: ScopeReconciliationTrace | null;
  confidence_trace?: ConfidenceFactorTrace | null;
  estimatorAudit?: {
    finalization: {
      basePrice: number;
      conditionAdjusted: number;
      terrainAdjusted: number;
      accessAdjusted: number;
      materialAdjusted: number;
      regionAdjusted: number;
      luxuryAdjusted: number;
      floorAdjusted: number;
      preRoundingLowEstimate: number;
      preRoundingHighEstimate: number;
      roundedLowEstimate: number;
      roundedHighEstimate: number;
      priceChangedByFinalRounding: boolean;
      conditionMultiplierApplied: number;
      terrainMultiplierApplied: number;
      accessMultiplierApplied: number;
      materialMultiplierApplied: number;
      regionalMultiplierApplied: number;
      luxuryMultiplierApplied: number;
    };
  };
};

export type EngineEstimate = {
  service: string;
  snapQuote: number;
  lowEstimate: number;
  highEstimate: number;
  confidenceScore: number;
  confidence: LeadConfidence;
  scopeSummary: string;
  pricingDrivers: string[];
  estimatorNotes: string[];
  serviceCategory: ServiceCategory;
  jobType: string;
  pricingRegion: string;
  propertyData: PropertyData;
  serviceEstimates: ServiceEstimate[];
  lineItems: Record<string, number>;
  terrain?: TerrainType | null;
  access?: AccessType | null;
  material?: SurfaceMaterialType | null;
  region?: PricingRegionKey | null;
  wash_surface_sqft?: number | null;
  detected_surfaces?: HardSurfaceMap;
  quoted_surfaces?: HardSurfaceMap;
  snap_quote?: number;
  price_range?: string;
  confidence_score?: number;
  luxury_score?: number;
  luxury_multiplier?: number;
  outOfServiceArea?: boolean;
  multiplierSummary?: {
    pricingRegionModelKey: string;
    resolvedRegion: PricingRegionKey;
    regionalMultiplier: number;
    travelDistanceMiles: number | null;
    travelMultiplier: number;
    luxuryMultiplier: number;
    serviceMultipliers: Array<{
      service: CanonicalService;
      conditionMultiplier: number;
      terrainMultiplier: number;
      accessMultiplier: number;
      materialMultiplier: number;
      regionalMultiplier: number;
      luxuryMultiplier: number;
    }>;
  };
};

export type TieredRate = {
  upto: number;
  rate: number;
};

export type FinalizeEstimateInput = {
  service: CanonicalService;
  serviceCategory: ServiceCategory;
  jobType: string;
  scope: number;
  unitLabel: string;
  tieredRates: TieredRate[];
  materialMultiplier?: number;
  conditionMultiplier?: number;
  terrainMultiplier?: number;
  accessMultiplier?: number;
  regionalMultiplier?: number;
  luxuryMultiplier?: number;
  minimumJobPrice: number;
  internalConfidence: number;
  pricingDrivers: string[];
  estimatorNotes: string[];
  lineItems?: Record<string, number>;
  terrain?: TerrainType | null;
  access?: AccessType | null;
  material?: SurfaceMaterialType | null;
  region?: PricingRegionKey | null;
  washSurfaceSqft?: number | null;
  detectedSurfaces?: HardSurfaceMap;
  quotedSurfaces?: HardSurfaceMap;
  scopeReconciliation?: ScopeReconciliationTrace | null;
  confidenceTrace?: ConfidenceFactorTrace | null;
  baseScopeOverride?: number;
};

export type LuxuryProfile = {
  luxuryScore: number;
  luxuryMultiplier: number;
  poolDetected: boolean;
  drivewayArea: number;
  hardscapeArea: number;
};

export type ConfidenceScoreInput = {
  services: ServiceRequest[];
  propertyData: PropertyData;
  description: string;
  photoCount: number;
  signals: AiEstimatorSignals;
};

export type EvidenceConfidenceOptions = {
  quantityEvidence?: QuantityEvidence | null;
  knownPath?: boolean;
  usedFallbackFamily?: boolean;
  customJob?: boolean;
  needsManualReview?: boolean;
  conflictingSignals?: boolean;
  consistencyScore?: number | null;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundCurrency(value: number): number {
  return Math.max(0, Math.round(value));
}

export function sumSurfaceMap(surfaceMap: HardSurfaceMap | undefined): number {
  if (!surfaceMap) return 0;
  return HARD_SURFACE_TYPES.reduce((total, key) => total + (surfaceMap[key] ?? 0), 0);
}

export function roundToNearestTwentyFive(value: number): number {
  return Math.max(0, Math.round(value / 25) * 25);
}

export function midpoint(low: number, high: number): number {
  return roundToNearestTwentyFive((low + high) / 2);
}

export function getAnswer(answers: ServiceQuestionAnswers, key: string): string {
  const value = answers[key];
  if (Array.isArray(value)) return value.join(" | ");
  return typeof value === "string" ? value : "";
}

export function getAnswerSelections(answers: ServiceQuestionAnswers, key: string): string[] {
  return parseQuestionAnswer(answers[key]);
}

export function getAnswerByKeys(answers: ServiceQuestionAnswers, keys: readonly string[]): string {
  for (const key of keys) {
    const value = answers[key];
    if (Array.isArray(value) && value.length > 0) return value.join(" | ");
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

export function getAnswerSelectionsByKeys(answers: ServiceQuestionAnswers, keys: readonly string[]): string[] {
  const merged = keys.flatMap((key) => getAnswerSelections(answers, key));
  return Array.from(new Set(merged));
}

export function getOtherText(answers: ServiceQuestionAnswers, key: string): string {
  const value = answers[`${key}_other_text`];
  return typeof value === "string" ? value : "";
}

export function getServiceSignal(
  signals: AiEstimatorSignals,
  service: CanonicalService
): NormalizedServiceSignal | undefined {
  return signals.serviceSignals?.[service];
}

export function progressiveTieredBase(scope: number, tiers: TieredRate[]): number {
  let remaining = Math.max(0, scope);
  let previousCap = 0;
  let total = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierCap = Number.isFinite(tier.upto) ? tier.upto : previousCap + remaining;
    const tierSpan = Math.max(0, tierCap - previousCap);
    const unitsInTier = Math.min(remaining, tierSpan);
    total += unitsInTier * tier.rate;
    remaining -= unitsInTier;
    previousCap = tierCap;
  }

  return total;
}

function topBandSignalCount(trace: ConfidenceFactorTrace): number {
  return [
    trace.requiredInputs >= 4,
    trace.photoEvidence >= 8,
    trace.descriptionUsefulness >= 7,
    trace.propertyEvidence >= 7,
    trace.crossInputAgreement >= 8,
    trace.quantityEvidence >= 5.5,
    trace.estimatorPath >= 5,
    trace.reconciliation >= 5,
    trace.ambiguityPenalty >= 0
  ].filter(Boolean).length;
}

function qualifiesForMaxConfidence(trace: ConfidenceFactorTrace): boolean {
  return (
    trace.finalScore >= 92 &&
    trace.requiredInputs >= 4 &&
    trace.photoEvidence >= 8 &&
    trace.propertyEvidence >= 7 &&
    trace.crossInputAgreement >= 8 &&
    trace.quantityEvidence >= 5.5 &&
    trace.estimatorPath >= 5 &&
    trace.reconciliation >= 5 &&
    trace.ambiguityPenalty >= 0 &&
    topBandSignalCount(trace) >= 8
  );
}

function calibratedDisplayScore(rawScore: number, trace?: ConfidenceFactorTrace | null): number {
  const raw = clamp(rawScore, 48, 92);
  let score = raw;

  if (raw > 80) {
    score = 80 + (raw - 80) * 0.88;
  }
  if (raw > 86) {
    score = 85.28 + (raw - 86) * 0.72;
  }
  if (raw > 90) {
    score = 88.16 + (raw - 90) * 0.62;
  }

  if (trace) {
    const corroborationBoost =
      raw >= 88 && trace.ambiguityPenalty >= 0
        ? Math.min(Math.max(topBandSignalCount(trace) - 5, 0) * 0.3, 1.2)
        : 0;
    score += corroborationBoost;

    if (qualifiesForMaxConfidence(trace)) {
      return 92;
    }

    if (raw >= 90) {
      score = Math.min(score, 90.5);
    }
  }

  return clamp(score, 48, 92);
}

export function smoothDisplayConfidence(
  internalConfidence: number,
  confidenceTrace?: ConfidenceFactorTrace | null
): number {
  return calibratedDisplayScore(internalConfidence, confidenceTrace) / 100;
}

export function confidenceLabel(score: number): LeadConfidence {
  if (score >= 0.78) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

export function accessMultiplier(access: AiEstimatorSignals["access"]): number {
  switch (access) {
    case "moderate":
      return 1.12;
    case "difficult":
      return 1.25;
    default:
      return 1;
  }
}

export function regionalMultiplier(model: RegionalCostModel): number {
  return clamp(model.regionalMultiplier, 0.85, 1.3);
}

export function terrainMultiplier(terrain: TerrainType | null | undefined): number {
  switch (terrain) {
    case "moderate_slope":
      return 1.08;
    case "steep_hillside":
      return 1.15;
    default:
      return 1;
  }
}

export function hardSurfaceAccessMultiplier(access: AccessType | null | undefined): number {
  switch (access) {
    case "tight_access":
      return 1.07;
    case "gated_estate":
      return 1.1;
    default:
      return 1;
  }
}

export function hardSurfaceMaterialMultiplier(material: SurfaceMaterialType | null | undefined): number {
  switch (material) {
    case "asphalt":
      return 1.02;
    case "pavers":
      return 1.12;
    case "brick":
      return 1.1;
    case "stone":
      return 1.15;
    default:
      return 1;
  }
}

function mergeSurfaceMaps(serviceEstimates: ServiceEstimate[], key: "detected_surfaces" | "quoted_surfaces") {
  const merged: HardSurfaceMap = {};

  for (const surfaceType of HARD_SURFACE_TYPES) {
    const total = serviceEstimates.reduce((sum, estimate) => sum + (estimate[key]?.[surfaceType] ?? 0), 0);
    if (total > 0) {
      merged[surfaceType] = roundCurrency(total);
    }
  }

  return Object.keys(merged).length ? merged : undefined;
}

export function computeLuxuryProfile(
  propertyData: PropertyData,
  signals: Pick<AiEstimatorSignals, "detectedSurfaces" | "estimatedPoolSqft" | "materialType">
): LuxuryProfile {
  const lotSize = propertyData.lotSizeSqft ?? 0;
  const backyardSize = propertyData.estimatedBackyardSqft ?? 0;
  const detectedSurfaces = signals.detectedSurfaces ?? {};
  const drivewayArea = (detectedSurfaces.driveway ?? 0) + (detectedSurfaces.motor_court ?? 0);
  const baseHardscapeArea = detectedSurfaces.patio ?? 0;
  const premiumHardscapeArea =
    signals.materialType && ["pavers", "stone", "brick"].includes(signals.materialType)
      ? sumSurfaceMap(detectedSurfaces)
      : 0;
  const hardscapeArea = Math.max(baseHardscapeArea, premiumHardscapeArea);
  const poolDetected = (signals.estimatedPoolSqft ?? 0) > 0;
  let luxuryScore = 0;

  if (lotSize > 10000) luxuryScore += 1;
  if (lotSize > 20000) luxuryScore += 2;
  if (lotSize > 40000) luxuryScore += 3;
  if (drivewayArea > 1200) luxuryScore += 1;
  if (drivewayArea > 2500) luxuryScore += 2;
  if (backyardSize > 4000) luxuryScore += 1;
  if (backyardSize > 8000) luxuryScore += 2;
  if (hardscapeArea > 1200) luxuryScore += 1;
  if (poolDetected) luxuryScore += 1;

  const luxuryMultiplier =
    luxuryScore >= 7 ? 1.4 : luxuryScore >= 5 ? 1.3 : luxuryScore >= 3 ? 1.15 : 1;

  return {
    luxuryScore,
    luxuryMultiplier,
    poolDetected,
    drivewayArea,
    hardscapeArea
  };
}

function applyLuxuryToServiceEstimate(
  estimate: ServiceEstimate,
  luxuryProfile: LuxuryProfile
): ServiceEstimate {
  if (estimate.outOfServiceArea) {
    return estimate;
  }

  const baseSnapQuote = estimate.snapQuote;
  const luxuryAdjustedLow = roundToNearestTwentyFive(estimate.lowEstimate * luxuryProfile.luxuryMultiplier);
  const luxuryAdjustedHigh = roundToNearestTwentyFive(estimate.highEstimate * luxuryProfile.luxuryMultiplier);
  const luxuryAdjustedSnapQuote = midpoint(luxuryAdjustedLow, luxuryAdjustedHigh);
  const luxuryAdjustment = roundCurrency(luxuryAdjustedSnapQuote - baseSnapQuote);

  return {
    ...estimate,
    lowEstimate: luxuryAdjustedLow,
    highEstimate: Math.max(luxuryAdjustedLow, luxuryAdjustedHigh),
    snapQuote: luxuryAdjustedSnapQuote,
    pricingDrivers: Array.from(
      new Set([
        ...estimate.pricingDrivers,
        ...(luxuryProfile.luxuryMultiplier > 1 ? ["Luxury property adjustment"] : [])
      ])
    ).slice(0, 10),
    estimatorNotes: Array.from(
      new Set([
        ...estimate.estimatorNotes,
        `Luxury score ${luxuryProfile.luxuryScore}; multiplier ${luxuryProfile.luxuryMultiplier.toFixed(2)}.`
      ])
    ).slice(0, 10),
    lineItems: {
      ...estimate.lineItems,
      luxury_adjustment: (estimate.lineItems.luxury_adjustment ?? 0) + luxuryAdjustment
    },
    luxury_score: luxuryProfile.luxuryScore,
    luxury_multiplier: luxuryProfile.luxuryMultiplier
  };
}

export function conditionMultiplier(
  condition: AiEstimatorSignals["condition"],
  intensity: { moderate: number; heavy: number }
): number {
  if (condition === "heavy") return intensity.heavy;
  if (condition === "moderate") return intensity.moderate;
  return 1;
}

export function uncertaintyPct(internalConfidence: number, scope: number): number {
  let uncertainty =
    internalConfidence >= 88 ? 0.12 : internalConfidence >= 78 ? 0.18 : internalConfidence >= 66 ? 0.26 : 0.38;

  if (scope > 5000) uncertainty += 0.04;
  if (scope > 10000) uncertainty += 0.04;

  return clamp(uncertainty, 0.12, 0.5);
}

export function estimateDrivewaySqft(propertyData: PropertyData): number {
  const lot = propertyData.lotSizeSqft ?? 7000;
  return roundCurrency(clamp(lot * 0.09, 180, 1600));
}

export function estimatePatioOrDeckSqft(propertyData: PropertyData, ratio: number, min = 120, max = 650): number {
  const base = propertyData.estimatedBackyardSqft ?? propertyData.lotSizeSqft ?? 2500;
  return roundCurrency(clamp(base * ratio, min, max));
}

export function estimateRoofPerimeter(propertyData: PropertyData): number {
  const houseSqft = propertyData.houseSqft ?? 1800;
  return roundCurrency(clamp(Math.sqrt(houseSqft) * 4.6, 120, 420));
}

export function estimateRoofArea(propertyData: PropertyData): number {
  const houseSqft = propertyData.houseSqft ?? 1800;
  return roundCurrency(houseSqft * 1.18);
}

export function estimatePaintableArea(propertyData: PropertyData): number {
  const houseSqft = propertyData.houseSqft ?? 1800;
  return roundCurrency(houseSqft * 2.5);
}

export function estimateFenceLinearFt(propertyData: PropertyData): number {
  const yard = propertyData.estimatedBackyardSqft ?? 3200;
  return roundCurrency(clamp(Math.sqrt(yard) * 3.6, 40, 320));
}

export function estimateMowableArea(propertyData: PropertyData, landscapeBedPct = 0.08): number {
  const lot = propertyData.lotSizeSqft ?? 7200;
  const house = propertyData.houseSqft ?? lot * 0.24;
  const driveway = estimateDrivewaySqft(propertyData);
  const patioDeck = estimatePatioOrDeckSqft(propertyData, 0.1, 80, 500);
  const pool = 0;
  const beds = lot * landscapeBedPct;
  return roundCurrency(Math.max(lot - house - driveway - patioDeck - pool - beds, 300));
}

function hasSubstantiveAnswer(answer: ServiceQuestionAnswerValue | undefined): boolean {
  const selections = parseQuestionAnswer(answer);
  if (selections.length === 0) return false;
  return selections.some((selection) => !/^not sure$/i.test(selection));
}

function answeredQuestionStats(services: ServiceRequest[]) {
  return services.reduce(
    (totals, request) => {
      const questions = serviceQuestions[request.service as ServiceType] ?? [];
      const answeredQuestions = questions.reduce((count, question) => {
        const answer = getAnswer(request.answers, question.key).trim();
        return count + (hasSubstantiveAnswer(answer) ? 1 : 0);
      }, 0);

      const usefulOtherText = questions.reduce((count, question) => {
        const otherText = getOtherText(request.answers, question.key).trim();
        return count + (otherText.length >= 8 ? 1 : 0);
      }, 0);

      return {
        answeredQuestions: totals.answeredQuestions + answeredQuestions,
        totalQuestions: totals.totalQuestions + questions.length,
        usefulOtherText: totals.usefulOtherText + usefulOtherText
      };
    },
    { answeredQuestions: 0, totalQuestions: 0, usefulOtherText: 0 }
  );
}

function propertyEvidenceScore(propertyData: PropertyData): number {
  const locationStrong = propertyData.locationSource !== "unavailable";
  const lotStrong = propertyData.lotSizeSource === "parcel_data" || propertyData.lotSizeSource === "solar_estimate";
  const houseStrong = propertyData.houseSqftSource === "solar_building_ground_area";
  if (locationStrong && lotStrong && houseStrong) return 9;
  if (locationStrong && (lotStrong || propertyData.houseSqft != null)) return 7;
  if (locationStrong || propertyData.lotSizeSqft != null || propertyData.houseSqft != null) return 4;
  return 1.5;
}

function directQuantityClueScore(text: string): number {
  if (
    /(\d{1,4}\s*(x|by)\s*\d{1,4})|(\d{2,5}\s*(sq\s*ft|sqft|square feet|linear feet|linear foot|windows|trees|lights|fixtures|stumps))/i.test(
      text
    )
  ) {
    return 10;
  }
  return 0;
}

function descriptionEvidenceScore(description: string): number {
  const trimmed = description.trim();
  const directClues = directQuantityClueScore(trimmed);
  if (directClues > 0) return 10;
  if (trimmed.length >= 120) return 8.5;
  if (trimmed.length >= 60) return 7;
  if (trimmed.length >= 20) return 4.5;
  if (trimmed.length > 0) return 1.5;
  return 0;
}

function photoEvidenceScore(photoCount: number, signals: AiEstimatorSignals): number {
  if (photoCount <= 0) return 0;

  const imageQuality = signals.imageQuality ?? 56;
  const scopeMatch = signals.scopeMatchConfidence ?? 58;
  const detectionConfidence = signals.surfaceDetectionConfidence ?? 55;
  let score = photoCount >= 4 ? 4.5 : photoCount >= 2 ? 3.5 : 2;

  score += imageQuality >= 84 ? 3 : imageQuality >= 70 ? 2 : imageQuality >= 58 ? 1 : 0;
  score += scopeMatch >= 86 ? 2 : scopeMatch >= 72 ? 1 : 0;
  score += detectionConfidence >= 84 ? 1.5 : detectionConfidence >= 70 ? 0.75 : 0;

  return clamp(score, 0, 10);
}

function quantityEvidenceWeight(quantityEvidence: QuantityEvidence | null | undefined): number {
  switch (quantityEvidence) {
    case "direct":
      return 9.5;
    case "strong_inference":
      return 5.5;
    case "weak_inference":
      return 2;
    default:
      return 0.5;
  }
}

function pathStrengthScore(signal: NormalizedServiceSignal | undefined, options: EvidenceConfidenceOptions): number {
  const knownPath = options.knownPath ?? Boolean(signal?.jobSubtype);
  const fallbackPath = options.usedFallbackFamily ?? Boolean(signal?.fallbackFamily);

  let score = knownPath ? 5 : fallbackPath ? 2 : 1;
  if (signal?.customJobSignal || options.customJob) score -= 2.5;
  if (signal?.needsManualReview || options.needsManualReview) score -= 2.5;
  return score;
}

function agreementScore(consistencyScore: number): number {
  if (consistencyScore >= 88) return 8;
  if (consistencyScore >= 78) return 6;
  if (consistencyScore >= 68) return 4;
  if (consistencyScore >= 58) return 2;
  if (consistencyScore >= 48) return 0;
  return -4;
}

function ambiguityPenalty(
  context: Pick<EstimatorContext, "description" | "photoCount">,
  signal: NormalizedServiceSignal | undefined,
  options: EvidenceConfidenceOptions
): { score: number; notes: string[] } {
  let penalty = 0;
  const notes: string[] = [];

  if (options.conflictingSignals) {
    penalty -= 8;
    notes.push("Conflicting signals pulled confidence down.");
  }
  if (signal?.customJobSignal || options.customJob) {
    penalty -= 4;
    notes.push("Custom or unusual scope reduced certainty.");
  }
  if (signal?.needsManualReview || options.needsManualReview) {
    penalty -= 6;
    notes.push("Manual-review recommendation reduced confidence.");
  }
  if (context.photoCount === 1) {
    penalty -= 1.5;
    notes.push("A single photo helps, but only modestly.");
  } else if (context.photoCount === 0) {
    penalty -= 6;
    notes.push("No photos reduced evidence quality.");
  }
  if (context.description.trim().length > 0 && context.description.trim().length < 16) {
    penalty -= 2.5;
    notes.push("Short description added little scope detail.");
  }
  if (signal?.scopeReconciliation?.componentTrace?.some((component) => component.selectedOptions.length > 1)) {
    penalty -= signal.scopeReconciliation.reconciliationStrength === "strong" ? 1 : 3;
    notes.push("Blended multi-select scope introduced some ambiguity.");
  }

  return { score: penalty, notes };
}

function reconciliationConfidenceImpact(
  trace: ScopeReconciliationTrace | null | undefined
): number {
  if (!trace) return -1.5;

  let score =
    trace.reconciliationStrength === "strong"
      ? 5
      : trace.reconciliationStrength === "moderate"
        ? 2.5
        : 0.5;

  if (trace.anchorDriftPct != null) {
    if (trace.anchorDriftPct <= 0.12) score += 2;
    else if (trace.anchorDriftPct <= 0.28) score += 1;
    else if (trace.anchorDriftPct >= 0.8) score -= 5;
    else if (trace.anchorDriftPct >= 0.55) score -= 3;
  }

  if (trace.propertyDriftPct != null) {
    if (trace.propertyDriftPct <= 0.18) score += 1.5;
    else if (trace.propertyDriftPct >= 0.85) score -= 4;
    else if (trace.propertyDriftPct >= 0.6) score -= 2;
  }

  if (trace.manualReviewRecommended) score -= 4;
  if (trace.sanityBandApplied && trace.reconciliationStrength === "weak") score -= 2.5;
  if (trace.notes.some((note) => /heavily damped|stable anchor band/i.test(note))) score += 0.5;

  return clamp(score, -8, 9);
}

function confidenceTraceFromInputs(input: {
  answeredQuestions: number;
  totalQuestions: number;
  usefulOtherText: number;
  description: string;
  photoCount: number;
  propertyData: PropertyData;
  signals: AiEstimatorSignals;
  signal?: NormalizedServiceSignal;
  options?: EvidenceConfidenceOptions;
}): ConfidenceFactorTrace {
  const { answeredQuestions, totalQuestions, usefulOtherText, description, photoCount, propertyData, signals } = input;
  const signal = input.signal;
  const options = input.options ?? {};
  const questionCompletion = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;
  const completenessBoost =
    questionCompletion >= 1 ? 4 : questionCompletion >= 0.75 ? 2.5 : questionCompletion > 0 ? 1 : 0;
  const otherTextBoost = Math.min(usefulOtherText * 1.25, 3);
  const quantityEvidence = options.quantityEvidence ?? signal?.quantityEvidence ?? "fallback";
  const consistencyScore = clamp(
    options.consistencyScore ?? signal?.consistencyScore ?? signals.scopeMatchConfidence ?? 60,
    0,
    100
  );
  const { score: ambiguity, notes: ambiguityNotes } = ambiguityPenalty(
    { description, photoCount },
    signal,
    options
  );

  const trace: ConfidenceFactorTrace = {
    baseFloor: 50,
    requiredInputs: completenessBoost + otherTextBoost,
    photoEvidence: photoEvidenceScore(photoCount, signals),
    descriptionUsefulness: descriptionEvidenceScore(description),
    propertyEvidence: propertyEvidenceScore(propertyData),
    crossInputAgreement: agreementScore(consistencyScore),
    quantityEvidence: quantityEvidenceWeight(quantityEvidence),
    estimatorPath: pathStrengthScore(signal, options),
    reconciliation: reconciliationConfidenceImpact(signal?.scopeReconciliation),
    ambiguityPenalty: ambiguity,
    finalScore: 50,
    displayScore: 50,
    maxScoreEligible: false,
    notes: []
  };

  trace.finalScore = clamp(
    trace.baseFloor +
      trace.requiredInputs +
      trace.photoEvidence +
      trace.descriptionUsefulness +
      trace.propertyEvidence +
      trace.crossInputAgreement +
      trace.quantityEvidence +
      trace.estimatorPath +
      trace.reconciliation +
      trace.ambiguityPenalty,
    50,
    92
  );

  trace.maxScoreEligible = qualifiesForMaxConfidence(trace);
  trace.displayScore = calibratedDisplayScore(trace.finalScore, trace);

  trace.notes = [
    questionCompletion >= 1
      ? "Required questionnaire inputs were complete."
      : "Partial questionnaire completion limited confidence.",
    photoCount > 0
      ? `Photo evidence contributed ${trace.photoEvidence.toFixed(1)} points.`
      : "No photo evidence was available.",
    description.trim().length >= 20
      ? "Description provided usable scope detail."
      : "Description added limited scope detail.",
    propertyData.locationSource !== "unavailable"
      ? "Property and location data contributed corroboration."
      : "Property context was weak.",
    quantityEvidence === "direct"
      ? "Quantity evidence was direct."
      : quantityEvidence === "strong_inference"
        ? "Quantity evidence was inferred but fairly well supported."
        : "Quantity evidence was mostly inferred.",
    trace.maxScoreEligible
      ? "Exceptional corroboration unlocked the top confidence band."
      : trace.finalScore >= 90
        ? "Top-end confidence was compressed until corroboration cleared the exceptional-confidence gate."
        : "Confidence stayed within the standard evidence band.",
    ...ambiguityNotes
  ];

  return trace;
}

function defaultConsistency(signals: AiEstimatorSignals): number {
  if (signals.scopeMatchConfidence != null) return clamp(signals.scopeMatchConfidence, 0, 100);
  return 60;
}

export function computeGlobalConfidenceScore(input: ConfidenceScoreInput): number {
  const { answeredQuestions, totalQuestions, usefulOtherText } = answeredQuestionStats(input.services);
  const serviceSignals = Object.values(input.signals.serviceSignals ?? {}).filter(Boolean) as NormalizedServiceSignal[];
  const traces =
    serviceSignals.length > 0
      ? serviceSignals.map((signal) =>
          confidenceTraceFromInputs({
            answeredQuestions,
            totalQuestions,
            usefulOtherText,
            description: input.description,
            photoCount: input.photoCount,
            propertyData: input.propertyData,
            signals: input.signals,
            signal
          })
        )
      : [
          confidenceTraceFromInputs({
            answeredQuestions,
            totalQuestions,
            usefulOtherText,
            description: input.description,
            photoCount: input.photoCount,
            propertyData: input.propertyData,
            signals: input.signals,
            options: {
              consistencyScore: defaultConsistency(input.signals)
            }
          })
        ];

  const average = traces.reduce((sum, trace) => sum + trace.displayScore, 0) / Math.max(traces.length, 1);
  return clamp(average, 48, 92) / 100;
}

export function buildConfidenceTrace(
  context: EstimatorContext,
  options: EvidenceConfidenceOptions = {}
): ConfidenceFactorTrace {
  const questions = serviceQuestions[context.request.service as ServiceType] ?? [];
  const answeredCount = questions.reduce(
    (count, question) => count + (hasSubstantiveAnswer(context.request.answers[question.key]) ? 1 : 0),
    0
  );
  const usefulOtherTextCount = questions.reduce((count, question) => {
    const otherText = getOtherText(context.request.answers, question.key).trim();
    return count + (otherText.length >= 8 ? 1 : 0);
  }, 0);

  return confidenceTraceFromInputs({
    answeredQuestions: answeredCount,
    totalQuestions: questions.length,
    usefulOtherText: usefulOtherTextCount,
    description: context.description.trim(),
    photoCount: context.photoCount,
    propertyData: context.propertyData,
    signals: context.signals,
    signal: getServiceSignal(context.signals, context.request.service),
    options
  });
}

export function baseInternalConfidence(
  context: EstimatorContext,
  options: EvidenceConfidenceOptions = {}
): number {
  return buildConfidenceTrace(context, options).finalScore;
}

function isEstimatorAuditEnabled(): boolean {
  const raw = process.env.SNAPQUOTE_ESTIMATOR_AUDIT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function finalizeEstimate(input: FinalizeEstimateInput): ServiceEstimate {
  const conditionMultiplierApplied = input.conditionMultiplier ?? 1;
  const terrainMultiplierApplied = input.terrainMultiplier ?? 1;
  const accessMultiplierApplied = input.accessMultiplier ?? 1;
  const materialMultiplierApplied = input.materialMultiplier ?? 1;
  const regionalMultiplierApplied = input.regionalMultiplier ?? 1;
  const luxuryMultiplierApplied = input.luxuryMultiplier ?? 1;
  const basePrice = input.baseScopeOverride ?? progressiveTieredBase(input.scope, input.tieredRates);
  const conditionAdjusted = basePrice * conditionMultiplierApplied;
  const terrainAdjusted = conditionAdjusted * terrainMultiplierApplied;
  const accessAdjusted = terrainAdjusted * accessMultiplierApplied;
  const materialAdjusted = accessAdjusted * materialMultiplierApplied;
  const regionAdjusted = materialAdjusted * regionalMultiplierApplied;
  const luxuryAdjusted = regionAdjusted * luxuryMultiplierApplied;
  const floorAdjusted = Math.max(luxuryAdjusted, input.minimumJobPrice);
  const spread = uncertaintyPct(input.internalConfidence, input.scope);
  const preRoundingLowEstimate = Math.max(input.minimumJobPrice, floorAdjusted * (1 - spread));
  const preRoundingHighEstimate = Math.max(preRoundingLowEstimate, floorAdjusted * (1 + spread));
  const lowEstimate = roundToNearestTwentyFive(preRoundingLowEstimate);
  const highEstimate = roundToNearestTwentyFive(preRoundingHighEstimate);
  const estimatorAudit =
    isEstimatorAuditEnabled()
      ? {
          finalization: {
            basePrice: roundCurrency(basePrice),
            conditionAdjusted: roundCurrency(conditionAdjusted),
            terrainAdjusted: roundCurrency(terrainAdjusted),
            accessAdjusted: roundCurrency(accessAdjusted),
            materialAdjusted: roundCurrency(materialAdjusted),
            regionAdjusted: roundCurrency(regionAdjusted),
            luxuryAdjusted: roundCurrency(luxuryAdjusted),
            floorAdjusted: roundCurrency(floorAdjusted),
            preRoundingLowEstimate: roundCurrency(preRoundingLowEstimate),
            preRoundingHighEstimate: roundCurrency(preRoundingHighEstimate),
            roundedLowEstimate: lowEstimate,
            roundedHighEstimate: highEstimate,
            priceChangedByFinalRounding:
              roundCurrency(preRoundingLowEstimate) !== lowEstimate ||
              roundCurrency(preRoundingHighEstimate) !== highEstimate,
            conditionMultiplierApplied,
            terrainMultiplierApplied,
            accessMultiplierApplied,
            materialMultiplierApplied,
            regionalMultiplierApplied,
            luxuryMultiplierApplied
          }
        }
      : undefined;

  return {
    service: input.service,
    lowEstimate,
    highEstimate,
    snapQuote: midpoint(lowEstimate, highEstimate),
    confidenceScore: smoothDisplayConfidence(input.internalConfidence, input.confidenceTrace),
    internalConfidence: input.internalConfidence,
    scopeSummary: `${roundCurrency(input.scope)} ${input.unitLabel}`,
    pricingDrivers: input.pricingDrivers,
    estimatorNotes: input.estimatorNotes,
    serviceCategory: input.serviceCategory,
    jobType: input.jobType,
    lineItems: {
      base_scope: roundCurrency(basePrice),
      material_adjustment: roundCurrency(basePrice * ((input.materialMultiplier ?? 1) - 1)),
      condition_adjustment: roundCurrency(basePrice * ((input.conditionMultiplier ?? 1) - 1)),
      terrain_adjustment: roundCurrency(terrainAdjusted - conditionAdjusted),
      access_adjustment: roundCurrency(accessAdjusted - terrainAdjusted),
      regional_adjustment: roundCurrency(regionAdjusted - materialAdjusted),
      luxury_adjustment: roundCurrency(luxuryAdjusted - regionAdjusted),
      minimum_job_floor: roundCurrency(Math.max(0, input.minimumJobPrice - luxuryAdjusted)),
      ...(input.lineItems ?? {})
    },
    terrain: input.terrain ?? null,
    access: input.access ?? null,
    material: input.material ?? null,
    region: input.region ?? null,
    wash_surface_sqft: input.washSurfaceSqft ?? null,
    detected_surfaces: input.detectedSurfaces,
    quoted_surfaces: input.quotedSurfaces,
    luxury_score: undefined,
    luxury_multiplier: input.luxuryMultiplier,
    appliedMultipliers: {
      condition: conditionMultiplierApplied,
      terrain: terrainMultiplierApplied,
      access: accessMultiplierApplied,
      material: materialMultiplierApplied,
      regional: regionalMultiplierApplied,
      luxury: luxuryMultiplierApplied
    },
    scope_reconciliation: input.scopeReconciliation ?? null,
    confidence_trace: input.confidenceTrace ?? null,
    estimatorAudit
  };
}

export function aggregateEngineEstimate(
  serviceEstimates: ServiceEstimate[],
  propertyData: PropertyData,
  pricingRegion: string,
  signals: AiEstimatorSignals,
  confidenceInput?: Omit<ConfidenceScoreInput, "propertyData" | "signals">
): EngineEstimate {
  const luxuryProfile = computeLuxuryProfile(propertyData, signals);
  const luxuryAdjustedServiceEstimates = serviceEstimates.map((estimate) =>
    applyLuxuryToServiceEstimate(estimate, luxuryProfile)
  );
  const travelDistanceMiles = propertyData.travelDistanceMiles ?? null;
  const travelMultiplier = 1 + getTravelAdjustmentPct(travelDistanceMiles);
  const lowEstimateBeforeTravel = roundToNearestTwentyFive(
    luxuryAdjustedServiceEstimates.reduce((total, estimate) => total + estimate.lowEstimate, 0)
  );
  const highEstimateBeforeTravel = roundToNearestTwentyFive(
    luxuryAdjustedServiceEstimates.reduce((total, estimate) => total + estimate.highEstimate, 0)
  );
  const lowEstimate = roundToNearestTwentyFive(lowEstimateBeforeTravel * travelMultiplier);
  const highEstimate = roundToNearestTwentyFive(highEstimateBeforeTravel * travelMultiplier);
  const snapQuote = midpoint(lowEstimate, highEstimate);
  const snapQuoteBeforeTravel = midpoint(lowEstimateBeforeTravel, highEstimateBeforeTravel);
  const pricingDrivers = Array.from(
    new Set(luxuryAdjustedServiceEstimates.flatMap((estimate) => estimate.pricingDrivers))
  )
    .concat(travelMultiplier > 1 ? ["Travel distance adjustment"] : [])
    .slice(0, 8);
  const estimatorNotes = Array.from(
    new Set(luxuryAdjustedServiceEstimates.flatMap((estimate) => estimate.estimatorNotes))
  ).slice(0, 8);
  const lineItems = luxuryAdjustedServiceEstimates.reduce<Record<string, number>>((result, estimate) => {
    for (const [key, value] of Object.entries(estimate.lineItems)) {
      result[key] = (result[key] ?? 0) + value;
    }
    result[estimate.service] = (result[estimate.service] ?? 0) + estimate.snapQuote;
    return result;
  }, {});
  lineItems.travel_adjustment = roundCurrency(Math.max(0, snapQuote - snapQuoteBeforeTravel));
  const detectedSurfaces = mergeSurfaceMaps(luxuryAdjustedServiceEstimates, "detected_surfaces");
  const quotedSurfaces = mergeSurfaceMaps(luxuryAdjustedServiceEstimates, "quoted_surfaces");
  const washSurfaceSqft = luxuryAdjustedServiceEstimates.some((estimate) => estimate.wash_surface_sqft != null)
    ? roundCurrency(
        luxuryAdjustedServiceEstimates.reduce((total, estimate) => total + (estimate.wash_surface_sqft ?? 0), 0)
      )
    : null;
  const firstRichSignal = luxuryAdjustedServiceEstimates.find(
    (estimate) => estimate.terrain || estimate.access || estimate.material || estimate.region
  );
  const resolvedRegion = firstRichSignal?.region ?? signals.region ?? "default";
  const serviceMultipliers = luxuryAdjustedServiceEstimates.map((estimate) => {
    const finalization = estimate.estimatorAudit?.finalization;
    return {
      service: estimate.service,
      conditionMultiplier: estimate.appliedMultipliers?.condition ?? finalization?.conditionMultiplierApplied ?? 1,
      terrainMultiplier: estimate.appliedMultipliers?.terrain ?? finalization?.terrainMultiplierApplied ?? 1,
      accessMultiplier: estimate.appliedMultipliers?.access ?? finalization?.accessMultiplierApplied ?? 1,
      materialMultiplier: estimate.appliedMultipliers?.material ?? finalization?.materialMultiplierApplied ?? 1,
      regionalMultiplier: estimate.appliedMultipliers?.regional ?? finalization?.regionalMultiplierApplied ?? 1,
      luxuryMultiplier: estimate.appliedMultipliers?.luxury ?? finalization?.luxuryMultiplierApplied ?? 1
    };
  });
  const outOfServiceArea = luxuryAdjustedServiceEstimates.some((estimate) => estimate.outOfServiceArea);
  const serviceConfidenceAverage =
    luxuryAdjustedServiceEstimates.reduce((total, estimate) => total + estimate.confidenceScore, 0) /
    Math.max(luxuryAdjustedServiceEstimates.length, 1);
  const evidenceConfidence =
    confidenceInput == null
      ? serviceConfidenceAverage
      : computeGlobalConfidenceScore({
          ...confidenceInput,
          propertyData,
          signals
        });
  const confidenceScore = outOfServiceArea
    ? 0
    : clamp((serviceConfidenceAverage * 0.55 + evidenceConfidence * 0.45) * 100, 48, 92) / 100;

  return {
    service:
      luxuryAdjustedServiceEstimates.length === 1
        ? luxuryAdjustedServiceEstimates[0].service
        : luxuryAdjustedServiceEstimates.map((estimate) => estimate.service).join(", "),
    snapQuote,
    lowEstimate,
    highEstimate,
    confidenceScore,
    confidence: confidenceLabel(confidenceScore),
    scopeSummary: serviceEstimates
      .map((estimate) => `${estimate.service}: ${estimate.scopeSummary}`)
      .join(" | "),
    pricingDrivers,
    estimatorNotes,
    serviceCategory:
      luxuryAdjustedServiceEstimates.length === 1 ? luxuryAdjustedServiceEstimates[0].serviceCategory : "other",
    jobType:
      luxuryAdjustedServiceEstimates.length === 1
        ? luxuryAdjustedServiceEstimates[0].jobType
        : "multi_service_request",
    pricingRegion,
    propertyData,
    serviceEstimates: luxuryAdjustedServiceEstimates,
    lineItems,
    terrain: firstRichSignal?.terrain ?? null,
    access: firstRichSignal?.access ?? null,
    material: firstRichSignal?.material ?? null,
    region: resolvedRegion,
    wash_surface_sqft: washSurfaceSqft,
    detected_surfaces: detectedSurfaces,
    quoted_surfaces: quotedSurfaces,
    snap_quote: snapQuote,
    price_range: `${lowEstimate.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    })} - ${highEstimate.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    })}`,
    confidence_score: confidenceScore,
    luxury_score: luxuryProfile.luxuryScore,
    luxury_multiplier: luxuryProfile.luxuryMultiplier,
    outOfServiceArea,
    multiplierSummary: {
      pricingRegionModelKey: pricingRegion,
      resolvedRegion,
      regionalMultiplier: serviceMultipliers[0]?.regionalMultiplier ?? 1,
      travelDistanceMiles,
      travelMultiplier,
      luxuryMultiplier: luxuryProfile.luxuryMultiplier,
      serviceMultipliers
    }
  };
}
