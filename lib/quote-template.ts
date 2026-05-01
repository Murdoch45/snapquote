import { getAppUrl } from "@/lib/utils";

export const CUSTOMER_NAME_TOKEN = "{{customer_name}}";
export const ESTIMATE_LINK_TOKEN = "{{estimate_link}}";
export const COMPANY_NAME_TOKEN = "{{company_name}}";
export const CONTRACTOR_PHONE_TOKEN = "{{contractor_phone}}";
export const CONTRACTOR_EMAIL_TOKEN = "{{contractor_email}}";

// Backward compat
export const QUOTE_LINK_TOKEN = ESTIMATE_LINK_TOKEN;

export function buildDefaultEstimateTemplate(): string {
  // The trailing "Reply STOP to opt out" line is the 10DLC compliance
  // footer required by US carriers for A2P SMS. It must remain on the
  // first message a customer receives in a conversation; we keep it on
  // the default estimate template so contractors who never customize
  // their SMS message stay compliant by default. Contractors can edit
  // their template in profile settings, but the footer is always
  // appended by lib/notify.ts at send time so removing it from the
  // template never lands a non-compliant outbound message.
  return `Hi ${CUSTOMER_NAME_TOKEN},
Here is your estimate from ${COMPANY_NAME_TOKEN}.
View your estimate:
${ESTIMATE_LINK_TOKEN}
Questions? Call or email ${CONTRACTOR_PHONE_TOKEN} ${CONTRACTOR_EMAIL_TOKEN}

Reply STOP to opt out.`;
}

export const DEFAULT_ESTIMATE_SMS_TEMPLATE = buildDefaultEstimateTemplate();

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

  if (vars.companyName != null) result = result.replaceAll(COMPANY_NAME_TOKEN, vars.companyName);
  if (vars.contractorPhone != null) result = result.replaceAll(CONTRACTOR_PHONE_TOKEN, vars.contractorPhone);
  if (vars.contractorEmail != null) result = result.replaceAll(CONTRACTOR_EMAIL_TOKEN, vars.contractorEmail);

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
