import { enforceServerOnly } from "@/lib/serverOnlyGuard";

enforceServerOnly();

/**
 * Invokes the `run-estimator` Supabase Edge Function for a given leadId.
 * The edge function drives the estimator on a decoupled runtime so the
 * caller (e.g. /api/public/lead-submit, /api/cron/rescue-stuck-leads)
 * can return immediately without holding the Vercel instance open for
 * the full AI call.
 *
 * Returns { ok: true } if the edge function accepted the request. The
 * actual estimator outcome is persisted by the edge function's upstream
 * via `ai_status` on the lead row — callers should not block on it.
 */
export async function triggerEstimatorForLead(
  leadId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const url = `${base}/functions/v1/run-estimator`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Edge Functions require the project's anon/service-role key.
        // We use service role here because this call originates from a
        // server-only code path; anon is rejected for invoke() on
        // functions that aren't publicly exposed.
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ leadId })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Edge function ${response.status}: ${detail.slice(0, 500)}`
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
