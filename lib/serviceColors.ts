// Single source of truth for service-type colors across web and mobile.
//
// This file MUST stay byte-identical between SnapQuote/lib/serviceColors.ts
// and SnapQuote-mobile/lib/serviceColors.ts. Cross-repo sharing is done via
// duplicated-identical files (same convention as lib/plans.ts,
// lib/socialCaption.ts, lib/analyticsTypes.ts) because there is no shared
// npm package. Any edit here needs the matching edit on the other side.
//
// The canonical map is keyed by the exact service strings used in both
// repos' SERVICE_OPTIONS / SERVICE_TYPES constants. The fuzzy fallback
// below catches legacy free-form inputs on the web side ("lawn care",
// "Landscaping / Installation", etc.) — new callers should pass exact
// service names and hit the fast path.

export type ServiceColor = {
  background: string;
  text: string;
  chart: string;
  // Tailwind utility string used by the web's shadcn Badge component.
  // Mobile ignores this field.
  badgeClassName: string;
};

export const DEFAULT_SERVICE_COLOR: ServiceColor = {
  background: "#F3F4F6",
  text: "#374151",
  chart: "#374151",
  badgeClassName: "border-transparent bg-[#F3F4F6] text-[#374151]"
};

export const SERVICE_COLORS: Record<string, ServiceColor> = {
  "Pressure Washing": {
    background: "#DBEAFE",
    text: "#1D4ED8",
    chart: "#1D4ED8",
    badgeClassName: "border-transparent bg-[#DBEAFE] text-[#1D4ED8]"
  },
  "Gutter Cleaning": {
    background: "#E0F2FE",
    text: "#0369A1",
    chart: "#0369A1",
    badgeClassName: "border-transparent bg-[#E0F2FE] text-[#0369A1]"
  },
  "Window Cleaning": {
    background: "#CFFAFE",
    text: "#0E7490",
    chart: "#0E7490",
    badgeClassName: "border-transparent bg-[#CFFAFE] text-[#0E7490]"
  },
  "Pool Service / Cleaning": {
    background: "#CCFBF1",
    text: "#0F766E",
    chart: "#0F766E",
    badgeClassName: "border-transparent bg-[#CCFBF1] text-[#0F766E]"
  },
  "Lawn Care / Maintenance": {
    background: "#DCFCE7",
    text: "#15803D",
    chart: "#15803D",
    badgeClassName: "border-transparent bg-[#DCFCE7] text-[#15803D]"
  },
  "Landscaping / Installation": {
    background: "#D1FAE5",
    text: "#065F46",
    chart: "#065F46",
    badgeClassName: "border-transparent bg-[#D1FAE5] text-[#065F46]"
  },
  "Tree Service / Removal": {
    background: "#FEF3C7",
    text: "#92400E",
    chart: "#92400E",
    badgeClassName: "border-transparent bg-[#FEF3C7] text-[#92400E]"
  },
  "Fence Installation / Repair": {
    background: "#FFEDD5",
    text: "#C2410C",
    chart: "#C2410C",
    badgeClassName: "border-transparent bg-[#FFEDD5] text-[#C2410C]"
  },
  Concrete: {
    background: "#E2E8F0",
    text: "#475569",
    chart: "#475569",
    badgeClassName: "border-transparent bg-[#E2E8F0] text-[#475569]"
  },
  "Deck Installation / Repair": {
    background: "#FEF9C3",
    text: "#854D0E",
    chart: "#854D0E",
    badgeClassName: "border-transparent bg-[#FEF9C3] text-[#854D0E]"
  },
  "Exterior Painting": {
    background: "#F3E8FF",
    text: "#7E22CE",
    chart: "#7E22CE",
    badgeClassName: "border-transparent bg-[#F3E8FF] text-[#7E22CE]"
  },
  Roofing: {
    background: "#FEE2E2",
    text: "#B91C1C",
    chart: "#B91C1C",
    badgeClassName: "border-transparent bg-[#FEE2E2] text-[#B91C1C]"
  },
  "Junk Removal": {
    background: "#F4F4F5",
    text: "#3F3F46",
    chart: "#3F3F46",
    badgeClassName: "border-transparent bg-[#F4F4F5] text-[#3F3F46]"
  },
  "Outdoor Lighting Installation": {
    background: "#FEF08A",
    text: "#854D0E",
    chart: "#854D0E",
    badgeClassName: "border-transparent bg-[#FEF08A] text-[#854D0E]"
  },
  Other: {
    background: "#F3F4F6",
    text: "#374151",
    chart: "#374151",
    badgeClassName: "border-transparent bg-[#F3F4F6] text-[#374151]"
  }
};

// Fuzzy substring matchers for legacy callers that pass free-form strings
// ("lawn care", "pressure washing", etc.) instead of the canonical keys.
// Exact lookups against SERVICE_COLORS are tried first.
const FUZZY_PATTERNS: Array<{ match: RegExp; key: string }> = [
  { match: /pressure washing/i, key: "Pressure Washing" },
  { match: /gutter/i, key: "Gutter Cleaning" },
  { match: /window/i, key: "Window Cleaning" },
  { match: /pool/i, key: "Pool Service / Cleaning" },
  { match: /lawn care/i, key: "Lawn Care / Maintenance" },
  { match: /landscap/i, key: "Landscaping / Installation" },
  { match: /tree/i, key: "Tree Service / Removal" },
  { match: /fenc/i, key: "Fence Installation / Repair" },
  { match: /concrete/i, key: "Concrete" },
  { match: /deck/i, key: "Deck Installation / Repair" },
  { match: /painting/i, key: "Exterior Painting" },
  { match: /roof/i, key: "Roofing" },
  { match: /junk/i, key: "Junk Removal" },
  { match: /lighting/i, key: "Outdoor Lighting Installation" },
  { match: /other/i, key: "Other" }
];

export function getServiceColor(service: string | null | undefined): ServiceColor {
  if (!service) return DEFAULT_SERVICE_COLOR;
  const exact = SERVICE_COLORS[service];
  if (exact) return exact;
  const normalized = service.trim();
  const match = FUZZY_PATTERNS.find((p) => p.match.test(normalized));
  return match ? SERVICE_COLORS[match.key] : DEFAULT_SERVICE_COLOR;
}

export function getServiceBadgeClassName(service: string | null | undefined): string {
  return getServiceColor(service).badgeClassName;
}

export function getServiceBadgeStyle(
  service: string | null | undefined
): { backgroundColor: string; color: string } {
  const color = getServiceColor(service);
  return { backgroundColor: color.background, color: color.text };
}

export function getServiceChartColor(service: string | null | undefined): string {
  return getServiceColor(service).chart;
}
