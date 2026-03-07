export const SERVICE_OPTIONS = [
  "Landscaping",
  "Lawn Care",
  "Fence",
  "Roofing",
  "Pressure Washing"
] as const;

export type ServiceType = (typeof SERVICE_OPTIONS)[number];

export const ORG_PLANS = ["SOLO", "TEAM", "BUSINESS"] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const MEMBER_ROLES = ["OWNER", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const LEAD_STATUS = ["NEW", "QUOTED", "ACCEPTED", "ARCHIVED"] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const QUOTE_STATUS = ["SENT", "VIEWED", "ACCEPTED", "EXPIRED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export type LeadAiOutput = {
  jobSummary: string;
  estimateLow: number;
  estimateHigh: number;
  suggestedPrice: number;
  draftMessage: string;
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
