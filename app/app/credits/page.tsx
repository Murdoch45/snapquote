import { Sparkles } from "lucide-react";
import { CreditPackCheckoutButton } from "@/components/plan/CreditPackCheckoutButton";
import { CreditsAddedToast } from "@/components/plan/CreditsAddedToast";
import { getStripeCreditPackPriceLabel } from "@/lib/stripe";

// Static metadata for the three credit packs. The displayed price comes from
// `getStripeCreditPackPriceLabel` at render time so the UI never drifts from
// what Stripe actually charges (the previous hardcoded "$10 / $40 / $70"
// drifted from Stripe's "$9.99 / $39.99 / $69.99"). May 1, 2026 audit fix.
const CREDIT_PACK_META = [
  { pack: "10" as const, credits: 10, accent: "from-card to-muted" },
  { pack: "50" as const, credits: 50, accent: "from-muted to-accent" },
  { pack: "100" as const, credits: 100, accent: "from-accent to-card", featured: true }
];

type Props = {
  searchParams: Promise<{ credits?: string }>;
};

export default async function CreditsPage({ searchParams }: Props) {
  const params = await searchParams;

  // Fetch live prices from Stripe in parallel. Wrapped in React.cache inside
  // the helper so a single render dedupes any redundant calls.
  const creditPacks = await Promise.all(
    CREDIT_PACK_META.map(async (meta) => ({
      ...meta,
      price: await getStripeCreditPackPriceLabel(meta.pack)
    }))
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <CreditsAddedToast enabled={params.credits === "added"} />

      <section className="rounded-[14px] border border-border bg-card px-6 py-8 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] sm:px-8">
        <div className="max-w-3xl space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Bonus credits
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
            Stock up on credits when you need them
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Credit packs add to your bonus balance and never expire.
          </p>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="flex h-full flex-col rounded-[12px] border border-border bg-card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.05em] text-muted-foreground">
                      Credit Pack
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-foreground">
                      {pack.credits} credits
                    </h2>
                  </div>
                  {pack.featured ? (
                    <span className="rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-white">
                      Best Value
                    </span>
                  ) : null}
                </div>

                <div className="mt-8">
                  <p className="text-[40px] font-semibold tracking-[-0.04em] text-primary">
                    {pack.price}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Added immediately to your bonus credit balance for future unlocks.
                  </p>
                </div>

                <div className="mt-8 rounded-[12px] border border-border bg-muted px-4 py-4">
                  <p className="text-sm font-medium text-foreground">
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
