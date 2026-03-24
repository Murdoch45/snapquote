import { getAppUrl } from "@/lib/utils";

export const CUSTOMER_NAME_TOKEN = "{{customer_name}}";
export const QUOTE_LINK_TOKEN = "{{quote_link}}";

export const DEFAULT_QUOTE_SMS_TEMPLATE = `Hi {{customer_name}},

Here is your estimate from {{company_name}}.

View your estimate:
{{quote_link}}

Questions? Call or email:
{{contractor_phone}}
{{contractor_email}}`;

type QuoteTemplateVars = {
  customerName: string;
  companyName: string;
  quoteLink: string;
  contractorPhone: string;
  contractorEmail: string;
};

export function getDisplayCustomerName(customerName: string | null | undefined): string {
  const trimmed = customerName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Customer";
}

export function getCustomerFirstName(customerName: string | null | undefined): string {
  const firstName = customerName?.trim().split(/\s+/)[0];
  return firstName && firstName.length > 0 ? firstName : "Customer";
}

export function buildQuoteLink(publicId: string): string {
  return `${getAppUrl()}/q/${publicId}`;
}

export function renderQuoteTemplate(template: string, vars: QuoteTemplateVars): string {
  return template
    .replaceAll(CUSTOMER_NAME_TOKEN, vars.customerName)
    .replaceAll("{{company_name}}", vars.companyName)
    .replaceAll(QUOTE_LINK_TOKEN, vars.quoteLink)
    .replaceAll("{{contractor_phone}}", vars.contractorPhone)
    .replaceAll("{{contractor_email}}", vars.contractorEmail);
}

export function sanitizeQuoteTemplate(template: string | null | undefined): string {
  const trimmed = template?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_QUOTE_SMS_TEMPLATE;
}

export function renderCustomerNamePreview(
  template: string,
  customerName: string | null | undefined
): string {
  return template.replaceAll(CUSTOMER_NAME_TOKEN, getCustomerFirstName(customerName));
}
