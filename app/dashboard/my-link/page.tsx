import { MyLinkPageClient } from "@/components/MyLinkPageClient";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";
import { getAppUrl } from "@/lib/utils";

export default async function MyLinkPage() {
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
      .select("business_name, public_slug, social_caption")
      .eq("org_id", auth.orgId)
      .single(),
    getMonthlyUsage(auth.orgId)
  ]);

  if (!profile?.public_slug || !profile?.business_name) {
    return (
      <div className="min-h-screen bg-[#F8F9FC]">
        <Sidebar businessName={(profile?.business_name as string) ?? "SnapQuote"} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-[220px]">
          <TopBar
            email={user?.email}
            orgId={auth.orgId}
            businessName={(profile?.business_name as string) ?? "SnapQuote"}
          />
          <main className="flex-1 space-y-6 bg-[#F8F9FC] p-4 md:p-6">
            <UpgradeBanner {...usage} />
            <p className="text-sm text-red-600">Contractor profile not found.</p>
          </main>
        </div>
      </div>
    );
  }

  const businessName = profile.business_name as string;
  const requestLink = `${getAppUrl()}/${profile.public_slug as string}`;
  const initialSocialCaption =
    (profile.social_caption as string | null) ??
    `Need an estimate? ${businessName} makes it easy - just fill out a quick form and we'll get back to you as soon as possible. ${requestLink}`;

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <Sidebar businessName={businessName} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-[220px]">
        <TopBar email={user?.email} orgId={auth.orgId} businessName={businessName} />
        <main className="flex-1 space-y-6 bg-[#F8F9FC] p-4 md:p-6">
          <UpgradeBanner {...usage} />
          <MyLinkPageClient
            businessName={businessName}
            requestLink={requestLink}
            initialSocialCaption={initialSocialCaption}
          />
        </main>
      </div>
    </div>
  );
}
