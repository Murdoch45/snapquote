import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user }
    },
    { data: profile },
    usage
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("contractor_profile")
      .select("business_name")
      .eq("org_id", auth.orgId)
      .single(),
    getMonthlyUsage(auth.orgId)
  ]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar businessName={(profile?.business_name as string) ?? "SnapQuote"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar email={user?.email} orgId={auth.orgId} />
        <main className="flex-1 space-y-4 p-4 md:p-6">
          <UpgradeBanner {...usage} />
          {children}
        </main>
      </div>
    </div>
  );
}
