import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/plans";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRODUCT_TO_PLAN: Record<string, OrgPlan> = {
  snapquote_team_monthly: "TEAM",
  snapquote_team_annual: "TEAM",
  snapquote_business_monthly: "BUSINESS",
  snapquote_business_annual: "BUSINESS"
};

type RevenueCatEvent = {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
};

type RevenueCatPayload = {
  api_version?: string;
  event: RevenueCatEvent;
};

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function resolvePlanFromEvent(event: RevenueCatEvent): OrgPlan | null {
  const entitlements = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (entitlements.some((id) => id?.toLowerCase() === "business")) return "BUSINESS";
  if (entitlements.some((id) => id?.toLowerCase() === "team")) return "TEAM";

  if (event.product_id && PRODUCT_TO_PLAN[event.product_id]) {
    return PRODUCT_TO_PLAN[event.product_id];
  }

  return null;
}

function resolveOrgId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id];
  for (const candidate of candidates) {
    if (candidate && UUID_RE.test(candidate)) return candidate;
  }
  return null;
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

async function applyPlan(orgId: string, plan: OrgPlan) {
  await setOrganizationPlan(orgId, plan);
  await resetOrganizationCredits(orgId, plan);
}

async function handleRenewal(event: RevenueCatEvent, orgId: string) {
  const plan = resolvePlanFromEvent(event);
  if (!plan) {
    console.warn("RevenueCat renewal skipped: unable to resolve plan.", {
      productId: event.product_id,
      entitlements: event.entitlement_ids
    });
    return;
  }
  await applyPlan(orgId, plan);
}

async function handleDowngrade(orgId: string) {
  await applyPlan(orgId, "SOLO");
}

export async function POST(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error("REVENUECAT_WEBHOOK_AUTH is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const authorization = (await headers()).get("authorization");
  if (!authorization || !safeEqual(authorization, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RevenueCatPayload;
  try {
    payload = (await request.json()) as RevenueCatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const event = payload?.event;
  if (!event?.type) {
    return NextResponse.json({ error: "Missing event." }, { status: 400 });
  }

  const orgId = resolveOrgId(event);
  if (!orgId) {
    console.warn("RevenueCat event skipped: app_user_id is not a valid org UUID.", {
      type: event.type,
      appUserId: event.app_user_id
    });
    return NextResponse.json({ received: true, skipped: "no_org" });
  }

  try {
    switch (event.type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
        await handleRenewal(event, orgId);
        break;

      case "CANCELLATION":
      case "EXPIRATION":
      case "REFUND":
        await handleDowngrade(orgId);
        break;

      default:
        return NextResponse.json({ received: true, ignored: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("RevenueCat webhook handler failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handling failed." },
      { status: 500 }
    );
  }
}
