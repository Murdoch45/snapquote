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

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !membership) {
    redirect("/signup?onboarding=1");
  }

  return {
    userId: user.id,
    orgId: membership.org_id as string,
    role: membership.role as "OWNER" | "MEMBER"
  };
}
