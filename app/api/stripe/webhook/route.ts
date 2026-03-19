import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanFromPriceId, getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

function normalizePlan(value: string | null | undefined): OrgPlan | null {
  if (value === "SOLO" || value === "TEAM" || value === "BUSINESS") return value;
  return null;
}

function getSubscriptionPlan(subscription: Stripe.Subscription): OrgPlan | null {
  const metadataPlan = normalizePlan(subscription.metadata.plan);
  if (metadataPlan) return metadataPlan;
  const firstPriceId = subscription.items.data[0]?.price?.id;
  const pricePlan = getPlanFromPriceId(firstPriceId);

  if (!pricePlan) {
    console.warn("Subscription plan could not be resolved.", {
      subscriptionId: subscription.id,
      firstPriceId: firstPriceId ?? null
    });
    return null;
  }

  return pricePlan;
}

async function getOrgIdForUser(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (membership?.org_id as string | undefined) ?? null;
}

async function getUserIdForStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: record } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (record?.user_id as string | undefined) ?? null;
}

async function saveSubscriptionRecord(args: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: OrgPlan;
  status: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: args.userId,
      stripe_customer_id: args.stripeCustomerId,
      stripe_subscription_id: args.stripeSubscriptionId,
      plan: args.plan,
      status: args.status
    },
    { onConflict: "stripe_subscription_id" }
  );

  if (error) throw error;
}

async function setOrganizationPlan(orgId: string, plan: OrgPlan) {
  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ plan }).eq("id", orgId);
  if (error) throw error;
}

async function markOrganizationTrialUsed(orgId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ has_used_trial: true })
    .eq("id", orgId);
  if (error) throw error;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const orgId = session.metadata?.orgId;
  const plan = normalizePlan(session.metadata?.plan);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!userId || !orgId || !plan || !stripeCustomerId || !stripeSubscriptionId) {
    console.warn("Checkout session skipped: incomplete metadata.", {
      sessionId: session.id,
      userId: userId ?? null,
      orgId: orgId ?? null,
      plan: plan ?? null,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: stripeSubscriptionId ?? null
    });
    return;
  }

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    status: "active"
  });

  const stripe = getStripe();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    console.warn("Checkout session skipped: unable to retrieve subscription.", {
      sessionId: session.id,
      stripeSubscriptionId,
      error
    });
    return;
  }

  if (subscription.status === "trialing" || subscription.trial_end) {
    await markOrganizationTrialUsed(orgId);
  }

  await setOrganizationPlan(orgId, plan);
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription) {
  const metadataUserId = subscription.metadata.userId;
  const metadataOrgId = subscription.metadata.orgId;
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const plan = getSubscriptionPlan(subscription);

  if (!stripeCustomerId || !plan) {
    console.warn("Subscription update skipped: missing customer or unresolved plan.", {
      subscriptionId: subscription.id,
      stripeCustomerId: stripeCustomerId ?? null
    });
    return;
  }

  const userId = metadataUserId || (await getUserIdForStripeCustomer(stripeCustomerId));
  if (!userId) {
    console.warn("Subscription update skipped: unable to resolve user for customer.", {
      subscriptionId: subscription.id,
      stripeCustomerId
    });
    return;
  }

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan,
    status: subscription.status
  });

  const orgId = metadataOrgId || (await getOrgIdForUser(userId));
  if (!orgId) {
    console.warn("Subscription update skipped: unable to resolve organization for user.", {
      subscriptionId: subscription.id,
      userId,
      stripeCustomerId
    });
    return;
  }

  await setOrganizationPlan(orgId, plan);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

  if (!subscriptionId) {
    console.warn("Invoice payment skipped: missing subscription reference.", {
      invoiceId: invoice.id
    });
    return;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionChanged(subscription);
  } catch (error) {
    console.warn("Invoice payment skipped: unable to retrieve subscription.", {
      invoiceId: invoice.id,
      subscriptionId,
      error
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const admin = createAdminClient();
  const { data: record } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const userId = subscription.metadata.userId || (record?.user_id as string | undefined);
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const plan = getSubscriptionPlan(subscription) || "SOLO";

  if (!userId || !stripeCustomerId) {
    console.warn("Subscription deletion skipped: unable to resolve user or customer.", {
      subscriptionId: subscription.id,
      userId: userId ?? null,
      stripeCustomerId: stripeCustomerId ?? null
    });
    return;
  }

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan,
    status: subscription.status
  });

  const orgId = subscription.metadata.orgId || (await getOrgIdForUser(userId));
  if (!orgId) {
    console.warn("Subscription deletion skipped: unable to resolve organization.", {
      subscriptionId: subscription.id,
      userId,
      stripeCustomerId
    });
    return;
  }

  await setOrganizationPlan(orgId, "SOLO");
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChanged(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handling failed." },
      { status: 500 }
    );
  }
}
