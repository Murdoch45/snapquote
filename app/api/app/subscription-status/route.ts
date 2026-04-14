import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { getOrganizationSubscriptionStatus } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * GET /api/app/subscription-status
 *
 * Returns whether the caller's organization has an active Stripe
 * subscription. Unlike a direct supabase query from the client, this
 * checks subscriptions across *all* members of the org, so seat-2+
 * members correctly see the owner's subscription.
 */
export async function GET(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const status = await getOrganizationSubscriptionStatus(auth.orgId);
    return NextResponse.json({
      active: status.active,
      plan: status.plan,
      status: status.status,
      trialEndDate: status.trialEndDate,
      billingSource: status.billingSource
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve subscription status." },
      { status: 500 }
    );
  }
}
