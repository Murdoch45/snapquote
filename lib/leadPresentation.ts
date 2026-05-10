import { formatServiceQuestionAnswers, parseServiceQuestionBundles } from "@/lib/serviceQuestions";

export type LeadQuestionPreview = {
  key: string;
  label: string;
  value: string;
};

export function getVisibleAddress(address: string | null | undefined): string {
  // address_full comes back NULL from leads_safe when the lead is locked
  // (Audit 8 C2 — view gates PII by lead_unlocks). Caller branches that
  // hit this helper in the locked path used to assume a string and would
  // crash; the early return preserves the prior placeholder semantics.
  if (!address) return "Address hidden";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return "Address hidden";
  return parts.slice(1).join(", ");
}

export function getAddressParts(address: string | null | undefined): {
  street: string;
  locality: string;
} {
  if (!address) {
    return {
      street: "Address hidden",
      locality: "Location unavailable"
    };
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return {
      street: address,
      locality: address
    };
  }

  return {
    street: parts[0],
    locality: parts.slice(1).join(", ")
  };
}

// Locked-lead address display: city/state/zip ONLY (no street, no house
// number). job_city/job_state/job_zip are returned unconditionally by
// leads_safe (Audit 8 C2 only gates true PII — address_full, customer_*,
// lat/lng, etc.), so use them as the source of truth for locality. The
// address_full fallback handles legacy rows from before job_city was
// backfilled — parsing the comma-separated string yields the same
// "City, State Zip" shape that the dedicated columns produce.
export function composeLocality(args: {
  jobCity?: string | null;
  jobState?: string | null;
  jobZip?: string | null;
  addressFull?: string | null;
}): string {
  const city = args.jobCity?.trim() || null;
  const state = args.jobState?.trim() || null;
  const zip = args.jobZip?.trim() || null;
  if (city && state) {
    return zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`;
  }
  if (city) return zip ? `${city} ${zip}` : city;
  if (state) return zip ? `${state} ${zip}` : state;
  return getAddressParts(args.addressFull ?? null).locality;
}

export function getLeadQuestionPreview(serviceQuestionAnswers: unknown, limit = 3): LeadQuestionPreview[] {
  const serviceQuestionBundles = parseServiceQuestionBundles(serviceQuestionAnswers);
  return serviceQuestionBundles
    .flatMap((bundle) => formatServiceQuestionAnswers(bundle.service, bundle.answers))
    .slice(0, limit);
}

export function getLeadJobType(serviceQuestionAnswers: unknown, services: string[]): string {
  const answers = getLeadQuestionPreview(serviceQuestionAnswers, 10);
  const preferred =
    answers.find((answer) => answer.label === "Job type") ??
    answers.find((answer) => answer.label === "Need help with");

  if (preferred?.value) {
    return preferred.value;
  }

  return services[0] ?? "Unknown";
}
