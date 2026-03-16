import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { debugEstimateTrace } from "../lib/ai/estimate";
import {
  getAnswerByKeys,
  hardSurfaceAccessMultiplier,
  hardSurfaceMaterialMultiplier,
  type AccessType,
  type HardSurfaceMap,
  type QuantityEvidence,
  type ServiceEstimate,
  type SurfaceMaterialType
} from "../estimators/shared";
import { resolveAccessMultiplierLabel } from "../estimators/serviceEstimatorSupport";
import { parseServiceQuestionBundles, type ServiceQuestionAnswerBundle, type ServiceQuestionAnswers } from "../lib/serviceQuestions";

const DATASET_DIR = path.join(process.cwd(), "test-results", "datasets", "cheyenne");
const BASELINE_CSV_PATH = path.join(DATASET_DIR, "snapquote-test-results--cheyenne-run-1--baseline--seed-a.csv");
const AI_CSV_PATH = path.join(DATASET_DIR, "snapquote-test-results--cheyenne-run-2--ai-replay--seed-a.csv");
const BASELINE_DETAILS_PATH = path.join(DATASET_DIR, "snapquote-test-details--cheyenne-run-1--baseline--seed-a.json");
const AI_DETAILS_PATH = path.join(DATASET_DIR, "snapquote-test-details--cheyenne-run-2--ai-replay--seed-a.json");
const OUTPUT_HTML_PATH = path.join(DATASET_DIR, "cheyenne-diagnostic-dashboard.html");
const OUTPUT_AUDIT_JSON_PATH = path.join(DATASET_DIR, "cheyenne-diagnostic-audit.json");
const STRUCTURED_AI_CACHE_DIR = path.join(process.cwd(), "test-results", "cache", "structured-ai");
const REPLAY_PHOTO_URL = "https://example.com/replay-photo.jpg";

const QUANTITY_SERVICES = new Set(["Roofing", "Exterior Painting", "Landscaping / Installation"]);
const PATH_INSPECTION_SERVICES = new Set(["Concrete", "Pressure Washing", "Deck Installation / Repair"]);

type CsvRow = {
  timestamp: string;
  run_label: string;
  test_label: string;
  seed: string;
  address: string;
  city: string;
  service: string;
  selected_answers: string;
  ai_mode: string;
  ai_signal_source: string;
  ai_status: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
  google_lot_sqft: string;
  google_building_sqft: string;
  travel_distance_miles: string;
  estimate: string;
};

type DetailRow = {
  timestamp: string;
  runLabel: string;
  testLabel: string;
  seed: string;
  address: string;
  city: string;
  service: string;
  selectedAnswers: string;
  aiMode: string;
  aiSignalSource: string;
  aiStatus: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
  googleLotSqft: string;
  googleBuildingSqft: string;
  travelDistanceMiles: string;
  estimate: string;
  leadId: string | null;
  originalAddress: string;
  formattedAddress: string;
  error: string | null;
};

type DetailReport = {
  runLabel: string;
  testLabel: string;
  seed: string;
  seedDisplay: string;
  contractorSlug: string;
  propertiesPath: string | null;
  rows: DetailRow[];
};

type ComparisonRow = {
  key: string;
  address: string;
  service: string;
  baseline: number;
  ai: number;
  delta: number;
  baselineRow: CsvRow;
  aiRow: CsvRow;
  baselineDetail: DetailRow | null;
  aiDetail: DetailRow | null;
};

type LeadRecord = {
  id: string;
  org_id: string;
  address_full: string;
  address_place_id: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  travel_distance_miles: number | null;
  parcel_lot_size_sqft: number | null;
  house_sqft: number | null;
  services: string[] | null;
  service_question_answers: unknown;
  ai_service_estimates: unknown;
  ai_pricing_drivers: unknown;
  ai_estimator_notes: unknown;
};

type ContractorRecord = {
  org_id: string;
  business_name: string;
  business_address_full: string | null;
  business_lat: number | null;
  business_lng: number | null;
};

type TraceEnvelope = Awaited<ReturnType<typeof debugEstimateTrace>>;

type QuantityInspectionRow = {
  address: string;
  service: string;
  googleBuildingSqft: number | null;
  googleLotSqft: number | null;
  baselineEstimate: number;
  aiEstimate: number;
  delta: number;
  baselineQuantity: number | null;
  aiQuantity: number | null;
  aiSignal: {
    estimatedQuantity: number | null;
    quotedSurfaces: HardSurfaceMap | null;
    quantityEvidence: QuantityEvidence | null;
    jobSubtype: string | null;
    materialClass: string | null;
    accessDifficulty: string | null;
    premiumPropertySignal: boolean | null;
  };
  explanation: string;
};

type PathInspectionRow = {
  address: string;
  service: string;
  selectedAnswers: string;
  baselineEstimate: number;
  jobSubtype: string | null;
  estimatedQuantity: number | null;
  baseRateUsed: number | null;
  accessModifier: number;
  conditionModifier: number;
  materialModifier: number;
  jobSubtypePricing: string;
  formula: string;
  drivers: string;
};

type MultiplierRow = {
  service: string;
  address: string;
  jobSubtype: string | null;
  accessModifier: number;
  conditionModifier: number;
  materialModifier: number;
  jobSubtypePricing: string;
};

type ServiceScalingRow = {
  service: string;
  pricesByAddress: Record<string, number>;
  driver: string;
  flag: string | null;
  scopeNotes: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US");
}

function formatSignedMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
  const raw = await readFile(filePath, "utf8");
  const [header, ...body] = csvParse(raw);
  return body.map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])) as CsvRow);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function selectedAnswersObject(row: CsvRow | DetailRow): Record<string, string | string[]> {
  try {
    return JSON.parse("selected_answers" in row ? row.selected_answers : row.selectedAnswers) as Record<string, string | string[]>;
  } catch {
    return {};
  }
}

function comparisonKey(address: string, service: string) {
  return `${address}__${service}`;
}

function detailMap(report: DetailReport) {
  return new Map(report.rows.map((row) => [comparisonKey(row.address, row.service), row]));
}

function buildComparisons(
  baselineRows: CsvRow[],
  aiRows: CsvRow[],
  baselineDetails: DetailReport,
  aiDetails: DetailReport
): ComparisonRow[] {
  const baselineMap = new Map(baselineRows.map((row) => [comparisonKey(row.address, row.service), row]));
  const aiMap = new Map(aiRows.map((row) => [comparisonKey(row.address, row.service), row]));
  const baselineDetailMap = detailMap(baselineDetails);
  const aiDetailMap = detailMap(aiDetails);
  const keys = Array.from(new Set([...baselineMap.keys(), ...aiMap.keys()]));

  return keys
    .map((key) => {
      const baselineRow = baselineMap.get(key);
      const aiRow = aiMap.get(key);
      if (!baselineRow || !aiRow) return null;

      const baseline = parseNumber(baselineRow.estimate);
      const ai = parseNumber(aiRow.estimate);
      if (baseline == null || ai == null) return null;

      return {
        key,
        address: baselineRow.address,
        service: baselineRow.service,
        baseline,
        ai,
        delta: ai - baseline,
        baselineRow,
        aiRow,
        baselineDetail: baselineDetailMap.get(key) ?? null,
        aiDetail: aiDetailMap.get(key) ?? null
      } satisfies ComparisonRow;
    })
    .filter((row): row is ComparisonRow => row != null);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchLeadsByIds(ids: string[]): Promise<Map<string, LeadRecord>> {
  const admin = getSupabaseAdmin();
  const result = new Map<string, LeadRecord>();

  for (const group of chunk(ids, 50)) {
    const { data, error } = await admin
      .from("leads")
      .select(
        "id,org_id,address_full,address_place_id,lat,lng,description,travel_distance_miles,parcel_lot_size_sqft,house_sqft,services,service_question_answers,ai_service_estimates,ai_pricing_drivers,ai_estimator_notes"
      )
      .in("id", group);

    if (error) {
      throw new Error(`Failed to fetch leads for analysis: ${error.message}`);
    }

    for (const row of (data ?? []) as LeadRecord[]) {
      result.set(row.id, row);
    }
  }

  return result;
}

async function fetchContractorsByOrgIds(orgIds: string[]): Promise<Map<string, ContractorRecord>> {
  const admin = getSupabaseAdmin();
  const result = new Map<string, ContractorRecord>();

  for (const group of chunk(orgIds, 50)) {
    const { data, error } = await admin
      .from("contractor_profile")
      .select("org_id,business_name,business_address_full,business_lat,business_lng")
      .in("org_id", group);

    if (error) {
      throw new Error(`Failed to fetch contractor profiles for analysis: ${error.message}`);
    }

    for (const row of (data ?? []) as ContractorRecord[]) {
      result.set(row.org_id, row);
    }
  }

  return result;
}

function parseServiceEstimates(value: unknown): ServiceEstimate[] {
  return Array.isArray(value) ? (value as ServiceEstimate[]) : [];
}

function getServiceEstimateForLead(lead: LeadRecord, service: string): ServiceEstimate | null {
  return parseServiceEstimates(lead.ai_service_estimates).find((estimate) => estimate.service === service) ?? null;
}

function getAnswerBundles(lead: LeadRecord): ServiceQuestionAnswerBundle[] {
  return parseServiceQuestionBundles(lead.service_question_answers);
}

function getAnswersForService(lead: LeadRecord, service: string): ServiceQuestionAnswers {
  return getAnswerBundles(lead).find((bundle) => bundle.service === service)?.answers ?? {};
}

function extractScopeQuantity(serviceEstimate: ServiceEstimate | null): number | null {
  if (!serviceEstimate?.scopeSummary) return null;
  const match = serviceEstimate.scopeSummary.match(/([\d,.]+)/);
  return match ? parseNumber(match[1].replaceAll(",", "")) : null;
}

function extractEstimatedQuantity(trace: TraceEnvelope, service: string, lead: LeadRecord): number | null {
  const signal = trace.normalizedSignals.serviceSignals?.[service as keyof typeof trace.normalizedSignals.serviceSignals];
  if (signal?.estimatedQuantity != null && signal.estimatedQuantity > 0) {
    return signal.estimatedQuantity;
  }

  const serviceEstimate = getServiceEstimateForLead(lead, service);
  if (serviceEstimate?.scope_reconciliation?.reconciledQuantity != null) {
    return serviceEstimate.scope_reconciliation.reconciledQuantity;
  }

  return extractScopeQuantity(serviceEstimate);
}

function pairwiseConcordance(x: number[], y: number[]): number {
  let score = 0;
  for (let i = 0; i < x.length; i += 1) {
    for (let j = i + 1; j < x.length; j += 1) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      if (dx === 0 || dy === 0) continue;
      score += Math.sign(dx) === Math.sign(dy) ? 1 : -1;
    }
  }
  return score;
}

function normalizeScopeRank(value: string): number {
  const normalized = value.toLowerCase();
  if (/full property|entire roof|whole property|full exterior|very large|200\+|4,000\+|700\+|1,500\+|50\+|large portion|full yard/.test(normalized)) return 4;
  if (/large|most of exterior|75-200|600-1,500|350-700|200-600|500-1,500|one area or slope/.test(normalized)) return 3;
  if (/medium|one side|11-25|25-75|150-350|200-500|one side or small area|partial exterior/.test(normalized)) return 2;
  if (/small|few items|up to|touch-up|minor|small section/.test(normalized)) return 1;
  if (/not sure/.test(normalized)) return 2;
  return 0;
}

function findScopeDescriptor(row: CsvRow): string {
  const answers = selectedAnswersObject(row);
  const preferredKeys = Object.keys(answers).filter((key) =>
    /(scope|size|area|count|amount|length|target|work_type|project_type)/i.test(key)
  );
  const firstKey = preferredKeys[0];
  if (!firstKey) return "";
  const value = answers[firstKey];
  return Array.isArray(value) ? value.join(" | ") : String(value ?? "");
}

function deriveScalingRows(baselineRows: CsvRow[]): ServiceScalingRow[] {
  const addresses = Array.from(new Set(baselineRows.map((row) => row.address)));
  const byService = new Map<string, CsvRow[]>();

  for (const row of baselineRows) {
    const bucket = byService.get(row.service) ?? [];
    bucket.push(row);
    byService.set(row.service, bucket);
  }

  return Array.from(byService.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, rows]) => {
      const prices = rows.map((row) => parseNumber(row.estimate) ?? 0);
      const building = rows.map((row) => parseNumber(row.google_building_sqft) ?? 0);
      const lot = rows.map((row) => parseNumber(row.google_lot_sqft) ?? 0);
      const scopeRanks = rows.map((row) => normalizeScopeRank(findScopeDescriptor(row)));
      const buildingScore = pairwiseConcordance(prices, building);
      const lotScore = pairwiseConcordance(prices, lot);
      const scopeScore = pairwiseConcordance(prices, scopeRanks);
      const ranking = [
        { driver: "building size", score: buildingScore },
        { driver: "lot size", score: lotScore },
        { driver: "questionnaire scope", score: scopeScore }
      ].sort((a, b) => b.score - a.score);
      const best = ranking[0];
      const flag =
        best.score <= 0 && prices.some((value, index, all) => value !== all[0])
          ? "Price order does not line up cleanly with size or questionnaire scope."
          : null;

      return {
        service,
        pricesByAddress: Object.fromEntries(
          addresses.map((address) => [address, parseNumber(rows.find((row) => row.address === address)?.estimate) ?? 0])
        ),
        driver: best.score > 0 ? best.driver : "mixed / unclear",
        flag,
        scopeNotes: rows.map((row) => `${row.address}: ${findScopeDescriptor(row) || "n/a"}`).join(" | ")
      };
    });
}

async function buildTrace(
  row: ComparisonRow,
  mode: "baseline" | "ai",
  leads: Map<string, LeadRecord>,
  contractors: Map<string, ContractorRecord>
) {
  const detail = mode === "baseline" ? row.baselineDetail : row.aiDetail;
  if (!detail?.leadId) {
    throw new Error(`Missing lead ID for ${row.address} / ${row.service} (${mode}).`);
  }

  const lead = leads.get(detail.leadId);
  if (!lead) {
    throw new Error(`Lead ${detail.leadId} was not found for ${row.address} / ${row.service}.`);
  }

  const contractor = contractors.get(lead.org_id);
  if (!contractor) {
    throw new Error(`Contractor org ${lead.org_id} was not found for ${row.address} / ${row.service}.`);
  }

  const previousAiMode = process.env.SNAPQUOTE_ESTIMATOR_AI_MODE;
  const previousCacheMode = process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE;
  const previousCacheDir = process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR;

  process.env.SNAPQUOTE_ESTIMATOR_AI_MODE = mode === "baseline" ? "off" : "require";
  process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE = mode === "baseline" ? "off" : "replay";
  process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR = STRUCTURED_AI_CACHE_DIR;

  try {
    const trace = await debugEstimateTrace({
      businessName: contractor.business_name,
      services: [row.service],
      serviceQuestionAnswers: getAnswerBundles(lead),
      address: lead.address_full,
      addressPlaceId: lead.address_place_id,
      lat: lead.lat,
      lng: lead.lng,
      description: lead.description,
      photoUrls: [REPLAY_PHOTO_URL],
      parcelLotSizeSqft: null,
      businessAddress: contractor.business_address_full,
      businessLat: contractor.business_lat,
      businessLng: contractor.business_lng,
      travelDistanceMiles: lead.travel_distance_miles
    });

    return { trace, lead };
  } finally {
    if (previousAiMode == null) delete process.env.SNAPQUOTE_ESTIMATOR_AI_MODE;
    else process.env.SNAPQUOTE_ESTIMATOR_AI_MODE = previousAiMode;

    if (previousCacheMode == null) delete process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE;
    else process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE = previousCacheMode;

    if (previousCacheDir == null) delete process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR;
    else process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR = previousCacheDir;
  }
}

function roofMaterialMultiplier(roofType: string): number {
  const normalized = roofType.toLowerCase();
  if (normalized.includes("tile")) return 1.26;
  if (normalized.includes("metal")) return 1.2;
  if (normalized.includes("flat")) return 1.14;
  return 1;
}

function paintingSurfaceMultiplier(surfaceType: string): number {
  const normalized = surfaceType.toLowerCase();
  if (normalized.includes("brick")) return 1.18;
  if (normalized.includes("stucco")) return 1.06;
  if (normalized.includes("siding")) return 1.02;
  if (normalized.includes("wood")) return 1;
  return 1.05;
}

function deckMaterialMultiplier(material: string): number {
  const normalized = material.toLowerCase();
  if (normalized.includes("composite")) return 1.24;
  if (normalized.includes("pvc") || normalized.includes("premium")) return 1.34;
  if (normalized.includes("wood")) return 1;
  return 1.1;
}

function analyzePressure(trace: TraceEnvelope, lead: LeadRecord, row: ComparisonRow): PathInspectionRow {
  const answers = getAnswersForService(lead, row.service);
  const signal = trace.normalizedSignals.serviceSignals?.["Pressure Washing"];
  const targetAnswer = getAnswerByKeys(answers, ["pressure_washing_target", "pressure_area"]);
  const conditionAnswer = getAnswerByKeys(answers, ["pressure_washing_condition", "pressure_condition"]);
  const accessAnswer = getAnswerByKeys(answers, ["pressure_washing_access"]);
  const serviceEstimate = getServiceEstimateForLead(lead, row.service);
  const estimatedQuantity = extractEstimatedQuantity(trace, row.service, lead);
  const baseScope = serviceEstimate?.lineItems?.base_scope ?? null;
  const accessLabel = resolveAccessMultiplierLabel(`${accessAnswer} ${signal?.accessDifficulty ?? ""}`);
  const accessModifier =
    accessLabel === "difficult"
      ? 1.18
      : accessLabel === "moderate"
        ? 1.08
        : trace.normalizedSignals.accessTypeMultiplier ?? hardSurfaceAccessMultiplier(trace.normalizedSignals.accessType as AccessType);
  const baseCondition =
    /oil|rust|deep stains/i.test(conditionAnswer) ? 1.26 :
    /heavy staining|moss/i.test(conditionAnswer) ? 1.18 :
    /moderate/i.test(conditionAnswer) ? 1.08 :
    1;
  const mixedJob = signal?.customJobSignal || signal?.fallbackFamily === "mixed_custom" || /other/i.test(targetAnswer) ? 1.08 : 1;
  const delicateSurface = signal?.surfaceFamily === "delicate_specialty_surface" ? 1.12 : 1;
  const conditionModifier = baseCondition * mixedJob * delicateSurface;
  const materialModifier =
    signal?.surfaceFamily === "roof_like_surface"
      ? 1.08
      : trace.normalizedSignals.materialMultiplier ?? hardSurfaceMaterialMultiplier(trace.normalizedSignals.materialType as SurfaceMaterialType);
  const baseRateUsed = baseScope != null && estimatedQuantity != null && estimatedQuantity > 0
    ? Number((baseScope / estimatedQuantity).toFixed(4))
    : null;
  const formula = estimatedQuantity != null && baseRateUsed != null
    ? `~ ${formatNumber(estimatedQuantity)} sqft x $${baseRateUsed.toFixed(2)} x ${conditionModifier.toFixed(2)} x ${accessModifier.toFixed(2)} x ${materialModifier.toFixed(2)}`
    : "Derived from blended tiered surface rates and modifiers";

  return {
    address: row.address,
    service: row.service,
    selectedAnswers: row.baselineRow.selected_answers,
    baselineEstimate: row.baseline,
    jobSubtype: signal?.jobSubtype ?? serviceEstimate?.jobType ?? null,
    estimatedQuantity,
    baseRateUsed,
    accessModifier,
    conditionModifier,
    materialModifier,
    jobSubtypePricing: `Subtype "${signal?.jobSubtype ?? serviceEstimate?.jobType ?? "custom"}" selects a dedicated tier schedule rather than a separate multiplier.`,
    formula,
    drivers: "Surface family, staining severity, answer-based access difficulty, and the selected subtype rate schedule drove the baseline price."
  };
}

function analyzeConcrete(trace: TraceEnvelope, lead: LeadRecord, row: ComparisonRow): PathInspectionRow {
  const answers = getAnswersForService(lead, row.service);
  const signal = trace.normalizedSignals.serviceSignals?.Concrete;
  const workType = getAnswerByKeys(answers, ["concrete_work_type", "concrete_timing"]);
  const materialAnswer = getAnswerByKeys(answers, ["concrete_material"]);
  const siteAnswer = getAnswerByKeys(answers, ["concrete_site_condition", "concrete_timing"]);
  const serviceEstimate = getServiceEstimateForLead(lead, row.service);
  const estimatedQuantity = extractEstimatedQuantity(trace, row.service, lead);
  const baseScope = serviceEstimate?.lineItems?.base_scope ?? null;
  const materialMultiplier =
    /stamped|decorative/i.test(materialAnswer) ? 1.24 :
    /brick|stone/i.test(materialAnswer) ? 1.35 :
    /exposed aggregate|specialty/i.test(materialAnswer) ? 1.2 :
    1;
  const removalMultiplier = /replacement|removal|old concrete/i.test(`${workType} ${siteAnswer}`) ? 1.16 : 1;
  const prepMultiplier = /grading|prep|dirt/i.test(siteAnswer) ? 1.12 : 1;
  const extensionMultiplier = (signal?.jobSubtype ?? serviceEstimate?.jobType) === "extension_addition" ? 1.08 : 1;
  const materialModifier = materialMultiplier * removalMultiplier * prepMultiplier * extensionMultiplier;
  const accessLabel = resolveAccessMultiplierLabel(siteAnswer);
  const accessModifier = accessLabel === "difficult" ? 1.14 : accessLabel === "moderate" ? 1.06 : 1;
  const conditionModifier = /repair|resurfac/i.test(workType) ? 0.86 : 1;
  const baseRateUsed = baseScope != null && estimatedQuantity != null && estimatedQuantity > 0
    ? Number((baseScope / estimatedQuantity).toFixed(4))
    : null;
  const formula = estimatedQuantity != null && baseRateUsed != null
    ? `~ ${formatNumber(estimatedQuantity)} sqft x $${baseRateUsed.toFixed(2)} x ${conditionModifier.toFixed(2)} x ${accessModifier.toFixed(2)} x ${materialModifier.toFixed(2)}`
    : "Derived from subtype-specific tiered concrete rates and modifiers";

  return {
    address: row.address,
    service: row.service,
    selectedAnswers: row.baselineRow.selected_answers,
    baselineEstimate: row.baseline,
    jobSubtype: signal?.jobSubtype ?? serviceEstimate?.jobType ?? null,
    estimatedQuantity,
    baseRateUsed,
    accessModifier,
    conditionModifier,
    materialModifier,
    jobSubtypePricing: `Subtype "${signal?.jobSubtype ?? serviceEstimate?.jobType ?? "custom"}" swaps in a distinct concrete rate profile and minimum job floor.`,
    formula,
    drivers: "Concrete project subtype, finish choice, removal/prep requirements, and site access were the main baseline price drivers."
  };
}

function analyzeDeck(trace: TraceEnvelope, lead: LeadRecord, row: ComparisonRow): PathInspectionRow {
  const answers = getAnswersForService(lead, row.service);
  const signal = trace.normalizedSignals.serviceSignals?.["Deck Installation / Repair"];
  const material = getAnswerByKeys(answers, ["deck_material"]);
  const workType = getAnswerByKeys(answers, ["deck_work_type"]);
  const areaType = getAnswerByKeys(answers, ["deck_area_type"]);
  const repairCondition = getAnswerByKeys(answers, ["deck_repair_condition"]);
  const serviceEstimate = getServiceEstimateForLead(lead, row.service);
  const estimatedQuantity = extractEstimatedQuantity(trace, row.service, lead);
  const baseScope = serviceEstimate?.lineItems?.base_scope ?? null;
  const structureMultiplier =
    /rooftop|specialty/i.test(areaType) ? 1.3 :
    /multi-level/i.test(areaType) ? 1.22 :
    /raised deck/i.test(areaType) ? 1.12 :
    1;
  const removalMultiplier = (signal?.jobSubtype ?? serviceEstimate?.jobType) === "replace_existing" ? 1.14 : 1;
  const stairsMultiplier = (signal?.jobSubtype ?? serviceEstimate?.jobType) === "stairs_railing_work" ? 1.24 : 1;
  const materialModifier = deckMaterialMultiplier(material) * structureMultiplier * removalMultiplier * stairsMultiplier;
  const conditionModifier =
    (signal?.jobSubtype ?? serviceEstimate?.jobType) === "repair_existing"
      ? /not applicable|not a repair/i.test(repairCondition)
        ? 1
        : /major deterioration/i.test(repairCondition)
          ? 0.92
          : /structural/i.test(repairCondition)
            ? 0.88
            : /damaged boards/i.test(repairCondition)
              ? 0.82
              : 0.74
      : 1;
  const accessModifier = 1;
  const baseRateUsed = baseScope != null && estimatedQuantity != null && estimatedQuantity > 0
    ? Number((baseScope / estimatedQuantity).toFixed(4))
    : null;
  const formula = estimatedQuantity != null && baseRateUsed != null
    ? `~ ${formatNumber(estimatedQuantity)} sqft x $${baseRateUsed.toFixed(2)} x ${conditionModifier.toFixed(2)} x ${materialModifier.toFixed(2)}`
    : "Derived from deck tier rates with structure and material modifiers";

  return {
    address: row.address,
    service: row.service,
    selectedAnswers: row.baselineRow.selected_answers,
    baselineEstimate: row.baseline,
    jobSubtype: signal?.jobSubtype ?? serviceEstimate?.jobType ?? null,
    estimatedQuantity,
    baseRateUsed,
    accessModifier,
    conditionModifier,
    materialModifier,
    jobSubtypePricing: `Subtype "${signal?.jobSubtype ?? serviceEstimate?.jobType ?? "custom"}" controls the minimum job floor and whether demolition/stairs premiums apply.`,
    formula,
    drivers: `Deck path selection (${workType || "scope"}), material class, structural complexity (${areaType || "n/a"}), and repair condition drove the baseline price.`
  };
}

function buildQuantityExplanation(
  service: string,
  aiQuantity: number | null,
  baselineQuantity: number | null,
  signal: QuantityInspectionRow["aiSignal"],
  lotSqft: number | null,
  buildingSqft: number | null
) {
  const source =
    signal.quantityEvidence === "direct"
      ? "questionnaire-provided scope"
      : signal.quotedSurfaces && Object.values(signal.quotedSurfaces).some((value) => (value ?? 0) > 0)
        ? "surface-scope inference plus questionnaire anchoring"
        : service === "Landscaping / Installation"
          ? "lot/backyard sizing blended with questionnaire scope"
          : "building-size/property context blended with questionnaire scope";
  const inflation =
    aiQuantity != null && baselineQuantity != null && baselineQuantity > 0
      ? aiQuantity > baselineQuantity * 1.2
        ? "AI expanded quantity materially versus baseline."
        : aiQuantity < baselineQuantity * 0.8
          ? "AI narrowed quantity materially versus baseline."
          : "AI stayed close to baseline quantity."
      : "Quantity comparison to baseline was limited.";
  const reasonableness =
    service === "Landscaping / Installation" && lotSqft != null && aiQuantity != null && aiQuantity > lotSqft * 0.95
      ? "This looks aggressive relative to total lot size."
      : service !== "Landscaping / Installation" && buildingSqft != null && aiQuantity != null && aiQuantity > buildingSqft * 2.4
        ? "This looks somewhat inflated relative to the building footprint."
        : "The inferred quantity looks generally plausible for the property context.";

  return `${source}. ${inflation} ${reasonableness}`;
}

function renderTable(tableId: string, headers: string[], rows: string[][]) {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table id="${escapeHtml(tableId)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function main() {
  const [baselineRows, aiRows, baselineDetails, aiDetails] = await Promise.all([
    readCsvRows(BASELINE_CSV_PATH),
    readCsvRows(AI_CSV_PATH),
    readJsonFile<DetailReport>(BASELINE_DETAILS_PATH),
    readJsonFile<DetailReport>(AI_DETAILS_PATH)
  ]);

  const comparisons = buildComparisons(baselineRows, aiRows, baselineDetails, aiDetails);
  const changed = comparisons.filter((row) => row.delta !== 0);
  const unchanged = comparisons.length - changed.length;
  const increases = comparisons.filter((row) => row.delta > 0);
  const decreases = comparisons.filter((row) => row.delta < 0);
  const topIncreases = [...increases].sort((a, b) => b.delta - a.delta).slice(0, 10);
  const topDecreases = [...decreases].sort((a, b) => a.delta - b.delta).slice(0, 10);

  const leadIds = Array.from(
    new Set(
      comparisons.flatMap((row) => [row.baselineDetail?.leadId, row.aiDetail?.leadId].filter((value): value is string => Boolean(value)))
    )
  );
  const leads = await fetchLeadsByIds(leadIds);
  const contractors = await fetchContractorsByOrgIds(Array.from(new Set(Array.from(leads.values()).map((lead) => lead.org_id))));

  const quantityRows = comparisons.filter((row) => QUANTITY_SERVICES.has(row.service));
  const pathRows = comparisons.filter((row) => PATH_INSPECTION_SERVICES.has(row.service));

  const traceCache = new Map<string, { trace: TraceEnvelope; lead: LeadRecord }>();
  async function cachedTrace(row: ComparisonRow, mode: "baseline" | "ai") {
    const key = `${mode}__${row.key}`;
    const existing = traceCache.get(key);
    if (existing) return existing;
    const next = await buildTrace(row, mode, leads, contractors);
    traceCache.set(key, next);
    return next;
  }

  const quantityInspection: QuantityInspectionRow[] = [];
  for (const row of quantityRows) {
    const baselineTrace = await cachedTrace(row, "baseline");
    const aiTrace = await cachedTrace(row, "ai");
    const aiSignal = aiTrace.trace.normalizedSignals.serviceSignals?.[row.service as keyof typeof aiTrace.trace.normalizedSignals.serviceSignals];
    const baselineQuantity = extractEstimatedQuantity(baselineTrace.trace, row.service, baselineTrace.lead);
    const aiQuantity = extractEstimatedQuantity(aiTrace.trace, row.service, aiTrace.lead);

    quantityInspection.push({
      address: row.address,
      service: row.service,
      googleBuildingSqft: parseNumber(row.baselineRow.google_building_sqft),
      googleLotSqft: parseNumber(row.baselineRow.google_lot_sqft),
      baselineEstimate: row.baseline,
      aiEstimate: row.ai,
      delta: row.delta,
      baselineQuantity,
      aiQuantity,
      aiSignal: {
        estimatedQuantity: aiSignal?.estimatedQuantity ?? null,
        quotedSurfaces: aiSignal?.quotedSurfaces ?? null,
        quantityEvidence: aiSignal?.quantityEvidence ?? null,
        jobSubtype: aiSignal?.jobSubtype ?? null,
        materialClass: aiSignal?.materialClass ?? null,
        accessDifficulty: aiSignal?.accessDifficulty ?? null,
        premiumPropertySignal: aiSignal?.premiumPropertySignal ?? null
      },
      explanation: buildQuantityExplanation(
        row.service,
        aiQuantity,
        baselineQuantity,
        {
          estimatedQuantity: aiSignal?.estimatedQuantity ?? null,
          quotedSurfaces: aiSignal?.quotedSurfaces ?? null,
          quantityEvidence: aiSignal?.quantityEvidence ?? null,
          jobSubtype: aiSignal?.jobSubtype ?? null,
          materialClass: aiSignal?.materialClass ?? null,
          accessDifficulty: aiSignal?.accessDifficulty ?? null,
          premiumPropertySignal: aiSignal?.premiumPropertySignal ?? null
        },
        parseNumber(row.baselineRow.google_lot_sqft),
        parseNumber(row.baselineRow.google_building_sqft)
      )
    });
  }

  const pathInspection: PathInspectionRow[] = [];
  const multiplierRows: MultiplierRow[] = [];
  for (const row of pathRows) {
    const baselineTrace = await cachedTrace(row, "baseline");
    const analysis =
      row.service === "Pressure Washing"
        ? analyzePressure(baselineTrace.trace, baselineTrace.lead, row)
        : row.service === "Concrete"
          ? analyzeConcrete(baselineTrace.trace, baselineTrace.lead, row)
          : analyzeDeck(baselineTrace.trace, baselineTrace.lead, row);

    pathInspection.push(analysis);
    multiplierRows.push({
      service: analysis.service,
      address: analysis.address,
      jobSubtype: analysis.jobSubtype,
      accessModifier: analysis.accessModifier,
      conditionModifier: analysis.conditionModifier,
      materialModifier: analysis.materialModifier,
      jobSubtypePricing: analysis.jobSubtypePricing
    });
  }

  const propertyRows = Array.from(
    new Map(
      baselineRows.map((row) => [
        row.address,
        {
          address: row.address,
          googleBuildingSqft: parseNumber(row.google_building_sqft),
          googleLotSqft: parseNumber(row.google_lot_sqft)
        }
      ])
    ).values()
  ).sort((a, b) => (a.googleBuildingSqft ?? 0) - (b.googleBuildingSqft ?? 0));

  const scalingRows = deriveScalingRows(baselineRows);
  const flaggedScaling = scalingRows.filter((row) => row.flag);
  const quantityInflations = quantityInspection.filter((row) => row.aiQuantity != null && row.baselineQuantity != null && row.aiQuantity > row.baselineQuantity * 1.2);
  const quantityReductions = quantityInspection.filter((row) => row.aiQuantity != null && row.baselineQuantity != null && row.aiQuantity < row.baselineQuantity * 0.8);
  const nonUnitMultipliers = multiplierRows.filter((row) =>
    Math.abs(row.accessModifier - 1) > 0.001 ||
    Math.abs(row.conditionModifier - 1) > 0.001 ||
    Math.abs(row.materialModifier - 1) > 0.001
  );

  const summaryLines = [
    `1. Contractor reasonableness: ${flaggedScaling.length <= 3 ? "Mostly reasonable across the sampled residential jobs, with the main concerns limited to flagged scaling oddities rather than across-the-board price inflation." : "Mixed. Several services show prices that deserve a second look before treating the dataset as fully trustworthy."}`,
    `2. Scaling consistency: ${flaggedScaling.length === 0 ? "No clear scaling inversions were flagged by the baseline sanity check." : `${flaggedScaling.length} services were flagged for mixed or inverted scaling, led by ${flaggedScaling.slice(0, 4).map((row) => row.service).join(", ")}.`}`,
    `3. AI scope movement: ${quantityInflations.length === 0 && quantityReductions.length === 0 ? "AI stayed close to baseline on the inspected quantity-sensitive services." : `AI changed inferred scope on the inspected quantity-sensitive services, with ${quantityInflations.length} material expansions and ${quantityReductions.length} material reductions.`}`,
    `4. Multiplier realism: ${nonUnitMultipliers.length === 0 ? "The inspected multiplier paths stayed near neutral." : "Most inspected multipliers still look plausible, but compounding access/material/condition factors should be watched on the rows with the largest deltas."}`,
    `5. Fix-before-next-run call: ${flaggedScaling.length === 0 && quantityInflations.length <= 1 ? "No blocking estimator defect is obvious from this pass; the next dataset can likely proceed after reviewing the flagged rows." : "Review the flagged scaling rows and any AI-expanded quantity rows before promoting this configuration to the next dataset."}`
  ];

  const auditRows: Array<{
    address: string;
    service: string;
    mode: "baseline" | "ai";
    leadId: string | null;
    aiMode: string;
    source: string;
    structuredAiSucceeded: boolean;
    fallbackUsed: boolean;
    estimatorAudit: unknown;
  }> = [];
  for (const row of comparisons) {
    const baselineTrace = await cachedTrace(row, "baseline");
    const aiTrace = await cachedTrace(row, "ai");

    auditRows.push({
      address: row.address,
      service: row.service,
      mode: "baseline",
      leadId: row.baselineDetail?.leadId ?? null,
      aiMode: "off",
      source: baselineTrace.trace.aiExtractionTrace?.source ?? "unknown",
      structuredAiSucceeded: baselineTrace.trace.aiExtractionTrace?.structuredAiSucceeded ?? false,
      fallbackUsed: baselineTrace.trace.aiExtractionTrace?.fallbackUsed ?? true,
      estimatorAudit: baselineTrace.trace.generatedEstimate?.estimatorAudit ?? null
    });
    auditRows.push({
      address: row.address,
      service: row.service,
      mode: "ai",
      leadId: row.aiDetail?.leadId ?? null,
      aiMode: "require",
      source: aiTrace.trace.aiExtractionTrace?.source ?? "unknown",
      structuredAiSucceeded: aiTrace.trace.aiExtractionTrace?.structuredAiSucceeded ?? false,
      fallbackUsed: aiTrace.trace.aiExtractionTrace?.fallbackUsed ?? true,
      estimatorAudit: aiTrace.trace.generatedEstimate?.estimatorAudit ?? null
    });
  }

  const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>SnapQuote Cheyenne Diagnostic Dashboard</title><style>:root{--bg:#f4f0e8;--panel:#fffdf8;--ink:#20303a;--muted:#6a7781;--line:#d7cec1;--accent:#9b4d2c;--good:#1f7a49;--bad:#b42318;}*{box-sizing:border-box;}body{margin:0;color:var(--ink);background:radial-gradient(circle at top left, rgba(155,77,44,.16), transparent 28%),linear-gradient(180deg,#f9f3e8 0%,#f2efe8 58%,#ece6dc 100%);font-family:\"Segoe UI\",\"Trebuchet MS\",sans-serif;}main{max-width:1480px;margin:0 auto;padding:28px 18px 56px;}h1{margin:0 0 10px;font-size:2.4rem;letter-spacing:.02em;}h2{margin:0 0 12px;font-size:1.35rem;}h3{margin:18px 0 10px;font-size:1rem;}p,li{line-height:1.5}.meta{color:var(--muted);margin-bottom:18px}.hero{background:linear-gradient(135deg,rgba(255,255,255,.88),rgba(246,229,218,.96));border:1px solid rgba(155,77,44,.2);border-radius:22px;padding:24px 24px 18px;box-shadow:0 18px 40px rgba(46,39,31,.08);margin-bottom:18px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px}.stat{background:rgba(255,255,255,.8);border:1px solid rgba(32,48,58,.08);border-radius:16px;padding:14px}.stat strong{display:block;font-size:1.5rem;margin-top:6px}section{background:rgba(255,253,248,.96);border:1px solid var(--line);border-radius:18px;padding:18px;margin-top:16px;box-shadow:0 10px 26px rgba(46,39,31,.05)}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;background:white}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px 12px;border-bottom:1px solid #ece5da;text-align:left;vertical-align:top;white-space:nowrap}th{background:#f3ebe2;position:sticky;top:0}tr:hover td{background:#fff8f3}.delta-pos{color:var(--bad);font-weight:700}.delta-neg{color:var(--good);font-weight:700}.delta-zero{color:var(--muted)}.flag{color:var(--bad);font-weight:600}.note{color:var(--muted)}.summary-list{margin:0;padding-left:22px}.two-up{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}code{font-family:Consolas,\"Courier New\",monospace;font-size:12px;white-space:pre-wrap}@media (max-width:720px){main{padding:18px 12px 40px}h1{font-size:1.9rem}}</style></head><body><main>" +
    `<section class="hero"><div class="meta">Cheyenne, Wyoming residential estimator dataset | Generated automatically from baseline + structured-AI replay runs</div><h1>SnapQuote Cheyenne Diagnostic Dashboard</h1><p>This dashboard compares the trusted baseline and AI replay outputs for the three Cheyenne properties, then drills into quantity inference, service-path behavior, multiplier use, and cross-property sanity checks.</p><div class="stats"><div class="stat"><span>Rows compared</span><strong>${comparisons.length}</strong></div><div class="stat"><span>Rows changed</span><strong>${changed.length}</strong></div><div class="stat"><span>Rows unchanged</span><strong>${unchanged}</strong></div><div class="stat"><span>AI increases</span><strong>${increases.length}</strong></div><div class="stat"><span>AI decreases</span><strong>${decreases.length}</strong></div></div></section>` +
    `<section><h2>Baseline vs AI Comparison</h2>${renderTable("comparison",["Address","Service","Baseline Estimate","AI Estimate","Delta"],comparisons.map((row)=>[escapeHtml(row.address),escapeHtml(row.service),escapeHtml(formatMoney(row.baseline)),escapeHtml(formatMoney(row.ai)),`<span class="${row.delta > 0 ? "delta-pos" : row.delta < 0 ? "delta-neg" : "delta-zero"}">${escapeHtml(formatSignedMoney(row.delta))}</span>`]))}<div class="two-up"><div><h3>Top 10 Price Increases</h3>${renderTable("increases",["Address","Service","Baseline","AI","Delta"],topIncreases.map((row)=>[escapeHtml(row.address),escapeHtml(row.service),escapeHtml(formatMoney(row.baseline)),escapeHtml(formatMoney(row.ai)),`<span class="delta-pos">${escapeHtml(formatSignedMoney(row.delta))}</span>`]))}</div><div><h3>Top 10 Price Decreases</h3>${renderTable("decreases",["Address","Service","Baseline","AI","Delta"],topDecreases.map((row)=>[escapeHtml(row.address),escapeHtml(row.service),escapeHtml(formatMoney(row.baseline)),escapeHtml(formatMoney(row.ai)),`<span class="delta-neg">${escapeHtml(formatSignedMoney(row.delta))}</span>`]))}</div></div></section>` +
    `<section><h2>Property Size Sanity Check</h2>${renderTable("property-size",["Address","Google Building Sq Ft","Google Lot Sq Ft"],propertyRows.map((row)=>[escapeHtml(row.address),escapeHtml(formatNumber(row.googleBuildingSqft)),escapeHtml(formatNumber(row.googleLotSqft))]))}<h3>Baseline Pricing by Service</h3>${renderTable("scaling",["Service",...propertyRows.map((row)=>row.address),"Likely Driver","Scope Notes","Flag"],scalingRows.map((row)=>[escapeHtml(row.service),...propertyRows.map((property)=>escapeHtml(formatMoney(row.pricesByAddress[property.address]))),escapeHtml(row.driver),escapeHtml(row.scopeNotes),row.flag ? `<span class="flag">${escapeHtml(row.flag)}</span>` : ""]))}</section>` +
    `<section><h2>Quantity Inference Check</h2>${renderTable("quantity",["Address","Service","Building Sq Ft","Lot Sq Ft","Baseline Estimate","AI Estimate","Delta","Baseline Qty","AI Qty","AI Job Subtype","AI Quantity Evidence","AI Material Class","AI Access Difficulty","AI Premium Signal","AI Quoted Surfaces","Assessment"],quantityInspection.map((row)=>[escapeHtml(row.address),escapeHtml(row.service),escapeHtml(formatNumber(row.googleBuildingSqft)),escapeHtml(formatNumber(row.googleLotSqft)),escapeHtml(formatMoney(row.baselineEstimate)),escapeHtml(formatMoney(row.aiEstimate)),`<span class="${row.delta > 0 ? "delta-pos" : row.delta < 0 ? "delta-neg" : "delta-zero"}">${escapeHtml(formatSignedMoney(row.delta))}</span>`,escapeHtml(formatNumber(row.baselineQuantity)),escapeHtml(formatNumber(row.aiQuantity)),escapeHtml(row.aiSignal.jobSubtype ?? ""),escapeHtml(row.aiSignal.quantityEvidence ?? ""),escapeHtml(row.aiSignal.materialClass ?? ""),escapeHtml(row.aiSignal.accessDifficulty ?? ""),escapeHtml(String(row.aiSignal.premiumPropertySignal ?? "")),`<code>${escapeHtml(JSON.stringify(row.aiSignal.quotedSurfaces ?? {}))}</code>`,escapeHtml(row.explanation)]))}</section>` +
    `<section><h2>Service Path Inspection</h2>${renderTable("path-inspection",["Address","Service","Selected Answers JSON","Baseline Estimate","Job Subtype","Estimated Quantity","Base Rate Used","Access Modifier","Condition Modifier","Material Modifier","Subtype Pricing","Simplified Formula","Key Drivers"],pathInspection.map((row)=>[escapeHtml(row.address),escapeHtml(row.service),`<code>${escapeHtml(row.selectedAnswers)}</code>`,escapeHtml(formatMoney(row.baselineEstimate)),escapeHtml(row.jobSubtype ?? ""),escapeHtml(formatNumber(row.estimatedQuantity)),escapeHtml(row.baseRateUsed != null ? `$${row.baseRateUsed.toFixed(2)}` : ""),escapeHtml(row.accessModifier.toFixed(2)),escapeHtml(row.conditionModifier.toFixed(2)),escapeHtml(row.materialModifier.toFixed(2)),escapeHtml(row.jobSubtypePricing),escapeHtml(row.formula),escapeHtml(row.drivers)]))}</section>` +
    `<section><h2>Multiplier Inspection</h2>${renderTable("multipliers",["Service","Address","Job Subtype","Access Modifier","Condition Modifier","Material Modifier","Subtype Pricing Note"],multiplierRows.map((row)=>[escapeHtml(row.service),escapeHtml(row.address),escapeHtml(row.jobSubtype ?? ""),escapeHtml(row.accessModifier.toFixed(2)),escapeHtml(row.conditionModifier.toFixed(2)),escapeHtml(row.materialModifier.toFixed(2)),escapeHtml(row.jobSubtypePricing)]))}</section>` +
    `<section><h2>Final Sanity Check</h2><ol class="summary-list">${summaryLines.map((line)=>`<li>${escapeHtml(line.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ol>${flaggedScaling.length > 0 ? `<p class="note">Flagged scaling services: ${escapeHtml(flaggedScaling.map((row)=>row.service).join(", "))}</p>` : ""}${(quantityInflations.length > 0 || quantityReductions.length > 0) ? `<p class="note">Material quantity changes on inspected services: ${escapeHtml([quantityInflations.length > 0 ? `${quantityInflations.length} AI expansions` : null,quantityReductions.length > 0 ? `${quantityReductions.length} AI reductions` : null].filter(Boolean).join(", "))}</p>` : ""}</section>` +
    "</main></body></html>";

  await mkdir(DATASET_DIR, { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_HTML_PATH, html, "utf8"),
    writeFile(OUTPUT_AUDIT_JSON_PATH, JSON.stringify(auditRows, null, 2), "utf8")
  ]);
  console.log(`Cheyenne diagnostic dashboard written to ${OUTPUT_HTML_PATH}`);
  console.log(`Cheyenne audit JSON written to ${OUTPUT_AUDIT_JSON_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
