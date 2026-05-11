import { NextResponse } from "next/server";
import { ensureOrganizationMembershipForUser } from "@/lib/onboarding";
import { rateLimit } from "@/lib/rateLimit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Audit 7 M3 — per-user cap. The route is gated by Turnstile + a cookie
// session, but a signed-up user with a valid signup cookie can replay
// indefinitely; ensureOrganizationMembershipForUser is meant to be
// idempotent but is the kind of code path you don't want to stress-test
// from the public surface.
const ONE_HOUR_MS = 60 * 60 * 1000;
const BOOTSTRAP_RATE_LIMIT = 5;

async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured.");
    return false;
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    const json = (await response.json().catch(() => null)) as { success?: boolean } | null;
    return Boolean(response.ok && json?.success === true);
  } catch (error) {
    console.error("Turnstile verification request failed:", error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { turnstileToken?: string } | null;
    const turnstileToken = body?.turnstileToken?.trim() ?? "";

    if (!turnstileToken) {
      return NextResponse.json({ error: "Bot verification failed." }, { status: 400 });
    }

    const verified = await verifyTurnstileToken(turnstileToken);
    if (!verified) {
      return NextResponse.json({ error: "Bot verification failed." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await rateLimit(`bootstrap:user:${user.id}`, BOOTSTRAP_RATE_LIMIT, ONE_HOUR_MS))) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const result = await ensureOrganizationMembershipForUser({
      userId: user.id,
      email: user.email
    });

    return NextResponse.json({ ok: true, orgId: result.orgId });
  } catch (error) {
    console.error("SIGNUP BOOTSTRAP ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create organization." },
      { status: 500 }
    );
  }
}
