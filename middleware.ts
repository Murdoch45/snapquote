import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// CORS policy (Audit 8 L3) — *intentionally* no Access-Control-Allow-Origin
// header is set anywhere in this app. The browser default — block
// cross-origin reads, allow simple no-credential POSTs but reject
// preflighted credentialed requests — is exactly what we want today:
//
//   - The public lead form (/[contractorSlug]) is rendered server-side
//     on snapquote.us and POSTs to /api/public/lead-submit on the same
//     origin. No CORS needed.
//   - The mobile app uses bearer-token Supabase auth, not browser cookies,
//     so it's not subject to CORS in the first place.
//   - /api/app/* is cookie-authenticated and intentionally same-origin
//     only. Adding CORS would risk credentialed cross-origin requests.
//
// If we ever ship an embeddable lead form (e.g. a contractor pasting an
// <iframe> into their own marketing site), add an allowlist-driven
// Access-Control-Allow-Origin response header to /api/public/embed/*
// here — do NOT use a wildcard and do NOT extend it to /api/app/*.
//
// Click-jacking is already blocked by the X-Frame-Options: DENY +
// CSP frame-ancestors 'none' headers configured in next.config.ts.
export async function middleware(request: NextRequest) {
  // Belt-and-suspenders for OAuth redirect-target misconfigs.
  //
  // When `signInWithOAuth({ options: { redirectTo: "https://snapquote.us/auth/callback?next=/app" } })`
  // is called and the Supabase Studio Redirect URLs allowlist doesn't include
  // a pattern that matches `/auth/callback`, GoTrue silently rejects our explicit
  // redirect_to and falls back to the Site URL (origin only). The OAuth flow then
  // bounces the browser to `https://snapquote.us?code=<flow_state.auth_code>`,
  // which lands on the marketing landing page instead of the Vercel /auth/callback
  // route handler. The auth code goes unused, exchangeCodeForSession is never
  // called, no session cookies are set, and the user sees the landing page like
  // they were never logged in.
  //
  // This guard catches that misconfig path: if `/` is hit with a `?code=` query
  // param, forward to the real callback handler so the session can actually be
  // established. (The proper fix is to add `https://snapquote.us/auth/callback`
  // or `https://snapquote.us/**` to the Studio Redirect URLs allowlist — this is
  // defense for if/when that drifts again.) See updates-log.md May 1 entry.
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === "/" && requestUrl.searchParams.has("code")) {
    const callbackUrl = new URL("/auth/callback", requestUrl.origin);
    callbackUrl.searchParams.set("code", requestUrl.searchParams.get("code")!);
    const incomingNext = requestUrl.searchParams.get("next");
    callbackUrl.searchParams.set(
      "next",
      incomingNext && incomingNext.startsWith("/") ? incomingNext : "/app"
    );
    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as any)
        );
      }
    }
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!api/public|_next/static|_next/image|favicon.ico).*)"]
};
