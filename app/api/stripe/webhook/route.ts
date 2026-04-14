import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  buildCreditPurchaseConfirmationEmail,
  buildPaymentFailedEmail
} from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { getPlanMonthlyCredits } from "@/lib/usage";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanFromPriceId, getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhookEvents";
import { sendPlanUpgradedEmail, sendPlanEndedEmail } from "@/lib/planChangeEmails";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

function normalizePlan(value: string | null | undefined): OrgPlan | null {
  if (value === "SOLO" || value === "TEAM" || value === "BUSINESS") return value;
  return null;
}

function shouldDowngradeToSolo(status: string): boolean {
  return status === "canceled" || status === "unpaid" || status === "past_due";
}

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  return typeof customer === "string" ? customer : customer?.id ?? null;
}

function getSubscriptionPlan(subscription: Stripe.Subscription): OrgPlan | null {
  const metadataPlan = normalizePlan(subscription.metadata.plan);
  if (metadataPlan) return metadataPlan;
  const firstPriceId = subscription.items.data[0]?.price?.id;
  const pricePlan = getPlanFromPriceId(firstPriceId);

  if (!pricePlan) {
    console.warn("Subscription plan could not be resolved.");
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
  billingInterval?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: args.userId,
      stripe_customer_id: args.stripeCustomerId,
      stripe_subscription_id: args.stripeSubscriptionId,
      plan: args.plan,
      status: args.status,
      billing_interval: args.billingInterval ?? null
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

async function resetOrganizationCredits(orgId: string, plan: OrgPlan) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("update_org_plan_credits", {
    p_org_id: orgId,
    p_monthly_credits: getPlanMonthlyCredits(plan),
    p_credits_reset_at: addOneMonth().toISOString()
  });

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

async function setOrganizationTrialEnd(
  orgId: string,
  trialEnd: Date | null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      trial_ends_at: trialEnd ? trialEnd.toISOString() : null,
      // Reset the notified flag whenever the trial window changes so a
      // re-trial (rare on Stripe, possible on Apple) gets a fresh email.
      trial_ending_notified_at: null
    })
    .eq("id", orgId);
  if (error) console.warn("Failed to set trial_ends_at:", error);
}

async function getCurrentOrgPlan(orgId: string): Promise<OrgPlan | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  return (data?.plan as OrgPlan | undefined) ?? null;
}

async function handleCreditPackCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.orgId;
  const creditAmountRaw = session.metadata?.creditAmount;
  const creditAmount = Number(creditAmountRaw);

  if (!orgId || !Number.isInteger(creditAmount) || creditAmount <= 0) {
    console.warn("Credit pack checkout skipped: incomplete metadata.");
    return;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_credit_purchase", {
    p_org_id: orgId,
    p_purchase_reference: session.id,
    p_credit_amount: creditAmount
  });

  if (error) {
    throw error;
  }

  if (data === "already_processed") {
    return;
  }

  // Send credit purchase confirmation email (best-effort).
  try {
    const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
    if (!ownerEmail) return;

    const { data: orgRow } = await admin
      .from("organizations")
      .select("bonus_credits")
      .eq("id", orgId)
      .maybeSingle();

    const newBalance =
      orgRow && typeof orgRow.bonus_credits === "number"
        ? (orgRow.bonus_credits as number)
        : null;

    const amountTotal = session.amount_total;
    const currency = (session.currency ?? "usd").toUpperCase();
    const amountPaid =
      typeof amountTotal === "number"
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency
          }).format(amountTotal / 100)
        : null;

    const email = buildCreditPurchaseConfirmationEmail({
      creditAmount,
      amountPaid,
      newBalance
    });

    await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      sender: "noreply"
    });
  } catch (emailError) {
    console.warn("stripe webhook: credit purchase email failed:", emailError);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.creditAmount) {
    await handleCreditPackCheckoutCompleted(session);
    return;
  }

  const userId = session.metadata?.userId;
  const orgId = session.metadata?.orgId;
  const plan = normalizePlan(session.metadata?.plan);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!userId || !orgId || !plan || !stripeCustomerId || !stripeSubscriptionId) {
    console.warn("Checkout session skipped: incomplete metadata.");
    return;
  }

  const stripe = getStripe();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    console.warn("Checkout session skipped: unable to retrieve subscription.", error);
    return;
  }

  const billingInterval = subscription.items.data[0]?.price?.recurring?.interval ?? null;

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    status: "active",
    billingInterval
  });

  if (subscription.status === "trialing" || subscription.trial_end) {
    await markOrganizationTrialUsed(orgId);
    if (subscription.trial_end) {
      await setOrganizationTrialEnd(orgId, new Date(subscription.trial_end * 1000));
    }
  }

  await setOrganizationPlan(orgId, plan);
  void sendPlanUpgradedEmail(orgId, plan);
}

async function handleSubscriptionChanged(subscription: Stripe.Subscription) {
  const metadataUserId = subscription.metadata.userId;
  const metadataOrgId = subscription.metadata.orgId;
  const stripeCustomerId = getStripeCustomerId(subscription.customer);
  const resolvedPlan = getSubscriptionPlan(subscription);
  const downgradedToSolo = shouldDowngradeToSolo(subscription.status);
  const plan = downgradedToSolo ? "SOLO" : resolvedPlan;

  if (!stripeCustomerId || !plan) {
    console.warn("Subscription update skipped: missing customer or unresolved plan.");
    return;
  }

  const userId = metadataUserId || (await getUserIdForStripeCustomer(stripeCustomerId));
  if (!userId) {
    console.warn("Subscription update skipped: unable to resolve user for customer.");
    return;
  }

  const billingInterval = subscription.items.data[0]?.price?.recurring?.interval ?? null;

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan,
    status: subscription.status,
    billingInterval
  });

  const orgId = metadataOrgId || (await getOrgIdForUser(userId));
  if (!orgId) {
    console.warn("Subscription update skipped: unable to resolve organization for user.");
    return;
  }

  // Capture the prior plan BEFORE we overwrite it so the downgrade email
  // can mention what the user is being moved off of.
  const previousPlan = downgradedToSolo ? await getCurrentOrgPlan(orgId) : null;

  await setOrganizationPlan(orgId, plan);

  if (downgradedToSolo) {
    await resetOrganizationCredits(orgId, "SOLO");
    if (previousPlan && previousPlan !== "SOLO") {
      void sendPlanEndedEmail(orgId, previousPlan);
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

  if (!subscriptionId) {
    console.warn("Invoice payment skipped: missing subscription reference.");
    return;
  }

  // billing_reason "subscription_cycle" = recurring renewal (vs.
  // "subscription_create" = first invoice). We only fire the renewal
  // upgrade email on cycles so the initial purchase doesn't double-send
  // (handleCheckoutCompleted already sent it for the first invoice).
  const isRenewalCycle = invoice.billing_reason === "subscription_cycle";

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionChanged(subscription);

    const effectivePlan = shouldDowngradeToSolo(subscription.status)
      ? "SOLO"
      : getSubscriptionPlan(subscription);

    if (!effectivePlan) {
      console.warn("Invoice payment credit reset skipped: unable to resolve subscription plan.");
      return;
    }

    const stripeCustomerId = getStripeCustomerId(subscription.customer);
    if (!stripeCustomerId) {
      console.warn("Invoice payment credit reset skipped: unable to resolve customer.");
      return;
    }

    const userId =
      subscription.metadata.userId || (await getUserIdForStripeCustomer(stripeCustomerId));
    if (!userId) {
      console.warn("Invoice payment credit reset skipped: unable to resolve user.");
      return;
    }

    const orgId = subscription.metadata.orgId || (await getOrgIdForUser(userId));
    if (!orgId) {
      console.warn("Invoice payment credit reset skipped: unable to resolve organization.");
      return;
    }

    await resetOrganizationCredits(orgId, effectivePlan);

    // Recurring renewal email — only on cycle invoices, not the first one.
    if (isRenewalCycle && (effectivePlan === "TEAM" || effectivePlan === "BUSINESS")) {
      void sendPlanUpgradedEmail(orgId, effectivePlan);
    }
  } catch (error) {
    console.warn("Invoice payment skipped: unable to retrieve subscription.", error);
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
  const stripeCustomerId = getStripeCustomerId(subscription.customer);
  if (!userId || !stripeCustomerId) {
    console.warn("Subscription deletion skipped: unable to resolve user or customer.");
    return;
  }

  await saveSubscriptionRecord({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan: "SOLO",
    status: subscription.status,
    billingInterval: null
  });

  const orgId = subscription.metadata.orgId || (await getOrgIdForUser(userId));
  if (!orgId) {
    console.warn("Subscription deletion skipped: unable to resolve organization.");
    return;
  }

  // Capture the prior plan BEFORE we move them to SOLO so the email
  // can mention what they had before.
  const previousPlan = await getCurrentOrgPlan(orgId);

  await setOrganizationPlan(orgId, "SOLO");
  await resetOrganizationCredits(orgId, "SOLO");

  if (previousPlan && previousPlan !== "SOLO") {
    void sendPlanEndedEmail(orgId, previousPlan);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

  if (!subscriptionId) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const stripeCustomerId = getStripeCustomerId(subscription.customer);
    if (!stripeCustomerId) return;

    const userId =
      subscription.metadata.userId || (await getUserIdForStripeCustomer(stripeCustomerId));
    if (!userId) return;

    const orgId = subscription.metadata.orgId || (await getOrgIdForUser(userId));
    if (!orgId) return;

    const admin = createAdminClient();
    const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
    if (!ownerEmail) return;

    const email = buildPaymentFailedEmail();
    const sent = await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      sender: "noreply"
    });

    if (!sent) {
      console.warn("Payment failed email send failed for org", orgId);
    }
  } catch (error) {
    console.warn("handleInvoicePaymentFailed threw:", error);
  }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  // We only need to act on credit pack (one-time) refunds to claw back the
  // bonus credits. Subscription refunds are handled by customer.subscription.deleted.
  // The checkout session metadata check below naturally skips non-credit-pack charges.
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const stripe = getStripe();

  try {
    // Find the checkout session that created this charge so we can match it
    // to the credit_purchases row (keyed on session.id as purchase_reference).
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1
    });
    const session = sessions.data[0];
    if (!session) return;

    const orgId = session.metadata?.orgId;
    const creditAmountRaw = session.metadata?.creditAmount;
    const creditAmount = Number(creditAmountRaw);

    if (!orgId || !Number.isInteger(creditAmount) || creditAmount <= 0) return;

    // Verify the purchase was actually recorded before we deduct.
    const admin = createAdminClient();
    const { data: purchase } = await admin
      .from("credit_purchases")
      .select("id")
      .eq("purchase_reference", session.id)
      .maybeSingle();

    if (!purchase) return;

    // Deduct the credits, flooring at zero. We deduct the full credit amount
    // even on partial monetary refunds because credit packs are all-or-nothing
    // units — you can't partially use half a 50-credit pack.
    const { data: org } = await admin
      .from("organizations")
      .select("bonus_credits")
      .eq("id", orgId)
      .single();

    const currentBonus = Number((org as { bonus_credits?: number } | null)?.bonus_credits ?? 0);
    const newBonus = Math.max(0, currentBonus - creditAmount);

    const { error: deductError } = await admin
      .from("organizations")
      .update({ bonus_credits: newBonus })
      .eq("id", orgId);

    if (deductError) {
      console.error("Credit refund deduction failed:", deductError);
    } else {
      console.log(
        `Credit refund: org ${orgId} bonus_credits ${currentBonus} → ${newBonus} (deducted ${creditAmount})`
      );
    }
  } catch (error) {
    console.warn("handleChargeRefunded threw:", error);
  }
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

  let claimed: boolean;
  try {
    claimed = await claimWebhookEvent("stripe", event.id, event.type);
  } catch (error) {
    console.error("Failed to claim Stripe webhook event.", error);
    return NextResponse.json({ error: "Failed to record event." }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
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
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed.", error);
    await releaseWebhookEvent("stripe", event.id).catch((releaseErr) => {
      console.error("Failed to release webhook event after handler error.", releaseErr);
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handling failed." },
      { status: 500 }
    );
  }
}
