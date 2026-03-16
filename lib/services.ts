export const SERVICE_OPTIONS = [
  "Pressure Washing",
  "Gutter Cleaning",
  "Window Cleaning",
  "Pool Service / Cleaning",
  "Lawn Care / Maintenance",
  "Landscaping / Installation",
  "Tree Service / Removal",
  "Fence Installation / Repair",
  "Concrete",
  "Deck Installation / Repair",
  "Exterior Painting",
  "Roofing",
  "Junk Removal",
  "Outdoor Lighting Installation",
  "Other"
] as const;

export type ServiceType = (typeof SERVICE_OPTIONS)[number];

const serviceOptionSet = new Set<string>(SERVICE_OPTIONS);

export function isServiceType(value: string): value is ServiceType {
  return serviceOptionSet.has(value);
}

export function normalizeServiceTypes(values: readonly string[]): ServiceType[] {
  return Array.from(new Set(values.filter(isServiceType)));
}

export function parseServiceTypesParam(value?: string | null): ServiceType[] {
  if (!value) return [];
  return normalizeServiceTypes(value.split("|").map((item) => item.trim()));
}
