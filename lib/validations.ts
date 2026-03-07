import { z } from "zod";
import {
  LEAD_STATUS,
  MEMBER_ROLES,
  ORG_PLANS,
  QUOTE_STATUS,
  SERVICE_OPTIONS
} from "@/lib/types";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d().\-\s]{7,20}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const leadSubmitSchema = z
  .object({
    contractorSlug: z.string().min(3),
    customerName: z.string().min(2).max(120),
    customerPhone: phoneSchema,
    customerEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)),
    addressFull: z.string().min(5).max(240),
    addressPlaceId: z.string().optional(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    services: z.array(z.enum(SERVICE_OPTIONS)).min(1),
    description: z.string().max(2000).optional()
  })
  .superRefine((val, ctx) => {
    if (!val.customerPhone && !val.customerEmail) {
      ctx.addIssue({
        path: ["customerPhone"],
        code: z.ZodIssueCode.custom,
        message: "Provide phone or email."
      });
      ctx.addIssue({
        path: ["customerEmail"],
        code: z.ZodIssueCode.custom,
        message: "Provide phone or email."
      });
    }
  });

export const aiEstimateSchema = z.object({
  jobSummary: z.string().min(8).max(400),
  estimateLow: z.number().nonnegative(),
  estimateHigh: z.number().nonnegative(),
  suggestedPrice: z.number().nonnegative(),
  draftMessage: z.string().min(12).max(1200)
});

export const sendQuoteSchema = z.object({
  leadId: z.string().uuid(),
  price: z.number().positive(),
  message: z.string().min(12).max(2000)
});

export const updateSettingsSchema = z.object({
  businessName: z.string().min(2).max(120),
  publicSlug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notificationLeadSms: z.boolean(),
  notificationLeadEmail: z.boolean(),
  notificationAcceptSms: z.boolean(),
  notificationAcceptEmail: z.boolean()
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
  quoteStatus: z.enum(QUOTE_STATUS)
};
