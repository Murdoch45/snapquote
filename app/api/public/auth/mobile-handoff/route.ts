import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySupabaseJWT } from "@/lib/auth/verifyJWT";

/**
 * Audit 1 H3: mobile → web authenticated handoff without leaking the mobile
 * refresh token into the URL fragment.
 *
 * Pre-fix path (`lib/utils/authBrowser.ts` on mobile):
 *   1. Mobile read access_token + refresh_token from its Supabase session.
 *   2. Built `https://snapquote.us${path}#access_token=…&refresh_token=…&type=bearer`.
 *   3. Opened that URL via `WebBrowser.openBrowserAsync`.
 *   4. The `/credits` and `/plan` web pages read the fragment and called
 *      `supabase.auth.setSession({ access_token, refresh_token })`.
 *
 * Refresh tokens are long-lived. Putting one in a URL — even a fragment —
 * leaks it into in-app SFSafariViewController history, Sentry breadcrumbs
 * unless URL scrubbing is configured for every URL surface, and any logging
 * along the WebBrowser path. A leaked refresh token survives until the
 * user signs out everywhere or the org owner deletes the account.
 *
 * Post-fix path:
 *   1. Mobile POSTs here with `Authorization: Bearer <mobile_access_token>`
 *      and `{ path }` in the body.
 *   2. This route `verifySupabaseJWT`s the bearer locally (no GoTrue
 *      round-trip, same pattern as `requireRole.ts`).
 *   3. On success, calls `admin.auth.admin.generateLink({ type: "magiclink",
 *      email })` to mint a one-time magiclink. Supabase magiclinks are
 *      single-use and short-TTL (controlled by the project setting).
 *   4. Returns `{ handoff_url }` pointing at our existing
 *      `/auth/confirm?token_hash=<…>&type=magiclink&next=<path>` flow, which
 *      sets the session cookies via the same code path the email-recovery
 *      flow already uses. Refresh token never leaves Supabase.
 *
 * Even if the handoff_url is intercepted somewhere along the path, it's
 * single-use: as soon as `/auth/confirm` verifies it, the token is dead.
 * Compare to the pre-fix refresh_token-in-fragment, which an attacker who
 * intercepted could replay indefinitely.
 */

const bodySchema = z.object({
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\/[^\s]*$/, "path must be an absolute URL path starting with /")
});

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function safeNextPath(value: string): string {
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  return value;
}

export async function POST(request: Request) {
  const bearer = getBearerToken(request);
  if (!bearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const verified = await verifySupabaseJWT(bearer);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!verified.email) {
    // Supabase requires email for magiclink. OAuth-only users without an
    // email synced into auth.users hit this branch; surface a 400 so
    // mobile can fall back gracefully.
    return NextResponse.json({ error: "Account is missing an email on file." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const nextPath = safeNextPath(parsed.data.path);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us";

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: verified.email,
    options: { redirectTo: `${appUrl}${nextPath}` }
  });

  if (error || !data?.properties?.hashed_token) {
    console.warn("[mobile-handoff] generateLink failed:", error?.message);
    return NextResponse.json({ error: "Could not mint handoff link." }, { status: 500 });
  }

  const tokenHash = data.properties.hashed_token;
  // Route through our existing /auth/confirm handler — same code path the
  // password-recovery email flow uses — instead of redirecting straight to
  // Supabase's auth/v1/verify. /auth/confirm verifies via verifyOtp and sets
  // the session cookies onto the redirect response (the pattern documented
  // at app/auth/confirm/route.ts:42-57).
  const handoffUrl =
    `${appUrl}/auth/confirm` +
    `?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=magiclink` +
    `&next=${encodeURIComponent(nextPath)}`;

  return NextResponse.json({ handoff_url: handoffUrl });
}
