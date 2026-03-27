import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeServiceQuestionAnswers,
  parseQuestionAnswer,
  serviceQuestions,
  type ServiceQuestionAnswers,
  type ServiceQuestionConfig
} from "../lib/serviceQuestions";
import { SERVICE_OPTIONS, type ServiceType } from "../lib/services";
import { properties as defaultProperties, type TestProperty } from "./test-properties";

const APP_URL = process.env.SNAPQUOTE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const RESULTS_DIR = path.join(process.cwd(), "test-results");
const CACHE_DIR = path.join(RESULTS_DIR, "cache");
const PROPERTY_CACHE_PATH = path.join(CACHE_DIR, "property-lookups.json");
const DEFAULT_RESULTS_PATH = path.join(RESULTS_DIR, "snapquote-test-results.csv");
const DEFAULT_HTML_REPORT_PATH = path.join(RESULTS_DIR, "estimator-report.html");
const OUTPUT_DIR = process.env.SNAPQUOTE_TEST_OUTPUT_DIR?.trim()
  ? path.resolve(process.cwd(), process.env.SNAPQUOTE_TEST_OUTPUT_DIR.trim())
  : RESULTS_DIR;
const TEST_PROPERTIES_PATH = process.env.SNAPQUOTE_TEST_PROPERTIES_PATH?.trim()
  ? path.resolve(process.cwd(), process.env.SNAPQUOTE_TEST_PROPERTIES_PATH.trim())
  : null;
const ESTIMATE_POLL_INTERVAL_MS = 5_000;
const ESTIMATE_TIMEOUT_MS = 3 * 60 * 1000;
const TEST_CUSTOMER_NAME = "Estimator Test Runner";
const TEST_CUSTOMER_PHONE = "+15555550123";
const TEST_DESCRIPTION = "Automated estimator test";
const TEST_PHOTO_PATH = path.join(process.cwd(), "scripts", "assets", "estimator-test-photo.jpg");
const PLACEHOLDER_ADDRESS_PREFIX = "REPLACE_WITH_ZILLOW_ADDRESS_";
const TEST_RUN_LABEL = process.env.SNAPQUOTE_TEST_RUN_LABEL?.trim() || "Ad hoc run";
const TEST_LABEL = process.env.SNAPQUOTE_TEST_LABEL?.trim() || "Ad hoc test";
const TEST_SEED = process.env.SNAPQUOTE_TEST_SEED?.trim() || "";
const TEST_SERVICES = parseSelectedServices(process.env.SNAPQUOTE_TEST_SERVICES);
const TEST_CONTRACTOR_ADDRESS = process.env.SNAPQUOTE_TEST_CONTRACTOR_ADDRESS?.trim() || "";
const WORCESTER_DEFAULT_CONTRACTOR_ADDRESS = "21 Kendall St, Worcester, MA 01605";

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;
let testPhotoBytesPromise: Promise<Buffer> | null = null;
let propertyLookupCachePromise: Promise<PropertyLookupCache> | null = null;

type RandomSource = {
  next: () => number;
};

type RunContext = {
  runLabel: string;
  testLabel: string;
  seed: string;
  seedDisplay: string;
  seeded: boolean;
  resultsPath: string;
  htmlReportPath: string;
  detailsPath: string;
};

type GeocodedProperty = {
  city: string;
  originalAddress: string;
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
};

type PropertyLookupCache = Record<string, GeocodedProperty>;

type LeadEstimateRow = {
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
  aiExecution: string;
  aiLiveInvocation: string;
  aiCacheStatus: string;
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
};

type LeadEstimateDetailRow = LeadEstimateRow & {
  leadId: string | null;
  originalAddress: string;
  formattedAddress: string;
  error: string | null;
};

type DetailedRunReport = {
  runLabel: string;
  testLabel: string;
  seed: string;
  seedDisplay: string;
  contractorSlug: string;
  propertiesPath: string | null;
  rows: LeadEstimateDetailRow[];
};

type QuestionAnswerRow = {
  question: string;
  answer: string;
};

type ServiceReportEntry = {
  timestamp: string;
  service: string;
  selectedAnswers: string;
  aiMode: string;
  aiSignalSource: string;
  aiExecution: string;
  aiLiveInvocation: string;
  aiCacheStatus: string;
  aiStatus: string;
  multiplierSummary: string;
  questions: QuestionAnswerRow[];
  estimate: string;
};

type PropertyReportEntry = {
  address: string;
  city: string;
  googleLotSqft: string;
  googleBuildingSqft: string;
  travelDistanceMiles: string;
  services: ServiceReportEntry[];
};

type LeadStatusRow = {
  ai_status: string | null;
  ai_generated_at: string | null;
  ai_estimator_notes: unknown;
  ai_suggested_price: number | string | null;
  ai_estimate_low: number | string | null;
  ai_estimate_high: number | string | null;
  parcel_lot_size_sqft: number | string | null;
  house_sqft: number | string | null;
  travel_distance_miles: number | string | null;
};

class EstimatePollingError extends Error {
  aiMode: string;
  aiSignalSource: string;
  aiExecution: string;
  aiLiveInvocation: string;
  aiCacheStatus: string;
  aiStatus: string;

  constructor(message: string, metadata: {
    aiMode: string;
    aiSignalSource: string;
    aiExecution: string;
    aiLiveInvocation: string;
    aiCacheStatus: string;
    aiStatus: string;
  }) {
    super(message);
    this.name = "EstimatePollingError";
    this.aiMode = metadata.aiMode;
    this.aiSignalSource = metadata.aiSignalSource;
    this.aiExecution = metadata.aiExecution;
    this.aiLiveInvocation = metadata.aiLiveInvocation;
    this.aiCacheStatus = metadata.aiCacheStatus;
    this.aiStatus = metadata.aiStatus;
  }
}

function getGoogleMapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
  }
  return key;
}

function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  supabaseAdminClient = createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdminClient;
}

async function loadTestProperties(): Promise<TestProperty[]> {
  if (!TEST_PROPERTIES_PATH) {
    return defaultProperties;
  }

  const raw = await readFile(TEST_PROPERTIES_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of properties in ${TEST_PROPERTIES_PATH}.`);
  }

  const properties = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid property entry at index ${index} in ${TEST_PROPERTIES_PATH}.`);
    }

    const candidate = entry as Partial<TestProperty>;
    if (typeof candidate.address !== "string" || typeof candidate.city !== "string") {
      throw new Error(`Property entry at index ${index} must include string city and address fields.`);
    }

    return {
      city: candidate.city.trim(),
      address: candidate.address.trim()
    };
  });

  if (properties.length === 0) {
    throw new Error(`No test properties were found in ${TEST_PROPERTIES_PATH}.`);
  }

  return properties;
}

function ensureRealPropertyAddresses(properties: TestProperty[]) {
  const placeholders = properties.filter((property) =>
    property.address.startsWith(PLACEHOLDER_ADDRESS_PREFIX)
  );

  if (placeholders.length > 0) {
    throw new Error(
      `Replace the placeholder test addresses in scripts/test-properties.ts before running this script.`
    );
  }
}

function slugifyLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function createRunContext(): RunContext {
  const seedDisplay = TEST_SEED || "random";
  const outputSlug = [TEST_RUN_LABEL, TEST_LABEL, seedDisplay].map(slugifyLabel).join("--");

  return {
    runLabel: TEST_RUN_LABEL,
    testLabel: TEST_LABEL,
    seed: TEST_SEED,
    seedDisplay,
    seeded: TEST_SEED.length > 0,
    resultsPath: path.join(OUTPUT_DIR, `snapquote-test-results--${outputSlug}.csv`),
    htmlReportPath: path.join(OUTPUT_DIR, `estimator-report--${outputSlug}.html`),
    detailsPath: path.join(OUTPUT_DIR, `snapquote-test-details--${outputSlug}.json`)
  };
}

function getRecommendedStructuredAiCacheDir(): string {
  const explicitDir = process.env.SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_DIR?.trim();
  if (explicitDir) {
    return path.resolve(process.cwd(), explicitDir);
  }

  return path.join(OUTPUT_DIR, "_ai-cache");
}

function parseSelectedServices(rawValue: string | undefined): ServiceType[] {
  const requested = rawValue
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!requested || requested.length === 0) {
    return [...SERVICE_OPTIONS];
  }

  const normalized = Array.from(new Set(requested));
  const unknown = normalized.filter((service) => !SERVICE_OPTIONS.includes(service as ServiceType));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown service names in SNAPQUOTE_TEST_SERVICES: ${unknown.join(", ")}`
    );
  }

  return normalized as ServiceType[];
}

function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: string): RandomSource {
  let state = hashString(seed) || 0x9e3779b9;

  return {
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

function createRandomSource(seed: string | null): RandomSource {
  return seed ? createSeededRandom(seed) : { next: () => Math.random() };
}

function randomInt(random: RandomSource, min: number, max: number): number {
  return Math.floor(random.next() * (max - min + 1)) + min;
}

function shuffleOptions(random: RandomSource, options: readonly string[]): string[] {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function pickRandomOption(random: RandomSource, options: readonly string[]): string {
  if (options.length === 0) {
    return "";
  }

  return options[Math.floor(random.next() * options.length)];
}

function getQuestionRandom(
  run: RunContext,
  propertyAddress: string,
  service: ServiceType,
  questionKey: string
): RandomSource {
  if (!run.seeded) {
    return createRandomSource(null);
  }

  return createRandomSource(`${run.seed}|${propertyAddress}|${service}|${questionKey}`);
}

function buildRandomOtherText(random: RandomSource, question: ServiceQuestionConfig): string {
  const fallbackPhrases = [
    "custom scope requested",
    "special access needs",
    "premium material preference",
    "site-specific details"
  ];
  const keyLabel = question.key.replace(/_/g, " ");
  const detailNumber = randomInt(random, 1, 99);
  return `${pickRandomOption(random, fallbackPhrases)} for ${keyLabel} ${detailNumber}`;
}

function buildRandomNumericValue(random: RandomSource, question: ServiceQuestionConfig): string {
  if (/sq.?ft|area|size|scope/i.test(question.key) || /how much|how large|area|size/i.test(question.question)) {
    return String(randomInt(random, 100, 5000));
  }

  if (/count|windows?|trees?|lights?|items?/i.test(question.key) || /how many|count/i.test(question.question)) {
    return String(randomInt(random, 1, 25));
  }

  return String(randomInt(random, 1, 10));
}

function buildRandomTextValue(random: RandomSource, question: ServiceQuestionConfig): string {
  const phrases = ["custom detail", "site note", "special request", "material preference", "access note"];
  return `${pickRandomOption(random, phrases)} for ${question.key.replace(/_/g, " ")} ${randomInt(random, 1, 99)}`;
}

function buildRandomCheckboxSelection(random: RandomSource, question: ServiceQuestionConfig): string[] {
  const exclusiveOptions = new Set(question.exclusiveOptions ?? []);
  const exclusiveSelections = question.options.filter((option) => exclusiveOptions.has(option));
  const combinableOptions = question.options.filter((option) => !exclusiveOptions.has(option));

  if (exclusiveSelections.length > 0 && (combinableOptions.length === 0 || random.next() < 0.3)) {
    return [pickRandomOption(random, exclusiveSelections)];
  }

  const pool = combinableOptions.length > 0 ? combinableOptions : question.options;
  const randomCount = randomInt(random, 1, pool.length);

  return shuffleOptions(random, pool).slice(0, randomCount);
}

function buildRandomAnswerValue(random: RandomSource, question: ServiceQuestionConfig): string | string[] {
  if (question.inputType === "checkbox") {
    return buildRandomCheckboxSelection(random, question);
  }

  if (question.options.length > 0) {
    return pickRandomOption(random, question.options);
  }

  if (/count|number|size|length|sq.?ft|area/i.test(question.key) || /how many|how much|how large/i.test(question.question)) {
    return buildRandomNumericValue(random, question);
  }

  return buildRandomTextValue(random, question);
}

function buildBasicAnswers(run: RunContext, propertyAddress: string, service: ServiceType): ServiceQuestionAnswers {
  const rawAnswers: Record<string, string | string[]> = {};

  for (const question of serviceQuestions[service]) {
    const random = getQuestionRandom(run, propertyAddress, service, question.key);
    const answerValue = buildRandomAnswerValue(random, question);
    rawAnswers[question.key] = answerValue;

    const selections = parseQuestionAnswer(answerValue);
    if (selections.includes("Other")) {
      rawAnswers[`${question.key}_other_text`] = buildRandomOtherText(random, question);
    }
  }

  return normalizeServiceQuestionAnswers(service, rawAnswers);
}

function buildQuestionAnswerRows(service: ServiceType, answers: ServiceQuestionAnswers): QuestionAnswerRow[] {
  return serviceQuestions[service].map((question) => ({
    question: question.question,
    answer: formatQuestionAnswer(answers[question.key])
  }));
}

function formatQuestionAnswer(answer: string | string[] | undefined): string {
  const values = parseQuestionAnswer(answer);
  return values.join(" | ");
}

function buildAnswerColumns(service: ServiceType, answers: ServiceQuestionAnswers): [string, string, string, string, string] {
  const values = serviceQuestions[service]
    .slice(0, 5)
    .map((question) => formatQuestionAnswer(answers[question.key]));

  while (values.length < 5) {
    values.push("");
  }

  return [values[0] ?? "", values[1] ?? "", values[2] ?? "", values[3] ?? "", values[4] ?? ""];
}

function buildSelectedAnswersValue(service: ServiceType, answers: ServiceQuestionAnswers): string {
  const orderedEntries = serviceQuestions[service].flatMap((question) => {
    const entries: Array<[string, string | string[]]> = [];
    const answer = answers[question.key];

    if (answer !== undefined) {
      entries.push([question.key, answer]);
    }

    const otherText = answers[`${question.key}_other_text`];
    if (otherText !== undefined) {
      entries.push([`${question.key}_other_text`, otherText]);
    }

    return entries;
  });

  return JSON.stringify(Object.fromEntries(orderedEntries));
}

function parseLeadNotes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((note): note is string => typeof note === "string") : [];
}

function extractLeadMetadata(lead: LeadStatusRow): {
  aiMode: string;
  aiSignalSource: string;
  aiExecution: string;
  aiLiveInvocation: string;
  aiCacheStatus: string;
  aiStatus: string;
  multiplierSummary: string;
} {
  const notes = parseLeadNotes(lead.ai_estimator_notes);
  const aiModeNote = notes.find((note) => note.startsWith("Estimator AI mode: "));
  const aiSignalSourceNote = notes.find((note) => note.startsWith("Estimator signal source: "));
  const aiExecutionNote = notes.find((note) => note.startsWith("Estimator AI execution: "));
  const aiLiveInvocationNote = notes.find((note) => note.startsWith("Estimator AI live invocation: "));
  const aiCacheStatusNote = notes.find((note) => note.startsWith("Estimator AI cache status: "));
  const multiplierSummaryNote = notes.find((note) => note.startsWith("Estimator multipliers: "));

  return {
    aiMode: aiModeNote?.replace(/^Estimator AI mode:\s*/, "").replace(/\.$/, "") ?? "unknown",
    aiSignalSource: aiSignalSourceNote?.replace(/^Estimator signal source:\s*/, "").replace(/\.$/, "") ?? "unknown",
    aiExecution: aiExecutionNote?.replace(/^Estimator AI execution:\s*/, "").replace(/\.$/, "") ?? "unknown",
    aiLiveInvocation:
      aiLiveInvocationNote?.replace(/^Estimator AI live invocation:\s*/, "").replace(/\.$/, "") ?? "unknown",
    aiCacheStatus: aiCacheStatusNote?.replace(/^Estimator AI cache status:\s*/, "").replace(/\.$/, "") ?? "unknown",
    aiStatus: lead.ai_status ?? "unknown",
    multiplierSummary: multiplierSummaryNote?.replace(/^Estimator multipliers:\s*/, "") ?? ""
  };
}

function isReplayMissFailure(metadata: {
  aiExecution: string;
  aiCacheStatus: string;
}, message: string): boolean {
  return (
    metadata.aiExecution === "replay_miss" ||
    metadata.aiCacheStatus === "replay_miss" ||
    /Structured AI test cache miss/i.test(message)
  );
}

async function resolveContractorSlug() {
  const envSlug = process.env.SNAPQUOTE_TEST_CONTRACTOR_SLUG?.trim();
  if (envSlug) {
    return envSlug;
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("contractor_profile")
    .select("public_slug")
    .not("public_slug", "is", null)
    .limit(1)
    .maybeSingle();
  const row = data as { public_slug: string | null } | null;

  if (error) {
    throw new Error(`Failed to resolve contractor slug: ${error.message}`);
  }

  if (!row?.public_slug) {
    throw new Error(
      "No contractor_profile.public_slug was found. Set SNAPQUOTE_TEST_CONTRACTOR_SLUG to choose one explicitly."
    );
  }

  return String(row.public_slug);
}

function normalizeAddressForMatch(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWorcesterOnlyDataset(properties: TestProperty[]): boolean {
  return properties.length > 0 && properties.every((property) => property.city.trim().toLowerCase() === "worcester");
}

async function resolveContractorSlugForTestRun(properties: TestProperty[]): Promise<string> {
  const explicitSlug = process.env.SNAPQUOTE_TEST_CONTRACTOR_SLUG?.trim();
  if (explicitSlug) {
    return explicitSlug;
  }

  const preferredAddress = TEST_CONTRACTOR_ADDRESS || (isWorcesterOnlyDataset(properties)
    ? WORCESTER_DEFAULT_CONTRACTOR_ADDRESS
    : "");

  if (preferredAddress) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("contractor_profile")
      .select("public_slug,business_address_full")
      .not("public_slug", "is", null)
      .not("business_address_full", "is", null);
    const rows = (data ?? []) as Array<{ public_slug: string | null; business_address_full: string | null }>;

    if (error) {
      throw new Error(`Failed to resolve contractor slug by address: ${error.message}`);
    }

    const target = normalizeAddressForMatch(preferredAddress);
    const match = rows.find((row) => {
      const candidate = normalizeAddressForMatch(row.business_address_full ?? "");
      return candidate.includes(target) || target.includes(candidate);
    });

    if (!match?.public_slug) {
      throw new Error(
        `No contractor_profile matched "${preferredAddress}". Set SNAPQUOTE_TEST_CONTRACTOR_SLUG explicitly for this run.`
      );
    }

    return String(match.public_slug);
  }

  return resolveContractorSlug();
}

async function geocodeProperty(address: string, expectedCity: string): Promise<GeocodedProperty> {
  const key = getGoogleMapsApiKey();
  const params = new URLSearchParams({
    address,
    key
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Google geocoding failed with status ${response.status}.`);
  }

  const json = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
    }>;
  };

  if (json.status !== "OK" || !json.results?.[0]) {
    throw new Error(
      `Google geocoding failed for "${address}": ${json.status ?? "UNKNOWN"}${json.error_message ? ` - ${json.error_message}` : ""}`
    );
  }

  const result = json.results[0];
  const city =
    result.address_components?.find((component) => component.types?.includes("locality"))?.long_name ??
    expectedCity;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  const placeId = result.place_id;
  const formattedAddress = result.formatted_address;

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !placeId ||
    !formattedAddress
  ) {
    throw new Error(`Incomplete geocoding response for "${address}".`);
  }

  return {
    city,
    originalAddress: address,
    formattedAddress,
    placeId,
    lat,
    lng
  };
}

async function loadPropertyLookupCache(): Promise<PropertyLookupCache> {
  if (!propertyLookupCachePromise) {
    propertyLookupCachePromise = (async () => {
      try {
        const raw = await readFile(PROPERTY_CACHE_PATH, "utf8");
        const parsed = JSON.parse(raw) as unknown;

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {};
        }

        const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return false;
          }

          const candidate = value as Partial<GeocodedProperty>;
          return (
            typeof candidate.originalAddress === "string" &&
            typeof candidate.formattedAddress === "string" &&
            typeof candidate.placeId === "string" &&
            typeof candidate.city === "string" &&
            typeof candidate.lat === "number" &&
            typeof candidate.lng === "number"
          );
        });

        return Object.fromEntries(entries) as PropertyLookupCache;
      } catch (error) {
        const missingFile = error && typeof error === "object" && "code" in error && error.code === "ENOENT";

        if (missingFile) {
          return {};
        }

        console.warn(`Failed to read property lookup cache at ${PROPERTY_CACHE_PATH}; ignoring cache.`, error);
        return {};
      }
    })();
  }

  return propertyLookupCachePromise;
}

async function savePropertyLookupCache(cache: PropertyLookupCache): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(PROPERTY_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

async function resolveGeocodedProperty(address: string, expectedCity: string): Promise<GeocodedProperty> {
  const cache = await loadPropertyLookupCache();
  const cached = cache[address];

  if (cached) {
    return cached;
  }

  const geocoded = await geocodeProperty(address, expectedCity);
  cache[address] = geocoded;
  await savePropertyLookupCache(cache);
  return geocoded;
}

async function loadTestPhotoBytes(): Promise<Buffer> {
  if (!testPhotoBytesPromise) {
    testPhotoBytesPromise = readFile(TEST_PHOTO_PATH);
  }

  return testPhotoBytesPromise;
}

async function createTestPhoto(): Promise<File> {
  const bytes = await loadTestPhotoBytes();
  return new File([new Uint8Array(bytes)], "estimator-test-photo.jpg", { type: "image/jpeg" });
}

async function submitLead(input: {
  contractorSlug: string;
  property: GeocodedProperty;
  service: ServiceType;
  answers: ServiceQuestionAnswers;
}) {
  const formData = new FormData();
  const serviceQuestionAnswers = [
    {
      service: input.service,
      answers: input.answers
    }
  ];

  formData.append("contractorSlug", input.contractorSlug);
  formData.append("customerName", TEST_CUSTOMER_NAME);
  formData.append("customerPhone", TEST_CUSTOMER_PHONE);
  formData.append("customerEmail", "test@snapquote.com");
  formData.append("addressFull", input.property.formattedAddress);
  formData.append("addressPlaceId", input.property.placeId);
  formData.append("lat", String(input.property.lat));
  formData.append("lng", String(input.property.lng));
  formData.append("services[]", input.service);
  formData.append("description", TEST_DESCRIPTION);
  formData.append("serviceQuestionAnswers", JSON.stringify(serviceQuestionAnswers));
  formData.append("photos", await createTestPhoto());

  const response = await fetch(`${APP_URL}/api/public/lead-submit`, {
    method: "POST",
    body: formData
  });

  const payload = (await response.json()) as { leadId?: string; error?: string };

  if (!response.ok || !payload.leadId) {
    throw new Error(payload.error || `Lead submit failed with status ${response.status}.`);
  }

  return payload.leadId;
}

async function waitForEstimate(leadId: string): Promise<LeadStatusRow> {
  const admin = getSupabaseAdminClient();
  const startedAt = Date.now();

  while (Date.now() - startedAt < ESTIMATE_TIMEOUT_MS) {
    const { data, error } = await admin
      .from("leads")
      .select(
        "ai_status,ai_generated_at,ai_estimator_notes,ai_suggested_price,ai_estimate_low,ai_estimate_high,parcel_lot_size_sqft,house_sqft,travel_distance_miles"
      )
      .eq("id", leadId)
      .maybeSingle<LeadStatusRow>();

    if (error) {
      throw new Error(`Failed to poll lead ${leadId}: ${error.message}`);
    }

    if (data?.ai_status === "ready" || data?.ai_generated_at) {
      return data;
    }

    if (data?.ai_status === "failed") {
      const metadata = extractLeadMetadata(data);
      const notes = parseLeadNotes(data.ai_estimator_notes);
      const detail = notes.length > 0 ? ` ${notes.join(" | ")}` : "";
      throw new EstimatePollingError(`Estimator generation failed for lead ${leadId}.${detail}`, metadata);
    }

    await sleep(ESTIMATE_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting ${ESTIMATE_TIMEOUT_MS / 1000}s for estimate generation on lead ${leadId}.`
  );
}

function formatEstimateValue(lead: LeadStatusRow): string {
  const suggested = typeof lead.ai_suggested_price === "number"
    ? lead.ai_suggested_price
    : Number(lead.ai_suggested_price);

  if (Number.isFinite(suggested)) {
    return suggested.toFixed(2);
  }

  const low = typeof lead.ai_estimate_low === "number" ? lead.ai_estimate_low : Number(lead.ai_estimate_low);
  const high = typeof lead.ai_estimate_high === "number" ? lead.ai_estimate_high : Number(lead.ai_estimate_high);

  if (Number.isFinite(low) && Number.isFinite(high)) {
    return `${low.toFixed(2)}-${high.toFixed(2)}`;
  }

  return "NO_ESTIMATE";
}

function formatNumericValue(value: number | string | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toString() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrCreatePropertyReport(
  reports: Map<string, PropertyReportEntry>,
  property: { address: string; city: string }
): PropertyReportEntry {
  const key = `${property.address}__${property.city}`;
  const existing = reports.get(key);

  if (existing) {
    return existing;
  }

  const created: PropertyReportEntry = {
    address: property.address,
    city: property.city,
    googleLotSqft: "",
    googleBuildingSqft: "",
    travelDistanceMiles: "",
    services: []
  };

  reports.set(key, created);
  return created;
}

function updatePropertySignals(
  report: PropertyReportEntry,
  values: Pick<PropertyReportEntry, "googleLotSqft" | "googleBuildingSqft" | "travelDistanceMiles">
) {
  if (values.googleLotSqft) {
    report.googleLotSqft = values.googleLotSqft;
  }
  if (values.googleBuildingSqft) {
    report.googleBuildingSqft = values.googleBuildingSqft;
  }
  if (values.travelDistanceMiles) {
    report.travelDistanceMiles = values.travelDistanceMiles;
  }
}

function addServiceReport(
  propertyReport: PropertyReportEntry,
  entry: ServiceReportEntry
) {
  propertyReport.services.push(entry);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function appendCsvRow(row: LeadEstimateRow) {
  const line = [
    row.timestamp,
    row.runLabel,
    row.testLabel,
    row.seed,
    row.address,
    row.city,
    row.service,
    row.selectedAnswers,
    row.aiMode,
    row.aiSignalSource,
    row.aiExecution,
    row.aiLiveInvocation,
    row.aiCacheStatus,
    row.aiStatus,
    row.q1,
    row.q2,
    row.q3,
    row.q4,
    row.q5,
    row.googleLotSqft,
    row.googleBuildingSqft,
    row.travelDistanceMiles,
    row.estimate
  ]
    .map(csvCell)
    .join(",") + "\n";
  await Promise.all([
    appendFile(DEFAULT_RESULTS_PATH, line, "utf8"),
    row.runLabel || row.testLabel || row.seed
      ? appendFile(runContext.resultsPath, line, "utf8")
      : Promise.resolve()
  ]);
}

async function prepareResultsFile() {
  await Promise.all([mkdir(RESULTS_DIR, { recursive: true }), mkdir(OUTPUT_DIR, { recursive: true })]);
  const header =
    "timestamp,run_label,test_label,seed,address,city,service,selected_answers,ai_mode,ai_signal_source,ai_execution,ai_live_invocation,ai_cache_status,ai_status,q1,q2,q3,q4,q5,google_lot_sqft,google_building_sqft,travel_distance_miles,estimate\n";

  await Promise.all([
    writeFile(DEFAULT_RESULTS_PATH, header, "utf8"),
    writeFile(runContext.resultsPath, header, "utf8")
  ]);
}

async function writeHtmlReport(propertyReports: PropertyReportEntry[]) {
  const sections = propertyReports
    .map((property) => {
      const servicesHtml = property.services
        .map((service) => {
          const questionRows = service.questions.length > 0
            ? service.questions
                .map(
                  (row) => `
                    <tr>
                      <td>${escapeHtml(row.question)}</td>
                      <td>${escapeHtml(row.answer || "")}</td>
                    </tr>`
                )
                .join("")
            : `
              <tr>
                <td colspan="2">No submitted question data available.</td>
              </tr>`;

          return `
            <section class="service-card">
              <h3>${escapeHtml(service.service)}</h3>
              <p class="service-meta">
                Submitted at ${escapeHtml(service.timestamp)}
                <br />
                AI mode: ${escapeHtml(service.aiMode)} | Signal source: ${escapeHtml(service.aiSignalSource)} | Execution: ${escapeHtml(service.aiExecution)} | Live invocation: ${escapeHtml(service.aiLiveInvocation)} | Cache: ${escapeHtml(service.aiCacheStatus)} | Status: ${escapeHtml(service.aiStatus)}
              </p>
              <p class="service-meta">Multipliers: ${escapeHtml(service.multiplierSummary || "n/a")}</p>
              <p class="service-meta">Selected answers: ${escapeHtml(service.selectedAnswers)}</p>
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  ${questionRows}
                </tbody>
              </table>
              <p class="estimate"><strong>Estimated Price:</strong> ${escapeHtml(service.estimate)}</p>
            </section>`;
        })
        .join("");

      return `
        <section class="property-card">
          <h2>${escapeHtml(property.address)}</h2>
          <div class="property-grid">
            <div><strong>City</strong><span>${escapeHtml(property.city)}</span></div>
            <div><strong>Google Lot Size</strong><span>${escapeHtml(property.googleLotSqft || "N/A")}</span></div>
            <div><strong>Google House Size</strong><span>${escapeHtml(property.googleBuildingSqft || "N/A")}</span></div>
            <div><strong>Travel Distance</strong><span>${escapeHtml(property.travelDistanceMiles || "N/A")}</span></div>
          </div>
          ${servicesHtml}
        </section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SnapQuote Estimator Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f4ef;
        --card: #ffffff;
        --ink: #1f2937;
        --muted: #6b7280;
        --line: #d1d5db;
        --accent: #14532d;
        --accent-soft: #ecfdf5;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: linear-gradient(180deg, #f8f7f2 0%, #eef3f7 100%);
        color: var(--ink);
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px 64px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 2.4rem;
      }
      .intro {
        margin: 0 0 32px;
        color: var(--muted);
        font-size: 1rem;
      }
      .property-card {
        background: var(--card);
        border: 1px solid rgba(20, 83, 45, 0.12);
        border-radius: 18px;
        padding: 24px;
        margin-bottom: 28px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
      }
      .property-card h2 {
        margin: 0 0 18px;
        font-size: 1.5rem;
      }
      .property-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      .property-grid div {
        background: var(--accent-soft);
        border-radius: 12px;
        padding: 12px 14px;
      }
      .property-grid strong {
        display: block;
        margin-bottom: 4px;
        font-size: 0.85rem;
      }
      .service-card {
        border-top: 1px solid var(--line);
        padding-top: 20px;
        margin-top: 20px;
      }
      .service-card h3 {
        margin: 0 0 6px;
        font-size: 1.2rem;
      }
      .service-meta {
        margin: 0 0 14px;
        color: var(--muted);
        font-size: 0.95rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
      }
      th, td {
        padding: 10px 12px;
        border: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #f3f4f6;
        font-size: 0.95rem;
      }
      .estimate {
        margin: 14px 0 0;
        font-size: 1rem;
      }
      @media (max-width: 720px) {
        main {
          padding: 24px 14px 48px;
        }
        h1 {
          font-size: 1.9rem;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>SnapQuote Estimator Report</h1>
      <p class="intro">
        ${escapeHtml(runContext.runLabel)} / ${escapeHtml(runContext.testLabel)} / Seed: ${escapeHtml(runContext.seedDisplay)}.
        Grouped by property and service. The CSV backup remains available at snapquote-test-results.csv.
      </p>
      ${sections}
    </main>
  </body>
</html>`;

  await Promise.all([
    writeFile(DEFAULT_HTML_REPORT_PATH, html, "utf8"),
    writeFile(runContext.htmlReportPath, html, "utf8")
  ]);
}

async function writeDetailedRunReport(report: DetailedRunReport) {
  await writeFile(runContext.detailsPath, JSON.stringify(report, null, 2), "utf8");
}

const runContext = createRunContext();

async function main() {
  const properties = await loadTestProperties();
  ensureRealPropertyAddresses(properties);

  const contractorSlug = await resolveContractorSlugForTestRun(properties);
  const propertyReports = new Map<string, PropertyReportEntry>();
  const detailRows: LeadEstimateDetailRow[] = [];
  let abortRunMessage: string | null = null;
  await prepareResultsFile();

  for (const property of properties) {
    if (abortRunMessage) {
      break;
    }

    let geocodedProperty: GeocodedProperty;

    try {
      geocodedProperty = await resolveGeocodedProperty(property.address, property.city);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown geocoding error";

      console.error(`Failed to geocode property: ${message}`);
      const propertyReport = getOrCreatePropertyReport(propertyReports, {
        address: property.address,
        city: property.city
      });

      for (const service of TEST_SERVICES) {
        addServiceReport(propertyReport, {
          timestamp: new Date().toISOString(),
          service,
          selectedAnswers: "",
          aiMode: "n/a",
          aiSignalSource: "n/a",
          aiExecution: "n/a",
          aiLiveInvocation: "n/a",
          aiCacheStatus: "n/a",
          aiStatus: "error",
          multiplierSummary: "",
          questions: [],
          estimate: `ERROR: ${message}`
        });
        await appendCsvRow({
          timestamp: new Date().toISOString(),
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: property.address,
          city: property.city,
          service,
          selectedAnswers: "",
          aiMode: "n/a",
          aiSignalSource: "n/a",
          aiExecution: "n/a",
          aiLiveInvocation: "n/a",
          aiCacheStatus: "n/a",
          aiStatus: "error",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
          q5: "",
          googleLotSqft: "",
          googleBuildingSqft: "",
          travelDistanceMiles: "",
          estimate: `ERROR: ${message}`
        });
        detailRows.push({
          timestamp: new Date().toISOString(),
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: property.address,
          city: property.city,
          service,
          selectedAnswers: "",
          aiMode: "n/a",
          aiSignalSource: "n/a",
          aiExecution: "n/a",
          aiLiveInvocation: "n/a",
          aiCacheStatus: "n/a",
          aiStatus: "error",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
          q5: "",
          googleLotSqft: "",
          googleBuildingSqft: "",
          travelDistanceMiles: "",
          estimate: `ERROR: ${message}`,
          leadId: null,
          originalAddress: property.address,
          formattedAddress: property.address,
          error: message
        });
      }

      continue;
    }

    for (const service of TEST_SERVICES) {
      const answers = buildBasicAnswers(runContext, property.address, service);
      const selectedAnswers = buildSelectedAnswersValue(service, answers);
      const questionRows = buildQuestionAnswerRows(service, answers);
      const [q1, q2, q3, q4, q5] = buildAnswerColumns(service, answers);
      const timestamp = new Date().toISOString();
      const propertyReport = getOrCreatePropertyReport(propertyReports, {
        address: geocodedProperty.formattedAddress,
        city: geocodedProperty.city
      });

      try {
        const leadId = await submitLead({
          contractorSlug,
          property: geocodedProperty,
          service,
          answers
        });

        const lead = await waitForEstimate(leadId);
        const leadMetadata = extractLeadMetadata(lead);
        const estimate = formatEstimateValue(lead);
        const googleLotSqft = formatNumericValue(lead.parcel_lot_size_sqft);
        const googleBuildingSqft = formatNumericValue(lead.house_sqft);
        const travelDistanceMiles = formatNumericValue(lead.travel_distance_miles);

        updatePropertySignals(propertyReport, {
          googleLotSqft,
          googleBuildingSqft,
          travelDistanceMiles
        });
        addServiceReport(propertyReport, {
          timestamp,
          service,
          selectedAnswers,
          aiMode: leadMetadata.aiMode,
          aiSignalSource: leadMetadata.aiSignalSource,
          aiExecution: leadMetadata.aiExecution,
          aiLiveInvocation: leadMetadata.aiLiveInvocation,
          aiCacheStatus: leadMetadata.aiCacheStatus,
          aiStatus: leadMetadata.aiStatus,
          multiplierSummary: leadMetadata.multiplierSummary,
          questions: questionRows,
          estimate
        });

        await appendCsvRow({
          timestamp,
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: geocodedProperty.formattedAddress,
          city: geocodedProperty.city,
          service,
          selectedAnswers,
          aiMode: leadMetadata.aiMode,
          aiSignalSource: leadMetadata.aiSignalSource,
          aiExecution: leadMetadata.aiExecution,
          aiLiveInvocation: leadMetadata.aiLiveInvocation,
          aiCacheStatus: leadMetadata.aiCacheStatus,
          aiStatus: leadMetadata.aiStatus,
          q1,
          q2,
          q3,
          q4,
          q5,
          googleLotSqft,
          googleBuildingSqft,
          travelDistanceMiles,
          estimate
        });
        detailRows.push({
          timestamp,
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: geocodedProperty.formattedAddress,
          city: geocodedProperty.city,
          service,
          selectedAnswers,
          aiMode: leadMetadata.aiMode,
          aiSignalSource: leadMetadata.aiSignalSource,
          aiExecution: leadMetadata.aiExecution,
          aiLiveInvocation: leadMetadata.aiLiveInvocation,
          aiCacheStatus: leadMetadata.aiCacheStatus,
          aiStatus: leadMetadata.aiStatus,
          q1,
          q2,
          q3,
          q4,
          q5,
          googleLotSqft,
          googleBuildingSqft,
          travelDistanceMiles,
          estimate,
          leadId,
          originalAddress: property.address,
          formattedAddress: geocodedProperty.formattedAddress,
          error: null
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const failureMetadata =
          error instanceof EstimatePollingError
            ? {
                aiMode: error.aiMode,
                aiSignalSource: error.aiSignalSource,
                aiExecution: error.aiExecution,
                aiLiveInvocation: error.aiLiveInvocation,
                aiCacheStatus: error.aiCacheStatus,
                aiStatus: error.aiStatus
              }
            : {
                aiMode: "unknown",
                aiSignalSource: "failed",
                aiExecution: "failed",
                aiLiveInvocation: "unknown",
                aiCacheStatus: "unknown",
                aiStatus: "error"
              };
        addServiceReport(propertyReport, {
          timestamp,
          service,
          selectedAnswers,
          aiMode: failureMetadata.aiMode,
          aiSignalSource: failureMetadata.aiSignalSource,
          aiExecution: failureMetadata.aiExecution,
          aiLiveInvocation: failureMetadata.aiLiveInvocation,
          aiCacheStatus: failureMetadata.aiCacheStatus,
          aiStatus: failureMetadata.aiStatus,
          multiplierSummary: "",
          questions: questionRows,
          estimate: `ERROR: ${message}`
        });

        await appendCsvRow({
          timestamp,
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: geocodedProperty.formattedAddress,
          city: geocodedProperty.city,
          service,
          selectedAnswers,
          aiMode: failureMetadata.aiMode,
          aiSignalSource: failureMetadata.aiSignalSource,
          aiExecution: failureMetadata.aiExecution,
          aiLiveInvocation: failureMetadata.aiLiveInvocation,
          aiCacheStatus: failureMetadata.aiCacheStatus,
          aiStatus: failureMetadata.aiStatus,
          q1,
          q2,
          q3,
          q4,
          q5,
          googleLotSqft: "",
          googleBuildingSqft: "",
          travelDistanceMiles: "",
          estimate: `ERROR: ${message}`
        });
        detailRows.push({
          timestamp,
          runLabel: runContext.runLabel,
          testLabel: runContext.testLabel,
          seed: runContext.seedDisplay,
          address: geocodedProperty.formattedAddress,
          city: geocodedProperty.city,
          service,
          selectedAnswers,
          aiMode: failureMetadata.aiMode,
          aiSignalSource: failureMetadata.aiSignalSource,
          aiExecution: failureMetadata.aiExecution,
          aiLiveInvocation: failureMetadata.aiLiveInvocation,
          aiCacheStatus: failureMetadata.aiCacheStatus,
          aiStatus: failureMetadata.aiStatus,
          q1,
          q2,
          q3,
          q4,
          q5,
          googleLotSqft: "",
          googleBuildingSqft: "",
          travelDistanceMiles: "",
          estimate: `ERROR: ${message}`,
          leadId: null,
          originalAddress: property.address,
          formattedAddress: geocodedProperty.formattedAddress,
          error: message
        });

        console.error(`Failed ${service} estimate run: ${message}`);

        if (isReplayMissFailure(failureMetadata, message)) {
          abortRunMessage =
            `Structured AI replay cache miss detected on ${service} at ${geocodedProperty.formattedAddress}. ` +
            `Stop using SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE=replay on an empty cache. ` +
            `Start the dev server with SNAPQUOTE_ESTIMATOR_TEST_AI_CACHE_MODE=record_replay ` +
            `and use cache dir ${getRecommendedStructuredAiCacheDir()}.`;
          break;
        }
      }
    }
  }

  await Promise.all([
    writeHtmlReport(Array.from(propertyReports.values())),
    writeDetailedRunReport({
      runLabel: runContext.runLabel,
      testLabel: runContext.testLabel,
      seed: runContext.seed,
      seedDisplay: runContext.seedDisplay,
      contractorSlug,
      propertiesPath: TEST_PROPERTIES_PATH,
      rows: detailRows
    })
  ]);
  if (abortRunMessage) {
    throw new Error(abortRunMessage);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
