import { Sparkles } from "lucide-react";
import { CreditPackCheckoutButton } from "@/components/plan/CreditPackCheckoutButton";
import { CreditsAddedToast } from "@/components/plan/CreditsAddedToast";

const creditPacks = [
  {
    pack: "10" as const,
    credits: 10,
    price: "$10",
    accent: "from-white to-[#F8F9FC]"
  },
  {
    pack: "50" as const,
    credits: 50,
    price: "$40",
    accent: "from-[#F8F9FC] to-[#EEF6FF]"
  },
  {
    pack: "100" as const,
    credits: 100,
    price: "$70",
    accent: "from-[#EFF6FF] to-white",
    featured: true
  }
];

type Props = {
  searchParams: Promise<{ credits?: string }>;
};

export default async function CreditsPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <CreditsAddedToast enabled={params.credits === "added"} />

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white px-6 py-8 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] sm:px-8">
        <div className="max-w-3xl space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-[#2563EB]">
            <Sparkles className="h-3.5 w-3.5" />
            Bonus credits
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#111827]">
            Stock up on credits when you need them
          </h1>
          <p className="text-sm leading-6 text-[#6B7280]">
            Credit packs add to your bonus balance and never expire.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {creditPacks.map((pack) => (
          <CreditPackCheckoutButton
            key={pack.pack}
            pack={pack.pack}
            successPath="/app/credits?credits=added"
            cancelPath="/app/credits"
          >
            <div
              className={`h-full rounded-[14px] bg-gradient-to-br ${pack.accent} p-1`}
            >
              <div className="flex h-full flex-col rounded-[12px] border border-[#E5E7EB] bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                      Credit Pack
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#111827]">
                      {pack.credits} credits
                    </h2>
                  </div>
                  {pack.featured ? (
                    <span className="rounded-full bg-[#2563EB] px-3 py-1 text-[12px] font-semibold text-white">
                      Best Value
                    </span>
                  ) : null}
                </div>

                <div className="mt-8">
                  <p className="text-[40px] font-semibold tracking-[-0.04em] text-[#2563EB]">
                    {pack.price}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                    Added immediately to your bonus credit balance for future unlocks.
                  </p>
                </div>

                <div className="mt-8 rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-4">
                  <p className="text-sm font-medium text-[#111827]">
                    Use these credits whenever you need extra volume beyond your monthly allotment.
                  </p>
                </div>
              </div>
            </div>
          </CreditPackCheckoutButton>
        ))}
      </section>
    </div>
  );
}
