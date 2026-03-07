import { SettingsForm } from "@/components/SettingsForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";

export default async function SettingsPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const [profileRes, orgRes, usage] = await Promise.all([
    supabase.from("contractor_profile").select("*").eq("org_id", auth.orgId).single(),
    supabase.from("organizations").select("plan").eq("id", auth.orgId).single(),
    getMonthlyUsage(auth.orgId)
  ]);

  const profile = profileRes.data;

  if (!profile) {
    return <p className="text-sm text-red-600">Contractor profile not found.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Plan & Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-gray-700">
          <p>
            Plan: <span className="font-medium text-gray-900">{orgRes.data?.plan}</span>
          </p>
          <p>
            Quotes this month: <span className="font-medium text-gray-900">{usage.quotesSentCount}</span>
            {usage.limit !== null ? ` / ${usage.limit}` : " (unlimited)"}
          </p>
          {usage.limit !== null && (
            <p className="text-xs text-gray-500">
              Hard stop after grace: {usage.hardStopAt} quotes.
            </p>
          )}
        </CardContent>
      </Card>
      <SettingsForm initial={profile as any} />
    </div>
  );
}
