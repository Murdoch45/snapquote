import { createClient } from "@supabase/supabase-js";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";

enforceServerOnly();

let adminClient: ReturnType<typeof createClient<any>> | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  adminClient = createClient<any>(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return adminClient;
}
