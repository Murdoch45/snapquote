import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductDemo } from "@/components/landing/ProductDemo";
import { Button } from "@/components/ui/button";

const manrope = Manrope({
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "SnapQuote | Better jobs. Faster quotes.",
  description: "AI-powered quoting built for contractors."
};

export default function HomePage() {
  return (
    <main className={manrope.className}>
      <div className="min-h-screen overflow-x-hidden bg-[#eef4fb] text-slate-900">
        <section className="relative overflow-hidden bg-[#060815]">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-45 blur-[1px] brightness-[0.48] contrast-[0.82] saturate-[0.75]"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
          >
            <source src="/landing/contractor-hero.mp4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_36%),linear-gradient(180deg,rgba(6,8,21,0.34)_0%,rgba(6,8,21,0.66)_48%,rgba(6,8,21,0.92)_100%)]" />
          <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/30 via-transparent to-transparent" />

          <div className="relative mx-auto flex min-h-[82svh] max-w-6xl flex-col px-6 pb-32 pt-8 sm:px-8 md:pb-40 lg:px-10">
            <div className="self-start rounded-full border border-white/[0.12] bg-white/[0.06] p-2 pr-4 backdrop-blur-sm">
              <Link
                href="/"
                className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <BrandLogo
                  size="sm"
                  iconClassName="drop-shadow-[0_10px_30px_rgba(37,99,235,0.35)]"
                  wordmarkClassName="text-white"
                />
              </Link>
            </div>

            <div className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center text-center">
              <h1 className="text-[clamp(3rem,8vw,6.35rem)] font-semibold leading-[0.94] tracking-[-0.075em] text-white">
                Better jobs. Faster quotes.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg md:text-xl">
                AI-powered quoting built for contractors.
              </p>

              <div className="mt-10 grid w-full max-w-md grid-cols-2 gap-3">
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-14 rounded-2xl border-white/[0.15] bg-white/[0.08] text-base font-semibold text-white backdrop-blur-md hover:bg-white/[0.14] hover:text-white"
                >
                  <Link href="/login">Log In</Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  className="h-14 rounded-2xl bg-[linear-gradient(135deg,#68d6ff_0%,#2f7bff_55%,#1d4ed8_100%)] text-base font-semibold text-white shadow-[0_24px_60px_-24px_rgba(47,123,255,0.75)] hover:text-white"
                >
                  <Link href="/signup" className="inline-flex items-center justify-center gap-2">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="relative -mt-16 pb-20 sm:-mt-20 md:-mt-24 md:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#eaf2fb_0%,#f7faff_45%,#edf5ff_100%)]" />
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
            <ProductDemo />
            <p className="mt-10 text-center text-sm font-medium tracking-[0.02em] text-slate-500">
              Built for all outdoor service contractors.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
