import { formatServiceQuestionAnswers, parseServiceQuestionBundles } from "@/lib/serviceQuestions";

export type LeadQuestionPreview = {
  key: string;
  label: string;
  value: string;
};

export function getVisibleAddress(address: string): string {
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
