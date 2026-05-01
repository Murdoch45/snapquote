import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { TeamManager } from "@/components/TeamManager";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getPlanSeatLimit } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgPlan } from "@/lib/types";

export default async function TeamPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const [membersQuery, organizationQuery] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", auth.orgId)
      .order("created_at", { ascending: true }),
    admin.from("organizations").select("plan").eq("id", auth.orgId).single()
  ]);

  const members = membersQuery.data;

  const membersWithEmail = await Promise.all(
    (members ?? []).map(async (member) => {
      const userResult = await admin.auth.admin.getUserById(member.user_id as string);
      return {
        ...member,
        user_email: userResult.data.user?.email ?? null
      };
    })
  );

  const isSoloWorkspace = membersWithEmail.length <= 1;
  const orgPlan = (organizationQuery.data?.plan as OrgPlan | null) ?? "SOLO";
  const seatLimit = getPlanSeatLimit(orgPlan);
  const isOverSeatLimit = membersWithEmail.length > seatLimit;
  // Plan name for user-facing copy. Reads the org's current effective plan
  // (organizations.plan, set by the Stripe webhook on actual phase
  // transitions — never reflects a queued/scheduled future plan).
  const planDisplayName: Record<OrgPlan, string> = {
    SOLO: "Solo",
    TEAM: "Team",
    BUSINESS: "Business"
  };

  return (
    <div className="space-y-6">
      {isOverSeatLimit && auth.role === "OWNER" ? (
        <Card className="border-destructive/40 bg-destructive/5 shadow-none">
          <CardContent className="flex items-start gap-3 py-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                Over seat limit ({membersWithEmail.length}/{seatLimit})
              </p>
              <p className="text-muted-foreground">
                Your plan allows {seatLimit} {seatLimit === 1 ? "seat" : "seats"}. Remove{" "}
                {membersWithEmail.length - seatLimit}{" "}
                {membersWithEmail.length - seatLimit === 1 ? "member" : "members"} below, or{" "}
                <Link href="/app/plan" className="font-medium text-primary hover:text-primary/90">
                  upgrade your plan
                </Link>{" "}
                to add more. New invites are blocked until you&apos;re back under the limit.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {isSoloWorkspace && auth.role === "OWNER" ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-start gap-2 py-6">
            <h3 className="text-base font-semibold text-foreground">
              You&apos;re flying solo
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {orgPlan === "SOLO" ? (
                <>
                  Solo plans include 1 seat.{" "}
                  <Link
                    href="/app/plan"
                    className="font-medium text-primary hover:text-primary/90"
                  >
                    Upgrade to Team or Business
                  </Link>{" "}
                  to invite teammates.
                </>
              ) : (
                <>
                  Invite a teammate below to share leads, send estimates
                  together, and keep everyone in sync. Your{" "}
                  {planDisplayName[orgPlan]} plan includes up to {seatLimit}{" "}
                  {seatLimit === 1 ? "seat" : "seats"}.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : null}
      <TeamManager
        isOwner={auth.role === "OWNER"}
        members={membersWithEmail as any}
      />
    </div>
  );
}
