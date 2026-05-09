import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "U58KVR8LTA.com.murdochmarcum.snapquote",
        paths: ["*"],
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
