import { getAppUrl } from "@/lib/utils";

export const CUSTOMER_NAME_TOKEN = "{{customer_name}}";
export const ESTIMATE_LINK_TOKEN = "{{estimate_link}}";

// Backward compat
export const QUOTE_LINK_TOKEN = ESTIMATE_LINK_TOKEN;

export function buildDefaultEstimateTemplate(
  companyName: string,
  phone: string,
  email: string
): string {
  return `Hi {{customer_name}},

Here is your estimate from ${companyName}.

View your estimate:
{{estimate_link}}

Questions? Call or email ${phone} ${email}`;
}

export const DEFAULT_ESTIMATE_SMS_TEMPLATE = buildDefaultEstimateTemplate(
  "Your Company",
  "Your Phone Number",
  "your@email.com"
);

// Backward compat
export const DEFAULT_QUOTE_SMS_TEMPLATE = DEFAULT_ESTIMATE_SMS_TEMPLATE;

type EstimateTemplateVars = {
  customerName: string;
  estimateLink: string;
  companyName?: string;
  contractorPhone?: string;
  contractorEmail?: string;
};

export function getDisplayCustomerName(customerName: string | null | undefined): string {
  const trimmed = customerName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Customer";
}

export function getCustomerFirstName(customerName: string | null | undefined): string {
  const firstName = customerName?.trim().split(/\s+/)[0];
  return firstName && firstName.length > 0 ? firstName : "Customer";
}

export function buildEstimateLink(publicId: string): string {
  return `${getAppUrl()}/q/${publicId}`;
}

// Backward compat
export const buildQuoteLink = buildEstimateLink;

export function renderEstimateTemplate(template: string, vars: EstimateTemplateVars): string {
  let result = template
    .replaceAll(CUSTOMER_NAME_TOKEN, vars.customerName)
    .replaceAll(ESTIMATE_LINK_TOKEN, vars.estimateLink)
    .replaceAll("{{quote_link}}", vars.estimateLink);

  if (vars.companyName != null) result = result.replaceAll("{{company_name}}", vars.companyName);
  if (vars.contractorPhone != null) result = result.replaceAll("{{contractor_phone}}", vars.contractorPhone);
  if (vars.contractorEmail != null) result = result.replaceAll("{{contractor_email}}", vars.contractorEmail);

  return result;
}

// Backward compat
export const renderQuoteTemplate = renderEstimateTemplate;

export function sanitizeEstimateTemplate(template: string | null | undefined): string {
  const trimmed = template?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_ESTIMATE_SMS_TEMPLATE;
}

// Backward compat
export const sanitizeQuoteTemplate = sanitizeEstimateTemplate;
