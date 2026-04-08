import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional()
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEMO_ORG_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  TELNYX_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional()
});

export function getClientEnv(): z.infer<typeof clientEnvSchema> {
  return clientEnvSchema.parse(process.env);
}

export function getServerEnv(): z.infer<typeof serverEnvSchema> {
  return serverEnvSchema.parse(process.env);
}
