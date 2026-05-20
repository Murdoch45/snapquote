import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { getReferralSummary } from "@/lib/referrals/getReferralSummary";

export const runtime = "nodejs";

/**
 * GET /api/app/referrals/summary
 *
 * Returns the caller org's referral data: referral code, shareable link,
 * pending/qualified/rewarded counts, total earned in dollars, and whether
 * the org itself has a referrer attached. Pure read, no side effects.
 */
export async function GET(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const summary = await getReferralSummary(auth.orgId);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load referral summary."
      },
      { status: 500 }
    );
  }
}
