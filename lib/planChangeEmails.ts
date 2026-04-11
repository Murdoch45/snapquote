import "server-only";
import { buildPlanEndedEmail, buildPlanUpgradedEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { getPlanMonthlyCredits, getPlanSeatLimit } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgPlan } from "@/lib/types";

function planLabel(plan: OrgPlan): string {
  if (plan === "TEAM") return "Team";
  if (plan === "BUSINESS") return "Business";
  return "Solo";
}

/**
 * Best-effort: send the "you're on the X plan" email to the org owner.
 * Fires from both Stripe (checkout completed, recurring renewal) and
 * RevenueCat (INITIAL_PURCHASE, RENEWAL) — caller decides when intent
 * is "user just got/renewed a paid plan."
 */
export async function sendPlanUpgradedEmail(orgId: string, plan: OrgPlan): Promise<void> {
  if (plan !== "TEAM" && plan !== "BUSINESS") return;

  try {
    const admin = createAdminClient();
    const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
    if (!ownerEmail) {
      console.warn("Plan upgraded email skipped: no owner email for org", orgId);
      return;
    }

    const email = buildPlanUpgradedEmail({
      planLabel: planLabel(plan),
      monthlyCredits: getPlanMonthlyCredits(plan),
      seatLimit: getPlanSeatLimit(plan)
    });

    const sent = await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      sender: "noreply"
    });

    if (!sent) {
      console.warn("Plan upgraded email send failed for org", orgId);
    }
  } catch (error) {
    console.warn("Plan upgraded email threw:", error);
  }
}

/**
 * Best-effort: send the "your plan ended" email to the org owner. Fires
 * from both Stripe (subscription canceled/deleted/past_due downgrade) and
 * RevenueCat (EXPIRATION, REFUND). The previousPlan should be the paid
 * tier that just ended — pass "TEAM" or "BUSINESS"; SOLO is rejected
 * since there's nothing to downgrade FROM.
 */
export async function sendPlanEndedEmail(
  orgId: string,
  previousPlan: OrgPlan
): Promise<void> {
  if (previousPlan !== "TEAM" && previousPlan !== "BUSINESS") return;

  try {
    const admin = createAdminClient();
    const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
    if (!ownerEmail) {
      console.warn("Plan ended email skipped: no owner email for org", orgId);
      return;
    }

    const email = buildPlanEndedEmail({
      previousPlanLabel: planLabel(previousPlan)
    });

    const sent = await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      sender: "noreply"
    });

    if (!sent) {
      console.warn("Plan ended email send failed for org", orgId);
    }
  } catch (error) {
    console.warn("Plan ended email threw:", error);
  }
}
