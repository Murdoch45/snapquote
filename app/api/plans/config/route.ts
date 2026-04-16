import { NextResponse } from "next/server";

import { PLAN_MONTHLY_CREDITS, PLAN_SEAT_LIMITS } from "@/lib/plans";

export const runtime = "nodejs";

// Authoritative source for plan tier constants consumed by the mobile app.
// Mobile hydrates this on launch and caches the result; web reads the
// constants directly from lib/plans.ts. Keeps the two platforms in lockstep
// whenever credit or seat allowances change.
export function GET() {
  return NextResponse.json(
    {
      credits: PLAN_MONTHLY_CREDITS,
      seats: PLAN_SEAT_LIMITS
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    }
  );
}
