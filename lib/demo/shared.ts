export type DemoPageId =
  | "dashboard"
  | "leads"
  | "quotes"
  | "customers"
  | "analytics"
  | "my-link"
  | "plan"
  | "team"
  | "settings";

import { getPlanMonthlyCredits, getPlanSeatLimit } from "@/lib/plans";
import type { OrgPlan } from "@/lib/types";

export type DemoPlan = OrgPlan;

export const DEMO_BUSINESS_NAME = "Rivera's Pressure Washing";
export const DEMO_OWNER_NAME = "Carlos Rivera";
export const DEMO_USER_EMAIL = "demo@snapquote.us";
export const DEMO_LOCATION_LABEL = "Phoenix, AZ";
export const DEMO_ORG_SLUG = "demo-riveras-pressure-washing";
export const DEMO_PUBLIC_SLUG = "riveras-pressure-washing";
export const DEMO_PLAN: DemoPlan = "BUSINESS";

export const demoPageLabels: Record<DemoPageId, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  quotes: "Estimates",
  customers: "Customers",
  analytics: "Analytics",
  "my-link": "My Link",
  plan: "Plan",
  team: "Team",
  settings: "Settings"
};

export type DemoMetric = {
  title: string;
  value: string;
  subtext?: string;
};

export type DemoShellData = {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  location: string;
  publicSlug: string;
  plan: DemoPlan;
  planLabel: string;
  pageTitle: string;
  totalCredits: number;
  requestLink: string;
};

export type DemoLeadItem = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  services: string[];
  addressFull: string;
  cityState: string;
  submittedAt: string;
  status: string;
  aiEstimateLow: number | null;
  aiEstimateHigh: number | null;
  aiSuggestedPrice: number | null;
  aiJobSummary: string | null;
  photoCount: number;
  isUnlocked: boolean;
};

export type DemoQuoteItem = {
  id: string;
  publicId: string;
  customerName: string;
  services: string[];
  addressFull: string;
  cityState: string;
  status: string;
  price: number | null;
  estimatedPriceLow: number | null;
  estimatedPriceHigh: number | null;
  sentAt: string;
  viewedAt: string | null;
  acceptedAt: string | null;
};

export type DemoCustomerItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
};

export type DemoMemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export type DemoInviteItem = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export type DemoTrendPoint = {
  date: string;
  count: number;
};

export type DemoAcceptancePoint = {
  date: string;
  rate: number;
};

export type DemoServiceBreakdownItem = {
  name: string;
  value: number;
};

export type DashboardPayload = {
  metrics: DemoMetric[];
  recentLeads: DemoLeadItem[];
  statusSummary: Array<{ label: string; value: string }>;
  serviceBreakdown: DemoServiceBreakdownItem[];
};

export type LeadsPayload = {
  creditsRemaining: number;
  leads: DemoLeadItem[];
};

export type QuotesPayload = {
  quotes: DemoQuoteItem[];
  awaitingApprovalCount: number;
  acceptedCount: number;
  avgApprovalCycleDays: string;
};

export type CustomersPayload = {
  customers: DemoCustomerItem[];
};

export type AnalyticsPayload = {
  metrics: DemoMetric[];
  leadsOverTime: DemoTrendPoint[];
  quotesOverTime: DemoTrendPoint[];
  acceptanceRateOverTime: DemoAcceptancePoint[];
  servicesBreakdown: DemoServiceBreakdownItem[];
};

export type MyLinkPayload = {
  requestLink: string;
  socialCaption: string;
  monthlyRequests: number;
  avgResponseMinutes: number;
  previewMetrics: Array<{ label: string; value: string }>;
};

export type PlanPayload = {
  planLabel: string;
  priceLabel: string;
  monthlyCreditsRemaining: number;
  monthlyCreditsLimit: number;
  bonusCredits: number;
  totalCredits: number;
  creditsResetLabel: string | null;
  seatsUsed: number;
  seatsLimit: number;
  highlights: string[];
};

export type TeamPayload = {
  members: DemoMemberItem[];
  invites: DemoInviteItem[];
  seatsUsed: number;
  seatsLimit: number;
};

export type SettingsPayload = {
  businessName: string;
  publicSlug: string;
  phone: string | null;
  email: string | null;
  businessAddress: string | null;
  enabledServices: string[];
  notifications: string[];
  quoteSmsTemplate: string | null;
};

export type DemoPagePayloadMap = {
  dashboard: DashboardPayload;
  leads: LeadsPayload;
  quotes: QuotesPayload;
  customers: CustomersPayload;
  analytics: AnalyticsPayload;
  "my-link": MyLinkPayload;
  plan: PlanPayload;
  team: TeamPayload;
  settings: SettingsPayload;
};

export type DemoApiResponse<P extends DemoPageId = DemoPageId> = {
  page: P;
  shell: DemoShellData;
  payload: DemoPagePayloadMap[P];
};

export function getPlanDisplayName(plan: DemoPlan): string {
  if (plan === "SOLO") return "Solo";
  if (plan === "TEAM") return "Team";
  return "Business";
}

export function getPlanPriceLabel(plan: DemoPlan): string {
  if (plan === "SOLO") return "Free";
  if (plan === "TEAM") return "$19/month";
  return "$39/month";
}

export { getPlanMonthlyCredits, getPlanSeatLimit };
