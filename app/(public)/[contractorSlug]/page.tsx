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
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <BrandLogo size="md" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {profile.business_name} - Request a Quote
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Submit a few details and receive your estimate shortly.
        </p>
        <div className="mt-6">
          <PublicLeadForm contractorSlug={profile.public_slug as string} />
        </div>
      </div>
    </main>
  );
}
