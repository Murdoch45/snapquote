import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { PublicLeadForm } from "@/components/PublicLeadForm";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ contractorSlug: string }>;
};

export default async function ContractorPublicPage({ params }: Props) {
  const { contractorSlug } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("contractor_profile")
    .select("business_name, public_slug")
    .eq("public_slug", contractorSlug)
    .maybeSingle();

  if (!profile) notFound();

  return (
    <div className="relative overflow-x-hidden">
      <main className="min-h-screen bg-muted dark:bg-background px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-[600px] rounded-[16px] border border-border bg-card p-4 shadow-[0_4px_24px_rgba(37,99,235,0.08)] sm:p-8">
          <div className="mb-6">
            <BrandLogo size="sm" />
          </div>
          <h1 id="lead-form-heading" className="mt-6 text-2xl font-bold text-foreground">
            Request an Estimate from {profile.business_name}
          </h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            Submit a few details and receive your estimate shortly.
          </p>
          <div className="min-w-0 max-w-full">
            <PublicLeadForm contractorSlug={profile.public_slug as string} />
          </div>
        </div>
      </main>
    </div>
  );
}
