import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "U58KVR8LTA.com.murdochmarcum.snapquote",
        paths: [
          "/invite/*",
          // Build 20 (PW-B19-5): /auth/callback removed from AASA so iOS
          // does NOT hijack web-initiated OAuth (Apple/Google Sign In on
          // snapquote.us) into the installed app. Web Apple SIWA used to
          // redirect to /auth/callback?code=…, iOS Universal Links grabbed
          // it because of this entry, the app rendered +not-found.tsx. Now
          // the redirect stays in Safari and the existing PKCE handler at
          // app/auth/callback/route.ts completes the session web-side.
          // Mobile-originated Apple sign-in (native AppleAuthentication SDK)
          // is unaffected — it never hit this path.
          //
          // 2026-05-12: /auth/confirm + /auth/confirm?* also removed. The
          // Build 20 fix that added a real Expo Router route at
          // mobile app/auth/confirm.tsx (PW-B19-6 Option B) was supposed to
          // make the password-reset universal link work cleanly inside the
          // app. Murdoch tested Build 20 on TestFlight: reset email tap
          // still failed to land on the reset-password screen and dropped
          // the user wherever they were (home tab if signed-in, login if
          // signed-out), no Sentry events captured. Web-only reset path
          // tested in parallel works correctly. So: stop routing password
          // reset through the app at all. Let iOS leave the URL in Safari
          // (no AASA match → no universal link interception); the web
          // reset-password page handles the OTP. After the user updates
          // their password, they return to the app and sign in normally —
          // the Slack / Notion / Linear / Discord pattern. The mobile
          // route file at app/auth/confirm.tsx is intentionally left on
          // disk; it will simply not be hit because iOS no longer claims
          // the path.
          "/stripe-return",
          "/stripe-return?*",
        ],
      },
    ],
  },
} as const;

export function GET() {
  return NextResponse.json(AASA, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
