import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { ArrowRight, CheckCircle2, Satellite, TrendingUp, Zap } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductDemo } from "@/components/landing/ProductDemo";
import { Button } from "@/components/ui/button";

const manrope = Manrope({
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "SnapQuote | Less time estimating. More time earning.",
  description: "Instant AI estimates on every job so contractors can see exactly what is worth their time."
};

export default function HomePage() {
  return (
    <main className={manrope.className}>
      <div className="min-h-screen overflow-x-hidden bg-[#101320] text-slate-900">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,#1e2a4a_0%,#101320_70%)]">
          <div className="pointer-events-none absolute left-1/2 top-24 h-[220px] w-[420px] -translate-x-1/2 rounded-full bg-[rgba(180,197,255,0.1)] blur-[90px] sm:top-1/4 sm:h-[300px] sm:w-[620px] sm:blur-[110px] lg:h-[400px] lg:w-[800px] lg:blur-[120px]" />

          <nav className="fixed top-0 z-50 w-full bg-transparent shadow-none backdrop-blur-0">
            <div className="mx-auto flex h-20 max-w-7xl items-center px-6 sm:px-8">
              <Link href="/" className="inline-flex items-center gap-3">
                <BrandLogo size="sm" showWordmark={false} iconClassName="text-white" />
                <span className="text-2xl font-bold tracking-tight text-white">SnapQuote</span>
              </Link>
            </div>
          </nav>

          <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-6 sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-4xl flex-col items-center pb-10 pt-32 text-center sm:pt-40">
              <h1 className="text-[clamp(3.2rem,8vw,6rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-white">
                More jobs. Less stress.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#c3c6d7] sm:text-xl">
                Choose the best jobs with AI-powered estimates.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="h-14 rounded-2xl bg-[#2563EB] px-7 text-base font-semibold text-white shadow-[0_24px_60px_-24px_rgba(37,99,235,0.6)] hover:bg-[#1D4ED8]">
                  <Link href="/signup" className="inline-flex items-center gap-2">
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-14 rounded-2xl border-white/20 bg-transparent px-7 text-base font-semibold text-white hover:bg-white/5">
                  <Link href="/login">Log In</Link>
                </Button>
              </div>
            </div>

            <ProductDemo />
          </div>
        </section>

        <div className="min-h-[12rem] w-full bg-[linear-gradient(180deg,#101320_0%,#1b2338_18%,#2a344f_34%,#556175_54%,#97a4b8_72%,#d7dfea_88%,#F8F9FC_100%)] sm:min-h-[18rem] md:min-h-[24rem]" />

        <section className="min-h-screen bg-[#F8F9FC] py-24">
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <div className="grid grid-cols-1 items-center gap-20 md:grid-cols-2">
              <div className="space-y-8">
                <div className="inline-block rounded-full bg-[#b4c5ff]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#2563EB]">
                  Smart Estimating
                </div>
                <h2 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
                  Focus on jobs that <br />
                  <span className="text-[#2563EB]">pay the bills.</span>
                </h2>
                <p className="text-xl leading-relaxed text-slate-600">
                  SnapQuote analyzes property data, satellite imagery, and your custom pricing rules to deliver instant estimates. No more driving 30 minutes for a $100 lead.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-slate-800">
                    <CheckCircle2 className="h-5 w-5 text-[#2563EB]" />
                    <span className="font-semibold">Automated property measurements</span>
                  </li>
                  <li className="flex items-center gap-3 text-slate-800">
                    <CheckCircle2 className="h-5 w-5 text-[#2563EB]" />
                    <span className="font-semibold">Dynamic pricing based on service difficulty</span>
                  </li>
                  <li className="flex items-center gap-3 text-slate-800">
                    <CheckCircle2 className="h-5 w-5 text-[#2563EB]" />
                    <span className="font-semibold">Instant customer booking portal</span>
                  </li>
                </ul>
              </div>

              <div className="relative">
                <div className="rounded-[14px] border border-slate-200 bg-white p-8 shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Contractor working"
                    className="mb-6 h-48 w-full rounded-xl object-cover shadow-sm sm:h-64 md:h-80"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDlazVSG2jSx9e9SFNIm17TPVmWzKn3vlGd_v1oo2hhwKpdk00yh5TPDptVC5GnWTyD2qgNOg8wtE2q70jXWjMFuGQQf5wQ46DNfW_-bLHK3xvLr49fsiG2fiyYmTm39NhtcbhSFlQKy_nOzG-rmtv0zD2-75LlSHhdNpiGjAQ--NchXwKN8XbLEsdMCqPSZlnRt-OQ9xd_nLdsvYiIo5i0EavYMLdBDKWRqTlkaojxp5_N4AK7rn5KzhnhJQ45NlYNHnQL8SDFjHY"
                  />
                  <div className="rounded-lg bg-slate-50 p-4">
                    <div className="font-bold text-slate-900">Estimated Revenue</div>
                    <div className="text-2xl font-black text-[#2563EB]">$12,450.00</div>
                  </div>
                </div>
                <div className="absolute -bottom-10 -right-10 -z-10 h-40 w-40 rounded-full bg-[#2563EB]/5 blur-3xl" />
              </div>
            </div>

            <div className="mt-40 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="group rounded-[14px] border border-slate-100 bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-2">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] transition-colors group-hover:bg-[#2563EB] group-hover:text-white">
                  <Satellite className="h-7 w-7" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">Precision Measurements</h3>
                <p className="leading-relaxed text-slate-600">
                  Stop guessing roof pitches or lawn square footage. Our AI uses high-res satellite data for exact quotes.
                </p>
              </div>

              <div className="group rounded-[14px] border border-slate-100 bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-2">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] transition-colors group-hover:bg-[#2563EB] group-hover:text-white">
                  <Zap className="h-7 w-7" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">60-Second Lead Capture</h3>
                <p className="leading-relaxed text-slate-600">
                  Customers get a professional price before they even close their browser. Catch them while they&apos;re ready to buy.
                </p>
              </div>

              <div className="group rounded-[14px] border border-slate-100 bg-white p-10 shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-2">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] transition-colors group-hover:bg-[#2563EB] group-hover:text-white">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <h3 className="mb-4 text-xl font-bold text-slate-900">Profit Filtering</h3>
                <p className="leading-relaxed text-slate-600">
                  Prioritize high-margin jobs and filter out the &quot;price shoppers&quot; automatically so your crew stays busy where it counts.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#101320] py-32">
          <div className="absolute right-0 top-0 h-[240px] w-[240px] rounded-full bg-[#b4c5ff]/10 blur-[90px] sm:h-[360px] sm:w-[360px] sm:blur-[110px] lg:h-[500px] lg:w-[500px] lg:blur-[120px]" />
          <div className="relative z-10 mx-auto max-w-4xl px-6 text-center sm:px-8">
            <h2 className="mb-8 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
              Ready to reclaim your weekends?
            </h2>
            <p className="mb-12 text-xl text-[#c3c6d7]">
              Join 2,000+ outdoor contractors who save 10+ hours a week on administration.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 md:flex-row">
              <Button asChild className="h-auto rounded-full bg-[#2563EB] px-10 py-5 text-xl font-bold text-white shadow-lg hover:scale-105 hover:bg-[#1D4ED8]">
                <Link href="/signup">Get Started Free</Link>
              </Button>
              <div className="font-medium italic text-white/60">
                No credit card required. Cancel anytime.
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-[#101320]">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>© 2026 SnapQuote. All rights reserved.</p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-white">
                Terms of Service
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
