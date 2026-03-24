import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import OpenAI from "openai";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
  UnprocessableEntityError
} from "openai/error";
import { zodTextFormat } from "openai/helpers/zod";
import { z, ZodError } from "zod";
import { estimateEngine, normalizeServiceName } from "@/estimators/estimateEngine";
import { reconcileServiceSignals } from "@/estimators/scopeReconciliation";
import {
  HARD_SURFACE_TYPES,
  estimateDrivewaySqft,
  estimatePatioOrDeckSqft,
  getAnswerByKeys,
  getAnswerSelections,
  mapConfidenceClarityToBaseTier,
  sumSurfaceMap,
  type AccessType,
  type AiEstimatorSignals,
  type CanonicalService,
  type EngineEstimate,
  type HardSurfaceMap,
  type HardSurfaceType,
  type JobStandardness,
  type NormalizedServiceSignal,
  type PricingRegionKey,
  type RemainingUncertainty,
  type ServiceRequest,
  type ScopeClarity,
  type SurfaceMaterialType,
  type TerrainType
} from "@/estimators/shared";
import { resolveRegion } from "@/lib/location/resolveRegion";
import { getTravelAdjustmentPct } from "@/lib/ai/cost-models";
import { getGoogleMapsApiKey, buildSatelliteStaticMapUrl, haversineMiles } from "@/lib/maps";
import { getPropertyData, type PropertyData } from "@/lib/property-data";
import {
  OTHER_OUTDOOR_UNSUPPORTED_MESSAGE,
  isOtherServiceOutdoorBlocked,
  parseQuestionAnswer,
  parseServiceQuestionBundles,
  serviceQuestions,
  type ServiceQuestionAnswerBundle,
  type ServiceQuestionAnswers
} from "@/lib/serviceQuestions";
import { SERVICE_OPTIONS } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadConfidence, ServiceCategory } from "@/lib/types";

const hardSurfaceTypeSchema = z.enum(HARD_SURFACE_TYPES);
const canonicalServiceSchema = z.enum(SERVICE_OPTIONS);
const sizeBucketSchema = z.enum(["small", "medium", "large", "very_large", "unknown"]);
const quantityUnitResponseSchema = z.enum([
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
  "service_event",
  "unknown"
]);
const quantityEvidenceResponseSchema = z.enum([
  "direct",
  "strong_inference",
  "weak_inference",
  "fallback",
  "unknown"
]);
const accessDifficultyResponseSchema = z.enum(["easy", "moderate", "difficult", "very_difficult", "unknown"]);
const obstructionResponseSchema = z.enum(["low", "moderate", "high", "unknown"]);
const heightClassResponseSchema = z.enum([
  "ground_level",
  "single_story",
  "two_story",
  "three_plus",
  "roof_level",
  "mixed_height",
  "unknown"
]);
const slopeClassResponseSchema = z.enum(["flat", "some_slope", "steep", "unknown"]);
const workTypeResponseSchema = z.enum([
  "clean",
  "repair",
  "replace",
  "install",
  "remove",
  "maintain",
  "resurface",
  "extend",
  "service",
  "custom",
  "unknown"
]);
const fallbackFamilyResponseSchema = z.enum([
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
  "mixed_custom",
  "unknown"
]);
const hardSurfaceMapSchema = z.object({
  driveway: z.number().min(0).optional(),
  motor_court: z.number().min(0).optional(),
  parking_pad: z.number().min(0).optional(),
  walkway: z.number().min(0).optional(),
  patio: z.number().min(0).optional()
});

const buildHardSurfaceMapResponseSchema = () =>
  z.object({
    driveway: z.number().min(0),
    motor_court: z.number().min(0),
    parking_pad: z.number().min(0),
    walkway: z.number().min(0),
    patio: z.number().min(0)
  });

const jobStandardnessResponseSchema = z.enum(["standard", "somewhat_unusual", "unusual"]);
const scopeClarityResponseSchema = z.enum(["clear", "moderate", "ambiguous"]);
const remainingUncertaintyResponseSchema = z.enum(["low", "medium", "high"]);

const aiServiceSignalSchema = z.object({
  serviceType: canonicalServiceSchema,
  jobSubtype: z.string().optional(),
  jobSubtypeLabel: z.string().optional(),
  workType: workTypeResponseSchema.optional(),
  fallbackFamily: fallbackFamilyResponseSchema.optional(),
  surfaceFamily: z.string().optional(),
  targetObjectFamily: z.string().optional(),
  sizeBucket: sizeBucketSchema.optional(),
  estimatedQuantity: z.number().min(0).optional(),
  quantityUnit: quantityUnitResponseSchema.optional(),
  quantityEvidence: quantityEvidenceResponseSchema.optional(),
  materialClass: z.string().optional(),
  materialSubtype: z.string().optional(),
  conditionClass: z.string().optional(),
  severityClass: z.string().optional(),
  accessDifficulty: z.enum(["easy", "moderate", "difficult", "very_difficult", "unknown"]).optional(),
  obstructionLevel: obstructionResponseSchema.optional(),
  heightClass: heightClassResponseSchema.optional(),
  stories: z.number().min(0).optional(),
  slopeClass: slopeClassResponseSchema.optional(),
  removalNeeded: z.boolean().optional(),
  prepNeeded: z.boolean().optional(),
  haulAwayNeeded: z.boolean().optional(),
  poolPresent: z.boolean().optional(),
  fencePresent: z.boolean().optional(),
  deckPresent: z.boolean().optional(),
  roofType: z.string().optional(),
  premiumPropertySignal: z.boolean().optional(),
  luxuryHardscapeSignal: z.boolean().optional(),
  commercialSignal: z.boolean().optional(),
  customJobSignal: z.boolean().optional(),
  needsManualReview: z.boolean().optional(),
  jobStandardness: jobStandardnessResponseSchema.optional(),
  scopeClarity: scopeClarityResponseSchema.optional(),
  remainingUncertainty: remainingUncertaintyResponseSchema.optional(),
  aiConfidenceReasons: z.array(z.string()).optional(),
  consistencyScore: z.number().min(0).max(100).optional(),
  notes: z.array(z.string()).optional(),
  summary: z.string().optional(),
  quotedSurfaces: hardSurfaceMapSchema.optional(),
  surfaceDetections: z
    .array(
      z.object({
        surface_type: hardSurfaceTypeSchema,
        surface_area_sqft: z.number().min(0),
        confidence: z.number().min(0).max(1)
      })
    )
    .optional()
});

const aiServiceSignalResponseSchema = z.object({
  serviceType: canonicalServiceSchema,
  jobSubtype: z.string(),
  jobSubtypeLabel: z.string(),
  workType: workTypeResponseSchema,
  fallbackFamily: fallbackFamilyResponseSchema,
  surfaceFamily: z.string(),
  targetObjectFamily: z.string(),
  sizeBucket: sizeBucketSchema,
  estimatedQuantity: z.number().min(-1),
  quantityUnit: quantityUnitResponseSchema,
  quantityEvidence: quantityEvidenceResponseSchema,
  materialClass: z.string(),
  materialSubtype: z.string(),
  conditionClass: z.string(),
  severityClass: z.string(),
  accessDifficulty: accessDifficultyResponseSchema,
  obstructionLevel: obstructionResponseSchema,
  heightClass: heightClassResponseSchema,
  stories: z.number().min(-1),
  slopeClass: slopeClassResponseSchema,
  removalNeeded: z.boolean(),
  prepNeeded: z.boolean(),
  haulAwayNeeded: z.boolean(),
  poolPresent: z.boolean(),
  fencePresent: z.boolean(),
  deckPresent: z.boolean(),
  roofType: z.string(),
  premiumPropertySignal: z.boolean(),
  luxuryHardscapeSignal: z.boolean(),
  commercialSignal: z.boolean(),
  customJobSignal: z.boolean(),
  needsManualReview: z.boolean(),
  jobStandardness: jobStandardnessResponseSchema,
  scopeClarity: scopeClarityResponseSchema,
  remainingUncertainty: remainingUncertaintyResponseSchema,
  aiConfidenceReasons: z.array(z.string()),
  consistencyScore: z.number().min(-1).max(100),
  notes: z.array(z.string()),
  summary: z.string(),
  quotedSurfaces: buildHardSurfaceMapResponseSchema(),
  surfaceDetections: z.array(
    z.object({
      surface_type: hardSurfaceTypeSchema,
      surface_area_sqft: z.number().min(0),
      confidence: z.number().min(0).max(1)
    })
  )
});

const aiSignalsSchema = z.object({
  summary: z.string(),
  condition: z.enum(["light", "moderate", "heavy"]),
  access: z.enum(["easy", "moderate", "difficult"]),
  severity: z.enum(["minor", "moderate", "major"]),
  debris: z.enum(["none", "light", "moderate", "heavy"]),
  multipleAreas: z.boolean(),
  materialHint: z.string().nullable(),
  inferredScope: z.string().nullable(),
  treeSize: z.enum(["small", "medium", "large"]),
  estimatedWindowCount: z.union([z.number(), z.null()]),
  estimatedPoolSqft: z.union([z.number(), z.null()]),
  estimatedFixtureCount: z.union([z.number(), z.null()]),
  estimatedJunkCubicYards: z.union([z.number(), z.null()]),
  internalConfidence: z.number().min(0).max(100),
  pricingDrivers: z.array(z.string()),
  estimatorNotes: z.array(z.string()),
  serviceSignals: z.array(aiServiceSignalSchema).optional(),
  surfaceDetections: z
    .array(
      z.object({
        surface_type: hardSurfaceTypeSchema,
        surface_area_sqft: z.number().min(0),
        confidence: z.number().min(0).max(1)
      })
    )
    .optional(),
  detectedSurfaces: hardSurfaceMapSchema.optional(),
  quotedSurfaces: hardSurfaceMapSchema.optional(),
  surfaceDetectionConfidence: z.number().min(0).max(100).optional(),
  satelliteClarity: z.number().min(0).max(100).optional(),
  imageQuality: z.number().min(0).max(100).optional(),
  scopeMatchConfidence: z.number().min(0).max(100).optional(),
  terrainType: z.enum(["flat", "moderate_slope", "steep_hillside"]).optional(),
  accessType: z.enum(["easy_access", "tight_access", "gated_estate"]).optional(),
  materialType: z.enum(["concrete", "asphalt", "pavers", "brick", "stone"]).optional(),
  terrainMultiplier: z.number().min(1).max(2).optional(),
  accessTypeMultiplier: z.number().min(1).max(2).optional(),
  materialMultiplier: z.number().min(1).max(2).optional(),
  regionMultiplier: z.number().min(0.8).max(2).optional(),
  luxuryMultiplier: z.number().min(1).max(2).optional(),
  estateScore: z.number().min(0).optional(),
  premiumPropertySignal: z.boolean().optional(),
  commercialSignal: z.boolean().optional(),
  customJobSignal: z.boolean().optional(),
  needsManualReview: z.boolean().optional(),
  aiConfidenceReasons: z.array(z.string()).optional()
});

const aiSignalsResponseSchema = z.object({
  summary: z.string(),
  condition: z.enum(["light", "moderate", "heavy"]),
  access: z.enum(["easy", "moderate", "difficult"]),
  severity: z.enum(["minor", "moderate", "major"]),
  debris: z.enum(["none", "light", "moderate", "heavy"]),
  multipleAreas: z.boolean(),
  materialHint: z.string(),
  inferredScope: z.string(),
  treeSize: z.enum(["small", "medium", "large"]),
  estimatedWindowCount: z.number().min(-1),
  estimatedPoolSqft: z.number().min(-1),
  estimatedFixtureCount: z.number().min(-1),
  estimatedJunkCubicYards: z.number().min(-1),
  internalConfidence: z.number().min(0).max(100),
  pricingDrivers: z.array(z.string()),
  estimatorNotes: z.array(z.string()),
  serviceSignals: z.array(aiServiceSignalResponseSchema),
  surfaceDetections: z.array(
    z.object({
      surface_type: hardSurfaceTypeSchema,
      surface_area_sqft: z.number().min(0),
      confidence: z.number().min(0).max(1)
    })
  ),
  detectedSurfaces: buildHardSurfaceMapResponseSchema(),
  quotedSurfaces: buildHardSurfaceMapResponseSchema(),
  surfaceDetectionConfidence: z.number().min(-1).max(100),
  satelliteClarity: z.number().min(-1).max(100),
  imageQuality: z.number().min(-1).max(100),
  scopeMatchConfidence: z.number().min(-1).max(100),
  terrainType: z.enum(["flat", "moderate_slope", "steep_hillside", "unknown"]),
  accessType: z.enum(["easy_access", "tight_access", "gated_estate", "unknown"]),
  materialType: z.enum(["concrete", "asphalt", "pavers", "brick", "stone", "unknown"]),
  terrainMultiplier: z.number().min(-1).max(2),
  accessTypeMultiplier: z.number().min(-1).max(2),
  materialMultiplier: z.number().min(-1).max(2),
  regionMultiplier: z.number().min(-1).max(2),
  luxuryMultiplier: z.number().min(-1).max(2),
  estateScore: z.number().min(-1),
  premiumPropertySignal: z.boolean(),
  commercialSignal: z.boolean(),
  customJobSignal: z.boolean(),
  needsManualReview: z.boolean(),
  aiConfidenceReasons: z.array(z.string())
});

type AiSignalsResponse = z.infer<typeof aiSignalsResponseSchema>;

function normalizeJobStandardness(value: string | null | undefined): JobStandardness {
  return value === "standard" || value === "unusual" ? value : "somewhat_unusual";
}

function normalizeScopeClarity(value: string | null | undefined): ScopeClarity {
  return value === "clear" || value === "ambiguous" ? value : "moderate";
}

function normalizeRemainingUncertainty(value: string | null | undefined): RemainingUncertainty {
  return value === "low" || value === "high" ? value : "medium";
}

const STRUCTURED_AI_MAX_ATTEMPTS = 3;
const STRUCTURED_AI_TIMEOUT_MS = 45000;
const STRUCTURED_AI_BASE_BACKOFF_MS = 600;
const STRUCTURED_AI_MAX_BACKOFF_MS = 3500;

export type AiFailureCategory =
  | "timeout"
  | "rate_limit"
  | "connection_error"
  | "server_error"
  | "parse_failure"
  | "schema_validation_failure"
  | "bad_request"
  | "image_payload_issue"
  | "unknown_error";

export type AiExtractionAttemptTrace = {
  attempt: number;
  category: AiFailureCategory;
  retryable: boolean;
  message: string;
  statusCode?: number | null;
  code?: string | null;
};

export type AiExtractionTrace = {
  source: "structured_ai" | "fallback";
  structuredAiSucceeded: boolean;
  fallbackUsed: boolean;
  attemptsMade: number;
  maxAttempts: number;
  finalFailureCategory: AiFailureCategory | null;
  finalFailureRetryable: boolean | null;
  attempts: AiExtractionAttemptTrace[];
};

function buildAiSignalsResponseFormat() {
  return zodTextFormat(aiSignalsResponseSchema, "snapquote_estimator_signals");
}

export type EstimateInput = {
  businessName: string;
  services: string[];
  serviceQuestionAnswers?: ServiceQuestionAnswerBundle[];
  address: string;
  addressPlaceId?: string | null;
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  photoUrls: string[];
  satelliteImageUrl?: string | null;
  parcelLotSizeSqft?: number | null;
  businessAddress?: string | null;
  businessLat?: number | null;
  businessLng?: number | null;
  travelDistanceMiles?: number | null;
};

export type GeneratedLeadEstimate = EngineEstimate & {
  message: string;
  summary: string;
  costBreakdown: Record<string, number>;
  aiExtractionTrace?: AiExtractionTrace | null;
  estimatorAudit?: EstimatorPipelineAudit | null;
};

type AiEstimatorSignalsWithTrace = AiEstimatorSignals & {
  aiExtractionTrace?: AiExtractionTrace | null;
};

type ServiceSignalAuditStages = {
  rawMergedSignal: NormalizedServiceSignal | null;
  postStabilizationSignal: NormalizedServiceSignal | null;
  postGuardrailSignal: NormalizedServiceSignal | null;
  postReconciliationSignal: NormalizedServiceSignal | null;
  finalEstimatorSignal: NormalizedServiceSignal | null;
  changedByStabilization: boolean;
  changedByGuardrails: boolean;
  changedByReconciliation: boolean;
};

type NormalizeSignalsAudit = {
  serviceStages: Partial<Record<CanonicalService, ServiceSignalAuditStages>>;
};

type EstimatorPipelineAudit = {
  usedFallback: boolean;
  signalSource: "structured_ai" | "heuristic_fallback";
  flags: {
    aiSignalsChangedByNormalization: boolean;
    aiSignalsChangedByGuardrails: boolean;
    aiSignalsChangedByReconciliation: boolean;
    priceChangedByFinalRounding: boolean;
  };
  rawAiSignals: AiEstimatorSignals | null;
  postNormalizationSignals: AiEstimatorSignals | null;
  serviceStages: Partial<Record<CanonicalService, ServiceSignalAuditStages>>;
  finalEstimatorInputs: {
    requests: ServiceRequest[];
    serviceSignals: Partial<Record<CanonicalService, NormalizedServiceSignal>>;
  };
  priceStages: Array<{
    service: CanonicalService;
    preRoundingLowEstimate: number | null;
    preRoundingHighEstimate: number | null;
    finalLowEstimate: number;
    finalHighEstimate: number;
    priceChangedByFinalRounding: boolean;
  }>;
};

const estimatorAiModeSchema = z.enum(["off", "auto", "require"]);
const structuredAiTestCacheModeSchema = z.enum(["off", "record", "replay", "record_replay"]);

export type EstimatorAiMode = z.infer<typeof estimatorAiModeSchema>;
type StructuredAiTestCacheMode = z.infer<typeof structuredAiTestCacheModeSchema>;

type StructuredAiCallResult =
  | { ok: true; signals: AiEstimatorSignals; trace: AiExtractionTrace }
  | { ok: false; failure: StructuredAiFailure; trace: AiExtractionTrace };

type StructuredAiCacheEntry = {
  version: 1;
  createdAt: string;
  promptHash: string;
  keyHash: string;
  requestSummary: {
    businessName: string;
    services: string[];
    address: string;
    addressPlaceId: string | null;
    lat: number | null;
    lng: number | null;
    description: string | null;
    serviceQuestionAnswers: ServiceQuestionAnswerBundle[];
  };
  signals: AiEstimatorSignals;
};

const structuredAiImageSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value), {
    message: "Image inputs must be HTTPS URLs or data:image payloads."
  });

const structuredAiRequestSchema = z.object({
  businessName: z.string().trim().min(1),
  services: z.array(z.string().trim().min(1)).min(1),
  address: z.string().trim().min(5),
  description: z.string().max(2000).nullish(),
  photoUrls: z.array(structuredAiImageSchema).max(10),
  satelliteImageUrl: structuredAiImageSchema.nullish(),
  lat: z.number().finite().nullish(),
  lng: z.number().finite().nullish(),
  serviceQuestionAnswers: z
    .array(
      z.object({
        service: z.string().trim().min(1),
        answers: z.record(z.union([z.string(), z.array(z.string())]))
      })
    )
    .optional()
});

class StructuredAiFailure extends Error {
  category: AiFailureCategory;
  retryable: boolean;
  statusCode: number | null;
  code: string | null;

  constructor(params: {
    category: AiFailureCategory;
    retryable: boolean;
    message: string;
    statusCode?: number | null;
    code?: string | null;
  }) {
    super(params.message);
    this.name = "StructuredAiFailure";
    this.category = params.category;
    this.retryable = params.retryable;
    this.statusCode = params.statusCode ?? null;
    this.code = params.code ?? null;
  }
}

function getEstimatorAiMode(): EstimatorAiMode {
  const rawMode = process.env.SNAPQUOTE_ESTIMATOR_AI_MODE?.trim().toLowerCase() ?? "auto";
  const parsedMode = estimatorAiModeSchema.safeParse(rawMode);

  if (parsedMode.success) {
    return parsedMode.data;
  }

  throw new Error(
    `Invalid SNAPQUOTE_ESTIMATOR_AI_MODE "${process.env.SNAPQUOTE_ESTIMATOR_AI_MODE ?? ""}". Expected off, auto, or require.`
  );
}

function isEstimatorAuditEnabled(): boolean {
  const raw = process.env.SNAPQUOTE_ESTIMATOR_AUDIT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function deepCloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizedForDiff(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedForDiff);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, normalizedForDiff(entryValue)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function changedForAudit(previousValue: unknown, nextValue: unknown): boolean {
  return JSON.stringify(normalizedForDiff(previousValue)) !== JSON.stringify(normalizedForDiff(nextValue));
}

function getStructuredAiTestCacheMode(): StructuredAiTestCacheMode {
  const rawMode = process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE?.trim().toLowerCase() ?? "off";
  const parsedMode = structuredAiTestCacheModeSchema.safeParse(rawMode);

  if (parsedMode.success) {
    return parsedMode.data;
  }

  throw new Error(
    `Invalid SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE "${process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE ?? ""}". Expected off, record, replay, or record_replay.`
  );
}

function getStructuredAiTestCacheDir(): string {
  const customDir = process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR?.trim();
  if (customDir) {
    return path.resolve(process.cwd(), customDir);
  }

  const testOutputDir = process.env.SNAPQUOTE_TEST_OUTPUT_DIR?.trim();
  if (testOutputDir) {
    return path.resolve(process.cwd(), testOutputDir, "_ai-cache");
  }

  return path.join(process.cwd(), "test-results", "cache", "structured-ai");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveSystemRegionMultiplier(systemRegion: PricingRegionKey): number | undefined {
  return systemRegion === "default" ? undefined : REGION_MULTIPLIERS[systemRegion];
}

const REGION_MULTIPLIERS: Record<PricingRegionKey, number> = {
  los_angeles: 1.2,
  san_francisco: 1.25,
  new_york: 1.3,
  miami: 1.15,
  chicago: 1.15,
  default: 1
};

const TERRAIN_MULTIPLIERS: Record<TerrainType, number> = {
  flat: 1,
  moderate_slope: 1.08,
  steep_hillside: 1.15
};

const ACCESS_MULTIPLIERS: Record<AccessType, number> = {
  easy_access: 1,
  tight_access: 1.07,
  gated_estate: 1.1
};

const MATERIAL_MULTIPLIERS: Record<SurfaceMaterialType, number> = {
  concrete: 1,
  asphalt: 1.02,
  pavers: 1.12,
  brick: 1.1,
  stone: 1.15
};

function normalizeHardSurfaceMap(surfaceMap: HardSurfaceMap | null | undefined): HardSurfaceMap {
  const normalized: HardSurfaceMap = {};

  for (const key of HARD_SURFACE_TYPES) {
    const value = surfaceMap?.[key];
    if (value != null && Number.isFinite(value) && value > 0) {
      normalized[key] = Math.round(value);
    }
  }

  return normalized;
}

function buildSurfaceMapFromDetections(
  detections:
    | Array<{ surface_type: HardSurfaceType; surface_area_sqft: number; confidence: number }>
    | undefined
): HardSurfaceMap {
  const surfaceMap: HardSurfaceMap = {};

  for (const detection of detections ?? []) {
    if (!Number.isFinite(detection.surface_area_sqft) || detection.surface_area_sqft <= 0) continue;
    surfaceMap[detection.surface_type] = Math.round(
      (surfaceMap[detection.surface_type] ?? 0) + detection.surface_area_sqft
    );
  }

  return surfaceMap;
}

function mergeHardSurfaceMaps(...surfaceMaps: Array<HardSurfaceMap | null | undefined>): HardSurfaceMap {
  const merged: HardSurfaceMap = {};

  for (const key of HARD_SURFACE_TYPES) {
    const value = surfaceMaps.find((map) => (map?.[key] ?? 0) > 0)?.[key];
    if (value != null && value > 0) {
      merged[key] = Math.round(value);
    }
  }

  return merged;
}

function flattenAnswerText(input: EstimateInput): string {
  return (input.serviceQuestionAnswers ?? [])
    .flatMap((bundle) =>
      Object.values(bundle.answers ?? {}).flatMap((value) =>
        Array.isArray(value) ? value : parseQuestionAnswer(value)
      )
    )
    .join(" ");
}

function countDetectedSurfaces(surfaceMap: HardSurfaceMap): number {
  return HARD_SURFACE_TYPES.filter((key) => (surfaceMap[key] ?? 0) > 0).length;
}

function inferDetectedSurfaces(input: EstimateInput, propertyData: PropertyData): HardSurfaceMap {
  const lotSize = propertyData.lotSizeSqft ?? input.parcelLotSizeSqft ?? 7000;
  const houseSqft = propertyData.houseSqft ?? Math.round(lotSize * 0.24);
  const driveway = clamp(lotSize * 0.075 + houseSqft * 0.08, 260, 2600);
  const walkway = clamp(houseSqft * 0.08, 90, 420);
  const patio = estimatePatioOrDeckSqft(propertyData, 0.11, 120, 900);
  const parkingPad = lotSize > 7500 ? clamp(driveway * 0.18, 160, 640) : 0;
  const motorCourt = lotSize > 14000 || houseSqft > 3200 ? clamp(driveway * 0.55, 650, 2400) : 0;
  const text = `${propertyData.formattedAddress} ${input.description ?? ""} ${flattenAnswerText(input)}`.toLowerCase();

  return normalizeHardSurfaceMap({
    driveway,
    walkway,
    patio,
    parking_pad:
      /parking pad|side pad|rv pad|boat pad/.test(text) || parkingPad > 200 ? Math.round(parkingPad) : undefined,
    motor_court:
      /motor court|circular drive|circular driveway/.test(text) || motorCourt > 800
        ? Math.round(motorCourt)
        : undefined
  });
}

function inferQuotedSurfaces(
  input: EstimateInput,
  detectedSurfaces: HardSurfaceMap,
  inferredScope: string | null | undefined
): { quotedSurfaces: HardSurfaceMap; scopeMatchConfidence: number } {
  const combinedText = [
    input.services.join(" "),
    flattenAnswerText(input),
    input.description ?? "",
    inferredScope ?? ""
  ]
    .join(" ")
    .toLowerCase();
  const quoted: HardSurfaceMap = {};
  const include = (surface: HardSurfaceType) => {
    const area = detectedSurfaces[surface];
    if (area && area > 0) quoted[surface] = area;
  };

  if (
    /entire exterior|full exterior wash|full property|whole property|entire property|all hard surfaces|full exterior/.test(
      combinedText
    )
  ) {
    return {
      quotedSurfaces: normalizeHardSurfaceMap(detectedSurfaces),
      scopeMatchConfidence: 92
    };
  }

  if (/front entry|front entrance/.test(combinedText)) {
    include("driveway");
    include("walkway");
    include("motor_court");
  }

  if (/driveway/.test(combinedText)) include("driveway");
  if (/walkway|walk way|entry path|sidewalk|front walk/.test(combinedText)) include("walkway");
  if (/motor court|circular drive|circular driveway/.test(combinedText)) include("motor_court");
  if (/parking pad|rv pad|boat pad|side pad/.test(combinedText)) include("parking_pad");
  if (/patio|courtyard|terrace|pool deck|deck/.test(combinedText)) include("patio");

  if (Object.keys(quoted).length === 0) {
    const pressureAreaAnswer = flattenAnswerText(input).toLowerCase();

    if (/driveway\s*\/\s*walkway/.test(pressureAreaAnswer)) {
      include("driveway");
      include("walkway");
    } else if (/patio\s*\/\s*deck/.test(pressureAreaAnswer)) {
      include("patio");
    } else if (/multiple areas/.test(pressureAreaAnswer)) {
      include("driveway");
      include("walkway");
      include("patio");
      include("parking_pad");
      include("motor_court");
    }
  }

  if (Object.keys(quoted).length === 0 && countDetectedSurfaces(detectedSurfaces) === 1) {
    return {
      quotedSurfaces: normalizeHardSurfaceMap(detectedSurfaces),
      scopeMatchConfidence: 64
    };
  }

  return {
    quotedSurfaces: normalizeHardSurfaceMap(quoted),
    scopeMatchConfidence:
      Object.keys(quoted).length > 0
        ? clamp(58 + Object.keys(quoted).length * 10 + (input.photoUrls.length > 0 ? 6 : 0), 58, 96)
        : 44
  };
}

function inferTerrain(
  input: EstimateInput,
  propertyData: PropertyData,
  region: PricingRegionKey
): { terrainType: TerrainType; confidence: number } {
  const text = `${propertyData.formattedAddress} ${input.description ?? ""}`.toLowerCase();

  if (
    /steep|hillside|canyon|ridge|incline/.test(text) ||
    (region === "los_angeles" && /bel air|hollywood hills|beverly hills/.test(text))
  ) {
    return { terrainType: "steep_hillside", confidence: 84 };
  }

  if (/slope|sloped|grade|elevated|terraced/.test(text) || (region === "san_francisco" && (propertyData.lotSizeSqft ?? 0) > 4500)) {
    return { terrainType: "moderate_slope", confidence: 70 };
  }

  return { terrainType: "flat", confidence: 62 };
}

function inferAccessType(
  input: EstimateInput,
  propertyData: PropertyData,
  detectedSurfaces: HardSurfaceMap,
  luxuryMultiplier: number
): { accessType: AccessType; confidence: number } {
  const text = `${propertyData.formattedAddress} ${input.description ?? ""} ${flattenAnswerText(input)}`.toLowerCase();
  const drivewayArea = (detectedSurfaces.driveway ?? 0) + (detectedSurfaces.motor_court ?? 0);

  if (/gate|gated|private road|estate/.test(text) || (luxuryMultiplier >= 1.12 && drivewayArea > 2200)) {
    return { accessType: "gated_estate", confidence: 82 };
  }

  if (/tight|narrow|limited|backyard only|stairs|alley/.test(text)) {
    return { accessType: "tight_access", confidence: 78 };
  }

  return { accessType: "easy_access", confidence: drivewayArea > 1800 ? 72 : 64 };
}

function inferMaterialType(
  input: EstimateInput,
  materialHint: string | null | undefined
): { materialType: SurfaceMaterialType; confidence: number } {
  const text = `${flattenAnswerText(input)} ${input.description ?? ""} ${materialHint ?? ""}`.toLowerCase();

  if (/asphalt|blacktop/.test(text)) return { materialType: "asphalt", confidence: 86 };
  if (/paver|interlock/.test(text)) return { materialType: "pavers", confidence: 88 };
  if (/brick/.test(text)) return { materialType: "brick", confidence: 84 };
  if (/stone|flagstone|travertine/.test(text)) return { materialType: "stone", confidence: 84 };

  return { materialType: "concrete", confidence: 66 };
}

function inferLuxuryMultiplier(
  propertyData: PropertyData,
  detectedSurfaces: HardSurfaceMap,
  region: PricingRegionKey
): { estateScore: number; luxuryMultiplier: number; confidence: number } {
  const drivewayArea = (detectedSurfaces.driveway ?? 0) + (detectedSurfaces.motor_court ?? 0);
  const lotSize = propertyData.lotSizeSqft ?? 0;
  const estateScore = lotSize + drivewayArea;
  const confidenceBase = lotSize > 0 ? 72 : 48;
  const regionalBoost = region === "los_angeles" || region === "san_francisco" ? 8 : 0;
  const confidence = clamp(confidenceBase + regionalBoost + (drivewayArea > 1800 ? 8 : 0), 0, 92);

  if (confidence < 60 || estateScore < 14000) {
    return { estateScore, luxuryMultiplier: 1, confidence };
  }

  const luxuryMultiplier = clamp(1.05 + (estateScore - 14000) / 50000, 1.05, 1.25);
  return { estateScore, luxuryMultiplier: Number(luxuryMultiplier.toFixed(2)), confidence };
}

function computeSignalConfidence(input: EstimateInput, propertyData: PropertyData, signals: AiEstimatorSignals): number {
  const surfaceDetectionConfidence = signals.surfaceDetectionConfidence ?? 56;
  const satelliteClarity = signals.satelliteClarity ?? (input.lat != null && input.lng != null ? 78 : 48);
  const imageQuality =
    signals.imageQuality ??
    (input.photoUrls.length >= 4 ? 84 : input.photoUrls.length >= 2 ? 72 : input.photoUrls.length === 1 ? 62 : 46);
  const scopeMatchConfidence = signals.scopeMatchConfidence ?? 52;
  const detectedSurfaceCount = countDetectedSurfaces(signals.detectedSurfaces ?? {});
  const propertyCompleteness = propertyData.lotSizeSqft && propertyData.houseSqft ? 82 : 60;
  const aiBaseline = Math.round((signals.internalConfidence ?? 70) / 10) * 10;

  return clamp(
    18 +
      surfaceDetectionConfidence * 0.2 +
      satelliteClarity * 0.14 +
      imageQuality * 0.14 +
      scopeMatchConfidence * 0.22 +
      Math.min(detectedSurfaceCount * 4, 12) +
      propertyCompleteness * 0.1 +
      aiBaseline * 0.04,
    48,
    94
  );
}

function normalizeSignals(
  input: EstimateInput,
  propertyData: PropertyData,
  systemRegion: PricingRegionKey,
  baseSignals: AiEstimatorSignals,
  audit?: NormalizeSignalsAudit
): AiEstimatorSignals {
  const requests = buildServiceRequests(input);
  const aiDetectedSurfaces = mergeHardSurfaceMaps(
    buildSurfaceMapFromDetections(baseSignals.surfaceDetections),
    baseSignals.detectedSurfaces
  );
  const heuristicDetectedSurfaces = inferDetectedSurfaces(input, propertyData);
  const detectedSurfaces = mergeHardSurfaceMaps(aiDetectedSurfaces, heuristicDetectedSurfaces);
  const { quotedSurfaces, scopeMatchConfidence } = inferQuotedSurfaces(
    input,
    detectedSurfaces,
    baseSignals.inferredScope
  );
  const surfaceDetectionConfidence =
    baseSignals.surfaceDetectionConfidence ??
    clamp(
      54 +
        countDetectedSurfaces(detectedSurfaces) * 7 +
        (input.lat != null && input.lng != null ? 8 : 0) +
        (input.photoUrls.length > 0 ? 6 : 0),
      40,
      94
    );
  const { estateScore, luxuryMultiplier, confidence: luxuryConfidence } = inferLuxuryMultiplier(
    propertyData,
    detectedSurfaces,
    systemRegion
  );
  const terrainInference = inferTerrain(input, propertyData, systemRegion);
  const materialInference = inferMaterialType(input, baseSignals.materialHint);
  const accessInference = inferAccessType(input, propertyData, detectedSurfaces, luxuryMultiplier);
  const mergedServiceSignals = mergeServiceSignals(input, propertyData, detectedSurfaces, quotedSurfaces, baseSignals);
  const serviceSignals = stabilizeAiServiceSignals(
    input,
    propertyData,
    mergedServiceSignals,
    audit
  );
  const preliminaryPremiumPropertySignal = Object.values(serviceSignals).some((signal) =>
    Boolean(signal?.premiumPropertySignal)
  );
  const preliminaryCommercialSignal = Object.values(serviceSignals).some((signal) =>
    Boolean(signal?.commercialSignal)
  );
  const preliminaryCustomJobSignal = Object.values(serviceSignals).some((signal) =>
    Boolean(signal?.customJobSignal)
  );
  const preliminaryNeedsManualReview = Object.values(serviceSignals).some((signal) =>
    Boolean(signal?.needsManualReview)
  );
  const preliminarySignals: AiEstimatorSignals = {
    ...baseSignals,
    serviceSignals,
    detectedSurfaces,
    quotedSurfaces,
    surfaceDetectionConfidence,
    satelliteClarity:
      baseSignals.satelliteClarity ?? (input.lat != null && input.lng != null ? 82 : 48),
    imageQuality:
      baseSignals.imageQuality ??
      (input.photoUrls.length >= 4 ? 88 : input.photoUrls.length >= 2 ? 74 : input.photoUrls.length > 0 ? 62 : 44),
    scopeMatchConfidence: baseSignals.scopeMatchConfidence ?? scopeMatchConfidence,
    terrainType: baseSignals.terrainType ?? terrainInference.terrainType,
    terrainMultiplier: baseSignals.terrainMultiplier ?? TERRAIN_MULTIPLIERS[baseSignals.terrainType ?? terrainInference.terrainType],
    accessType: baseSignals.accessType ?? accessInference.accessType,
    accessTypeMultiplier:
      baseSignals.accessTypeMultiplier ??
      ACCESS_MULTIPLIERS[baseSignals.accessType ?? accessInference.accessType],
    materialType: baseSignals.materialType ?? materialInference.materialType,
    materialMultiplier:
      baseSignals.materialMultiplier ??
      MATERIAL_MULTIPLIERS[baseSignals.materialType ?? materialInference.materialType],
    region: systemRegion,
    regionMultiplier: baseSignals.regionMultiplier ?? resolveSystemRegionMultiplier(systemRegion),
    luxuryMultiplier: baseSignals.luxuryMultiplier ?? luxuryMultiplier,
    estateScore: baseSignals.estateScore ?? estateScore,
    premiumPropertySignal: preliminaryPremiumPropertySignal,
    commercialSignal: preliminaryCommercialSignal,
    customJobSignal: preliminaryCustomJobSignal,
    needsManualReview: preliminaryNeedsManualReview,
    propertyResolutionQuality:
      propertyData.lotSizeSource === "parcel_data" || propertyData.houseSqftSource === "solar_building_ground_area"
        ? 90
        : propertyData.locationSource !== "unavailable"
          ? 72
          : 48,
    aiConfidenceReasons: Array.from(
      new Set([
        ...(baseSignals.aiConfidenceReasons ?? []),
        ...Object.values(serviceSignals).flatMap((signal) => signal?.aiConfidenceReasons ?? [])
      ])
    ).slice(0, 8)
  };
  const reconciledSignals = reconcileServiceSignals({
    requests,
    propertyData,
    description: input.description ?? "",
    photoCount: input.photoUrls.length,
    signals: preliminarySignals
  });
  if (audit) {
    for (const request of requests) {
      const service = request.service;
      const stage = audit.serviceStages[service];
      if (!stage) continue;
      const postReconciliationSignal = reconciledSignals.serviceSignals?.[service] ?? null;
      stage.postReconciliationSignal = deepCloneJson(postReconciliationSignal);
      stage.changedByReconciliation = changedForAudit(stage.postGuardrailSignal, stage.postReconciliationSignal);
    }
  }
  const premiumPropertySignal = Object.values(reconciledSignals.serviceSignals ?? {}).some((signal) =>
    Boolean(signal?.premiumPropertySignal)
  );
  const commercialSignal = Object.values(reconciledSignals.serviceSignals ?? {}).some((signal) =>
    Boolean(signal?.commercialSignal)
  );
  const customJobSignal = Object.values(reconciledSignals.serviceSignals ?? {}).some((signal) =>
    Boolean(signal?.customJobSignal)
  );
  const needsManualReview = Object.values(reconciledSignals.serviceSignals ?? {}).some((signal) =>
    Boolean(signal?.needsManualReview)
  );
  const normalizedSignals: AiEstimatorSignals = {
    ...reconciledSignals,
    premiumPropertySignal,
    commercialSignal,
    customJobSignal,
    needsManualReview
  };

  if (requests.length === 1 && requests[0]?.service === "Fence Installation / Repair") {
    const fenceRequest = requests[0];
    const fenceSignal = normalizedSignals.serviceSignals?.["Fence Installation / Repair"];
    const isStructuredFenceSignal =
      fenceSignal &&
      !(fenceSignal.notes ?? []).some((note) =>
        /Heuristic service signal generated because AI extraction was unavailable\./i.test(note)
      );
    const fenceSubtype = fenceSubtypeFromWorkType(getAnswerByKeys(fenceRequest.answers, ["fence_work_type"]));
    const fenceScopeBucket = fenceScopeBucketFromAnswer(getAnswerByKeys(fenceRequest.answers, ["fence_scope"]));

    if (fenceSignal && isStructuredFenceSignal && fenceSubtype === "repair" && fenceScopeBucket === "very_large") {
      fenceSignal.premiumPropertySignal = false;
      fenceSignal.poolPresent = false;
      fenceSignal.notes = Array.from(
        new Set([
          ...(fenceSignal.notes ?? []),
          "Large fence-repair jobs do not inherit luxury-style pool or premium-property inflation unless the questionnaire explicitly indicates a replacement/install context."
        ])
      );
      normalizedSignals.premiumPropertySignal = false;
      normalizedSignals.estimatedPoolSqft = null;
    }
  }

  normalizedSignals.access =
    normalizedSignals.access ??
    (normalizedSignals.accessType === "tight_access"
      ? "moderate"
      : normalizedSignals.accessType === "gated_estate"
        ? "moderate"
        : "easy");

  if (requests.length === 1 && requests[0]?.service === "Pressure Washing") {
    const pressureRequest = requests[0];
    const pressureSignal = normalizedSignals.serviceSignals?.["Pressure Washing"];
    const pressureTargets = getAnswerSelections(pressureRequest.answers, "pressure_washing_target");
    const pressureAccessAnswer = getAnswerByKeys(pressureRequest.answers, ["pressure_washing_access"]).toLowerCase();
    const isStructuredPressureSignal =
      pressureSignal &&
      !(pressureSignal.notes ?? []).some((note) =>
        /Heuristic service signal generated because AI extraction was unavailable\./i.test(note)
      );
    const anchoredAccessType = pressureAccessTypeFromAnswers(pressureRequest.answers);
    const anchoredAccessDifficulty = pressureAccessDifficultyFromAnswers(pressureRequest.answers);
    const selectedRoof = pressureTargets.some((target) => /roof/i.test(target));
    const explicitDifficultAccess = /tight|difficult/.test(pressureAccessAnswer);

    if (pressureSignal && isStructuredPressureSignal && anchoredAccessType) {
      if (anchoredAccessDifficulty) {
        pressureSignal.accessDifficulty = anchoredAccessDifficulty;
        if (anchoredAccessDifficulty === "easy") {
          pressureSignal.obstructionLevel = "low";
        }
      }
      normalizedSignals.accessType = anchoredAccessType;
      normalizedSignals.accessTypeMultiplier = ACCESS_MULTIPLIERS[anchoredAccessType];
      normalizedSignals.access = anchoredAccessType === "easy_access" ? "easy" : "moderate";
      if (selectedRoof && explicitDifficultAccess && terrainInference.terrainType !== "flat") {
        normalizedSignals.terrainType = terrainInference.terrainType;
        normalizedSignals.terrainMultiplier = TERRAIN_MULTIPLIERS[terrainInference.terrainType];
      }
      pressureSignal.notes = Array.from(
        new Set([
          ...(pressureSignal.notes ?? []),
          "Pressure-washing top-level access stayed anchored to the selected access answer for structured AI runs.",
          ...(anchoredAccessDifficulty === "easy" && /not sure/.test(pressureAccessAnswer)
            ? ["Pressure-washing service access stayed on the easy/default path because the questionnaire did not confirm extra access difficulty."]
            : []),
          ...(selectedRoof && explicitDifficultAccess && terrainInference.terrainType !== "flat"
            ? ["Pressure-washing terrain stayed anchored to the local property context because roof work was selected with explicitly difficult access."]
            : [])
        ])
      );
    }
  }

  normalizedSignals.internalConfidence = computeSignalConfidence(input, propertyData, normalizedSignals);
  normalizedSignals.pricingDrivers = Array.from(
    new Set([
      ...normalizedSignals.pricingDrivers,
      "Detected hard-surface scope",
      "Terrain and access heuristics",
      "Geo-priced regional multiplier",
      ...(luxuryConfidence >= 60 && (normalizedSignals.luxuryMultiplier ?? 1) > 1
        ? ["Luxury estate adjustment"]
        : [])
    ])
  ).slice(0, 10);
  normalizedSignals.estimatorNotes = Array.from(
    new Set([
      ...normalizedSignals.estimatorNotes,
      `Detected hard surfaces: ${countDetectedSurfaces(detectedSurfaces)}.`,
      sumSurfaceMap(quotedSurfaces) > 0
        ? `Quoted hard-surface scope filtered to ${sumSurfaceMap(quotedSurfaces)} sqft.`
        : "No hard-surface scope was priced beyond the requested service area."
    ])
  ).slice(0, 10);

  return normalizedSignals;
}

function inferSignalsFallback(input: EstimateInput, propertyData: PropertyData): AiEstimatorSignals {
  const text = `${input.services.join(" ")} ${input.description ?? ""}`.toLowerCase();
  const detectedSurfaces = inferDetectedSurfaces(input, propertyData);
  const inferredScope = /driveway|patio|walkway|roof|house exterior|fence/.test(text) ? text : null;
  const { quotedSurfaces } = inferQuotedSurfaces(input, detectedSurfaces, inferredScope);
  const serviceSignals = mergeServiceSignals(
    input,
    propertyData,
    detectedSurfaces,
    quotedSurfaces,
    {
      summary: "",
      condition: "light",
      access: "easy",
      severity: "minor",
      debris: "none",
      multipleAreas: false,
      materialHint: null,
      inferredScope: null,
      treeSize: "medium",
      estimatedWindowCount: null,
      estimatedPoolSqft: null,
      estimatedFixtureCount: null,
      estimatedJunkCubicYards: null,
      internalConfidence: 60,
      pricingDrivers: [],
      estimatorNotes: [],
      serviceSignals: {}
    }
  );

  return {
    summary: `Estimate based on ${input.services.join(", ")} scope, property context, and submitted details.`,
    condition:
      /heavy|severe|mold|mildew|storm|damag|rotten|overgrown/.test(text)
        ? "heavy"
        : /stain|repair|cloudy|peeling|debris/.test(text)
          ? "moderate"
          : "light",
    access:
      /tight|limited|narrow|backyard only/.test(text)
        ? "moderate"
        : /crane|power line|difficult access|no access/.test(text)
          ? "difficult"
          : "easy",
    severity:
      /replace|full|major|storm/.test(text)
        ? "major"
        : /repair|cleanup|moderate/.test(text)
          ? "moderate"
          : "minor",
    debris:
      /heavy debris|haul away|dumpster|junk/.test(text)
        ? "heavy"
        : /debris|cleanup/.test(text)
          ? "moderate"
          : "none",
    multipleAreas: /multiple|several|front and back|entire property/.test(text),
    materialHint:
      /composite|hardwood|vinyl|wood|chain link|metal|tile|asphalt|pavers|concrete|stucco|brick/.test(text)
        ? text
        : null,
    treeSize: /large tree|tall tree/.test(text) ? "large" : /small tree/.test(text) ? "small" : "medium",
    estimatedWindowCount: null,
    estimatedPoolSqft: null,
    estimatedFixtureCount: null,
    estimatedJunkCubicYards: null,
    serviceSignals,
    detectedSurfaces,
    quotedSurfaces,
    inferredScope,
    internalConfidence: clamp(
      36 +
        Math.min(input.photoUrls.length * 9, 24) +
        (input.description?.trim().length ? Math.min(input.description.trim().length / 4, 24) : 0),
      48,
      80
    ),
    pricingDrivers: ["Submitted service answers", "Property context", "Regional pricing model"],
    estimatorNotes: ["Fallback signal extraction used because structured AI analysis was unavailable."],
    premiumPropertySignal: Object.values(serviceSignals).some((signal) => Boolean(signal?.premiumPropertySignal)),
    commercialSignal: Object.values(serviceSignals).some((signal) => Boolean(signal?.commercialSignal)),
    customJobSignal: Object.values(serviceSignals).some((signal) => Boolean(signal?.customJobSignal)),
    needsManualReview: Object.values(serviceSignals).some((signal) => Boolean(signal?.needsManualReview)),
    aiConfidenceReasons: ["Fallback heuristic interpretation"]
  };
}

function sanitizeAiJsonPayload(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  let jsonPayload =
    firstBrace >= 0 && lastBrace >= firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;

  jsonPayload = jsonPayload.trim();
  jsonPayload = jsonPayload.replace(/```json|```/gi, "");
  jsonPayload = jsonPayload.replace(/[“”]/g, "\"");
  jsonPayload = jsonPayload.replace(/[‘’]/g, "'");
  jsonPayload = jsonPayload.replace(/\s+/g, " ").trim();
  jsonPayload = jsonPayload.replace(/,\s*([}\]])/g, "$1");
  jsonPayload = jsonPayload.replace(/(:\s*)(-?\d+)\.(?=\s*[,}\]])/g, "$1$2.0");
  jsonPayload = jsonPayload.replace(/(:\s*)\.(\d+)(?=\s*[,}\]])/g, "$10.$2");

  return jsonPayload;
}

function repairAiJsonPayload(jsonPayload: string): string {
  let repairedPayload = jsonPayload;

  repairedPayload = repairedPayload.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, "$1\"$2\"$3");
  repairedPayload = repairedPayload.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => {
    const normalizedValue = value.replace(/"/g, "\\\"");
    return `"${normalizedValue}"`;
  });
  repairedPayload = repairedPayload.replace(/(")\s+(")/g, "$1,$2");
  repairedPayload = repairedPayload.replace(/(\d)\s+(")/g, "$1,$2");
  repairedPayload = repairedPayload.replace(/(")\s+(\{|\[|-?\d|true|false|null)/g, "$1,$2");
  repairedPayload = repairedPayload.replace(/(\}|\]|true|false|null|-?\d+(?:\.\d+)?)\s+("|\{|\[|-?\d)/g, "$1,$2");
  repairedPayload = repairedPayload.replace(/,\s*([}\]])/g, "$1");
  repairedPayload = repairedPayload.replace(/(:\s*)(-?\d+)\.(?=\s*[,}\]])/g, "$1$2.0");
  repairedPayload = repairedPayload.replace(/(:\s*)\.(\d+)(?=\s*[,}\]])/g, "$10.$2");

  return repairedPayload;
}

function normalizeNullableSurfaceMap(
  surfaceMap: AiSignalsResponse["detectedSurfaces"]
): HardSurfaceMap | undefined {
  const normalized = Object.fromEntries(
    Object.entries(surfaceMap).filter(([, value]) => value > 0)
  ) as HardSurfaceMap;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeServiceSignalResponse(
  signal: AiSignalsResponse["serviceSignals"][number]
): NormalizedServiceSignal {
  const maybeNumber = (value: number): number | undefined => (value >= 0 ? value : undefined);
  const maybeString = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const normalizeUnknown = <T extends string>(value: T): T | undefined => (value === "unknown" ? undefined : value);

  return {
    serviceType: signal.serviceType,
    jobSubtype: maybeString(signal.jobSubtype) ?? null,
    jobSubtypeLabel: maybeString(signal.jobSubtypeLabel) ?? null,
    workType: normalizeUnknown(signal.workType) as NormalizedServiceSignal["workType"],
    fallbackFamily: normalizeUnknown(signal.fallbackFamily) as NormalizedServiceSignal["fallbackFamily"],
    surfaceFamily: maybeString(signal.surfaceFamily) ?? null,
    targetObjectFamily: maybeString(signal.targetObjectFamily) ?? null,
    sizeBucket: normalizeUnknown(signal.sizeBucket) as NormalizedServiceSignal["sizeBucket"],
    estimatedQuantity: maybeNumber(signal.estimatedQuantity) ?? null,
    quantityUnit: normalizeUnknown(signal.quantityUnit) as NormalizedServiceSignal["quantityUnit"],
    quantityEvidence: normalizeUnknown(signal.quantityEvidence) as NormalizedServiceSignal["quantityEvidence"],
    materialClass: maybeString(signal.materialClass) ?? null,
    materialSubtype: maybeString(signal.materialSubtype) ?? null,
    conditionClass: maybeString(signal.conditionClass) ?? null,
    severityClass: maybeString(signal.severityClass) ?? null,
    accessDifficulty: normalizeUnknown(signal.accessDifficulty) as NormalizedServiceSignal["accessDifficulty"],
    obstructionLevel: normalizeUnknown(signal.obstructionLevel) as NormalizedServiceSignal["obstructionLevel"],
    heightClass: normalizeUnknown(signal.heightClass) as NormalizedServiceSignal["heightClass"],
    stories: maybeNumber(signal.stories) ?? null,
    slopeClass: normalizeUnknown(signal.slopeClass) as NormalizedServiceSignal["slopeClass"],
    removalNeeded: signal.removalNeeded,
    prepNeeded: signal.prepNeeded,
    haulAwayNeeded: signal.haulAwayNeeded,
    poolPresent: signal.poolPresent,
    fencePresent: signal.fencePresent,
    deckPresent: signal.deckPresent,
    roofType: maybeString(signal.roofType) ?? null,
    premiumPropertySignal: signal.premiumPropertySignal,
    luxuryHardscapeSignal: signal.luxuryHardscapeSignal,
    commercialSignal: signal.commercialSignal,
    customJobSignal: signal.customJobSignal,
    needsManualReview: signal.needsManualReview,
    jobStandardness: normalizeJobStandardness(signal.jobStandardness),
    scopeClarity: normalizeScopeClarity(signal.scopeClarity),
    remainingUncertainty: normalizeRemainingUncertainty(signal.remainingUncertainty),
    aiConfidence: mapConfidenceClarityToBaseTier(signal.serviceType, {
      jobStandardness: normalizeJobStandardness(signal.jobStandardness),
      scopeClarity: normalizeScopeClarity(signal.scopeClarity),
      remainingUncertainty: normalizeRemainingUncertainty(signal.remainingUncertainty),
      customJobSignal: signal.customJobSignal,
      needsManualReview: signal.needsManualReview,
      fallbackFamily: normalizeUnknown(signal.fallbackFamily) as NormalizedServiceSignal["fallbackFamily"]
    }),
    aiConfidenceReasons: signal.aiConfidenceReasons,
    consistencyScore: maybeNumber(signal.consistencyScore) ?? null,
    notes: signal.notes,
    summary: maybeString(signal.summary) ?? null,
    quotedSurfaces: normalizeNullableSurfaceMap(signal.quotedSurfaces),
    surfaceDetections: signal.surfaceDetections.length > 0 ? signal.surfaceDetections : undefined
  };
}

function normalizeLooseServiceSignal(
  signal: z.infer<typeof aiServiceSignalSchema>
): NormalizedServiceSignal {
  return {
    serviceType: signal.serviceType,
    jobSubtype: signal.jobSubtype ?? null,
    jobSubtypeLabel: signal.jobSubtypeLabel ?? null,
    workType: signal.workType as NormalizedServiceSignal["workType"],
    fallbackFamily: signal.fallbackFamily as NormalizedServiceSignal["fallbackFamily"],
    surfaceFamily: signal.surfaceFamily ?? null,
    targetObjectFamily: signal.targetObjectFamily ?? null,
    sizeBucket: signal.sizeBucket ?? null,
    estimatedQuantity: signal.estimatedQuantity ?? null,
    quantityUnit: signal.quantityUnit as NormalizedServiceSignal["quantityUnit"],
    quantityEvidence: signal.quantityEvidence as NormalizedServiceSignal["quantityEvidence"],
    materialClass: signal.materialClass ?? null,
    materialSubtype: signal.materialSubtype ?? null,
    conditionClass: signal.conditionClass ?? null,
    severityClass: signal.severityClass ?? null,
    accessDifficulty: signal.accessDifficulty as NormalizedServiceSignal["accessDifficulty"],
    obstructionLevel: signal.obstructionLevel as NormalizedServiceSignal["obstructionLevel"],
    heightClass: signal.heightClass as NormalizedServiceSignal["heightClass"],
    stories: signal.stories ?? null,
    slopeClass: signal.slopeClass as NormalizedServiceSignal["slopeClass"],
    removalNeeded: signal.removalNeeded,
    prepNeeded: signal.prepNeeded,
    haulAwayNeeded: signal.haulAwayNeeded,
    poolPresent: signal.poolPresent,
    fencePresent: signal.fencePresent,
    deckPresent: signal.deckPresent,
    roofType: signal.roofType ?? null,
    premiumPropertySignal: signal.premiumPropertySignal,
    luxuryHardscapeSignal: signal.luxuryHardscapeSignal,
    commercialSignal: signal.commercialSignal,
    customJobSignal: signal.customJobSignal,
    needsManualReview: signal.needsManualReview,
    jobStandardness: normalizeJobStandardness(signal.jobStandardness),
    scopeClarity: normalizeScopeClarity(signal.scopeClarity),
    remainingUncertainty: normalizeRemainingUncertainty(signal.remainingUncertainty),
    aiConfidence: mapConfidenceClarityToBaseTier(signal.serviceType, {
      jobStandardness: normalizeJobStandardness(signal.jobStandardness),
      scopeClarity: normalizeScopeClarity(signal.scopeClarity),
      remainingUncertainty: normalizeRemainingUncertainty(signal.remainingUncertainty),
      customJobSignal: signal.customJobSignal,
      needsManualReview: signal.needsManualReview,
      fallbackFamily: signal.fallbackFamily as NormalizedServiceSignal["fallbackFamily"]
    }),
    aiConfidenceReasons: signal.aiConfidenceReasons,
    consistencyScore: signal.consistencyScore ?? null,
    notes: signal.notes,
    summary: signal.summary ?? null,
    quotedSurfaces: signal.quotedSurfaces,
    surfaceDetections: signal.surfaceDetections
  };
}

function normalizeLooseAiSignals(parsed: z.infer<typeof aiSignalsSchema>): AiEstimatorSignals {
  return {
    ...parsed,
    serviceSignals: parsed.serviceSignals
      ? (Object.fromEntries(
          parsed.serviceSignals.map((signal) => [signal.serviceType, normalizeLooseServiceSignal(signal)])
        ) as Partial<Record<CanonicalService, NormalizedServiceSignal>>)
      : undefined
  };
}

function normalizeAiSignalsResponse(parsed: AiSignalsResponse): AiEstimatorSignals {
  const maybeNumber = (value: number): number | undefined => (value >= 0 ? value : undefined);
  const maybeNullableNumber = (value: number): number | null => (value >= 0 ? value : null);
  const maybeString = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    ...parsed,
    materialHint: maybeString(parsed.materialHint),
    inferredScope: maybeString(parsed.inferredScope),
    estimatedWindowCount: maybeNullableNumber(parsed.estimatedWindowCount),
    estimatedPoolSqft: maybeNullableNumber(parsed.estimatedPoolSqft),
    estimatedFixtureCount: maybeNullableNumber(parsed.estimatedFixtureCount),
    estimatedJunkCubicYards: maybeNullableNumber(parsed.estimatedJunkCubicYards),
    surfaceDetections: parsed.surfaceDetections.length > 0 ? parsed.surfaceDetections : undefined,
    detectedSurfaces: normalizeNullableSurfaceMap(parsed.detectedSurfaces),
    quotedSurfaces: normalizeNullableSurfaceMap(parsed.quotedSurfaces),
    surfaceDetectionConfidence: maybeNumber(parsed.surfaceDetectionConfidence),
    satelliteClarity: maybeNumber(parsed.satelliteClarity),
    imageQuality: maybeNumber(parsed.imageQuality),
    scopeMatchConfidence: maybeNumber(parsed.scopeMatchConfidence),
    terrainType: parsed.terrainType === "unknown" ? undefined : parsed.terrainType,
    accessType: parsed.accessType === "unknown" ? undefined : parsed.accessType,
    materialType: parsed.materialType === "unknown" ? undefined : parsed.materialType,
    terrainMultiplier: maybeNumber(parsed.terrainMultiplier),
    accessTypeMultiplier: maybeNumber(parsed.accessTypeMultiplier),
    materialMultiplier: maybeNumber(parsed.materialMultiplier),
    regionMultiplier: maybeNumber(parsed.regionMultiplier),
    luxuryMultiplier: maybeNumber(parsed.luxuryMultiplier),
    estateScore: maybeNumber(parsed.estateScore),
    serviceSignals: Object.fromEntries(
      parsed.serviceSignals.map((signal) => [signal.serviceType, normalizeServiceSignalResponse(signal)])
    ) as Partial<Record<CanonicalService, NormalizedServiceSignal>>,
    premiumPropertySignal: parsed.premiumPropertySignal,
    commercialSignal: parsed.commercialSignal,
    customJobSignal: parsed.customJobSignal,
    needsManualReview: parsed.needsManualReview,
    aiConfidenceReasons: parsed.aiConfidenceReasons
  };
}

function summarizeZodIssues(error: ZodError, limit = 3): string {
  return error.issues
    .slice(0, limit)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function isImagePayloadMessage(message: string, param?: string | null, code?: string | null): boolean {
  const blob = `${message} ${param ?? ""} ${code ?? ""}`.toLowerCase();
  return /image|input_image|image_url|unsupported image|invalid image|data:image|too large|base64/.test(blob);
}

function inferConnectionCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const directCode = "code" in error && typeof error.code === "string" ? error.code : null;
  if (directCode) return directCode;
  const cause =
    "cause" in error && error.cause && typeof error.cause === "object" ? (error.cause as { code?: unknown }) : null;
  return cause && typeof cause.code === "string" ? cause.code : null;
}

export function classifyStructuredAiFailure(error: unknown): StructuredAiFailure {
  if (error instanceof StructuredAiFailure) return error;

  const statusCode =
    error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : inferConnectionCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (error instanceof APIConnectionTimeoutError) {
    return new StructuredAiFailure({ category: "timeout", retryable: true, message, code });
  }

  if (error instanceof APIUserAbortError || /timed out|timeout|abort/.test(lowerMessage)) {
    return new StructuredAiFailure({ category: "timeout", retryable: true, message, code, statusCode });
  }

  if (error instanceof RateLimitError || statusCode === 429) {
    return new StructuredAiFailure({ category: "rate_limit", retryable: true, message, code, statusCode });
  }

  if (
    error instanceof APIConnectionError ||
    ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "EHOSTUNREACH"].includes(code ?? "")
  ) {
    return new StructuredAiFailure({ category: "connection_error", retryable: true, message, code, statusCode });
  }

  if (error instanceof InternalServerError || (statusCode != null && statusCode >= 500)) {
    return new StructuredAiFailure({ category: "server_error", retryable: true, message, code, statusCode });
  }

  if (error instanceof ZodError) {
    return new StructuredAiFailure({
      category: "schema_validation_failure",
      retryable: true,
      message: `Structured AI response failed schema validation: ${summarizeZodIssues(error)}`,
      code,
      statusCode
    });
  }

  if (error instanceof SyntaxError) {
    return new StructuredAiFailure({
      category: "parse_failure",
      retryable: true,
      message: `Structured AI response could not be parsed: ${message}`,
      code,
      statusCode
    });
  }

  if (
    error instanceof BadRequestError ||
    error instanceof UnprocessableEntityError ||
    (error instanceof APIError && statusCode != null && statusCode >= 400 && statusCode < 500)
  ) {
    const category = isImagePayloadMessage(message, (error as APIError | undefined)?.param ?? null, code)
      ? "image_payload_issue"
      : "bad_request";
    return new StructuredAiFailure({
      category,
      retryable: false,
      message,
      code,
      statusCode
    });
  }

  if (isImagePayloadMessage(message, null, code)) {
    return new StructuredAiFailure({
      category: "image_payload_issue",
      retryable: false,
      message,
      code,
      statusCode
    });
  }

  return new StructuredAiFailure({
    category: "unknown_error",
    retryable: false,
    message,
    code,
    statusCode
  });
}

function validateStructuredAiRequest(input: EstimateInput) {
  const parsed = structuredAiRequestSchema.safeParse(input);
  if (parsed.success) return;

  const summary = summarizeZodIssues(parsed.error);
  const category = parsed.error.issues.some((issue) =>
    issue.path.some((segment) => String(segment).includes("photoUrls") || String(segment).includes("satelliteImageUrl"))
  )
    ? "image_payload_issue"
    : "bad_request";

  throw new StructuredAiFailure({
    category,
    retryable: false,
    message: `Structured AI request validation failed: ${summary}`
  });
}

function parseStructuredAiOutput(raw: string): AiEstimatorSignals {
  try {
    return parseAiOutput(raw);
  } catch (error) {
    throw classifyStructuredAiFailure(error);
  }
}

function validateStructuredAiParsedResponse(parsed: unknown): AiSignalsResponse {
  const validated = aiSignalsResponseSchema.safeParse(parsed);
  if (validated.success) return validated.data;

  throw classifyStructuredAiFailure(validated.error);
}

function buildAiExtractionTrace(
  attempts: AiExtractionAttemptTrace[],
  params: {
    structuredAiSucceeded: boolean;
    fallbackUsed: boolean;
    attemptsMade: number;
    finalFailureCategory?: AiFailureCategory | null;
    finalFailureRetryable?: boolean | null;
  }
): AiExtractionTrace {
  return {
    source: params.structuredAiSucceeded ? "structured_ai" : "fallback",
    structuredAiSucceeded: params.structuredAiSucceeded,
    fallbackUsed: params.fallbackUsed,
    attemptsMade: params.attemptsMade,
    maxAttempts: STRUCTURED_AI_MAX_ATTEMPTS,
    finalFailureCategory: params.finalFailureCategory ?? null,
    finalFailureRetryable: params.finalFailureRetryable ?? null,
    attempts
  };
}

function safeGetStructuredAiTestCacheMode(): StructuredAiTestCacheMode {
  try {
    return getStructuredAiTestCacheMode();
  } catch {
    return "off";
  }
}

function summarizeAiExecution(
  signals: AiEstimatorSignals,
  trace: AiExtractionTrace,
  mode: EstimatorAiMode
): {
  execution: "baseline_only" | "structured_ai_live" | "structured_ai_replay" | "fallback";
  liveInvocation: "yes" | "no";
  cacheMode: StructuredAiTestCacheMode;
  cacheStatus: "off" | "none" | "replay_hit" | "replay_miss" | "recorded";
} {
  const cacheMode = safeGetStructuredAiTestCacheMode();
  const estimatorNotes = signals.estimatorNotes ?? [];
  const replayHit = estimatorNotes.some((note) => /Structured AI test cache: replay hit/i.test(note));
  const recorded = estimatorNotes.some((note) => /Structured AI test cache: recorded/i.test(note));

  if (mode === "off") {
    return {
      execution: "baseline_only",
      liveInvocation: "no",
      cacheMode,
      cacheStatus: "off"
    };
  }

  if (replayHit) {
    return {
      execution: "structured_ai_replay",
      liveInvocation: "no",
      cacheMode,
      cacheStatus: "replay_hit"
    };
  }

  if (trace.structuredAiSucceeded) {
    return {
      execution: "structured_ai_live",
      liveInvocation: "yes",
      cacheMode,
      cacheStatus: recorded ? "recorded" : cacheMode === "off" ? "off" : "none"
    };
  }

  return {
    execution: "fallback",
    liveInvocation: trace.attemptsMade > 0 ? "yes" : "no",
    cacheMode,
    cacheStatus:
      cacheMode === "replay" && trace.attemptsMade === 0 ? "replay_miss" : cacheMode === "off" ? "off" : "none"
  };
}

function buildEstimatorFailureNotes(params: {
  mode: string;
  signalSource: string;
  execution: string;
  liveInvocation: "yes" | "no" | "unknown";
  cacheMode: string;
  cacheStatus: string;
  message: string;
}): string[] {
  return [
    `Estimator AI mode: ${params.mode}.`,
    `Estimator signal source: ${params.signalSource}.`,
    `Estimator AI execution: ${params.execution}.`,
    `Estimator AI live invocation: ${params.liveInvocation}.`,
    `Estimator AI cache mode: ${params.cacheMode}.`,
    `Estimator AI cache status: ${params.cacheStatus}.`,
    `Estimator generation failed: ${params.message}`
  ];
}

function summarizeEstimatorFailure(message: string): {
  signalSource: string;
  execution: string;
  liveInvocation: "yes" | "no" | "unknown";
  cacheMode: StructuredAiTestCacheMode | "unknown";
  cacheStatus: "off" | "none" | "replay_hit" | "replay_miss" | "recorded" | "unknown";
} {
  const cacheMode = safeGetStructuredAiTestCacheMode();

  if (/Structured AI test cache miss/i.test(message)) {
    return {
      signalSource: "structured_ai_cache_miss",
      execution: "replay_miss",
      liveInvocation: "no",
      cacheMode,
      cacheStatus: "replay_miss"
    };
  }

  return {
    signalSource: "failed",
    execution: "failed",
    liveInvocation: "unknown",
    cacheMode,
    cacheStatus: "unknown"
  };
}

function findEstimatorNoteValue(notes: string[], prefix: string): string | null {
  const match = notes.find((note) => note.startsWith(prefix));
  return match ? match.slice(prefix.length).replace(/\.$/, "").trim() : null;
}

export function buildAiExtractionNotes(trace: AiExtractionTrace, mode: EstimatorAiMode = "auto"): string[] {
  const history =
    trace.attempts.length > 0
      ? `Structured AI failure history: ${trace.attempts
          .map((attempt) =>
            `attempt ${attempt.attempt}=${attempt.category}${attempt.retryable ? " retryable" : " non-retryable"}`
          )
          .join("; ")}.`
      : "Structured AI failure history: none.";

  if (mode === "off") {
    return [
      "Structured AI extraction was skipped because SNAPQUOTE_ESTIMATOR_AI_MODE=off.",
      history
    ];
  }

  if (trace.structuredAiSucceeded) {
    return [
      `Structured AI extraction succeeded on attempt ${trace.attemptsMade}/${trace.maxAttempts}.`,
      history
    ];
  }

  return [
    `Structured AI extraction failed after ${trace.attemptsMade}/${trace.maxAttempts} attempts; fallback was used.`,
    `Structured AI final failure category: ${trace.finalFailureCategory ?? "unknown_error"} (${trace.finalFailureRetryable ? "retryable" : "non-retryable"}).`,
    history
  ];
}

function attachAiExtractionTrace(
  signals: AiEstimatorSignals,
  trace: AiExtractionTrace,
  mode: EstimatorAiMode
): AiEstimatorSignalsWithTrace {
  const executionSummary = summarizeAiExecution(signals, trace, mode);

  return {
    ...signals,
    estimatorNotes: Array.from(
      new Set([
        `Estimator AI mode: ${mode}.`,
        `Estimator signal source: ${trace.source}.`,
        `Estimator AI execution: ${executionSummary.execution}.`,
        `Estimator AI live invocation: ${executionSummary.liveInvocation}.`,
        `Estimator AI cache mode: ${executionSummary.cacheMode}.`,
        `Estimator AI cache status: ${executionSummary.cacheStatus}.`,
        ...buildAiExtractionNotes(trace, mode),
        ...(signals.estimatorNotes ?? [])
      ])
    ),
    aiExtractionTrace: trace
  };
}

function computeStructuredAiRetryDelayMs(attempt: number): number {
  const exponentialDelay = Math.min(
    STRUCTURED_AI_BASE_BACKOFF_MS * 2 ** Math.max(attempt - 1, 0),
    STRUCTURED_AI_MAX_BACKOFF_MS
  );
  const jitter = Math.floor(Math.random() * 250);
  return exponentialDelay + jitter;
}

function parseAiOutput(raw: string): AiEstimatorSignals {
  const sanitizedPayload = sanitizeAiJsonPayload(raw);

  try {
    const parsedJson = JSON.parse(sanitizedPayload);
    return normalizeLooseAiSignals(aiSignalsSchema.parse(parsedJson));
  } catch {
    const repairedPayload = repairAiJsonPayload(sanitizedPayload);

    try {
      const repairedJson = JSON.parse(repairedPayload);
      return normalizeLooseAiSignals(aiSignalsSchema.parse(repairedJson));
    } catch (error) {
      console.error("parseAiOutput failed after sanitizing payload:", sanitizedPayload);
      console.error("parseAiOutput failed after repair pass:", repairedPayload);
      throw error;
    }
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolveSatelliteImageUrl(input: EstimateInput): Promise<string | null> {
  if (input.satelliteImageUrl) return input.satelliteImageUrl;
  if (input.lat == null || input.lng == null) return null;

  const key = getGoogleMapsApiKey();
  if (!key) return null;

  const staticMapUrl = buildSatelliteStaticMapUrl(input.lat, input.lng, key);
  return fetchImageAsDataUrl(staticMapUrl);
}

export async function retryStructuredAiOperation<T>(params: {
  operation: (attempt: number) => Promise<T>;
  maxAttempts?: number;
  sleepFn?: (ms: number) => Promise<unknown>;
}): Promise<
  | { ok: true; result: T; trace: AiExtractionTrace }
  | { ok: false; result: null; failure: StructuredAiFailure; trace: AiExtractionTrace }
> {
  const attempts: AiExtractionAttemptTrace[] = [];
  const maxAttempts = Math.max(1, params.maxAttempts ?? STRUCTURED_AI_MAX_ATTEMPTS);
  const sleepFn = params.sleepFn ?? ((ms: number) => sleep(ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await params.operation(attempt);
      return {
        ok: true,
        result,
        trace: {
          ...buildAiExtractionTrace(attempts, {
            structuredAiSucceeded: true,
            fallbackUsed: false,
            attemptsMade: attempt
          }),
          maxAttempts
        }
      };
    } catch (error) {
      const failure = classifyStructuredAiFailure(error);
      attempts.push({
        attempt,
        category: failure.category,
        retryable: failure.retryable,
        message: failure.message,
        statusCode: failure.statusCode,
        code: failure.code
      });

      if (!failure.retryable || attempt >= maxAttempts) {
        return {
          ok: false,
          result: null,
          failure,
          trace: {
            ...buildAiExtractionTrace(attempts, {
              structuredAiSucceeded: false,
              fallbackUsed: true,
              attemptsMade: attempt,
              finalFailureCategory: failure.category,
              finalFailureRetryable: failure.retryable
            }),
            maxAttempts
          }
        };
      }

      const delayMs = computeStructuredAiRetryDelayMs(attempt);
      console.warn("Structured AI attempt failed; retrying.", {
        attempt,
        maxAttempts,
        category: failure.category,
        retryable: failure.retryable,
        statusCode: failure.statusCode,
        code: failure.code,
        delayMs
      });
      await sleepFn(delayMs);
    }
  }

  const failure = new StructuredAiFailure({
    category: "unknown_error",
    retryable: false,
    message: "Structured AI retry loop exited unexpectedly."
  });

  return {
    ok: false,
    result: null,
    failure,
    trace: buildAiExtractionTrace(attempts, {
      structuredAiSucceeded: false,
      fallbackUsed: true,
      attemptsMade: attempts.length,
      finalFailureCategory: failure.category,
      finalFailureRetryable: failure.retryable
    })
  };
}

function buildServiceRequests(input: EstimateInput): ServiceRequest[] {
  const answerBundles = Array.isArray(input.serviceQuestionAnswers) ? input.serviceQuestionAnswers : [];

  return input.services.map((service, index) => ({
    service: normalizeServiceName(service),
    answers: sanitizeAnswersForModeling(answerBundles[index]?.answers ?? {})
  }));
}

function sanitizeAnswersForModeling(answers: ServiceQuestionAnswers): ServiceQuestionAnswers {
  return Object.fromEntries(
    Object.entries(answers).filter(
      ([key]) => !key.endsWith("_contractor_note") && !key.endsWith("_other_text")
    )
  );
}

function sanitizeServiceQuestionBundlesForModeling(
  bundles: EstimateInput["serviceQuestionAnswers"]
): ServiceQuestionAnswerBundle[] {
  return [...(bundles ?? [])].map((bundle) => ({
    service: bundle.service,
    answers: sanitizeAnswersForModeling(bundle.answers)
  }));
}

function buildEstimatorRequests(
  input: EstimateInput,
  normalizedSignals?: AiEstimatorSignals | null
): ServiceRequest[] {
  const requests = buildServiceRequests(input);

  return requests.map((request) => {
    if (request.service !== "Pressure Washing") return request;

    const pressureSignal = normalizedSignals?.serviceSignals?.["Pressure Washing"];
    const isStructuredPressureSignal =
      pressureSignal &&
      !(pressureSignal.notes ?? []).some((note) =>
        /Heuristic service signal generated because AI extraction was unavailable\./i.test(note)
      );
    const accessAnswer = getAnswerByKeys(request.answers, ["pressure_washing_access"]).toLowerCase();
    const anchoredAccessType = pressureAccessTypeFromAnswers(request.answers);

    if (!isStructuredPressureSignal || !/not sure/.test(accessAnswer) || anchoredAccessType !== "easy_access") {
      return request;
    }

    return {
      ...request,
      answers: {
        ...request.answers,
        pressure_washing_access: "Easy access"
      }
    };
  });
}

function anchorFinalPressureEstimatorSignals(
  input: EstimateInput,
  propertyData: PropertyData,
  systemRegion: PricingRegionKey,
  normalizedSignals: AiEstimatorSignals
): AiEstimatorSignals {
  const requests = buildServiceRequests(input);
  if (requests.length !== 1 || requests[0]?.service !== "Pressure Washing") {
    return normalizedSignals;
  }

  const pressureSignal = normalizedSignals.serviceSignals?.["Pressure Washing"];
  if (!pressureSignal) return normalizedSignals;

  const isStructuredPressureSignal =
    !(pressureSignal.notes ?? []).some((note) =>
      /Heuristic service signal generated because AI extraction was unavailable\./i.test(note)
    );
  if (!isStructuredPressureSignal) return normalizedSignals;

  const pressureRequest = requests[0];
  const pressureTargets = getAnswerSelections(pressureRequest.answers, "pressure_washing_target");
  const pressureAccessAnswer = getAnswerByKeys(pressureRequest.answers, ["pressure_washing_access"]).toLowerCase();
  const anchoredAccessType = pressureAccessTypeFromAnswers(pressureRequest.answers);
  const anchoredAccessDifficulty = pressureAccessDifficultyFromAnswers(pressureRequest.answers);
  const selectedRoof = pressureTargets.some((target) => /roof/i.test(target));
  const explicitDifficultAccess = /tight|difficult/.test(pressureAccessAnswer);
  const normalizedNotSureEasy = /not sure/.test(pressureAccessAnswer) && anchoredAccessType === "easy_access";
  const nextPressureSignal: NormalizedServiceSignal = {
    ...pressureSignal,
    accessDifficulty:
      normalizedNotSureEasy
        ? null
        : anchoredAccessDifficulty ?? pressureSignal.accessDifficulty,
    obstructionLevel:
      normalizedNotSureEasy || anchoredAccessDifficulty === "easy"
        ? "low"
        : pressureSignal.obstructionLevel
  };
  normalizedSignals.serviceSignals = {
    ...(normalizedSignals.serviceSignals ?? {}),
    "Pressure Washing": nextPressureSignal
  };

  if (anchoredAccessType) {
    normalizedSignals.accessType = anchoredAccessType;
    normalizedSignals.accessTypeMultiplier = ACCESS_MULTIPLIERS[anchoredAccessType];
    normalizedSignals.access = anchoredAccessType === "easy_access" ? "easy" : "moderate";
  }

  if (selectedRoof && explicitDifficultAccess) {
    const terrainInference = inferTerrain(input, propertyData, systemRegion);
    if (terrainInference.terrainType !== "flat") {
      normalizedSignals.terrainType = terrainInference.terrainType;
      normalizedSignals.terrainMultiplier = TERRAIN_MULTIPLIERS[terrainInference.terrainType];
    }
  }

  return normalizedSignals;
}

function parseDirectQuantityHints(
  text: string
): { quantity: number; unit: NonNullable<NormalizedServiceSignal["quantityUnit"]>; evidence: "direct" } | null {
  const normalized = text.toLowerCase();
  const numberPattern = String.raw`(\d{1,3}(?:,\d{3})*|\d{2,5})`;
  const sqftPattern = new RegExp(`${numberPattern}\\s*(sq\\s*ft|sqft|square feet|square foot)`);
  const linearPattern = new RegExp(`${numberPattern}\\s*(linear feet|linear foot|lf|ft)`);
  const countPattern = new RegExp(`${numberPattern}\\s*(windows|trees|lights|fixtures|stumps)`);
  const byPattern = new RegExp(`${numberPattern}\\s*(?:x|by)\\s*${numberPattern}`);
  const rangePattern = new RegExp(
    `${numberPattern}\\s*(?:-|to)\\s*${numberPattern}\\s*(sq\\s*ft|sqft|square feet|square foot|linear feet|linear foot|lf|ft|windows|trees|lights|fixtures|stumps)`
  );
  const parseNumber = (value: string) => Number(value.replace(/,/g, ""));
  const hasUpperBoundPrefix = (matchIndex: number | undefined) => {
    if (matchIndex == null) return false;
    const prefix = normalized.slice(Math.max(0, matchIndex - 12), matchIndex);
    return /\b(up to|less than|max(?:imum)?|under)\s*$/.test(prefix);
  };
  const byMatch = normalized.match(byPattern);

  if (byMatch) {
    return {
      quantity: parseNumber(byMatch[1]) * parseNumber(byMatch[2]),
      unit: "sqft" as const,
      evidence: "direct" as const
    };
  }
  if (rangePattern.test(normalized)) return null;

  const sqftMatch = normalized.match(sqftPattern);
  const linearMatch = normalized.match(linearPattern);
  const countMatch = normalized.match(countPattern);

  if (sqftMatch && !hasUpperBoundPrefix(sqftMatch.index)) {
    return { quantity: parseNumber(sqftMatch[1]), unit: "sqft" as const, evidence: "direct" as const };
  }
  if (linearMatch && !hasUpperBoundPrefix(linearMatch.index)) {
    return { quantity: parseNumber(linearMatch[1]), unit: "linear_ft" as const, evidence: "direct" as const };
  }
  if (countMatch) {
    const unit =
      /windows/.test(countMatch[2]) ? "count" :
      /trees/.test(countMatch[2]) ? "tree_count" :
      /stumps/.test(countMatch[2]) ? "stump_count" :
      "fixture_count";
    return {
      quantity: parseNumber(countMatch[1]),
      unit: unit as NonNullable<NormalizedServiceSignal["quantityUnit"]>,
      evidence: "direct"
    };
  }

  return null;
}

function requestDirectEvidenceText(request: ServiceRequest, description: string | null | undefined): string {
  const questionOptionLookup = new Map(
    (serviceQuestions[request.service] ?? []).map((question) => [
      question.key,
      new Set(question.options.map((option) => option.trim().toLowerCase()))
    ])
  );
  const fragments = Object.entries(request.answers ?? {}).flatMap(([key, value]) => {
    const selections = parseQuestionAnswer(value);
    if (selections.length === 0) return [];

    if (/_other_text$|_contractor_note$/i.test(key)) {
      return selections;
    }

    const optionSet = questionOptionLookup.get(key);
    if (!optionSet) return [];

    return selections.filter((selection) => !optionSet.has(selection.trim().toLowerCase()));
  });

  if (description?.trim()) {
    fragments.push(description.trim());
  }

  return fragments.join(" ").trim();
}

function requestSignalText(request: ServiceRequest, description: string | null | undefined): string {
  const answerText = Object.values(request.answers ?? {})
    .flatMap((value) => parseQuestionAnswer(value))
    .join(" ");

  return `${request.service} ${answerText} ${description ?? ""}`.trim();
}

function roundToStableStep(value: number, step: number) {
  if (step < 1) {
    return Number((Math.round(value / step) * step).toFixed(2));
  }

  return Math.max(0, Math.round(value / step) * step);
}

function stableQuantityStep(unit: NormalizedServiceSignal["quantityUnit"], quantity: number) {
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

function unitsAreDirectlyCompatible(
  signalUnit: NormalizedServiceSignal["quantityUnit"] | null | undefined,
  directUnit: NormalizedServiceSignal["quantityUnit"]
) {
  return signalUnit != null && signalUnit === directUnit;
}

function clampEstimatedQuantityToMax(
  signal: NormalizedServiceSignal,
  maxQuantity: number | null | undefined,
  notes: string[],
  reason: string
) {
  if (
    maxQuantity == null ||
    maxQuantity <= 0 ||
    signal.estimatedQuantity == null ||
    signal.estimatedQuantity <= 0 ||
    signal.quantityEvidence === "direct"
  ) {
    return signal;
  }

  if (signal.estimatedQuantity <= maxQuantity) {
    return signal;
  }

  notes.push(reason);
  return {
    ...signal,
    estimatedQuantity: roundToStableStep(maxQuantity, stableQuantityStep(signal.quantityUnit ?? "count", maxQuantity)),
    quantityEvidence:
      signal.quantityEvidence === "strong_inference" ? "weak_inference" : signal.quantityEvidence
  };
}

function scaledSurfaceMap(surfaceMap: HardSurfaceMap, maxTotal: number): HardSurfaceMap {
  const total = sumSurfaceMap(surfaceMap);
  if (total <= 0 || total <= maxTotal) {
    return normalizeHardSurfaceMap(surfaceMap);
  }

  const scale = maxTotal / total;
  return normalizeHardSurfaceMap(
    Object.fromEntries(
      Object.entries(surfaceMap).map(([key, value]) => [key, Math.max(0, Math.round(value * scale))])
    ) as HardSurfaceMap
  );
}

function pressureSubtypeFromSelections(selections: string[]): string {
  if (selections.length !== 1) {
    return "custom";
  }

  const selection = selections[0].toLowerCase();
  if (/driveway/.test(selection)) return "driveway";
  if (/patio|porch/.test(selection)) return "patio_porch";
  if (/house exterior/.test(selection)) return "house_exterior";
  if (/fence/.test(selection)) return "fence";
  if (/roof/.test(selection)) return "roof";
  return "custom";
}

function hasOnlyVagueSelections(selections: string[]): boolean {
  return selections.length > 0 && selections.every((selection) => /^(other|not sure|unknown)$/i.test(selection.trim()));
}

function isVagueAnswer(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized.length === 0 || /^(other|not sure|unknown)$/i.test(normalized);
}

function gutterSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/downspout/.test(normalized)) return "clean_and_downspouts";
  if (/repair/.test(normalized)) return "minor_repair";
  if (/guard/.test(normalized)) return "gutter_guard_cleaning";
  if (/clean/.test(normalized)) return "clean_only";
  return "custom";
}

function windowSubtypeFromTargetType(targetType: string): string {
  const normalized = targetType.toLowerCase();
  if (/skylights/.test(normalized)) return "skylights";
  if (/large exterior windows|glass doors/.test(normalized)) return "oversized_windows_or_glass_doors";
  if (/commercial/.test(normalized)) return "small_commercial_glass";
  if (/second-story|hard-to-reach/.test(normalized)) return "second_story_hard_to_reach";
  if (/standard exterior house windows/.test(normalized)) return "standard_exterior_windows";
  return "custom";
}

function poolSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/green|neglected/.test(normalized)) return "green_pool_recovery";
  if (/dirty pool cleanup|very dirty/.test(normalized)) return "dirty_pool_cleanup";
  if (/opening|startup/.test(normalized)) return "opening_startup";
  if (/closing|winteriz/.test(normalized)) return "closing_winterizing";
  if (/spa only/.test(normalized)) return "spa_only";
  if (/pool and spa/.test(normalized)) return "pool_and_spa";
  if (/routine cleaning/.test(normalized)) return "routine_cleaning";
  return "custom";
}

function lawnSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/mowing only/.test(normalized)) return "mowing_only";
  if (/mowing and edging/.test(normalized)) return "mowing_and_edging";
  if (/full lawn maintenance/.test(normalized)) return "full_lawn_maintenance";
  if (/overgrown cleanup/.test(normalized)) return "overgrown_cleanup";
  return "custom";
}

function landscapingSubtypeFromAnswers(workSelections: string[], jobType: string): string {
  const normalizedSelections = Array.from(
    new Set(
      workSelections.flatMap((selection) => {
        const normalized = selection.toLowerCase();
        if (/new plants|garden beds/.test(normalized)) return ["new_plants_beds"];
        if (/rock|mulch/.test(normalized)) return ["rock_or_mulch_install"];
        if (/sod|lawn installation/.test(normalized)) return ["sod_or_lawn_install"];
        if (/yard makeover/.test(normalized)) return ["yard_makeover"];
        return [];
      })
    )
  );

  if (normalizedSelections.length > 1) return "custom";
  if (normalizedSelections.length === 1) return normalizedSelections[0] ?? "custom";

  const normalizedJobType = jobType.toLowerCase();
  if (/major redesign/.test(normalizedJobType)) return "major_redesign";
  if (/replace old/.test(normalizedJobType)) return "replace_old";
  if (/refresh existing/.test(normalizedJobType)) return "refresh_existing";
  return "custom";
}

function junkSubtypeFromType(junkType: string): string {
  const normalized = junkType.toLowerCase();
  if (/household junk/.test(normalized)) return "household_junk";
  if (/furniture/.test(normalized)) return "furniture";
  if (/yard debris/.test(normalized)) return "yard_debris";
  if (/construction debris/.test(normalized)) return "construction_debris";
  return "custom";
}

function pressureSurfaceCap(sizeAnswer: string): number | null {
  const normalized = sizeAnswer.toLowerCase();
  if (/small area/.test(normalized)) return 650;
  if (/medium area/.test(normalized)) return 1600;
  if (/large area/.test(normalized)) return 3200;
  if (/whole property|very large/.test(normalized)) return 5200;
  return null;
}

function pressureMixedQuantityAllowance(sizeAnswer: string, target: "house" | "roof" | "fence" | "custom"): number {
  const normalized = sizeAnswer.toLowerCase();
  const tier =
    /whole property|very large/.test(normalized) ? "very_large" :
    /large area/.test(normalized) ? "large" :
    /medium area/.test(normalized) ? "medium" :
    "small";

  const table = {
    house: { small: 160, medium: 220, large: 260, very_large: 360 },
    roof: { small: 120, medium: 170, large: 220, very_large: 320 },
    fence: { small: 60, medium: 90, large: 120, very_large: 180 },
    custom: { small: 0, medium: 40, large: 60, very_large: 100 }
  } as const;

  return table[target][tier];
}

function anchoredPressureMixedQuantity(
  answers: ServiceQuestionAnswers,
  quotedSurfaces: HardSurfaceMap | null | undefined
): number | null {
  const targets = getAnswerSelections(answers, "pressure_washing_target");
  if (targets.length <= 1) return null;

  const sizeAnswer = getAnswerByKeys(answers, ["pressure_washing_size"]);
  const hardSurfaceTotal = sumSurfaceMap(quotedSurfaces ?? {});
  const hardSurfaceWeight = targets.length >= 5 ? 0.45 : targets.length >= 3 ? 0.58 : 0.72;
  let total = hardSurfaceTotal * hardSurfaceWeight;

  if (targets.some((target) => /house exterior/i.test(target))) {
    total += pressureMixedQuantityAllowance(sizeAnswer, "house");
  }
  if (targets.some((target) => /roof/i.test(target))) {
    total += pressureMixedQuantityAllowance(sizeAnswer, "roof");
  }
  if (targets.some((target) => /fence/i.test(target))) {
    total += pressureMixedQuantityAllowance(sizeAnswer, "fence");
  }
  if (targets.some((target) => /other/i.test(target))) {
    total += pressureMixedQuantityAllowance(sizeAnswer, "custom");
  }

  const cap = pressureSurfaceCap(sizeAnswer);
  const maxAnchored =
    cap == null ? Number.POSITIVE_INFINITY : Math.round(cap * (targets.length >= 5 ? 0.7 : targets.length >= 3 ? 0.82 : 0.9));
  const minAnchored =
    cap == null ? 200 : Math.round(Math.max(180, cap * (targets.length >= 5 ? 0.34 : targets.length >= 3 ? 0.42 : 0.5)));
  const clamped = clamp(total, minAnchored, maxAnchored);

  return roundToStableStep(clamped, stableQuantityStep("sqft", clamped));
}

function lightingQuantityCap(scopeAnswer: string): number | null {
  const normalized = scopeAnswer.toLowerCase();
  if (/one small area/.test(normalized)) return 5;
  if (/one medium-sized area/.test(normalized)) return 9;
  if (/one large area/.test(normalized)) return 12;
  if (/multiple areas/.test(normalized)) return 18;
  return null;
}

function deckQuantityCap(scopeAnswer: string, areaType: string): number | null {
  const normalized = scopeAnswer.toLowerCase();
  const areaNormalized = areaType.toLowerCase();
  const premiumAreaFactor = /multi-level|rooftop|specialty/.test(areaNormalized) ? 1.2 : 1;

  if (/small/.test(normalized)) return Math.round(180 * premiumAreaFactor);
  if (/medium/.test(normalized)) return Math.round(380 * premiumAreaFactor);
  if (/large/.test(normalized)) return Math.round(750 * premiumAreaFactor);
  if (/multi-level|very large/.test(normalized)) return Math.round(1200 * premiumAreaFactor);
  return null;
}

function paintingQuantityCap(target: string, scopeAnswer: string): number | null {
  const targetNormalized = target.toLowerCase();
  const scopeNormalized = scopeAnswer.toLowerCase();
  const isDetachedTarget = /fence|detached/.test(targetNormalized);

  if (/small touch-up/.test(scopeNormalized)) return isDetachedTarget ? 180 : 220;
  if (/one side|small area/.test(scopeNormalized)) return isDetachedTarget ? 650 : 850;
  if (/most of exterior/.test(scopeNormalized)) return isDetachedTarget ? 700 : 1800;
  if (/full exterior/.test(scopeNormalized)) return isDetachedTarget ? 950 : 3600;
  return null;
}

function roofingQuantityCap(workType: string, scopeAnswer: string): number | null {
  const workNormalized = workType.toLowerCase();
  const scopeNormalized = scopeAnswer.toLowerCase();
  const repairCap =
    /minor repair/.test(workNormalized) ? 700 :
    /leak repair/.test(workNormalized) ? 1200 :
    /partial replacement/.test(workNormalized) ? 2500 :
    /full roof replacement/.test(workNormalized) ? 9000 :
    2200;

  if (/small section/.test(scopeNormalized)) return Math.min(repairCap, 700);
  if (/one area|slope/.test(scopeNormalized)) return Math.min(repairCap, 1400);
  if (/large portion/.test(scopeNormalized)) return Math.min(repairCap, 2600);
  if (/entire roof/.test(scopeNormalized)) return repairCap;
  return repairCap;
}

function concreteQuantityCap(scopeAnswer: string, selectedProjects: string[]): number | null {
  const normalized = scopeAnswer.toLowerCase();
  const componentMultiplier =
    selectedProjects.length >= 4 ? 1.5 : selectedProjects.length === 3 ? 1.35 : selectedProjects.length === 2 ? 1.2 : 1;

  if (/small/.test(normalized)) return Math.round(220 * componentMultiplier);
  if (/medium/.test(normalized)) return Math.round(600 * componentMultiplier);
  if (/large/.test(normalized)) return Math.round(1500 * componentMultiplier);
  if (/very large/.test(normalized)) return Math.round(2600 * componentMultiplier);
  if (/not sure|unknown/.test(normalized)) {
    const componentCaps = selectedProjects.map((project) => {
      const projectNormalized = project.toLowerCase();
      if (/driveway/.test(projectNormalized)) return 420;
      if (/patio/.test(projectNormalized)) return 280;
      if (/walkway/.test(projectNormalized)) return 160;
      if (/slab|pad/.test(projectNormalized)) return 240;
      return 220;
    });

    if (componentCaps.length === 0) {
      return 420;
    }

    const [largest, ...rest] = [...componentCaps].sort((a, b) => b - a);
    const blendedUnknownCap = largest + rest.reduce((sum, value) => sum + value * 0.45, 0);
    return Math.round(blendedUnknownCap);
  }
  return null;
}

function concreteSubtypeFromAnswers(projects: string[], workType: string): string {
  const workNormalized = workType.toLowerCase();

  if (/repair|resurfac/.test(workNormalized)) return "repair_resurfacing";
  if (/extension|addition/.test(workNormalized)) return "extension_addition";
  if (projects.length > 1) return "mixed";
  if (projects.length === 0) return "custom";

  const project = projects[0].toLowerCase();
  if (/driveway/.test(project)) return "driveway";
  if (/patio/.test(project)) return "patio";
  if (/walkway/.test(project)) return "walkway";
  if (/slab|pad/.test(project)) return "slab_pad";
  return "custom";
}

function treeSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/trim|cut back/.test(normalized)) return "trim_cut_back";
  if (/remove one tree/.test(normalized)) return "remove_one_tree";
  if (/remove multiple trees/.test(normalized)) return "remove_multiple_trees";
  if (/stump grinding/.test(normalized)) return "stump_grinding";
  return "custom";
}

function treeAccessDifficultyFromAnswers(answers: ServiceQuestionAnswers): NormalizedServiceSignal["accessDifficulty"] | null {
  const accessAnswer = getAnswerByKeys(answers, ["tree_access"]).toLowerCase();
  if (/difficult/.test(accessAnswer)) return "difficult";
  if (/moderate/.test(accessAnswer)) return "moderate";
  if (/easy/.test(accessAnswer) || /not sure/.test(accessAnswer)) return "easy";
  return null;
}

function roofingSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/minor repair/.test(normalized)) return "minor_repair";
  if (/leak repair/.test(normalized)) return "leak_repair";
  if (/partial replacement/.test(normalized)) return "partial_replacement";
  if (/full roof replacement/.test(normalized)) return "full_replacement";
  return "custom";
}

function fenceSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/new fence installation/.test(normalized)) return "new_install";
  if (/replacement/.test(normalized)) return "replacement";
  if (/gate/.test(normalized)) return "gate_work";
  if (/repair/.test(normalized)) return "repair";
  return "custom";
}

function fenceAccessDifficultyFromSite(siteAnswer: string): NormalizedServiceSignal["accessDifficulty"] | null {
  const normalized = siteAnswer.toLowerCase();
  if (/heavy slope|obstacles|tight access/.test(normalized)) return "difficult";
  if (/some slope/.test(normalized)) return "moderate";
  if (/flat and clear/.test(normalized)) return "easy";
  return null;
}

function fenceScopeBucketFromAnswer(scopeAnswer: string): "small" | "medium" | "large" | "very_large" | "unknown" {
  const normalized = scopeAnswer.toLowerCase();
  if (/full yard|200\+|very large/.test(normalized)) return "very_large";
  if (/one side|25-75|large/.test(normalized)) return "large";
  if (/75-200|medium/.test(normalized)) return "medium";
  if (/small section|up to/.test(normalized)) return "small";
  return "unknown";
}

function paintingSubtypeFromTarget(target: string): string {
  const normalized = target.toLowerCase();
  if (/full house exterior/.test(normalized)) return "full_house_exterior";
  if (/partial exterior/.test(normalized)) return "partial_exterior";
  if (/trim|doors|garage/.test(normalized)) return "trim_doors_garage";
  if (/fence|detached/.test(normalized)) return "fence_or_detached_structure";
  return "custom";
}

function deckSubtypeFromWorkType(workType: string): string {
  const normalized = workType.toLowerCase();
  if (/new deck/.test(normalized)) return "new_deck";
  if (/replace existing deck/.test(normalized)) return "replace_existing";
  if (/repair existing deck/.test(normalized)) return "repair_existing";
  if (/stairs|railing/.test(normalized)) return "stairs_railing_work";
  return "custom";
}

function lightingSubtypeFromAnswers(types: string[], workType: string): string {
  if (types.length !== 1) {
    const workNormalized = workType.toLowerCase();
    if (/repair existing/.test(workNormalized)) return "repair_existing";
    if (/add to an existing system|add to existing/.test(workNormalized)) return "add_to_existing";
    if (/replace existing/.test(workNormalized)) return "replace_existing";
    return "custom";
  }

  const normalized = types[0].toLowerCase();
  if (/pathway|driveway/.test(normalized)) return "pathway_lights";
  if (/accent|landscape/.test(normalized)) return "accent_landscape_lights";
  if (/patio|string/.test(normalized)) return "patio_string_lights";
  if (/security|flood/.test(normalized)) return "security_flood_lights";
  return "custom";
}

function pressureAccessDifficultyFromAnswers(
  answers: ServiceQuestionAnswers
): NormalizedServiceSignal["accessDifficulty"] | null {
  const accessAnswer = getAnswerByKeys(answers, ["pressure_washing_access"]).toLowerCase();
  const otherText =
    typeof answers.pressure_washing_target_other_text === "string"
      ? answers.pressure_washing_target_other_text.toLowerCase()
      : "";

  if (/tight|difficult/.test(accessAnswer)) return "difficult";
  if (/some obstacles|limited/.test(accessAnswer)) return "moderate";
  if (/easy/.test(accessAnswer)) return "easy";
  if (/not sure/.test(accessAnswer)) {
    return /access|obstacle|stairs|ladder|gate|gated|tight|difficult|hard-to-reach|limited/.test(otherText)
      ? "moderate"
      : "easy";
  }

  return null;
}

function pressureAccessTypeFromAnswers(answers: ServiceQuestionAnswers): AccessType | null {
  const accessAnswer = getAnswerByKeys(answers, ["pressure_washing_access"]).toLowerCase();
  const otherText =
    typeof answers.pressure_washing_target_other_text === "string"
      ? answers.pressure_washing_target_other_text.toLowerCase()
      : "";
  const hasExplicitConstraint = /access|obstacle|stairs|ladder|gate|gated|tight|difficult|hard-to-reach|limited/.test(
    otherText
  );

  if (/tight|difficult/.test(accessAnswer)) return "tight_access";
  if (/some obstacles|limited/.test(accessAnswer)) return "tight_access";
  if (/easy/.test(accessAnswer)) return "easy_access";
  if (/not sure/.test(accessAnswer)) return hasExplicitConstraint ? "tight_access" : "easy_access";

  return null;
}

function roofingAccessDifficultyFromAnswer(accessAnswer: string): NormalizedServiceSignal["accessDifficulty"] | null {
  const normalized = accessAnswer.toLowerCase();
  if (/very difficult/.test(normalized)) return "very_difficult";
  if (/steep|difficult/.test(normalized)) return "difficult";
  if (/moderate/.test(normalized)) return "moderate";
  if (/easy/.test(normalized)) return "easy";
  return null;
}

function lightingPremiumSignalAllowed(scopeAnswer: string, difficulty: string): boolean {
  return /multiple areas/i.test(scopeAnswer) || /complex|large-property|trenching/i.test(difficulty);
}

function applyServiceSpecificAiGuardrails(
  request: ServiceRequest,
  signal: NormalizedServiceSignal,
  propertyData?: PropertyData
): NormalizedServiceSignal {
  const notes = [...(signal.notes ?? [])];
  let adjusted = { ...signal };

  switch (request.service) {
    case "Pressure Washing": {
      const targets = getAnswerSelections(request.answers, "pressure_washing_target");
      const sizeAnswer = getAnswerByKeys(request.answers, ["pressure_washing_size"]);
      const selectedSubtype = pressureSubtypeFromSelections(targets);
      const isFallbackSignal = (signal.notes ?? []).some((note) =>
        /Heuristic service signal generated because AI extraction was unavailable\./i.test(note)
      );
      const allowedSurfaces: HardSurfaceMap = {};

      if (targets.some((target) => /driveway/i.test(target))) allowedSurfaces.driveway = adjusted.quotedSurfaces?.driveway ?? 0;
      if (targets.some((target) => /patio|porch/i.test(target))) allowedSurfaces.patio = adjusted.quotedSurfaces?.patio ?? 0;

      adjusted.jobSubtype = selectedSubtype;
      adjusted.jobSubtypeLabel = selectedSubtype.replace(/_/g, " ");
      if (!isFallbackSignal) {
        adjusted.accessDifficulty = pressureAccessDifficultyFromAnswers(request.answers) ?? adjusted.accessDifficulty;
      }
      adjusted.fallbackFamily = targets.length > 1 ? "mixed_custom" : adjusted.fallbackFamily;
      adjusted.customJobSignal = targets.length > 1;
      adjusted.needsManualReview = targets.length > 1 ? true : adjusted.needsManualReview;
      adjusted.quotedSurfaces = scaledSurfaceMap(allowedSurfaces, pressureSurfaceCap(sizeAnswer) ?? Number.POSITIVE_INFINITY);
      if (!isFallbackSignal && targets.length > 1) {
        const anchoredMixedQuantity = anchoredPressureMixedQuantity(request.answers, adjusted.quotedSurfaces);
        if (anchoredMixedQuantity != null) {
          adjusted.estimatedQuantity = anchoredMixedQuantity;
          adjusted.quantityUnit = "sqft";
          adjusted.quantityEvidence = "direct";
        }
      }
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        pressureSurfaceCap(sizeAnswer),
        notes,
        "Pressure-washing scope was capped to stay inside the questionnaire size band."
      );

      notes.push("Pressure-washing subtype and hard-surface scope were anchored to the selected questionnaire targets.");
      if (!isFallbackSignal) {
        notes.push("Pressure-washing access stayed anchored to the selected access answer unless the customer added explicit access constraints.");
      }
      if (targets.length > 1) {
        notes.push("Pressure-washing subtype was held to a mixed/custom path because multiple targets were selected.");
        notes.push("Pressure-washing mixed-job quantity stayed anchored to the selected target mix before scope reconciliation.");
      }
      break;
    }
    case "Concrete": {
      const workType = getAnswerByKeys(request.answers, ["concrete_work_type"]);
      const projects = getAnswerSelections(request.answers, "concrete_project_type");
      adjusted.jobSubtype = concreteSubtypeFromAnswers(projects, workType);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        concreteQuantityCap(getAnswerByKeys(request.answers, ["concrete_scope"]), projects),
        notes,
        "Concrete quantity was capped to respect the questionnaire scope band and selected project mix."
      );
      notes.push("Concrete subtype and quantity stayed anchored to the selected project mix and scope band.");
      break;
    }
    case "Tree Service / Removal": {
      const workType = getAnswerByKeys(request.answers, ["tree_work_type"]);
      const accessAnswer = getAnswerByKeys(request.answers, ["tree_access"]);
      const locationAnswer = getAnswerByKeys(request.answers, ["tree_location"]);
      adjusted.jobSubtype = treeSubtypeFromWorkType(workType);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted.accessDifficulty = treeAccessDifficultyFromAnswers(request.answers) ?? adjusted.accessDifficulty;
      if (
        adjusted.jobSubtype === "stump_grinding" &&
        /not sure/i.test(accessAnswer) &&
        /other/i.test(locationAnswer)
      ) {
        adjusted.accessDifficulty = "easy";
        adjusted.slopeClass = "flat";
        adjusted.needsManualReview = false;
        notes.push(
          "Simple stump-grinding jobs with uncertain access stay on the easy/default site path unless the questionnaire explicitly confirms harder access."
        );
      }
      notes.push("Tree-service subtype stayed anchored to the selected work type so stump-grinding requests keep the stump-specific pricing path.");
      break;
    }
    case "Fence Installation / Repair": {
      const workType = getAnswerByKeys(request.answers, ["fence_work_type"]);
      const scopeAnswer = getAnswerByKeys(request.answers, ["fence_scope"]);
      const siteAnswer = getAnswerByKeys(request.answers, ["fence_site"]);
      const material = getAnswerByKeys(request.answers, ["fence_material"]);
      const anchoredSubtype = fenceSubtypeFromWorkType(workType);
      const scopeBucket = fenceScopeBucketFromAnswer(scopeAnswer);
      const shouldSuppressRepairPremium =
        anchoredSubtype === "repair" &&
        scopeBucket === "very_large" &&
        Boolean(adjusted.premiumPropertySignal || adjusted.poolPresent);
      if (anchoredSubtype !== "gate_work") {
        adjusted.jobSubtype = anchoredSubtype;
        adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      }
      adjusted.accessDifficulty = fenceAccessDifficultyFromSite(siteAnswer) ?? adjusted.accessDifficulty;
      if (/other/i.test(material)) {
        adjusted.materialClass = "other";
      }
      if (shouldSuppressRepairPremium) {
        adjusted.premiumPropertySignal = false;
        adjusted.poolPresent = false;
        notes.push(
          "Large fence-repair jobs keep their repair scope, material, and site-condition signals, but unsupported estate-style premium assumptions were held back."
        );
      }
      notes.push("Fence subtype and site-access difficulty stayed anchored to the selected fence work type and site answer.");
      break;
    }
    case "Deck Installation / Repair": {
      const workType = getAnswerByKeys(request.answers, ["deck_work_type"]);
      const areaType = getAnswerByKeys(request.answers, ["deck_area_type"]);
      const material = getAnswerByKeys(request.answers, ["deck_material"]).toLowerCase();
      adjusted.jobSubtype = deckSubtypeFromWorkType(workType);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        deckQuantityCap(getAnswerByKeys(request.answers, ["deck_scope"]), areaType),
        notes,
        "Deck scope was capped to remain within the selected deck-size band."
      );
      adjusted.premiumPropertySignal =
        /multi-level|rooftop|specialty/i.test(areaType) || /premium|pvc/i.test(material)
          ? adjusted.premiumPropertySignal
          : false;
      if (adjusted.premiumPropertySignal === false) {
        notes.push("Deck premium-property assumptions were held back because the questionnaire did not indicate a specialty deck context.");
      }
      break;
    }
    case "Exterior Painting": {
      const target = getAnswerByKeys(request.answers, ["painting_target"]);
      const access = getAnswerByKeys(request.answers, ["painting_access"]).toLowerCase();
      const isDetachedTarget = /fence|detached/i.test(target);
      adjusted.jobSubtype = paintingSubtypeFromTarget(target);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        paintingQuantityCap(target, getAnswerByKeys(request.answers, ["painting_scope"])),
        notes,
        "Painting quantity was capped to remain inside the selected target/scope combination."
      );
      adjusted.accessDifficulty =
        /steep|hard-to-reach|tight/i.test(access)
          ? "difficult"
          : /two-story/i.test(access)
            ? "moderate"
            : /easy/.test(access)
              ? "easy"
              : adjusted.accessDifficulty;
      if (isDetachedTarget) {
        adjusted.premiumPropertySignal = false;
        if (!/two-story/i.test(access)) {
          adjusted.stories = 1;
          adjusted.heightClass = "single_story";
        }
        notes.push("Painting premium-property assumptions were reduced because the questionnaire target was a fence or detached structure.");
        notes.push("Detached-structure painting stayed anchored to single-story access unless the questionnaire explicitly indicated upper-story work.");
      }
      notes.push("Painting subtype, quantity, and access stayed anchored to the selected exterior-painting answers.");
      break;
    }
    case "Roofing": {
      const workType = getAnswerByKeys(request.answers, ["roofing_work_type"]);
      const problem = getAnswerByKeys(request.answers, ["roofing_problem"]).toLowerCase();
      const scopeAnswer = getAnswerByKeys(request.answers, ["roofing_scope"]);
      const accessAnswer = getAnswerByKeys(request.answers, ["roofing_access"]);
      adjusted.jobSubtype = roofingSubtypeFromWorkType(workType);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        roofingQuantityCap(workType, scopeAnswer),
        notes,
        "Roofing quantity was capped to stay aligned with the selected roofing work type and scope."
      );
      adjusted.accessDifficulty = roofingAccessDifficultyFromAnswer(accessAnswer) ?? adjusted.accessDifficulty;
      notes.push("Roofing subtype, access, and quantity stayed anchored to the selected roofing answers.");
      if (
        /repair/.test(workType.toLowerCase()) &&
        /old roof needing replacement|storm|major damage/.test(problem) &&
        /entire roof|large portion/.test(scopeAnswer.toLowerCase())
      ) {
        adjusted.needsManualReview = true;
        notes.push("Roofing answers conflict between repair intent and replacement-style scope, so manual review was kept on.");
      }
      break;
    }
    case "Outdoor Lighting Installation": {
      const workType = getAnswerByKeys(request.answers, ["lighting_work_type"]);
      const scopeAnswer = getAnswerByKeys(request.answers, ["lighting_scope"]);
      const difficulty = getAnswerByKeys(request.answers, ["lighting_install_difficulty"]).toLowerCase();
      const lightingTypes = getAnswerSelections(request.answers, "lighting_type");
      const propertySupportsPremiumLighting =
        (propertyData?.lotSizeSqft ?? 0) > 18000 || (propertyData?.houseSqft ?? 0) > 3600;
      adjusted.jobSubtype = lightingSubtypeFromAnswers(lightingTypes, workType);
      adjusted.jobSubtypeLabel = adjusted.jobSubtype.replace(/_/g, " ");
      adjusted = clampEstimatedQuantityToMax(
        adjusted,
        lightingQuantityCap(scopeAnswer),
        notes,
        "Lighting quantity was capped to stay inside the selected lighting scope bucket."
      );
      if (!lightingPremiumSignalAllowed(scopeAnswer, difficulty) || !propertySupportsPremiumLighting) {
        adjusted.premiumPropertySignal = false;
        notes.push(
          "Lighting premium-property assumptions were held back unless both the answers and the property size supported a large-property install."
        );
      }
      adjusted.customJobSignal =
        lightingTypes.length > 1 && /multiple areas/i.test(scopeAnswer) ? adjusted.customJobSignal : false;
      notes.push("Lighting subtype and complexity stayed anchored to the selected lighting type, scope, and difficulty.");
      break;
    }
  }

  return {
    ...adjusted,
    notes: Array.from(new Set(notes))
  };
}

function stabilizeAiServiceSignals(
  input: EstimateInput,
  propertyData: PropertyData,
  serviceSignals: Partial<Record<CanonicalService, NormalizedServiceSignal>>,
  audit?: NormalizeSignalsAudit
) {
  const requests = buildServiceRequests(input);

  return Object.fromEntries(
    requests.map((request) => {
      const signal = serviceSignals[request.service];
      if (!signal) return [request.service, signal];

      const rawMergedSignal = deepCloneJson(signal);
      const notes = [...(signal.notes ?? [])];
      let estimatedQuantity = signal.estimatedQuantity ?? null;
      let quantityEvidence = signal.quantityEvidence ?? null;
      const directHint = parseDirectQuantityHints(requestDirectEvidenceText(request, input.description));

      if (estimatedQuantity != null && estimatedQuantity > 0 && signal.quantityUnit) {
        if (directHint && unitsAreDirectlyCompatible(signal.quantityUnit, directHint.unit)) {
          estimatedQuantity = directHint.quantity;
          quantityEvidence = "direct";
          notes.push("Customer-provided dimensions or counts anchored the normalized quantity.");
        } else if (quantityEvidence === "direct") {
          quantityEvidence = "strong_inference";
          notes.push("Quantity evidence was downgraded because no direct customer dimensions or counts were found.");
        }

        if (quantityEvidence !== "direct") {
          estimatedQuantity = roundToStableStep(
            estimatedQuantity,
            stableQuantityStep(signal.quantityUnit, estimatedQuantity)
          );
          notes.push("Indirect AI quantity was quantized into a stable estimate band before reconciliation.");
        }
      }

      const postStabilizationSignal = {
        ...signal,
        estimatedQuantity,
        quantityEvidence,
        aiConfidence: mapConfidenceClarityToBaseTier(request.service, signal),
        consistencyScore:
          signal.consistencyScore != null
            ? clamp(Math.round(signal.consistencyScore / 5) * 5, 0, 100)
            : signal.consistencyScore,
        notes: Array.from(new Set(notes))
      } satisfies NormalizedServiceSignal;
      const postGuardrailSignal = applyServiceSpecificAiGuardrails(request, postStabilizationSignal, propertyData);

      if (audit) {
        const service = request.service;
        const previous = audit.serviceStages[service];
        const postStabilizationSnapshot = deepCloneJson(postStabilizationSignal);
        const postGuardrailSnapshot = deepCloneJson(postGuardrailSignal);
        audit.serviceStages[service] = {
          rawMergedSignal,
          postStabilizationSignal: postStabilizationSnapshot,
          postGuardrailSignal: postGuardrailSnapshot,
          postReconciliationSignal: previous?.postReconciliationSignal ?? null,
          finalEstimatorSignal: previous?.finalEstimatorSignal ?? null,
          changedByStabilization: changedForAudit(rawMergedSignal, postStabilizationSnapshot),
          changedByGuardrails: changedForAudit(postStabilizationSnapshot, postGuardrailSnapshot),
          changedByReconciliation: previous?.changedByReconciliation ?? false
        };
      }

      return [request.service, postGuardrailSignal];
    })
  ) as Partial<Record<CanonicalService, NormalizedServiceSignal>>;
}

function makeServiceSignal(
  serviceType: CanonicalService,
  partial: Partial<NormalizedServiceSignal>
): NormalizedServiceSignal {
  return {
    serviceType,
    ...partial
  };
}

function inferFallbackServiceSignal(
  request: ServiceRequest,
  input: EstimateInput,
  propertyData: PropertyData,
  detectedSurfaces: HardSurfaceMap,
  quotedSurfaces: HardSurfaceMap
): NormalizedServiceSignal {
  const text = requestSignalText(request, input.description).toLowerCase();
  const directEvidenceText = requestDirectEvidenceText(request, input.description).toLowerCase();
  const quantityHint = parseDirectQuantityHints(directEvidenceText);
  const lotSize = propertyData.lotSizeSqft ?? input.parcelLotSizeSqft ?? 0;
  const houseSqft = propertyData.houseSqft ?? 0;
  const stories =
    /three-story|three story|three-story or taller/.test(text) ? 3 : /two-story|two story/.test(text) ? 2 : 1;
  const premiumPropertySignal = lotSize > 18000 || houseSqft > 3600;
  const commercialSignal = /commercial|storefront|office|multi-unit|multi unit/.test(text);
  const fallbackClarity = {
    jobStandardness: request.service === "Other" || /custom|unusual|other/.test(text) ? "somewhat_unusual" : "standard",
    scopeClarity: /not sure|unknown|maybe/.test(text) ? "ambiguous" : "moderate",
    remainingUncertainty: /not sure|unknown|estimate/.test(text) ? "high" : "medium"
  } satisfies Pick<NormalizedServiceSignal, "jobStandardness" | "scopeClarity" | "remainingUncertainty">;
  const common = {
    summary: request.service,
    premiumPropertySignal,
    luxuryHardscapeSignal: sumSurfaceMap(detectedSurfaces) > 1800,
    commercialSignal,
    ...fallbackClarity,
    aiConfidence: mapConfidenceClarityToBaseTier(request.service, fallbackClarity),
    consistencyScore: 64,
    aiConfidenceReasons: ["Fallback heuristic interpretation"],
    notes: ["Heuristic service signal generated because AI extraction was unavailable."],
    quotedSurfaces
  } satisfies Partial<NormalizedServiceSignal>;

  switch (request.service) {
    case "Pressure Washing":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /driveway/.test(text) ? "driveway" :
          /patio|porch/.test(text) ? "patio_porch" :
          /house exterior/.test(text) ? "house_exterior" :
          /fence/.test(text) ? "fence" :
          /roof/.test(text) ? "roof" :
          "custom",
        workType: "clean",
        fallbackFamily:
          /roof/.test(text) ? "roof_like_surface" :
          /house exterior|fence/.test(text) ? "vertical_exterior_surface" :
          /other|multiple/.test(text) ? "mixed_custom" :
          "flat_hardscape",
        sizeBucket:
          /whole property|very large|3000\+/.test(text) ? "very_large" :
          /large/.test(text) ? "large" :
          /medium/.test(text) ? "medium" :
          /small/.test(text) ? "small" :
          "unknown",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : sumSurfaceMap(quotedSurfaces) || undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? (sumSurfaceMap(quotedSurfaces) > 0 ? "strong_inference" : "fallback"),
        surfaceFamily:
          /roof/.test(text) ? "roof_like_surface" :
          /house exterior|fence/.test(text) ? "vertical_exterior_surface" :
          "flat_hardscape",
        targetObjectFamily: /fence/.test(text) ? "fence" : "surface",
        conditionClass:
          /oil|rust|deep stains/.test(text) ? "deep_stains" :
          /heavy|moss/.test(text) ? "heavy_soiling" :
          /moderate/.test(text) ? "moderate_soiling" :
          "light_soiling",
        accessDifficulty:
          /tight|difficult|obstacles/.test(text) ? "difficult" :
          /some/.test(text) ? "moderate" :
          "easy"
      });
    case "Gutter Cleaning":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /downspout/.test(text) ? "clean_and_downspouts" :
          /repair/.test(text) ? "minor_repair" :
          /guard/.test(text) ? "gutter_guard_cleaning" :
          "clean_only",
        workType: /repair/.test(text) ? "repair" : "clean",
        fallbackFamily: "linear_boundary",
        estimatedQuantity: quantityHint?.unit === "linear_ft" ? quantityHint.quantity : undefined,
        quantityUnit: "linear_ft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        stories,
        heightClass: stories >= 3 ? "three_plus" : stories === 2 ? "two_story" : "single_story",
        conditionClass:
          /plants|overflowing|very full/.test(text) ? "heavy_debris" :
          /moderate/.test(text) ? "moderate_debris" :
          "light_debris"
      });
    case "Window Cleaning":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /skylights/.test(text) ? "skylights" :
          /large exterior windows|glass doors/.test(text) ? "oversized_windows_or_glass_doors" :
          /commercial/.test(text) ? "small_commercial_glass" :
          /second-story|hard-to-reach/.test(text) ? "second_story_hard_to_reach" :
          "standard_exterior_windows",
        workType: "clean",
        fallbackFamily: "window_group",
        estimatedQuantity: quantityHint?.quantity,
        quantityUnit: quantityHint?.unit === "count" ? "weighted_count" : "weighted_count",
        quantityEvidence: quantityHint?.evidence ?? "weak_inference",
        stories,
        heightClass: stories >= 3 ? "three_plus" : stories === 2 ? "two_story" : "single_story"
      });
    case "Pool Service / Cleaning":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /green|neglected/.test(text) ? "green_pool_recovery" :
          /dirty pool cleanup|very dirty/.test(text) ? "dirty_pool_cleanup" :
          /opening|startup/.test(text) ? "opening_startup" :
          /closing|winteriz/.test(text) ? "closing_winterizing" :
          /spa only/.test(text) ? "spa_only" :
          /pool and spa/.test(text) ? "pool_and_spa" :
          "routine_cleaning",
        workType: "service",
        fallbackFamily: "pool_service_event",
        estimatedQuantity: 1,
        quantityUnit: "service_event",
        quantityEvidence: "fallback",
        poolPresent: true,
        conditionClass:
          /green|neglected/.test(text) ? "neglected" :
          /very dirty/.test(text) ? "dirty" :
          /needs normal cleaning/.test(text) ? "routine" :
          "clean"
      });
    case "Lawn Care / Maintenance":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /mowing only/.test(text) ? "mowing_only" :
          /mowing and edging/.test(text) ? "mowing_and_edging" :
          /full lawn maintenance/.test(text) ? "full_lawn_maintenance" :
          /overgrown cleanup/.test(text) ? "overgrown_cleanup" :
          "custom",
        workType: /cleanup/.test(text) ? "remove" : "maintain",
        fallbackFamily: "yard_area",
        sizeBucket:
          /10,000\+|very large/.test(text) ? "very_large" :
          /5,000-10,000|large/.test(text) ? "large" :
          /2,000-5,000|medium/.test(text) ? "medium" :
          /small/.test(text) ? "small" :
          "unknown",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        conditionClass:
          /thick weeds|neglected/.test(text) ? "neglected" :
          /very overgrown/.test(text) ? "very_overgrown" :
          /slightly overgrown/.test(text) ? "slightly_overgrown" :
          "maintained"
      });
    case "Landscaping / Installation":
      {
        const workSelections = getAnswerSelections(request.answers, "landscape_work_type");
        const areaAnswer = getAnswerByKeys(request.answers, ["landscape_area_size"]);
        const jobTypeAnswer = getAnswerByKeys(request.answers, ["landscape_job_type", "landscape_existing_condition"]);
        const materialsAnswer = getAnswerByKeys(request.answers, ["landscape_materials"]);
        const keyedSubtype = landscapingSubtypeFromAnswers(workSelections, jobTypeAnswer);
        const textSubtype =
          /plants|garden beds/.test(text) ? "new_plants_beds" :
          /rock|mulch/.test(text) ? "rock_or_mulch_install" :
          /sod|lawn installation/.test(text) ? "sod_or_lawn_install" :
          /yard makeover/.test(text) ? "yard_makeover" :
          /refresh existing/.test(text) ? "refresh_existing" :
          /replace old/.test(text) ? "replace_old" :
          /major redesign/.test(text) ? "major_redesign" :
          "custom";
        const resolvedSubtype =
          (workSelections.length === 0 || hasOnlyVagueSelections(workSelections)) && isVagueAnswer(jobTypeAnswer)
            ? textSubtype
            : keyedSubtype;

      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype: resolvedSubtype,
        workType: "install",
        fallbackFamily: "install_area",
        sizeBucket:
          /full property|4,000\+|very large/.test(areaAnswer) ? "very_large" :
          /most of front or backyard|1,500-4,000/.test(areaAnswer) ? "large" :
          /one side of yard|500-1,500/.test(areaAnswer) ? "medium" :
          /small section|up to ~500|small/.test(areaAnswer) ? "small" :
          "unknown",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        prepNeeded: /replace old|cleanup/.test(jobTypeAnswer),
        materialClass:
          /mixed/.test(materialsAnswer) ? "mixed" :
          /rock|mulch/.test(materialsAnswer) ? "bulk_material" :
          /plants/.test(materialsAnswer) ? "plants" :
          /sod|turf/.test(materialsAnswer) ? "turf" :
          "plants"
      });
      }
    case "Tree Service / Removal":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /trim|cut back/.test(text) ? "trim_cut_back" :
          /remove one tree/.test(text) ? "remove_one_tree" :
          /remove multiple trees/.test(text) ? "remove_multiple_trees" :
          /stump grinding/.test(text) ? "stump_grinding" :
          "custom",
        workType: /stump grinding|remove/.test(text) ? "remove" : "service",
        fallbackFamily: "tree_work",
        estimatedQuantity: quantityHint?.quantity,
        quantityUnit: /stump/i.test(text) ? "stump_count" : "tree_count",
        quantityEvidence: quantityHint?.evidence ?? "weak_inference",
        haulAwayNeeded: /haul-away included|yes/.test(text),
        accessDifficulty: /power lines|difficult/.test(text) ? "difficult" : /moderate/.test(text) ? "moderate" : "easy"
      });
    case "Fence Installation / Repair":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /new fence installation/.test(text) ? "new_install" :
          /replacement/.test(text) ? "replacement" :
          /gate/.test(text) ? "gate_work" :
          /repair/.test(text) ? "repair" :
          "custom",
        workType:
          /new fence installation/.test(text) ? "install" :
          /replacement/.test(text) ? "replace" :
          /repair|gate/.test(text) ? "repair" :
          "custom",
        fallbackFamily: "linear_boundary",
        estimatedQuantity: quantityHint?.unit === "linear_ft" ? quantityHint.quantity : undefined,
        quantityUnit: "linear_ft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        materialClass:
          /vinyl/.test(text) ? "vinyl" : /chain link/.test(text) ? "chain_link" : /metal|aluminum/.test(text) ? "metal" : "wood"
      });
    case "Concrete":
      {
        const projects = getAnswerSelections(request.answers, "concrete_project_type");
        const workTypeAnswer = getAnswerByKeys(request.answers, ["concrete_work_type"]);
        const materialAnswer = getAnswerByKeys(request.answers, ["concrete_material"]);
        const siteConditionAnswer = getAnswerByKeys(request.answers, ["concrete_site_condition"]);
        const keyedSubtype = concreteSubtypeFromAnswers(projects, workTypeAnswer);
        const textSubtype =
          /driveway/.test(text) ? "driveway" :
          /patio/.test(text) ? "patio" :
          /walkway/.test(text) ? "walkway" :
          /slab|pad/.test(text) ? "slab_pad" :
          /repair|resurfac/.test(text) ? "repair_resurfacing" :
          /extension|addition/.test(text) ? "extension_addition" :
          "custom";
        const resolvedSubtype =
          projects.length > 0 || !isVagueAnswer(workTypeAnswer) ? keyedSubtype : textSubtype;

      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype: resolvedSubtype,
        workType:
          /repair|resurfac/.test(workTypeAnswer) ? "resurface" :
          /extension|addition/.test(workTypeAnswer) ? "extend" :
          /replacement/.test(workTypeAnswer) ? "replace" :
          "install",
        fallbackFamily: "install_area",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        removalNeeded: /removal|replacement/.test(workTypeAnswer),
        prepNeeded: /grading|prep|dirt/.test(siteConditionAnswer),
        materialClass:
          /brick|stone/.test(materialAnswer) ? "paver" :
          /stamped|decorative/.test(materialAnswer) ? "decorative_concrete" :
          "standard_concrete"
      });
      }
    case "Deck Installation / Repair":
      {
        const workTypeAnswer = getAnswerByKeys(request.answers, ["deck_work_type"]);
        const materialAnswer = getAnswerByKeys(request.answers, ["deck_material"]);
        const keyedSubtype = deckSubtypeFromWorkType(workTypeAnswer);
        const textSubtype =
          /new deck/.test(text) ? "new_deck" :
          /replace existing deck/.test(text) ? "replace_existing" :
          /repair existing deck/.test(text) ? "repair_existing" :
          /stairs|railing/.test(text) ? "stairs_railing_work" :
          "custom";
        const resolvedSubtype = isVagueAnswer(workTypeAnswer) ? textSubtype : keyedSubtype;

      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype: resolvedSubtype,
        workType:
          /new deck/.test(workTypeAnswer) ? "install" :
          /replace/.test(workTypeAnswer) ? "replace" :
          /repair|stairs|railing/.test(workTypeAnswer) ? "repair" :
          "custom",
        fallbackFamily: "install_area",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        materialClass:
          /composite/.test(materialAnswer) ? "composite" :
          /pvc|premium/.test(materialAnswer) ? "premium" :
          "wood"
      });
      }
    case "Exterior Painting":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /full house exterior/.test(text) ? "full_house_exterior" :
          /partial exterior/.test(text) ? "partial_exterior" :
          /trim|doors|garage/.test(text) ? "trim_doors_garage" :
          /fence|detached/.test(text) ? "fence_or_detached_structure" :
          "custom",
        workType: "install",
        fallbackFamily: "exterior_finish_surface",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        stories,
        heightClass: stories >= 3 ? "three_plus" : stories === 2 ? "two_story" : "single_story"
      });
    case "Roofing":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /minor repair/.test(text) ? "minor_repair" :
          /leak repair/.test(text) ? "leak_repair" :
          /partial replacement/.test(text) ? "partial_replacement" :
          /full roof replacement/.test(text) ? "full_replacement" :
          "custom",
        workType:
          /repair/.test(text) ? "repair" :
          /replacement/.test(text) ? "replace" :
          "custom",
        fallbackFamily: "roof_like_surface",
        estimatedQuantity: quantityHint?.unit === "sqft" ? quantityHint.quantity : undefined,
        quantityUnit: "sqft",
        quantityEvidence: quantityHint?.evidence ?? "strong_inference",
        roofType:
          /tile/.test(text) ? "tile" :
          /metal/.test(text) ? "metal" :
          /flat/.test(text) ? "flat" :
          "shingle"
      });
    case "Junk Removal":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /household junk/.test(text) ? "household_junk" :
          /furniture/.test(text) ? "furniture" :
          /yard debris/.test(text) ? "yard_debris" :
          /construction debris/.test(text) ? "construction_debris" :
          "custom",
        workType: "remove",
        fallbackFamily: "debris_load",
        estimatedQuantity: quantityHint?.quantity,
        quantityUnit: "load",
        quantityEvidence: quantityHint?.evidence ?? "weak_inference"
      });
    case "Outdoor Lighting Installation":
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype:
          /pathway|driveway/.test(text) ? "pathway_lights" :
          /accent|landscape/.test(text) ? "accent_landscape_lights" :
          /patio|string/.test(text) ? "patio_string_lights" :
          /security|flood/.test(text) ? "security_flood_lights" :
          /replace existing/.test(text) ? "replace_existing" :
          /add to existing/.test(text) ? "add_to_existing" :
          /repair existing/.test(text) ? "repair_existing" :
          "custom",
        workType:
          /install lights i already have|install a basic new lighting setup|install a full new lighting system|new installation/.test(text) ? "install" :
          /add to an existing system|add to existing/.test(text) ? "extend" :
          /replace/.test(text) ? "replace" :
          /repair/.test(text) ? "repair" :
          "custom",
        fallbackFamily: "lighting_system",
        sizeBucket:
          /multiple areas|large portion of the property or long runs|very large job/.test(text) ? "very_large" :
          /one large area|most of the front or backyard|large job/.test(text) ? "large" :
          /one medium-sized area|several areas on part of the property|medium job/.test(text) ? "medium" :
          /one small area|small job/.test(text) ? "small" :
          "unknown",
        estimatedQuantity: quantityHint?.quantity,
        quantityUnit: "fixture_count",
        quantityEvidence: quantityHint?.evidence ?? "weak_inference"
      });
    default:
      return makeServiceSignal(request.service, {
        ...common,
        jobSubtype: "custom",
        workType:
          /clean/.test(text) ? "clean" :
          /repair/.test(text) ? "repair" :
          /install/.test(text) ? "install" :
          /removal/.test(text) ? "remove" :
          "custom",
        fallbackFamily: "mixed_custom",
        estimatedQuantity: quantityHint?.quantity,
        quantityUnit: quantityHint?.unit ?? "count",
        quantityEvidence: quantityHint?.evidence ?? "fallback",
        customJobSignal: true,
        needsManualReview: true,
        commercialSignal
      });
  }
}

function mergeServiceSignals(
  input: EstimateInput,
  propertyData: PropertyData,
  detectedSurfaces: HardSurfaceMap,
  quotedSurfaces: HardSurfaceMap,
  aiSignals: AiEstimatorSignals
): Partial<Record<CanonicalService, NormalizedServiceSignal>> {
  const requests = buildServiceRequests(input);
  const aiSignalMap = aiSignals.serviceSignals ?? {};
  const result: Partial<Record<CanonicalService, NormalizedServiceSignal>> = {};

  for (const request of requests) {
    const existing = aiSignalMap[request.service];
    const fallback = inferFallbackServiceSignal(request, input, propertyData, detectedSurfaces, quotedSurfaces);
    result[request.service] = {
      ...fallback,
      ...existing,
      serviceType: request.service,
      quotedSurfaces: existing?.quotedSurfaces ?? fallback.quotedSurfaces,
      surfaceDetections: existing?.surfaceDetections ?? fallback.surfaceDetections,
      aiConfidenceReasons: Array.from(new Set([...(existing?.aiConfidenceReasons ?? []), ...(fallback.aiConfidenceReasons ?? [])])),
      notes: Array.from(new Set([...(existing?.notes ?? []), ...(fallback.notes ?? [])]))
    };
  }

  return result;
}

function buildSignalPrompt(
  input: EstimateInput,
  propertyData: PropertyData,
  systemRegion: PricingRegionKey
): string {
  return [
    "You are SnapQuote's estimator signal extraction assistant.",
    "Analyze the services, questionnaire answers, any other-text answer fields, customer description, uploaded photos, property data, and satellite image.",
    "Return ONLY valid JSON.",
    "Return a single JSON object and nothing else.",
    "Do not include explanations, markdown, code fences, or text before or after the JSON.",
    "All numbers must use valid JSON decimals. Use 0.8 or 0.0 when needed.",
    "AI interprets. Logic prices. Do not estimate or suggest any dollar amount.",
    "Questionnaire answers are the primary structured evidence. Use description, other-text answers, photos, satellite, and property context to refine and confirm, not to override recklessly.",
    "Prefer stable categorical outputs over creative wording. Use the canonical enums and stable subtype labels whenever possible.",
    "Do not return a confidence tier directly. Instead, return structured clarity judgments only.",
    "For each serviceSignals item, return these enum fields for confidence input: jobStandardness, scopeClarity, remainingUncertainty.",
    "jobStandardness must be one of: standard, somewhat_unusual, unusual.",
    "scopeClarity must be one of: clear, moderate, ambiguous.",
    "remainingUncertainty must be one of: low, medium, high.",
    "Base those judgments on job clarity, ambiguity, scope certainty, how standard vs unusual the request seems, and how much guessing is still required from structured evidence.",
    "Do not mainly base those judgments on form completion, vague selections, photo count, or description length; the backend handles those adjustments deterministically.",
    "A fully answered form is not automatically standard, clear, or low uncertainty.",
    "When uncertain between two adjacent clarity labels, choose the more conservative one: somewhat_unusual over standard, moderate over clear, high over medium, and medium over low.",
    "Treat exceptional clarity as rare: only label a job standard + clear + low when the request is plainly straightforward and very little guessing remains.",
    "For Other, use the same fields but stay conservative. Only use standard + clear + low when the custom request is unusually specific and easy to interpret.",
    "If the request is unusual, blended, custom, or could reasonably fit multiple interpretations, prefer somewhat_unusual or unusual, and prefer moderate or ambiguous clarity.",
    "aiConfidenceReasons should briefly justify the clarity judgments in terms of clarity and ambiguity, not completion score.",
    "Some questionnaire answers may be arrays because a few approved questions support multi-select.",
    "Treat multi-select answers as multiple components or blended attributes, not as multiple full-size jobs by default.",
    "Return both shared top-level signals and a serviceSignals array with one object per requested service.",
    "Each serviceSignals item should map the job into a known subtype when possible, otherwise the closest fallbackFamily.",
    "Use quantityEvidence to distinguish direct dimensions/counts from inferred quantities.",
    "Only use quantityEvidence='direct' when the customer explicitly provided dimensions, counts, or footage in the questionnaire, other-text answers, or main description.",
    "If quantity is inferred mainly from photos, satellite, property data, or general context, use strong_inference or weak_inference instead of direct.",
    "When evidence is indirect, prefer stable size bands and conservative quantities inside those bands rather than improvising a fresh exact quantity.",
    "For landscaping, lawn care, and concrete scope estimates, always default to the lower bound of the detected size band when quantity evidence is indirect or inferred.",
    "Set needsManualReview true for large custom, unusual, or conflicting jobs, but still provide the best structured signal set possible.",
    "The pricingRegion is already determined by the backend from the address. Treat it as fixed context and do not infer or return region.",
    "Detect washable hard surfaces from satellite imagery and photos, then separately infer which of those surfaces are actually in customer scope for relevant services.",
    "Surface types are driveway, motor_court, parking_pad, walkway, and patio.",
    "summary must be plain English sentences describing what the customer wants done, the condition or difficulty of the job, and any notable details. Write it like a contractor briefing a colleague. No technical labels, no colons, no data formats. Scale the summary length based on service count. For 1 service: write 3 detailed sentences covering scope, condition, size, and access. For 2-3 services: write 2 sentences covering all services briefly. For 4 or more services: write 1-2 concise sentences naming all services and the overall scope only. Never exceed 3 sentences regardless of service count. If multiple services are requested, summarize ALL of them. Do not focus on just one service. Cover the full scope of work across all requested services. Also include a rough size estimate using words like 'around' or 'about' — never an exact number. Base the size on satellite imagery, customer photos, and property data combined with questionnaire answers.",
    JSON.stringify(
      {
        businessName: input.businessName,
        services: input.services,
        serviceQuestionAnswers: sanitizeServiceQuestionBundlesForModeling(input.serviceQuestionAnswers),
        address: propertyData.formattedAddress,
        city: propertyData.city,
        state: propertyData.state,
        zipCode: propertyData.zipCode,
        pricingRegion: systemRegion,
        lotSizeSqft: propertyData.lotSizeSqft,
        lotSizeSource: propertyData.lotSizeSource,
        houseSqft: propertyData.houseSqft,
        houseSqftSource: propertyData.houseSqftSource,
        estimatedBackyardSqft: propertyData.estimatedBackyardSqft,
        locationSource: propertyData.locationSource,
        description: input.description ?? "",
        photoCount: input.photoUrls.length,
        satelliteAvailable: input.lat != null && input.lng != null
      },
      null,
      2
    ),
    "Return exactly this shape:",
    JSON.stringify(
      {
        summary: "The customer is looking to have their driveway and fence pressure washed at a Beverly Hills property. The driveway looks to be around 800 to 1,000 square feet based on the satellite view, with heavy oil staining on the driveway and moderate buildup on the fence. Access looks straightforward with no major obstacles.",
        condition: "light",
        access: "easy",
        severity: "minor",
        debris: "none",
        multipleAreas: false,
        materialHint: "",
        inferredScope: "",
        treeSize: "medium",
        estimatedWindowCount: -1,
        estimatedPoolSqft: -1,
        estimatedFixtureCount: -1,
        estimatedJunkCubicYards: -1,
        internalConfidence: 75,
        pricingDrivers: ["string"],
        estimatorNotes: ["string"],
        serviceSignals: [
          {
            serviceType: "Pressure Washing",
            jobSubtype: "driveway",
            jobSubtypeLabel: "Driveway",
            workType: "clean",
            fallbackFamily: "flat_hardscape",
            surfaceFamily: "flat_hardscape",
            targetObjectFamily: "surface",
            sizeBucket: "medium",
            estimatedQuantity: 950,
            quantityUnit: "sqft",
            quantityEvidence: "strong_inference",
            materialClass: "concrete",
            materialSubtype: "standard",
            conditionClass: "moderate_soiling",
            severityClass: "moderate",
            accessDifficulty: "easy",
            obstructionLevel: "low",
            heightClass: "ground_level",
            stories: -1,
            slopeClass: "flat",
            removalNeeded: false,
            prepNeeded: false,
            haulAwayNeeded: false,
            poolPresent: false,
            fencePresent: false,
            deckPresent: false,
            roofType: "",
            premiumPropertySignal: false,
            luxuryHardscapeSignal: false,
            commercialSignal: false,
            customJobSignal: false,
            needsManualReview: false,
            jobStandardness: "standard",
            scopeClarity: "moderate",
            remainingUncertainty: "medium",
            aiConfidenceReasons: ["The scope is understandable and fairly standard.", "Some quantity guessing still remains."],
            consistencyScore: 84,
            notes: ["Questionnaire and photo evidence agree on driveway cleaning scope."],
            summary: "Moderate driveway cleaning request.",
            quotedSurfaces: {
              driveway: 950,
              motor_court: 0,
              parking_pad: 0,
              walkway: 0,
              patio: 0
            },
            surfaceDetections: [
              {
                surface_type: "driveway",
                surface_area_sqft: 950,
                confidence: 0.86
              }
            ]
          }
        ],
        surfaceDetections: [
          {
            surface_type: "driveway",
            surface_area_sqft: 2100,
            confidence: 0.84
          }
        ],
        detectedSurfaces: {
          driveway: 2100,
          motor_court: 0,
          parking_pad: 0,
          walkway: 250,
          patio: 0
        },
        quotedSurfaces: {
          driveway: 2100,
          motor_court: 0,
          parking_pad: 0,
          walkway: 0,
          patio: 0
        },
        surfaceDetectionConfidence: 82,
        satelliteClarity: 85,
        imageQuality: 74,
        scopeMatchConfidence: 88,
        terrainType: "flat",
        accessType: "easy_access",
        materialType: "concrete",
        terrainMultiplier: 1,
        accessTypeMultiplier: 1,
        materialMultiplier: 1,
        regionMultiplier: 1.2,
        luxuryMultiplier: 1.05,
        estateScore: 14300,
        premiumPropertySignal: false,
        commercialSignal: false,
        customJobSignal: false,
        needsManualReview: false,
        aiConfidenceReasons: ["Questionnaire answers were specific.", "Property context and imagery support the inferred scope."]
      },
      null,
      2
    )
  ].join("\n");
}

function normalizeServiceQuestionBundlesForCache(
  bundles: EstimateInput["serviceQuestionAnswers"]
): ServiceQuestionAnswerBundle[] {
  return sanitizeServiceQuestionBundlesForModeling(bundles)
    .map((bundle) => ({
      service: bundle.service,
      answers: Object.fromEntries(
        Object.entries(bundle.answers)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])
      )
    }))
    .sort((left, right) => left.service.localeCompare(right.service));
}

function buildStructuredAiTestCachePayload(prompt: string, input: EstimateInput) {
  return {
    version: 1,
    prompt,
    requestSummary: {
      businessName: input.businessName,
      services: [...input.services],
      address: input.address,
      addressPlaceId: input.addressPlaceId ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      description: input.description ?? null,
      serviceQuestionAnswers: normalizeServiceQuestionBundlesForCache(input.serviceQuestionAnswers),
      photoUrlCount: input.photoUrls.length,
      hasSatelliteContext: Boolean(input.satelliteImageUrl || (input.lat != null && input.lng != null))
    }
  };
}

function buildStructuredAiTestCacheKey(prompt: string, input: EstimateInput): { keyHash: string; promptHash: string } {
  const payload = buildStructuredAiTestCachePayload(prompt, input);
  const serialized = JSON.stringify(payload);
  return {
    keyHash: createHash("sha256").update(serialized).digest("hex"),
    promptHash: createHash("sha256").update(prompt).digest("hex")
  };
}

function getStructuredAiTestCachePath(keyHash: string): string {
  return path.join(getStructuredAiTestCacheDir(), `${keyHash}.json`);
}

function withStructuredAiCacheNote(signals: AiEstimatorSignals, note: string): AiEstimatorSignals {
  return {
    ...signals,
    estimatorNotes: Array.from(new Set([note, ...(signals.estimatorNotes ?? [])]))
  };
}

async function readStructuredAiTestCacheEntry(
  prompt: string,
  input: EstimateInput
): Promise<{ entry: StructuredAiCacheEntry; cachePath: string } | null> {
  const { keyHash } = buildStructuredAiTestCacheKey(prompt, input);
  const cachePath = getStructuredAiTestCachePath(keyHash);

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StructuredAiCacheEntry> | null;

    if (!parsed || parsed.version !== 1 || !parsed.signals || parsed.keyHash !== keyHash) {
      return null;
    }

    return {
      entry: parsed as StructuredAiCacheEntry,
      cachePath
    };
  } catch (error) {
    const missingFile = error && typeof error === "object" && "code" in error && error.code === "ENOENT";

    if (missingFile) {
      return null;
    }

    throw error;
  }
}

async function writeStructuredAiTestCacheEntry(
  prompt: string,
  input: EstimateInput,
  signals: AiEstimatorSignals
): Promise<string> {
  const { keyHash, promptHash } = buildStructuredAiTestCacheKey(prompt, input);
  const cachePath = getStructuredAiTestCachePath(keyHash);
  const entry: StructuredAiCacheEntry = {
    version: 1,
    createdAt: new Date().toISOString(),
    promptHash,
    keyHash,
    requestSummary: {
      businessName: input.businessName,
      services: [...input.services],
      address: input.address,
      addressPlaceId: input.addressPlaceId ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      description: input.description ?? null,
      serviceQuestionAnswers: normalizeServiceQuestionBundlesForCache(input.serviceQuestionAnswers)
    },
    signals
  };

  await mkdir(getStructuredAiTestCacheDir(), { recursive: true });
  await writeFile(cachePath, JSON.stringify(entry, null, 2), "utf8");
  return cachePath;
}

async function callOpenAI(prompt: string, input: EstimateInput): Promise<StructuredAiCallResult> {
  try {
    validateStructuredAiRequest(input);
  } catch (error) {
    const failure = classifyStructuredAiFailure(error);
    return {
      ok: false,
      failure,
      trace: buildAiExtractionTrace([], {
        structuredAiSucceeded: false,
        fallbackUsed: true,
        attemptsMade: 0,
        finalFailureCategory: failure.category,
        finalFailureRetryable: failure.retryable
      })
    };
  }

  const testCacheMode = getStructuredAiTestCacheMode();

  if (testCacheMode === "replay" || testCacheMode === "record_replay") {
    try {
      const cached = await readStructuredAiTestCacheEntry(prompt, input);

      if (cached) {
        console.log("Structured AI test cache hit.", { cachePath: cached.cachePath });
        return {
          ok: true,
          signals: withStructuredAiCacheNote(
            cached.entry.signals,
            `Structured AI test cache: replay hit (${path.basename(cached.cachePath)}).`
          ),
          trace: buildAiExtractionTrace([], {
            structuredAiSucceeded: true,
            fallbackUsed: false,
            attemptsMade: 1
          })
        };
      }

      if (testCacheMode === "replay") {
        const cacheDir = getStructuredAiTestCacheDir();
        const failure = new StructuredAiFailure({
          category: "bad_request",
          retryable: false,
          message:
            `Structured AI test cache miss while SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE=replay. ` +
            `No cached response was found in ${cacheDir}. ` +
            "Re-run with SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE=record_replay to populate the cache, " +
            "or set SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR to a populated cache directory."
        });
        return {
          ok: false,
          failure,
          trace: buildAiExtractionTrace([], {
            structuredAiSucceeded: false,
            fallbackUsed: true,
            attemptsMade: 0,
            finalFailureCategory: failure.category,
            finalFailureRetryable: failure.retryable
          })
        };
      }
    } catch (error) {
      console.warn("Structured AI test cache read failed; continuing without replay cache.", error);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const failure = new StructuredAiFailure({
      category: "bad_request",
      retryable: false,
      message: "OPENAI_API_KEY is not configured."
    });
    return {
      ok: false,
      failure,
      trace: buildAiExtractionTrace([], {
        structuredAiSucceeded: false,
        fallbackUsed: true,
        attemptsMade: 0,
        finalFailureCategory: failure.category,
        finalFailureRetryable: failure.retryable
      })
    };
  }

  const client = new OpenAI({ apiKey });
  const satelliteImage = await resolveSatelliteImageUrl(input);
  const imageInputs = [
    ...input.photoUrls.map((url) => ({
      type: "input_image" as const,
      image_url: url,
      detail: "high" as const
    })),
    ...(satelliteImage
      ? [
          {
            type: "input_image" as const,
            image_url: satelliteImage,
            detail: "high" as const
          }
        ]
      : [])
  ];

  const attemptResult = await retryStructuredAiOperation({
    operation: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("Structured AI request timed out."), STRUCTURED_AI_TIMEOUT_MS);

      try {
        const response = await client.responses.parse(
          {
            model: "gpt-5-mini",
            reasoning: {
              effort: "low"
            },
            text: {
              format: buildAiSignalsResponseFormat()
            },
            input: [
              {
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text:
                      "Return ONLY valid JSON. Do not include markdown, explanations, or any text outside the JSON object. All numeric values must be valid JSON numbers."
                  }
                ]
              },
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt
                  },
                  ...imageInputs
                ]
              }
            ]
          },
          {
            signal: controller.signal
          }
        );

        if (response.output_parsed) {
          try {
            return normalizeAiSignalsResponse(validateStructuredAiParsedResponse(response.output_parsed));
          } catch (error) {
            const outputText = response.output_text?.trim();
            if (outputText) {
              return parseStructuredAiOutput(outputText);
            }
            throw error;
          }
        }

        const text = response.output_text?.trim();
        if (!text) {
          throw new StructuredAiFailure({
            category: "parse_failure",
            retryable: true,
            message: "Structured AI response did not include parsed output or output text."
          });
        }

        return parseStructuredAiOutput(text);
      } catch (error) {
        throw classifyStructuredAiFailure(error);
      } finally {
        clearTimeout(timeoutId);
      }
    }
  });

  if (attemptResult.ok) {
    let signals = attemptResult.result;

    if (testCacheMode === "record" || testCacheMode === "record_replay") {
      try {
        const cachePath = await writeStructuredAiTestCacheEntry(prompt, input, signals);
        console.log("Structured AI test cache saved.", { cachePath });
        signals = withStructuredAiCacheNote(
          signals,
          `Structured AI test cache: recorded (${path.basename(cachePath)}).`
        );
      } catch (error) {
        console.warn("Structured AI test cache write failed; continuing without cached replay.", error);
      }
    }

    return {
      ok: true,
      signals,
      trace: attemptResult.trace
    };
  }

  console.error("Structured AI extraction failed; falling back.", {
    attemptsMade: attemptResult.trace.attemptsMade,
    finalFailureCategory: attemptResult.trace.finalFailureCategory,
    finalFailureRetryable: attemptResult.trace.finalFailureRetryable,
    attempts: attemptResult.trace.attempts
  });
  return {
    ok: false,
    failure: attemptResult.failure,
    trace: attemptResult.trace
  };
}

function buildGeneratedEstimate(
  engineEstimate: EngineEstimate,
  propertyData: PropertyData,
  signals: AiEstimatorSignalsWithTrace,
  estimatorAudit?: EstimatorPipelineAudit | null
): GeneratedLeadEstimate {
  const message = `SnapQuote estimate: ${engineEstimate.service}. Estimated range ${engineEstimate.lowEstimate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} to ${engineEstimate.highEstimate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`;
  const region = engineEstimate.region ?? signals.region ?? "default";

  return {
    ...engineEstimate,
    message,
    summary: signals.summary ?? engineEstimate.scopeSummary,
    costBreakdown: engineEstimate.lineItems,
    propertyData,
    terrain: engineEstimate.terrain ?? signals.terrainType ?? null,
    access: engineEstimate.access ?? signals.accessType ?? null,
    material: engineEstimate.material ?? signals.materialType ?? null,
    region,
    wash_surface_sqft: engineEstimate.wash_surface_sqft ?? (sumSurfaceMap(signals.quotedSurfaces) || null),
    detected_surfaces: engineEstimate.detected_surfaces ?? signals.detectedSurfaces,
    quoted_surfaces: engineEstimate.quoted_surfaces ?? signals.quotedSurfaces,
    snap_quote: engineEstimate.snapQuote,
    price_range:
      engineEstimate.price_range ??
      `${engineEstimate.lowEstimate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} - ${engineEstimate.highEstimate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
    confidence_score: engineEstimate.confidenceScore,
    aiExtractionTrace: signals.aiExtractionTrace ?? null,
    estimatorAudit: estimatorAudit ?? null
  };
}

function buildMultiplierVisibilityNote(
  estimate: EngineEstimate,
  propertyData: PropertyData
): string {
  const travelDistanceMiles = propertyData.travelDistanceMiles ?? null;
  const travelMultiplier = 1 + getTravelAdjustmentPct(travelDistanceMiles);
  const summary = {
    pricingRegionModelKey: estimate.multiplierSummary?.pricingRegionModelKey ?? estimate.pricingRegion,
    resolvedRegion: estimate.multiplierSummary?.resolvedRegion ?? estimate.region ?? estimate.pricingRegion,
    regionalMultiplier: estimate.multiplierSummary?.regionalMultiplier ?? 1,
    travelDistanceMiles,
    travelMultiplier,
    luxuryMultiplier: estimate.multiplierSummary?.luxuryMultiplier ?? estimate.luxury_multiplier ?? 1,
    serviceMultipliers: estimate.multiplierSummary?.serviceMultipliers ?? []
  };
  return `Estimator multipliers: ${JSON.stringify(summary)}`;
}

export function fallbackEstimate(
  input: EstimateInput,
  propertyData: PropertyData,
  signals?: AiEstimatorSignalsWithTrace
): GeneratedLeadEstimate {
  const systemRegion = resolveRegion(propertyData);
  const rawSignals: AiEstimatorSignalsWithTrace = signals ?? inferSignalsFallback(input, propertyData);
  const auditEnabled = isEstimatorAuditEnabled();
  const normalizeAudit: NormalizeSignalsAudit | undefined = auditEnabled ? { serviceStages: {} } : undefined;
  const normalizedSignals = normalizeSignals(
    input,
    propertyData,
    systemRegion,
    rawSignals,
    normalizeAudit
  );
  const finalSignals = anchorFinalPressureEstimatorSignals(input, propertyData, systemRegion, normalizedSignals);
  if (normalizeAudit) {
    for (const service of Object.keys(normalizeAudit.serviceStages) as CanonicalService[]) {
      const stage = normalizeAudit.serviceStages[service];
      if (!stage) continue;
      const finalEstimatorSignal = finalSignals.serviceSignals?.[service] ?? null;
      stage.finalEstimatorSignal = deepCloneJson(finalEstimatorSignal);
    }
  }
  const estimatorRequests = buildEstimatorRequests(input, finalSignals);
  const engineEstimate = estimateEngine({
    services: estimatorRequests,
    propertyData,
    description: input.description ?? "",
    photoCount: input.photoUrls.length,
    signals: finalSignals
  });
  const multiplierVisibilityNote = buildMultiplierVisibilityNote(engineEstimate, propertyData);
  engineEstimate.estimatorNotes = Array.from(new Set([multiplierVisibilityNote, ...engineEstimate.estimatorNotes]))
    .slice(0, 12);
  console.log("Estimator multiplier summary:", multiplierVisibilityNote);
  const serviceStages = normalizeAudit?.serviceStages ?? {};
  const aiSignalsChangedByGuardrails = Object.values(serviceStages).some((stage) => Boolean(stage?.changedByGuardrails));
  const aiSignalsChangedByReconciliation = Object.values(serviceStages).some((stage) =>
    Boolean(stage?.changedByReconciliation)
  );
  const priceStages = engineEstimate.serviceEstimates.map((estimate) => {
    const pricingAudit = estimate.estimatorAudit?.finalization ?? null;
    return {
      service: estimate.service,
      preRoundingLowEstimate: pricingAudit?.preRoundingLowEstimate ?? null,
      preRoundingHighEstimate: pricingAudit?.preRoundingHighEstimate ?? null,
      finalLowEstimate: estimate.lowEstimate,
      finalHighEstimate: estimate.highEstimate,
      priceChangedByFinalRounding: pricingAudit?.priceChangedByFinalRounding ?? false
    };
  });
  const estimatorAudit: EstimatorPipelineAudit | null =
    auditEnabled
      ? {
          usedFallback: rawSignals.aiExtractionTrace?.fallbackUsed ?? true,
          signalSource: rawSignals.aiExtractionTrace?.source === "structured_ai" ? "structured_ai" : "heuristic_fallback",
          flags: {
            aiSignalsChangedByNormalization: changedForAudit(rawSignals, normalizedSignals),
            aiSignalsChangedByGuardrails,
            aiSignalsChangedByReconciliation,
            priceChangedByFinalRounding: priceStages.some((stage) => stage.priceChangedByFinalRounding)
          },
          rawAiSignals: deepCloneJson(rawSignals),
          postNormalizationSignals: deepCloneJson(normalizedSignals),
          serviceStages,
          finalEstimatorInputs: {
            requests: deepCloneJson(estimatorRequests),
            serviceSignals: deepCloneJson(finalSignals.serviceSignals ?? {})
          },
          priceStages
        }
      : null;

  return buildGeneratedEstimate(engineEstimate, propertyData, finalSignals, estimatorAudit);
}

export async function generateEstimate(input: EstimateInput): Promise<GeneratedLeadEstimate> {
  const propertyData = await getPropertyData({
    address: input.address,
    placeId: input.addressPlaceId,
    lat: input.lat,
    lng: input.lng,
    parcelLotSizeSqft: input.parcelLotSizeSqft,
    travelDistanceMiles: input.travelDistanceMiles
  });
  const systemRegion = resolveRegion(propertyData);
  const aiMode = getEstimatorAiMode();

  console.log("Resolved region:", systemRegion);

  const prompt = buildSignalPrompt(input, propertyData, systemRegion);
  if (aiMode === "off") {
    const skippedTrace = buildAiExtractionTrace([], {
      structuredAiSucceeded: false,
      fallbackUsed: true,
      attemptsMade: 0
    });

    return fallbackEstimate(
      input,
      propertyData,
      attachAiExtractionTrace(inferSignalsFallback(input, propertyData), skippedTrace, aiMode)
    );
  }

  const aiResult = await callOpenAI(prompt, input);

  if (aiResult.ok) {
    return fallbackEstimate(input, propertyData, {
      ...attachAiExtractionTrace(aiResult.signals, aiResult.trace, aiMode),
      region: systemRegion,
      regionMultiplier: resolveSystemRegionMultiplier(systemRegion)
    });
  }

  if (aiMode === "require") {
    throw new StructuredAiFailure({
      category: aiResult.failure.category,
      retryable: false,
      statusCode: aiResult.failure.statusCode,
      code: "ESTIMATOR_AI_REQUIRED_FAILED",
      message: `Structured AI is required but did not succeed: ${aiResult.failure.message}`
    });
  }

  console.error("generateEstimate fell back to heuristic signals:", {
    category: aiResult.trace.finalFailureCategory,
    retryable: aiResult.trace.finalFailureRetryable,
    attempts: aiResult.trace.attempts
  });

  return fallbackEstimate(
    input,
    propertyData,
    attachAiExtractionTrace(inferSignalsFallback(input, propertyData), aiResult.trace, aiMode)
  );
}

export async function debugEstimateTrace(input: EstimateInput) {
  const propertyData = await getPropertyData({
    address: input.address,
    placeId: input.addressPlaceId,
    lat: input.lat,
    lng: input.lng,
    parcelLotSizeSqft: input.parcelLotSizeSqft,
    travelDistanceMiles: input.travelDistanceMiles
  });
  const systemRegion = resolveRegion(propertyData);
  const aiMode = getEstimatorAiMode();
  const prompt = buildSignalPrompt(input, propertyData, systemRegion);

  if (aiMode === "off") {
    const trace = buildAiExtractionTrace([], {
      structuredAiSucceeded: false,
      fallbackUsed: true,
      attemptsMade: 0
    });
    const rawFallbackSignals = attachAiExtractionTrace(inferSignalsFallback(input, propertyData), trace, aiMode);
    const normalizedSignals = normalizeSignals(input, propertyData, systemRegion, rawFallbackSignals);
    const finalSignals = anchorFinalPressureEstimatorSignals(input, propertyData, systemRegion, normalizedSignals);
    const engineEstimate = estimateEngine({
      services: buildEstimatorRequests(input, finalSignals),
      propertyData,
      description: input.description ?? "",
      photoCount: input.photoUrls.length,
      signals: finalSignals
    });

    return {
      source: "fallback" as const,
      propertyData,
      systemRegion,
      prompt,
      rawAiSignals: null,
      rawFallbackSignals,
      aiExtractionTrace: trace,
      aiExecutionSummary: summarizeAiExecution(rawFallbackSignals, trace, aiMode),
      normalizedSignals: finalSignals,
      engineEstimate,
      generatedEstimate: fallbackEstimate(input, propertyData, rawFallbackSignals),
      error: "Structured AI extraction skipped because SNAPQUOTE_ESTIMATOR_AI_MODE=off."
    };
  }

  const aiResult = await callOpenAI(prompt, input);

  if (aiResult.ok) {
    const rawAiSignals = aiResult.signals;
    const tracedAiSignals = attachAiExtractionTrace(rawAiSignals, aiResult.trace, aiMode);
    const normalizedSignals = normalizeSignals(input, propertyData, systemRegion, {
      ...tracedAiSignals,
      region: systemRegion,
      regionMultiplier: resolveSystemRegionMultiplier(systemRegion)
    });
    const finalSignals = anchorFinalPressureEstimatorSignals(input, propertyData, systemRegion, normalizedSignals);
    const engineEstimate = estimateEngine({
      services: buildEstimatorRequests(input, finalSignals),
      propertyData,
      description: input.description ?? "",
      photoCount: input.photoUrls.length,
      signals: finalSignals
    });

    return {
      source: "ai" as const,
      propertyData,
      systemRegion,
      prompt,
      rawAiSignals,
      aiExtractionTrace: aiResult.trace,
      aiExecutionSummary: summarizeAiExecution(tracedAiSignals, aiResult.trace, aiMode),
      normalizedSignals: finalSignals,
      engineEstimate,
      generatedEstimate: fallbackEstimate(input, propertyData, {
        ...tracedAiSignals,
        region: systemRegion,
        regionMultiplier: resolveSystemRegionMultiplier(systemRegion)
      })
    };
  }

  const rawAiSignals = attachAiExtractionTrace(inferSignalsFallback(input, propertyData), aiResult.trace, aiMode);
  const normalizedSignals = normalizeSignals(input, propertyData, systemRegion, rawAiSignals);
  const finalSignals = anchorFinalPressureEstimatorSignals(input, propertyData, systemRegion, normalizedSignals);
  const engineEstimate = estimateEngine({
    services: buildEstimatorRequests(input, finalSignals),
    propertyData,
    description: input.description ?? "",
    photoCount: input.photoUrls.length,
    signals: finalSignals
  });

  return {
    source: "fallback" as const,
    propertyData,
    systemRegion,
    prompt,
    rawAiSignals: null,
    rawFallbackSignals: rawAiSignals,
    aiExtractionTrace: aiResult.trace,
    aiExecutionSummary: summarizeAiExecution(rawAiSignals, aiResult.trace, aiMode),
    normalizedSignals: finalSignals,
    engineEstimate,
    generatedEstimate: fallbackEstimate(input, propertyData, rawAiSignals),
    error: aiResult.failure.message
  };
}

function confidenceLabel(score: number): LeadConfidence {
  if (score >= 0.78) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function parseServiceQuestionAnswers(value: unknown): ServiceQuestionAnswerBundle[] {
  return parseServiceQuestionBundles(value);
}

function getUnsupportedEstimatorRequest(
  bundles: EstimateInput["serviceQuestionAnswers"]
): { service: "Other"; message: string } | null {
  const otherBundle = [...(bundles ?? [])].find(
    (bundle) => bundle.service === "Other" && isOtherServiceOutdoorBlocked(bundle.service, bundle.answers)
  );

  return otherBundle ? { service: "Other", message: OTHER_OUTDOOR_UNSUPPORTED_MESSAGE } : null;
}

export async function generateEstimateAsync(leadId: string) {
  const admin = createAdminClient();

  try {
    const aiMode = getEstimatorAiMode();

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select(
        "id,org_id,address_full,address_place_id,lat,lng,parcel_lot_size_sqft,services,service_question_answers,description,travel_distance_miles,ai_generated_at"
      )
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      throw leadError || new Error("Lead not found for AI estimate.");
    }

    if (lead.ai_generated_at) {
      return;
    }

    const [{ data: contractor, error: contractorError }, { data: photos, error: photosError }] =
      await Promise.all([
        admin
          .from("contractor_profile")
          .select("business_name,business_address_full,business_lat,business_lng")
          .eq("org_id", lead.org_id)
          .single(),
        admin
          .from("lead_photos")
          .select("public_url")
          .eq("lead_id", leadId)
          .eq("org_id", lead.org_id)
      ]);

    if (contractorError || !contractor) {
      throw contractorError || new Error("Contractor profile not found for AI estimate.");
    }

    if (photosError) {
      throw photosError;
    }

    const parsedServiceQuestionAnswers = parseServiceQuestionAnswers(lead.service_question_answers);
    const unsupportedRequest = getUnsupportedEstimatorRequest(parsedServiceQuestionAnswers);

    if (unsupportedRequest) {
      const failureNotes = buildEstimatorFailureNotes({
        mode: aiMode,
        signalSource: "unsupported_request",
        execution: "unsupported_request",
        liveInvocation: "no",
        cacheMode: safeGetStructuredAiTestCacheMode(),
        cacheStatus: "none",
        message: unsupportedRequest.message
      });

      const { error: unsupportedUpdateError } = await admin
        .from("leads")
        .update({
          ai_status: "failed",
          ai_estimator_notes: failureNotes
        })
        .eq("id", leadId)
        .eq("org_id", lead.org_id);

      if (unsupportedUpdateError) {
        throw unsupportedUpdateError;
      }

      console.warn("Estimator request blocked as unsupported.", {
        leadId,
        service: unsupportedRequest.service,
        reason: unsupportedRequest.message
      });
      return;
    }

    const contractorLat = contractor.business_lat != null ? Number(contractor.business_lat) : null;
    const contractorLng = contractor.business_lng != null ? Number(contractor.business_lng) : null;
    const leadLat = lead.lat != null ? Number(lead.lat) : null;
    const leadLng = lead.lng != null ? Number(lead.lng) : null;

    const travelDistanceMiles =
      lead.travel_distance_miles != null
        ? Number(lead.travel_distance_miles)
        : contractorLat != null &&
            contractorLng != null &&
            leadLat != null &&
            leadLng != null
          ? Number(
              haversineMiles(
                { lat: contractorLat, lng: contractorLng },
                { lat: leadLat, lng: leadLng }
              ).toFixed(1)
            )
          : null;

    if (
      lead.travel_distance_miles == null &&
      (travelDistanceMiles !== null || contractorLat == null || contractorLng == null)
    ) {
      const { error: travelDistanceUpdateError } = await admin
        .from("leads")
        .update({ travel_distance_miles: travelDistanceMiles })
        .eq("id", leadId)
        .eq("org_id", lead.org_id);

      if (travelDistanceUpdateError) {
        console.warn("Failed to persist estimator travel distance.", {
          leadId,
          orgId: lead.org_id,
          travelDistanceMiles,
          error: travelDistanceUpdateError
        });
      }
    }

    const estimate = await generateEstimate({
      businessName: contractor.business_name as string,
      services: ((lead.services as string[]) ?? []).map((service) => service),
      serviceQuestionAnswers: parsedServiceQuestionAnswers,
      address: lead.address_full as string,
      addressPlaceId: (lead.address_place_id as string | null) ?? null,
      lat: leadLat,
      lng: leadLng,
      description: lead.description as string | null,
      photoUrls: (photos ?? []).map((photo) => (photo.public_url as string) || "").filter(Boolean),
      parcelLotSizeSqft: lead.parcel_lot_size_sqft ? Number(lead.parcel_lot_size_sqft) : null,
      businessAddress: (contractor.business_address_full as string | null) ?? null,
      businessLat: contractorLat,
      businessLng: contractorLng,
      travelDistanceMiles
    });

    console.log("Estimator AI path resolved:", {
      leadId,
      aiMode,
      source: estimate.aiExtractionTrace?.source ?? "unknown",
      structuredAiSucceeded: estimate.aiExtractionTrace?.structuredAiSucceeded ?? false,
      fallbackUsed: estimate.aiExtractionTrace?.fallbackUsed ?? true,
      execution: findEstimatorNoteValue(estimate.estimatorNotes, "Estimator AI execution: "),
      liveInvocation: findEstimatorNoteValue(estimate.estimatorNotes, "Estimator AI live invocation: "),
      cacheStatus: findEstimatorNoteValue(estimate.estimatorNotes, "Estimator AI cache status: ")
    });

    const { error: updateError } = await admin
      .from("leads")
      .update({
        job_city: estimate.propertyData.city,
        job_state: estimate.propertyData.state,
        job_zip: estimate.propertyData.zipCode,
        pricing_region: estimate.region ?? estimate.pricingRegion,
        parcel_lot_size_sqft: estimate.propertyData.lotSizeSqft,
        house_sqft: estimate.propertyData.houseSqft,
        estimated_backyard_sqft: estimate.propertyData.estimatedBackyardSqft,
        service_category: estimate.serviceCategory as ServiceCategory,
        job_type: estimate.jobType,
        terrain_classification: estimate.terrain ?? null,
        access_difficulty: estimate.access ?? null,
        material_tier: estimate.material ?? null,
        fence_linear_ft: null,
        ai_confidence: confidenceLabel(estimate.confidenceScore),
        ai_confidence_score: estimate.confidenceScore,
        ai_cost_breakdown: estimate.costBreakdown,
        ai_service_estimates: estimate.serviceEstimates,
        ai_pricing_drivers: estimate.pricingDrivers,
        ai_estimator_notes: estimate.estimatorNotes,
        yard_layout: null,
        demo_items: null,
        ai_job_summary: estimate.summary,
        ai_estimate_low: estimate.lowEstimate,
        ai_estimate_high: estimate.highEstimate,
        ai_suggested_price: estimate.snapQuote,
        ai_draft_message: estimate.message,
        ai_status: "ready",
        ai_generated_at: new Date().toISOString()
        ,
        travel_distance_miles: travelDistanceMiles
      })
      .eq("id", leadId)
      .eq("org_id", lead.org_id);

    if (updateError) {
      throw updateError;
    }
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : "Unknown estimator failure.";
    console.error("AI estimate failed:", {
      leadId,
      error: failureMessage,
      cause: error
    });

    const aiModeNote = (() => {
      try {
        return `Estimator AI mode: ${getEstimatorAiMode()}.`;
      } catch {
        return `Estimator AI mode: invalid (${process.env.SNAPQUOTE_ESTIMATOR_AI_MODE ?? ""}).`;
      }
    })();
    const failureSummary = summarizeEstimatorFailure(failureMessage);
    const failureNotes = buildEstimatorFailureNotes({
      mode: aiModeNote.replace(/^Estimator AI mode:\s*/, "").replace(/\.$/, ""),
      signalSource: failureSummary.signalSource,
      execution: failureSummary.execution,
      liveInvocation: failureSummary.liveInvocation,
      cacheMode: failureSummary.cacheMode,
      cacheStatus: failureSummary.cacheStatus,
      message: failureMessage
    });

    const { error: failureUpdateError } = await admin
      .from("leads")
      .update({
        ai_status: "failed",
        ai_estimator_notes: failureNotes
      })
      .eq("id", leadId);

    if (failureUpdateError) {
      console.error("Failed to persist estimator failure state:", failureUpdateError);
    }
  }
}

export { parseAiOutput };
export { buildAiSignalsResponseFormat };


