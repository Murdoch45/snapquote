import Link from "next/link";
import { House } from "lucide-react";
import { PricingPlans } from "@/components/PricingPlans";
import { PublicBrandLink } from "@/components/PublicBrandLink";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function PricingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let currentPlan = "free";
  let hasUsedTrial = false;
  let plan = "free";
  let organization:
    | {
        plan?: string | null;
        has_used_trial?: boolean | null;
      }
    | null = null;

  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership?.org_id) {
      const [{ data: orgData }, { data: subscription }] = await Promise.all([
        supabase
          .from("organizations")
          .select("plan, has_used_trial")
          .eq("id", membership.org_id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      organization = orgData;
      plan = (organization?.plan as string | null | undefined)?.toLowerCase() || "free";
      hasUsedTrial = organization?.has_used_trial ?? false;

      const subscriptionStatus =
        (subscription?.status as string | null | undefined)?.toLowerCase() ?? null;
      const hasActivePaidPlan =
        subscriptionStatus === "active" || subscriptionStatus === "trialing";

      if (hasActivePaidPlan) {
        currentPlan = plan;
      } else {
        currentPlan = "solo";
      }
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#ffffff_52%,_#ecfeff)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 md:py-24">
        <div className="flex items-center justify-between gap-4">
          <PublicBrandLink />
          <div className="flex gap-3">
            {!user ? (
              <Button asChild variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/" aria-label="Home" className="h-10 w-10 p-0">
                <House className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <section className="max-w-3xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
            Upgrade SnapQuote with a 14-day free trial
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            Pick the plan that fits your business
          </p>
        </section>

        <PricingPlans currentPlan={currentPlan} hasUsedTrial={hasUsedTrial} />
      </div>
    </main>
  );
}
