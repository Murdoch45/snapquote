import { z } from "zod";
import { toE164UsPhone } from "@/lib/phone";
import {
  getRequiredQuestionIssues,
  parseServiceQuestionBundles,
  type ServiceQuestionAnswers
} from "@/lib/serviceQuestions";
import { SERVICE_OPTIONS } from "@/lib/services";
import { QUOTE_STATUSES } from "@/lib/quoteStatus";
import {
  LEAD_STATUS,
  MEMBER_ROLES,
  ORG_PLANS
} from "@/lib/types";

// Re-export the shared quote-send schema so existing callers
// (`@/lib/validations`) keep working. The authoritative definition lives
// in the cross-repo-shared lib/quoteSendSchema.ts.
export { sendQuoteSchema } from "@/lib/quoteSendSchema";
export type { SendQuoteInput } from "@/lib/quoteSendSchema";

// Lead-submit phone schema: validates the user's free-form input, then
// normalizes to E.164. The transform is the single source-of-truth for
// the format that lands in `leads.customer_phone` going forward — every
// downstream consumer (customer dedup lookup, lead insert, notifyCustomer
// SMS send) sees `+1XXXXXXXXXX` consistently. Inputs that can't be
// confidently normalized (too short, no country code we can infer) fall
// through as `undefined` rather than corrupting the row, mirroring the
// existing "missing phone" behavior so the lead still saves.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d().\-\s]{7,20}$/)
  .transform((value) => toE164UsPhone(value) ?? undefined)
  .optional()
  .or(z.literal("").transform(() => undefined));

const serviceQuestionAnswerValueSchema = z.union([z.string(), z.array(z.string())]);

const serviceQuestionAnswerBundleSchema = z.object({
  service: z.enum(SERVICE_OPTIONS),
  answers: z.record(serviceQuestionAnswerValueSchema)
});

export const leadSubmitSchema = z
  .object({
    contractorSlug: z.string().min(3),
    customerName: z.string().min(2).max(120),
    customerPhone: phoneSchema,
    customerEmail: z.string().email(),
    addressFull: z.string().min(5).max(240),
    addressPlaceId: z.string().trim().min(1, "Select an address from the Google suggestions."),
    lat: z.number().finite(),
    lng: z.number().finite(),
    services: z.array(z.enum(SERVICE_OPTIONS)).min(1),
    description: z.string().max(2000).optional(),
    serviceQuestionAnswers: z.array(serviceQuestionAnswerBundleSchema),
    photoCount: z
      .number()
      .int()
      .min(1, "Upload at least one photo before submitting.")
      .max(10, "Upload up to 10 photos before submitting.")
  })
  .superRefine((val, ctx) => {
    if (val.serviceQuestionAnswers.length !== val.services.length) {
      ctx.addIssue({
        path: ["serviceQuestionAnswers"],
        code: z.ZodIssueCode.custom,
        message: "Answer all required service questions before submitting."
      });
      return;
    }

    val.services.forEach((service, index) => {
      const bundle = val.serviceQuestionAnswers[index];
      if (!bundle || bundle.service !== service) {
        ctx.addIssue({
          path: ["serviceQuestionAnswers", index, "service"],
          code: z.ZodIssueCode.custom,
          message: `Missing required questions for ${service}.`
        });
        return;
      }

      const issues = getRequiredQuestionIssues(service, bundle.answers as ServiceQuestionAnswers);
      for (const issue of issues) {
        ctx.addIssue({
          path: ["serviceQuestionAnswers", index, "answers", issue.key],
          code: z.ZodIssueCode.custom,
          message: issue.message
        });
      }
    });
  });

export function parseLeadSubmitQuestionAnswers(value: unknown) {
  return parseServiceQuestionBundles(value);
}

export const updateSettingsSchema = z.object({
  businessName: z.string().min(2).max(120),
  publicSlug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  // Normalize the contractor's own phone to E.164 too — `lib/notify.ts:
  // notifyContractor` sends SMS to `contractor_profile.phone` for new-lead
  // and estimate-accepted notifications, so a 10-digit input here would
  // silently fail Telnyx the same way customer phones did. An empty
  // string clears the field; an unparseable input falls through to null.
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null) return value;
      const trimmed = value.trim();
      if (!trimmed) return null;
      return toE164UsPhone(trimmed);
    }),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  services: z.preprocess(
    (value) => (Array.isArray(value) && value.length === 0 ? undefined : value),
    z.array(z.enum(SERVICE_OPTIONS)).min(1).optional()
  ),
  businessAddressFull: z.string().max(240).optional().nullable(),
  businessAddressPlaceId: z.string().optional().nullable(),
  businessLat: z.number().finite().optional().nullable(),
  businessLng: z.number().finite().optional().nullable(),
  quoteSmsTemplate: z.string().max(4000).optional().nullable(),
  travelPricingDisabled: z.boolean(),
  notificationLeadEmail: z.boolean(),
  notificationAcceptEmail: z.boolean()
}).superRefine((val, ctx) => {
  if (val.travelPricingDisabled) return;

  if (!val.businessAddressFull?.trim()) {
    ctx.addIssue({
      path: ["businessAddressFull"],
      code: z.ZodIssueCode.custom,
      message: "Business address is required unless travel distance is disabled."
    });
  }

  if (!val.businessAddressPlaceId?.trim()) {
    ctx.addIssue({
      path: ["businessAddressPlaceId"],
      code: z.ZodIssueCode.custom,
      message: "Select a business address from Google suggestions."
    });
  }

  if (val.businessLat == null || val.businessLng == null) {
    ctx.addIssue({
      path: ["businessLat"],
      code: z.ZodIssueCode.custom,
      message: "Business address coordinates are required."
    });
  }
});

export const inviteTeamSchema = z.object({
  email: z.string().email()
});

export const removeTeamSchema = z.object({
  memberUserId: z.string().uuid()
});

export const enumSchemas = {
  orgPlan: z.enum(ORG_PLANS),
  memberRole: z.enum(MEMBER_ROLES),
  leadStatus: z.enum(LEAD_STATUS),
  quoteStatus: z.enum(QUOTE_STATUSES)
};
