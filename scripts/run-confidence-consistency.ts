import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { debugEstimateTrace } from "../lib/ai/estimate";
import {
  computeRuleBasedConfidence,
  deterministicPhotoConfidenceAdjustment,
  getDeterministicConfidenceServiceConfig,
  type CanonicalService
} from "../estimators/shared";
import { parseQuestionAnswer, type ServiceQuestionAnswers } from "../lib/serviceQuestions";

const FALCON_CONTRACTOR_SLUG = "falcon-vhnf";
const RESULTS_PATH = path.join(process.cwd(), "test-results", "confidence-consistency-falcon.json");
const PHOTO_PATH = path.join(process.cwd(), "scripts", "assets", "estimator-test-photo.jpg");
const RUNS_PER_JOB = 5;
const VAGUE_SELECTIONS = new Set(["other", "not sure"]);

type JobSpec = {
  jobName: string;
  address: string;
  service: CanonicalService;
  photoCount: number;
  answers: ServiceQuestionAnswers;
};

type RunResult = {
  jobName: string;
  runNumber: number;
  address: string;
  service: CanonicalService;
  questionnaireAnswers: ServiceQuestionAnswers;
  photoCount: number;
  serviceTier: string;
  serviceBaseline: number;
  vagueAnswerCount: number;
  nonVagueAnswerCount: number;
  photoAdjustment: number;
  capsOrFloorsTriggered: string[];
  finalConfidence: number;
};

const JOBS: JobSpec[] = [
  {
    jobName: "Job 1",
    address: "4700 King Arthur Way, Cheyenne, WY 82009",
    service: "Concrete",
    photoCount: 5,
    answers: {
      concrete_project_type: ["Driveway", "Walkway"],
      concrete_work_type: "Replacement",
      concrete_material: "Stamped or decorative concrete",
      concrete_scope: "Large (~600-1,500 sq ft)",
      concrete_site_condition: "Existing concrete needs removal"
    }
  },
  {
    jobName: "Job 2",
    address: "5417 Gateway Dr, Cheyenne, WY 82009",
    service: "Roofing",
    photoCount: 1,
    answers: {
      roofing_work_type: "Partial replacement",
      roofing_type: "Other",
      roofing_problem: "Storm or major damage",
      roofing_scope: "One area or slope",
      roofing_access: "Moderate"
    }
  },
  {
    jobName: "Job 3",
    address: "2139 Iron Mountain Rd, Cheyenne, WY 82009",
    service: "Other",
    photoCount: 1,
    answers: {
      other_outdoor_service: "Yes",
      other_work_type: "Cleaning",
      other_size: "Large",
      other_property_type: "Not sure",
      other_access: "Moderate"
    }
  }
];

function getAdminClient() {
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

async function loadPhotoDataUrl(): Promise<string> {
  const bytes = await readFile(PHOTO_PATH);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function buildPhotoUrls(photoDataUrl: string, count: number): string[] {
  return Array.from({ length: count }, () => photoDataUrl);
}

function countVagueAnswers(answers: ServiceQuestionAnswers): number {
  return Object.values(answers).reduce((count, value) => {
    const selections = parseQuestionAnswer(value);
    return count + selections.filter((selection) => VAGUE_SELECTIONS.has(selection.trim().toLowerCase())).length;
  }, 0);
}

function countNonVagueAnswers(answers: ServiceQuestionAnswers): number {
  return Object.values(answers).reduce((count, value) => {
    const selections = parseQuestionAnswer(value);
    return count + selections.filter((selection) => !VAGUE_SELECTIONS.has(selection.trim().toLowerCase())).length;
  }, 0);
}

function formatAnswers(answers: ServiceQuestionAnswers): string {
  return Object.entries(answers)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(" | ") : value}`)
    .join("; ");
}

function summarizeCapsOrFloors(input: {
  service: CanonicalService;
  rawScore: number;
  finalScore: number;
  floor: number;
  cap: number | null;
}): string[] {
  const triggered: string[] = [];

  if (input.finalScore > input.rawScore) {
    triggered.push(`service floor -> ${input.floor}`);
  }
  if (input.cap != null && input.finalScore < input.rawScore) {
    triggered.push(`${input.service} cap -> ${input.cap}`);
  }
  if (triggered.length === 0) {
    triggered.push("none");
  }

  return triggered;
}

function printRun(result: RunResult) {
  console.log(
    [
      `${result.jobName} run ${result.runNumber}`,
      `service tier ${result.serviceTier}`,
      `baseline ${result.serviceBaseline}`,
      `vague ${result.vagueAnswerCount}`,
      `non-vague ${result.nonVagueAnswerCount}`,
      `photos ${result.photoCount}`,
      `photo adj ${result.photoAdjustment >= 0 ? "+" : ""}${result.photoAdjustment}`,
      `caps/floors ${result.capsOrFloorsTriggered.join(", ")}`,
      `final ${result.finalConfidence}`
    ].join(" | ")
  );
}

async function main() {
  const admin = getAdminClient();
  const { data: contractor, error } = await admin
    .from("contractor_profile")
    .select("public_slug,business_name")
    .eq("public_slug", FALCON_CONTRACTOR_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Falcon contractor profile: ${error.message}`);
  }
  if (!contractor?.public_slug) {
    throw new Error(`Contractor slug ${FALCON_CONTRACTOR_SLUG} was not found.`);
  }

  const photoDataUrl = await loadPhotoDataUrl();
  const results: RunResult[] = [];

  console.log(`Using contractor slug: ${contractor.public_slug}`);
  console.log(`Business name: ${contractor.business_name ?? "(unknown)"}`);
  console.log(`Runs per job: ${RUNS_PER_JOB}`);
  console.log("");

  for (const job of JOBS) {
    console.log(`${job.jobName}`);
    console.log(`address: ${job.address}`);
    console.log(`service: ${job.service}`);
    console.log(`questionnaire: ${formatAnswers(job.answers)}`);
    console.log(`photo count: ${job.photoCount}`);

    for (let runNumber = 1; runNumber <= RUNS_PER_JOB; runNumber += 1) {
      const trace = await debugEstimateTrace({
        businessName: contractor.business_name ?? "Falcon Test Contractor",
        services: [job.service],
        serviceQuestionAnswers: [
          {
            service: job.service,
            answers: job.answers
          }
        ],
        address: job.address,
        description: "",
        photoUrls: buildPhotoUrls(photoDataUrl, job.photoCount)
      });

      const serviceEstimate = trace.engineEstimate.serviceEstimates[0];
      const confidenceTrace = serviceEstimate?.confidence_trace;
      const vagueAnswerCount = countVagueAnswers(job.answers);
      const nonVagueAnswerCount = countNonVagueAnswers(job.answers);
      const serviceConfig = getDeterministicConfidenceServiceConfig(job.service);
      const computed = computeRuleBasedConfidence({
        service: job.service,
        photoCount: job.photoCount,
        vagueAnswers: vagueAnswerCount,
        nonVagueSelections: nonVagueAnswerCount
      });
      const result: RunResult = {
        jobName: job.jobName,
        runNumber,
        address: job.address,
        service: job.service,
        questionnaireAnswers: job.answers,
        photoCount: job.photoCount,
        serviceTier: String(serviceConfig.tier),
        serviceBaseline: serviceConfig.baseline,
        vagueAnswerCount,
        nonVagueAnswerCount,
        photoAdjustment: deterministicPhotoConfidenceAdjustment(job.photoCount),
        capsOrFloorsTriggered: summarizeCapsOrFloors({
          service: job.service,
          rawScore: computed.rawScore,
          finalScore: confidenceTrace?.finalScore ?? Math.round(serviceEstimate.confidenceScore * 100),
          floor: computed.floor,
          cap: computed.cap
        }),
        finalConfidence: confidenceTrace?.finalScore ?? Math.round(serviceEstimate.confidenceScore * 100)
      };

      results.push(result);
      printRun(result);
    }

    const jobResults = results.filter((result) => result.jobName === job.jobName);
    const baselines = Array.from(new Set(jobResults.map((result) => result.serviceBaseline)));
    const finalScores = Array.from(new Set(jobResults.map((result) => result.finalConfidence)));

    console.log("summary:");
    console.log(`all 5 service baselines matched: ${baselines.length === 1 ? "yes" : "no"}${baselines.length === 1 ? ` (${baselines[0]})` : ` (${baselines.join(", ")})`}`);
    console.log(`all 5 final confidence scores matched: ${finalScores.length === 1 ? "yes" : "no"}${finalScores.length === 1 ? ` (${finalScores[0]})` : ` (${finalScores.join(", ")})`}`);
    if (baselines.length > 1 || finalScores.length > 1) {
      console.log(
        `variation: ${jobResults
          .map(
            (result) =>
              `run ${result.runNumber}: baseline ${result.serviceBaseline}, vague ${result.vagueAnswerCount}, non-vague ${result.nonVagueAnswerCount}, final ${result.finalConfidence}`
          )
          .join(" | ")}`
      );
    } else {
      console.log("variation: none");
    }
    console.log("");
  }

  await mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await writeFile(
    RESULTS_PATH,
    JSON.stringify(
      {
        contractorSlug: contractor.public_slug,
        contractorBusinessName: contractor.business_name ?? null,
        runsPerJob: RUNS_PER_JOB,
        results
      },
      null,
      2
    )
  );

  console.log(`Saved detailed results to ${RESULTS_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
