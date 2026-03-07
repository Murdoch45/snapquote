import OpenAI from "openai";
import { z } from "zod";
import { aiEstimateSchema } from "@/lib/validations";
import type { LeadAiOutput } from "@/lib/types";

const fallbackSchema = z.object({
  jobSummary: z.string(),
  estimateLow: z.number(),
  estimateHigh: z.number(),
  suggestedPrice: z.number(),
  draftMessage: z.string()
});

type EstimateInput = {
  businessName: string;
  services: string[];
  address: string;
  description?: string | null;
  photoUrls: string[];
};

export function buildPrompt(input: EstimateInput): string {
  return [
    "You are a careful estimator for outdoor service contractors.",
    "Return JSON only, no markdown, no commentary.",
    "Be conservative and avoid overconfidence.",
    "If details are missing, widen estimate range and mention needs review in jobSummary.",
    "Output schema: {\"jobSummary\": string, \"estimateLow\": number, \"estimateHigh\": number, \"suggestedPrice\": number, \"draftMessage\": string}.",
    "Rules:",
    "- estimateLow <= suggestedPrice <= estimateHigh",
    "- All numbers in USD, integer values",
    "- draftMessage should be customer-ready and signed as the contractor business name",
    `Contractor business name: ${input.businessName}`,
    `Services: ${input.services.join(", ")}`,
    `Address: ${input.address}`,
    `Customer description: ${input.description || "No additional details"}`,
    `Photo URLs (may be empty): ${input.photoUrls.join(", ") || "None"}`
  ].join("\n");
}

export function fallbackEstimate(input: EstimateInput): LeadAiOutput {
  return {
    jobSummary:
      "Preliminary estimate only. Details are limited and this request needs contractor review before final pricing.",
    estimateLow: 250,
    estimateHigh: 2500,
    suggestedPrice: 900,
    draftMessage: `Thanks for reaching out. Based on the details so far, a preliminary range is $250-$2,500. A fair starting quote is around $900, pending final on-site review. - ${input.businessName}`
  };
}

export async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You generate conservative contractor estimates. Respond with strict JSON only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("OpenAI returned empty response.");
  }
  return text;
}

export function parseAiOutput(raw: string): LeadAiOutput {
  const parsedJson = JSON.parse(raw);
  const parsed = aiEstimateSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("AI output failed validation.");
  const { estimateLow, estimateHigh, suggestedPrice } = parsed.data;
  if (!(estimateLow <= suggestedPrice && suggestedPrice <= estimateHigh)) {
    throw new Error("AI pricing relation invalid.");
  }
  return parsed.data;
}

export async function generateEstimate(input: EstimateInput): Promise<LeadAiOutput> {
  try {
    const prompt = buildPrompt(input);
    const raw = await callOpenAI(prompt);
    const parsed = parseAiOutput(raw);
    return parsed;
  } catch {
    const fallback = fallbackEstimate(input);
    // Ensure fallback shape is always valid.
    return fallbackSchema.parse(fallback);
  }
}
