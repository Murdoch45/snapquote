import type { ServiceType } from "@/lib/services";

export { SERVICE_OPTIONS } from "@/lib/services";
export type { ServiceType } from "@/lib/services";

export const ORG_PLANS = ["SOLO", "TEAM", "BUSINESS"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const MEMBER_ROLES = ["OWNER", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const LEAD_STATUS = ["NEW", "QUOTED", "ACCEPTED", "ARCHIVED"] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const QUOTE_STATUS = ["SENT", "VIEWED", "ACCEPTED", "EXPIRED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export const SERVICE_CATEGORIES = [
  "hardscape",
  "softscape",
  "fencing",
  "cleaning",
  "demolition",
  "grading",
  "pool",
  "deck",
  "irrigation",
  "other"
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const LEAD_CONFIDENCE = ["low", "medium", "high"] as const;
export type LeadConfidence = (typeof LEAD_CONFIDENCE)[number];

export type LeadAiCostBreakdown = {
  retaining_wall: number;
  walkway: number;
  patio: number;
  grading: number;
  landscaping: number;
  irrigation: number;
  fire_pit: number;
  fence: number;
  deck: number;
  cleaning: number;
  demo_removal: number;
  outdoor_living: number;
  regional_adjustment: number;
  travel_adjustment: number;
  terrain_adjustment: number;
  access_adjustment: number;
  material_tier_adjustment: number;
  minimum_job_adjustment: number;
};

export type LeadAiOutput = {
  snapQuote: number;
  message: string;
  summary: string;
  confidence?: LeadConfidence;
  confidenceScore?: number;
  serviceCategory?: ServiceCategory;
  jobType?: string;
  costBreakdown?: LeadAiCostBreakdown;
};

export type LeadFormPayload = {
  contractorSlug: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  addressFull: string;
  addressPlaceId?: string | null;
  lat?: number | null;
  lng?: number | null;
  services: ServiceType[];
  description?: string | null;
};

export type PlanUsageLimit = {
  limit: number | null;
  grace: number;
  hardStopAt: number | null;
};
