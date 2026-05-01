import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearStaleStripeCustomerId,
  getStripe,
  getStripeAppUrl,
  isStripeResourceMissingError
} from "@/lib/stripe";

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
      .select("user_id, role")
      .eq("org_id", auth.orgId);

    if (membersError) {
      throw membersError;
    }

    const memberRows = members ?? [];
    const ownerUserIds = memberRows
      .filter((m) => m.role === "OWNER")
      .map((m) => m.user_id as string | null)
      .filter((value): value is string => Boolean(value));
    const allUserIds = memberRows
      .map((m) => m.user_id as string | null)
      .filter((value): value is string => Boolean(value));

    if (allUserIds.length === 0) {
      return NextResponse.json({ error: "No billing account found for this organization." }, { status: 404 });
    }

    // Prefer the current OWNER's Stripe customer — they're the billing
    // contact. Previously this scanned all org members and took the most
    // recent subscription, which could open the wrong customer portal after
    // an ownership transfer (e.g. opening a former member's personal Stripe
    // account). Fall back to all members only when no current OWNER has a
    // subscription row, so legacy orgs whose original owner left don't
    // become unable to manage billing.
    const pickBillingRow = async (userIds: string[]) => {
      if (userIds.length === 0) return null;
      const { data, error } = await admin
        .from("subscriptions")
        .select("stripe_customer_id,status,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = data ?? [];
      return rows.find((r) => r.status === "active" || r.status === "trialing") ?? rows[0] ?? null;
    };

    const current =
      (await pickBillingRow(ownerUserIds)) ?? (await pickBillingRow(allUserIds));

    const stripeCustomerId =
      (current?.stripe_customer_id as string | null | undefined) ?? null;

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe billing profile found yet." }, { status: 404 });
    }

    // The Customer Portal cannot create a customer — it only opens an
    // existing one. If our stored ID is stale (test → live swap, manual
    // delete in Stripe), clear it and surface a 404 so the UI directs the
    // user to subscribe-fresh. (May 1 audit fix.)
    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl
      });
    } catch (stripeError) {
      if (isStripeResourceMissingError(stripeError, "customer")) {
        console.warn(
          `[stripe/customer-portal] Stale stripe_customer_id ${stripeCustomerId} for org ${auth.orgId}; clearing.`
        );
        // Clear across every owner's row so a future portal attempt either
        // finds a real customer or correctly surfaces "no billing profile".
        for (const ownerId of ownerUserIds.length > 0 ? ownerUserIds : allUserIds) {
          await clearStaleStripeCustomerId(admin, ownerId);
        }
        return NextResponse.json(
          {
            error:
              "We couldn't find your billing profile. Please re-subscribe from the Plan page to refresh your billing details."
          },
          { status: 404 }
        );
      }
      throw stripeError;
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to open billing portal." },
      { status: 400 }
    );
  }
}
