// Supabase Edge Function: run-estimator
//
// Decouples the AI estimator from the /api/public/lead-submit request
// lifecycle. The lead-submit route invokes this function asynchronously
// after it has persisted the lead row and uploaded photos, then returns
// to the browser immediately. Because this function runs on Supabase's
// own Deno runtime (not the Vercel serverless instance that served
// lead-submit), Vercel reclaiming that instance after the HTTP response
// cannot kill the estimator mid-run anymore — which was the root cause
// of the "lead stuck at ai_status='processing' with no notification"
// outages.
//
// This function is a thin orchestrator. It calls back into a guarded
// Next.js endpoint (/api/internal/run-estimator) which hosts the actual
// ~4.6k lines of estimator logic, prompts, property-data lookups,
// regional cost models, and structured-output parsing. Porting that
// surface to Deno wholesale would be a major migration; the benefit the
// edge function provides (a decoupled, durable trigger) is achieved by
// the hand-off alone.
//
// Expected invocation:
//   supabase.functions.invoke("run-estimator", { body: { leadId } })
// or an HTTP POST with JSON body { "leadId": "<uuid>" } and the
// standard Supabase `Authorization: Bearer <anon or service-role>` and
// `apikey` headers.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno runtime; types resolved at deploy time by Supabase.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type RequestBody = {
  leadId?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: RequestBody;
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const leadId = payload.leadId;
  if (typeof leadId !== "string" || leadId.length === 0) {
    return jsonResponse({ error: "leadId is required" }, 400);
  }

  let appUrl: string;
  let internalSecret: string;
  try {
    appUrl = getRequiredEnv("APP_URL").replace(/\/$/, "");
    internalSecret = getRequiredEnv("INTERNAL_API_SECRET");
  } catch (error) {
    console.error("run-estimator config error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }

  const target = `${appUrl}/api/internal/run-estimator`;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret
      },
      body: JSON.stringify({ leadId })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `run-estimator upstream returned ${response.status}: ${detail.slice(0, 500)}`
      );
      return jsonResponse(
        {
          ok: false,
          upstreamStatus: response.status,
          detail: detail.slice(0, 1000)
        },
        502
      );
    }

    return jsonResponse({ ok: true, leadId }, 200);
  } catch (error) {
    console.error("run-estimator upstream fetch failed:", error);
    return jsonResponse({ ok: false, error: (error as Error).message }, 502);
  }
});
