import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, getStripeAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const stripe = getStripe();
    const appUrl = getStripeAppUrl();
    const body = (await request.json().catch(() => null)) as { change?: string } | null;
    const returnUrl =
      body?.change === "scheduled" ? `${appUrl}/app/plan?change=scheduled` : `${appUrl}/app`;

    const { data: members, error: membersError } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", auth.orgId);

    if (membersError) {
      throw membersError;
    }

    const userIds = (members ?? [])
      .map((member) => member.user_id as string | null)
      .filter((value): value is string => Boolean(value));

    if (userIds.length === 0) {
      return NextResponse.json({ error: "No billing account found for this organization." }, { status: 404 });
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id,status,created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(20);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    const current =
      (subscriptions ?? []).find((row) =>
        row.status === "active" || row.status === "trialing"
      ) ?? (subscriptions ?? [])[0];

    const stripeCustomerId =
      (current?.stripe_customer_id as string | null | undefined) ?? null;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe billing profile found yet." }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to open billing portal." },
      { status: 400 }
    );
  }
}
