import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  RECOVERY_COOKIE_NAME,
  RECOVERY_COOKIE_MAX_AGE_SECONDS,
  signRecoveryToken
} from "@/lib/auth/recoveryCookie";

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

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const redirectBase =
    !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : url.origin;

  // Build the redirect response FIRST so the Supabase client can write auth
  // cookies directly onto it. Using cookieStore from next/headers does not
  // reliably propagate cookies onto a separately-created NextResponse.redirect().
  const response = NextResponse.redirect(`${redirectBase}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as any);
          });
        }
      }
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("oauth_error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  // Audit 8 H5: only mark a session as "in password recovery" when the
  // user just completed a recovery OTP. The reset-password page rejects
  // any session lacking this cookie, which closes the bypass where a
  // logged-in user (or hijacked session) could change the account
  // password without re-authenticating.
  if (type === "recovery" && data.user?.id) {
    response.cookies.set(RECOVERY_COOKIE_NAME, signRecoveryToken(data.user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS
    });
  }

  return response;
}
