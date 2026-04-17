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

const LISTED_SERVICE_BASE_TIERS = [55, 65, 75, 85, 92] as const;
const OTHER_SERVICE_BASE_TIERS = [50, 58, 66, 74, 82] as const;
const VAGUE_CONFIDENCE_SELECTIONS = new Set(["other", "not sure"]);
const MAX_PHOTO_CONFIDENCE_BONUS = 8;

type DeterministicConfidenceTier = 1 | 2 | 3 | "other";

type DeterministicConfidenceServiceConfig = {
  tier: DeterministicConfidenceTier;
  baseline: number;
  floor: number;
  cap?: number;
};

const DETERMINISTIC_CONFIDENCE_SERVICE_CONFIG: Record<CanonicalService, DeterministicConfidenceServiceConfig> = {
  "Pressure Washing": { tier: 1, baseline: 80, floor: 47 },
  "Gutter Cleaning": { tier: 1, baseline: 80, floor: 47 },
  "Window Cleaning": { tier: 1, baseline: 80, floor: 47 },
  "Pool Service / Cleaning": { tier: 1, baseline: 80, floor: 47 },
  "Lawn Care / Maintenance": { tier: 1, baseline: 80, floor: 47 },
  "Junk Removal": { tier: 1, baseline: 80, floor: 47 },
  "Landscaping / Installation": { tier: 2, baseline: 75, floor: 42 },
  "Tree Service / Removal": { tier: 2, baseline: 75, floor: 42 },
  "Fence Installation / Repair": { tier: 2, baseline: 75, floor: 42 },
  "Exterior Painting": { tier: 2, baseline: 75, floor: 42 },
  "Outdoor Lighting Installation": { tier: 2, baseline: 75, floor: 42 },
  "Concrete": { tier: 3, baseline: 70, floor: 37 },
  "Deck Installation / Repair": { tier: 3, baseline: 70, floor: 37 },
  "Roofing": { tier: 3, baseline: 70, floor: 37 },
  "Other": { tier: "other", baseline: 60, floor: 15, cap: 70 }
};

export type JobStandardness = "standard" | "somewhat_unusual" | "unusual";
export type ScopeClarity = "clear" | "moderate" | "ambiguous";
export type RemainingUncertainty = "low" | "medium" | "high";

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
  jobStandardness?: JobStandardness | null;
  scopeClarity?: ScopeClarity | null;
  remainingUncertainty?: RemainingUncertainty | null;
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

function qualifiesForMaxConfidence(trace: ConfidenceFactorTrace): boolean {
  return trace.finalScore >= 92;
}

function calibratedDisplayScore(rawScore: number): number {
  return clamp(rawScore, 0, 100);
}

export function smoothDisplayConfidence(
  internalConfidence: number,
  _confidenceTrace?: ConfidenceFactorTrace | null
): number {
  return calibratedDisplayScore(internalConfidence) / 100;
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
  return 0.1;
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
  return selections.some((selection) => !VAGUE_CONFIDENCE_SELECTIONS.has(selection.trim().toLowerCase()));
}

function hasAnyAnswer(answer: ServiceQuestionAnswerValue | undefined): boolean {
  return parseQuestionAnswer(answer).length > 0;
}

function isVagueQuestionAnswer(answer: ServiceQuestionAnswerValue | undefined): boolean {
  const selections = parseQuestionAnswer(answer);
  return selections.some((selection) => VAGUE_CONFIDENCE_SELECTIONS.has(selection.trim().toLowerCase()));
}

type ConfidenceQuestionStats = {
  answeredQuestions: number;
  substantiveAnsweredQuestions: number;
  totalQuestions: number;
  vagueAnswers: number;
  nonVagueSelections: number;
};

function confidenceQuestionStats(request: ServiceRequest): ConfidenceQuestionStats {
  const questions = serviceQuestions[request.service as ServiceType] ?? [];

  return questions.reduce<ConfidenceQuestionStats>(
    (totals, question) => {
      const answer = request.answers[question.key];
      return {
        answeredQuestions: totals.answeredQuestions + (hasAnyAnswer(answer) ? 1 : 0),
        substantiveAnsweredQuestions: totals.substantiveAnsweredQuestions + (hasSubstantiveAnswer(answer) ? 1 : 0),
        totalQuestions: totals.totalQuestions + 1,
        vagueAnswers: totals.vagueAnswers + parseQuestionAnswer(answer).filter((selection) => VAGUE_CONFIDENCE_SELECTIONS.has(selection.trim().toLowerCase())).length,
        nonVagueSelections:
          totals.nonVagueSelections +
          parseQuestionAnswer(answer).filter((selection) => !VAGUE_CONFIDENCE_SELECTIONS.has(selection.trim().toLowerCase())).length
      };
    },
    {
      answeredQuestions: 0,
      substantiveAnsweredQuestions: 0,
      totalQuestions: 0,
      vagueAnswers: 0,
      nonVagueSelections: 0
    }
  );
}

export function getDeterministicConfidenceServiceConfig(service: CanonicalService): DeterministicConfidenceServiceConfig {
  return DETERMINISTIC_CONFIDENCE_SERVICE_CONFIG[service];
}

export function deterministicPhotoConfidenceAdjustment(photoCount: number): number {
  if (photoCount === 1) return -5;
  if (photoCount === 2) return 0;
  if (photoCount >= 3) return Math.min(photoCount - 2, MAX_PHOTO_CONFIDENCE_BONUS);
  return 0;
}

function allowedBaseTiersForService(service: CanonicalService): readonly number[] {
  return service === "Other" ? OTHER_SERVICE_BASE_TIERS : LISTED_SERVICE_BASE_TIERS;
}

export function normalizeConfidenceBaseTier(service: CanonicalService, rawScore: number | null | undefined): number {
  const tiers = allowedBaseTiersForService(service);
  const fallbackTier = service === "Other" ? 58 : 65;
  if (rawScore == null || !Number.isFinite(rawScore)) return fallbackTier;

  let closestTier = tiers[0];
  let closestDistance = Math.abs(rawScore - closestTier);

  for (const tier of tiers.slice(1)) {
    const distance = Math.abs(rawScore - tier);
    if (distance < closestDistance) {
      closestTier = tier;
      closestDistance = distance;
    }
  }

  return closestTier;
}

export function mapConfidenceClarityToBaseTier(
  service: CanonicalService,
  signal: Pick<
    NormalizedServiceSignal,
    "jobStandardness" | "scopeClarity" | "remainingUncertainty" | "customJobSignal" | "needsManualReview" | "fallbackFamily"
  > | null | undefined
): number {
  const jobStandardness = signal?.jobStandardness ?? "somewhat_unusual";
  const scopeClarity = signal?.scopeClarity ?? "moderate";
  const remainingUncertainty = signal?.remainingUncertainty ?? "medium";
  const flaggedCustom =
    Boolean(signal?.customJobSignal) ||
    Boolean(signal?.needsManualReview) ||
    signal?.fallbackFamily === "mixed_custom";

  if (service === "Other") {
    if (scopeClarity === "ambiguous" && (jobStandardness === "unusual" || remainingUncertainty === "high")) {
      return 50;
    }
    if (remainingUncertainty === "high" || scopeClarity === "ambiguous" || jobStandardness === "unusual") {
      return 58;
    }
    if (scopeClarity === "clear" && remainingUncertainty === "low" && jobStandardness === "standard" && !flaggedCustom) {
      return 82;
    }
    if (
      scopeClarity === "clear" &&
      remainingUncertainty === "low" &&
      (jobStandardness === "standard" || jobStandardness === "somewhat_unusual")
    ) {
      return 74;
    }
    return 66;
  }

  if (scopeClarity === "ambiguous" && (jobStandardness === "unusual" || remainingUncertainty === "high")) {
    return 55;
  }
  if (remainingUncertainty === "high" || scopeClarity === "ambiguous" || jobStandardness === "unusual") {
    return 65;
  }
  if (scopeClarity === "clear" && remainingUncertainty === "low" && jobStandardness === "standard" && !flaggedCustom) {
    return 92;
  }
  if (
    scopeClarity === "clear" &&
    remainingUncertainty === "low" &&
    (jobStandardness === "standard" || jobStandardness === "somewhat_unusual")
  ) {
    return 85;
  }
  return 75;
}

type RuleBasedConfidenceInput = {
  service: CanonicalService;
  photoCount: number;
  vagueAnswers: number;
  nonVagueSelections: number;
};

export function computeRuleBasedConfidence(input: RuleBasedConfidenceInput): {
  serviceTier: DeterministicConfidenceTier;
  serviceBaseline: number;
  photoAdjustment: number;
  vaguePenalty: number;
  nonVagueBonus: number;
  rawScore: number;
  finalScore: number;
  floor: number;
  cap: number | null;
} {
  const serviceConfig = getDeterministicConfidenceServiceConfig(input.service);
  const vaguePenalty = input.vagueAnswers * -10;
  const nonVagueBonus = input.nonVagueSelections;
  const photoAdjustment = deterministicPhotoConfidenceAdjustment(input.photoCount);
  const rawScore = serviceConfig.baseline + vaguePenalty + nonVagueBonus + photoAdjustment;
  let finalScore = Math.max(rawScore, serviceConfig.floor);
  if (serviceConfig.cap != null) {
    finalScore = Math.min(finalScore, serviceConfig.cap);
  }
  finalScore = clamp(finalScore, 0, 100);

  return {
    serviceTier: serviceConfig.tier,
    serviceBaseline: serviceConfig.baseline,
    photoAdjustment,
    vaguePenalty,
    nonVagueBonus,
    rawScore,
    finalScore,
    floor: serviceConfig.floor,
    cap: serviceConfig.cap ?? null
  };
}

function answeredQuestionStats(services: ServiceRequest[]) {
  return services.reduce(
    (totals, request) => {
      const stats = confidenceQuestionStats(request);

      return {
        answeredQuestions: totals.answeredQuestions + stats.answeredQuestions,
        totalQuestions: totals.totalQuestions + stats.totalQuestions,
        usefulOtherText: totals.usefulOtherText
      };
    },
    { answeredQuestions: 0, totalQuestions: 0, usefulOtherText: 0 }
  );
}

function confidenceTraceFromInputs(input: {
  service: CanonicalService;
  answeredQuestions: number;
  totalQuestions: number;
  vagueAnswers: number;
  nonVagueSelections: number;
  usefulOtherText: number;
  description: string;
  photoCount: number;
  propertyData: PropertyData;
  signals: AiEstimatorSignals;
  signal?: NormalizedServiceSignal;
  options?: EvidenceConfidenceOptions;
}): ConfidenceFactorTrace {
  const { answeredQuestions, totalQuestions, photoCount } = input;
  const service = input.service;
  const confidence = computeRuleBasedConfidence({
    service,
    photoCount,
    vagueAnswers: input.vagueAnswers,
    nonVagueSelections: input.nonVagueSelections
  });
  const answerCoverage = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;

  const trace: ConfidenceFactorTrace = {
    baseFloor: confidence.serviceBaseline,
    requiredInputs: Number((answerCoverage * 10).toFixed(1)),
    photoEvidence: confidence.photoAdjustment,
    descriptionUsefulness: 0,
    propertyEvidence: 0,
    crossInputAgreement: 0,
    quantityEvidence: 0,
    estimatorPath: 0,
    reconciliation: 0,
    ambiguityPenalty: confidence.vaguePenalty,
    finalScore: confidence.finalScore,
    displayScore: confidence.finalScore,
    maxScoreEligible: false,
    notes: []
  };

  trace.maxScoreEligible = qualifiesForMaxConfidence(trace);
  trace.displayScore = calibratedDisplayScore(trace.finalScore);

  trace.notes = [
    `Deterministic service baseline: ${confidence.serviceBaseline}.`,
    answeredQuestions >= totalQuestions && totalQuestions > 0
      ? "All questionnaire questions were answered."
      : "Some questionnaire questions were left unanswered.",
    confidence.vaguePenalty !== 0
      ? `Vague-answer penalty applied: ${confidence.vaguePenalty}.`
      : "No vague-answer penalty applied.",
    confidence.nonVagueBonus !== 0
      ? `Non-vague selection bonus applied: +${confidence.nonVagueBonus}.`
      : "No non-vague selection bonus applied.",
    `Photo adjustment applied: ${confidence.photoAdjustment >= 0 ? "+" : ""}${confidence.photoAdjustment}.`,
    `Service floor applied at ${confidence.floor} when needed.`,
    confidence.cap != null ? `Service cap applied at ${confidence.cap} when needed.` : "No service cap applied."
  ];

  return trace;
}

function defaultConsistency(signals: AiEstimatorSignals): number {
  if (signals.scopeMatchConfidence != null) return clamp(signals.scopeMatchConfidence, 0, 100);
  return 60;
}

export function computeGlobalConfidenceScore(input: ConfidenceScoreInput): number {
  const traces =
    input.services.length > 0
      ? input.services.map((request) => {
          const stats = confidenceQuestionStats(request);
          return confidenceTraceFromInputs({
            service: request.service,
            answeredQuestions: stats.answeredQuestions,
            totalQuestions: stats.totalQuestions,
            vagueAnswers: stats.vagueAnswers,
            nonVagueSelections: stats.nonVagueSelections,
            usefulOtherText: 0,
            description: input.description,
            photoCount: input.photoCount,
            propertyData: input.propertyData,
            signals: input.signals,
            signal: getServiceSignal(input.signals, request.service)
          });
        })
      : [
          confidenceTraceFromInputs({
            service: "Other",
            answeredQuestions: 0,
            totalQuestions: 0,
            vagueAnswers: 0,
            nonVagueSelections: 0,
            usefulOtherText: 0,
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
  return clamp(average, 0, 100) / 100;
}

export function buildConfidenceTrace(
  context: EstimatorContext,
  options: EvidenceConfidenceOptions = {}
): ConfidenceFactorTrace {
  const stats = confidenceQuestionStats(context.request);

  return confidenceTraceFromInputs({
    service: context.request.service,
    answeredQuestions: stats.answeredQuestions,
    totalQuestions: stats.totalQuestions,
    vagueAnswers: stats.vagueAnswers,
    nonVagueSelections: stats.nonVagueSelections,
    usefulOtherText: 0,
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

const NON_REGIONAL_MULTIPLIER_CAP = 1.5;

function capNonRegionalMultipliers(input: {
  condition: number;
  terrain: number;
  access: number;
  material: number;
}) {
  const product = input.condition * input.terrain * input.access * input.material;
  if (product <= NON_REGIONAL_MULTIPLIER_CAP || product <= 0) {
    return {
      condition: input.condition,
      terrain: input.terrain,
      access: input.access,
      material: input.material,
      combinedBeforeCap: product,
      combinedAfterCap: product,
      capped: false
    };
  }

  const compressionExponent = Math.log(NON_REGIONAL_MULTIPLIER_CAP) / Math.log(product);
  return {
    condition: Math.pow(input.condition, compressionExponent),
    terrain: Math.pow(input.terrain, compressionExponent),
    access: Math.pow(input.access, compressionExponent),
    material: Math.pow(input.material, compressionExponent),
    combinedBeforeCap: product,
    combinedAfterCap: NON_REGIONAL_MULTIPLIER_CAP,
    capped: true
  };
}

export function finalizeEstimate(input: FinalizeEstimateInput): ServiceEstimate {
  const cappedMultipliers = capNonRegionalMultipliers({
    condition: input.conditionMultiplier ?? 1,
    terrain: input.terrainMultiplier ?? 1,
    access: input.accessMultiplier ?? 1,
    material: input.materialMultiplier ?? 1
  });
  const conditionMultiplierApplied = cappedMultipliers.condition;
  const terrainMultiplierApplied = cappedMultipliers.terrain;
  const accessMultiplierApplied = cappedMultipliers.access;
  const materialMultiplierApplied = cappedMultipliers.material;
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
            nonRegionalCombinedBeforeCap: roundCurrency(cappedMultipliers.combinedBeforeCap),
            nonRegionalCombinedAfterCap: roundCurrency(cappedMultipliers.combinedAfterCap),
            nonRegionalMultiplierCapApplied: cappedMultipliers.capped,
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
      material_adjustment: roundCurrency(basePrice * (materialMultiplierApplied - 1)),
      condition_adjustment: roundCurrency(basePrice * (conditionMultiplierApplied - 1)),
      terrain_adjustment: roundCurrency(terrainAdjusted - conditionAdjusted),
      access_adjustment: roundCurrency(accessAdjusted - terrainAdjusted),
      regional_adjustment: roundCurrency(regionAdjusted - materialAdjusted),
      luxury_adjustment: roundCurrency(luxuryAdjusted - regionAdjusted),
      minimum_job_floor: roundCurrency(Math.max(0, input.minimumJobPrice - luxuryAdjusted)),
      non_regional_multiplier_cap: roundCurrency(
        cappedMultipliers.capped ? basePrice * (cappedMultipliers.combinedAfterCap - cappedMultipliers.combinedBeforeCap) : 0
      ),
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
    : clamp(evidenceConfidence * 100, 0, 100) / 100;

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
