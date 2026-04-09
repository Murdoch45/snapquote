import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Only allow internal redirect targets to prevent open-redirect abuse.
function safeNextPath(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  // Block protocol-relative URLs like "//evil.com".
  if (value.startsWith("//")) return "/app";
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // The OAuth provider (or Supabase) bounced back with an error — e.g. the user
  // denied consent. Send them back to /login with a flag we can surface.
  if (errorParam) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", errorDescription ?? errorParam);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  // Honor the forwarded host when running behind a proxy (e.g. Vercel) so the
  // redirect lands on the user's actual hostname rather than the internal one.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${url.origin}${next}`);
}
