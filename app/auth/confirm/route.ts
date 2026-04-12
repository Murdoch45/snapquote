import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "recovery"
    | "signup"
    | "email"
    | null;
  const next = safeNextPath(url.searchParams.get("next"));

  if (!tokenHash || !type) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", "missing_token");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${url.origin}${next}`);
}
