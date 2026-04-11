import { NextResponse } from "next/server";
import { buildTrialEndingSoonEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — finds orgs whose trial_ends_at falls within the next 48 hours
 * and sends a heads-up email. Each org is notified at most once per trial
 * window via the trial_ending_notified_at flag.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const now = new Date();
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, trial_ends_at, trial_ending_notified_at")
    .not("trial_ends_at", "is", null)
    .is("trial_ending_notified_at", null)
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", cutoff.toISOString());

  if (error) {
    console.error("trial-ending-soon cron query failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;

  for (const org of orgs ?? []) {
    const orgId = org.id as string;

    try {
      const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
      if (!ownerEmail) {
        console.warn("trial-ending-soon: no owner email for org", orgId);
        continue;
      }

      const email = buildTrialEndingSoonEmail();
      const ok = await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        sender: "noreply"
      });

      if (!ok) {
        console.warn("trial-ending-soon: send failed for org", orgId);
        continue;
      }

      // Mark notified so we don't double-send tomorrow.
      const { error: markError } = await admin
        .from("organizations")
        .update({ trial_ending_notified_at: new Date().toISOString() })
        .eq("id", orgId);

      if (markError) {
        console.warn("trial-ending-soon: mark notified failed for org", orgId, markError);
        continue;
      }

      sent += 1;
    } catch (orgError) {
      console.error("trial-ending-soon: org loop threw for", orgId, orgError);
    }
  }

  return NextResponse.json({ sent, considered: orgs?.length ?? 0 });
}
