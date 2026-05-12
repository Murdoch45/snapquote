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
          "/auth/confirm",
          "/auth/confirm?*",
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
