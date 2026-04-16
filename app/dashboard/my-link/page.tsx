import { ActivityTracker } from "@/components/ActivityTracker";
import { AppShell } from "@/components/AppShell";
import { MyLinkPageClient } from "@/components/MyLinkPageClient";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { requireAuth } from "@/lib/auth/requireAuth";
import {
  buildDefaultSocialCaption,
  resolveBusinessNameForCaption
} from "@/lib/socialCaption";
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
    { data: organization },
    usage
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("contractor_profile")
      .select("business_name, public_slug, social_caption")
      .eq("org_id", auth.orgId)
      .single(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", auth.orgId)
      .single(),
    getMonthlyUsage(auth.orgId)
  ]);

  if (!profile?.public_slug || !profile?.business_name) {
    return (
      <AppShell
        email={user?.email}
        orgId={auth.orgId}
        businessName={(profile?.business_name as string) ?? "SnapQuote"}
      >
        <ActivityTracker />
        <UpgradeBanner {...usage} />
        <p className="text-sm text-red-600">Contractor profile not found.</p>
      </AppShell>
    );
  }

  const businessName = profile.business_name as string;
  const requestLink = `${getAppUrl()}/${profile.public_slug as string}`;
  const captionBusinessName = resolveBusinessNameForCaption({
    profileBusinessName: profile.business_name as string | null | undefined,
    organizationName: organization?.name as string | null | undefined
  });
  const initialSocialCaption =
    (profile.social_caption as string | null) ??
    buildDefaultSocialCaption({ businessName: captionBusinessName, requestLink });

  return (
    <AppShell email={user?.email} orgId={auth.orgId} businessName={businessName}>
      <ActivityTracker />
      <UpgradeBanner {...usage} />
      <MyLinkPageClient
        businessName={businessName}
        requestLink={requestLink}
        initialSocialCaption={initialSocialCaption}
        canEditCaption={auth.role === "OWNER"}
      />
    </AppShell>
  );
}
