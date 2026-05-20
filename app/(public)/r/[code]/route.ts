import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/ip";

// Mirrors the format CHECK on organizations.referral_code. We validate
// shape ONLY here — a real DB lookup at this stage would let a typo
// 404 the user before they ever reach the signup form. Actual code
// validity is enforced inside ensureOrganizationMembershipForUser when
// the cookie is consumed.
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;
const COOKIE_NAME = "sq_referral_code";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Lax IP-bucket cap. /r/CODE is a public, unauthenticated redirect —
// the limiter exists to keep a single client from spraying thousands
// of distinct codes in a brute-force enumeration. 60/min is plenty for
// any human or shared-NAT use, while still flagging abuse for the
// limiter's analytics path.
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function redirectToSignup(request: Request): NextResponse {
  return NextResponse.redirect(new URL("/signup", request.url), { status: 302 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const allowed = await rateLimit(`referral-link:${ip}`, RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_MS);
  if (!allowed) {
    // 429 with a plain body — no Set-Cookie. We don't redirect on 429
    // because that would let an attacker turn the redirect into an
    // amplification primitive.
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { code: rawCode } = await context.params;
  const normalized = (rawCode ?? "").trim().toUpperCase();

  const response = redirectToSignup(request);

  if (!REFERRAL_CODE_PATTERN.test(normalized)) {
    // Invalid shape — still bounce to signup so users with a mistyped
    // link aren't dead-ended on a 404, but don't persist the bad code
    // to a cookie that would get consumed and silently discarded later.
    return response;
  }

  response.cookies.set(COOKIE_NAME, normalized, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
