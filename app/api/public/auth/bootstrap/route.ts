import { NextResponse } from "next/server";
import { ensureOrganizationMembershipForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
