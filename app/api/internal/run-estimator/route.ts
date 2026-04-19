import { NextResponse } from "next/server";
import { generateEstimateAsync } from "@/lib/ai/estimate";

export const runtime = "nodejs";
// The estimator gets the full Vercel function budget on this endpoint. It
// is invoked by the run-estimator Supabase Edge Function (which is
// decoupled from the original lead-submit request), so there is no budget
// shared with the uploader / response path anymore.
export const maxDuration = 60;

/**
 * Internal endpoint that runs the AI estimator for one lead. Authenticated
 * by a shared secret and only intended to be called by the run-estimator
 * Supabase Edge Function — which is itself invoked asynchronously by
 * `/api/public/lead-submit` once the lead row + photos are persisted.
 *
 * Keeping the estimator in Next.js (rather than porting ~4600 lines of
 * Node-only logic, OpenAI prompts, regional cost models, and property-data
 * calls to Deno) lets us reuse all of the existing estimator code while
 * still getting the core benefit of the Edge Function hand-off: the
 * estimator no longer runs inside the lead-submit request's after() block,
 * so it can't be killed when Vercel reclaims that instance.
 */
export async function POST(request: Request) {
  const provided = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET is not configured on the server." },
      { status: 500 }
    );
  }

  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leadId: string;
  try {
    const body = (await request.json()) as { leadId?: unknown };
    if (typeof body.leadId !== "string" || body.leadId.length === 0) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    leadId = body.leadId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // generateEstimateAsync swallows its own errors and writes a terminal
  // ai_status ("ready" or "failed") plus notifications. We don't need
  // another try/catch here — any throw out of it is genuinely unexpected
  // and should surface to Sentry.
  await generateEstimateAsync(leadId);

  return NextResponse.json({ ok: true, leadId });
}
