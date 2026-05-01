import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  orgId: string;
  role: "OWNER" | "MEMBER";
};

export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Multi-org users: deterministic ordering so the same user always lands on
  // the same org across requests. Without ORDER BY, Postgres returns rows in
  // arbitrary order and pages can disagree on which org the user is "in"
  // (caused the May 1 audit's Plan vs Team tab mismatch — see updates-log.md).
  // We pick the OWNER role first (alphabetically MEMBER comes before OWNER, so
  // descending puts OWNER first), then the oldest org by created_at as a stable
  // tiebreaker.
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("org_id, role, created_at")
    .eq("user_id", user.id)
    .order("role", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !membership) {
    redirect("/onboarding");
  }

  return {
    userId: user.id,
    orgId: membership.org_id as string,
    role: membership.role as "OWNER" | "MEMBER"
  };
}
