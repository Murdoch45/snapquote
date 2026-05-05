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

// UUID v4 is the canonical client-generated tempLeadId / lead.id used by
// the pre-submit photo upload flow. The client picks the UUID at form
// mount, photos upload to a path keyed on it, and lead-submit creates
// the lead row with this exact id so the photo paths and lead row share
// the same identifier with no rename. Validated as v4 specifically so a
// caller can't supply something pathological (timestamp UUID, nil UUID,
// etc.) that would still parse as "a uuid" but break path conventions.
const uuidV4Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "tempLeadId must be a v4 UUID"
  );

const photoStoragePathSchema = z.object({
  storagePath: z.string().min(1).max(500),
  publicUrl: z.string().url().max(2000)
});

export const leadSubmitSchema = z
  .object({
    contractorSlug: z.string().min(3),
    tempLeadId: uuidV4Schema,
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
    // Storage paths the client believes have already finished uploading
    // via /api/public/lead-photo-upload at submit time. May be empty if
    // every picked photo is still mid-upload; in-flight uploads will
    // attach themselves to the just-created lead row when they complete.
    // Capped at 10 to match MAX_PHOTO_UPLOADS.
    photoStoragePaths: z.array(photoStoragePathSchema).max(10).default([])
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

// Validates the multipart fields on /api/public/lead-photo-upload. The
// File itself is validated by content-type / size in the route handler;
// this schema only covers the text fields.
export const leadPhotoUploadSchema = z.object({
  contractorSlug: z.string().min(3),
  tempLeadId: uuidV4Schema
});

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
