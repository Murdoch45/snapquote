import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductDemo } from "@/components/landing/ProductDemo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  title: "SnapQuote — Stop driving to estimates that waste your time.",
  description:
    "Send customers your link. They tell you about the job, and you get an instant estimate built with the help of our AI tools — send it or pass."
};

const HEADLINE_LEAD = "Stop driving to estimates that ";
const HEADLINE_TAIL = "waste your time.";
const SUBHEAD =
  "Send customers your link. They tell you about the job, and you get an instant estimate built with the help of our AI tools — send it or pass.";

type Step = {
  num: string;
  title: string;
  body: string;
  mediaLabel: string;
};

const STEPS: Step[] = [
  {
    num: "01",
    title: "Share your link",
    body: "Drop your personal SnapQuote link in a text, share it on social media, or put it in your bio.",
    mediaLabel: "Screen recording — share link"
  },
  {
    num: "02",
    title: "Customer tells you about the job",
    body: "They open the link and answer a few questions about what they need. Takes them under a minute.",
    mediaLabel: "Screen recording — customer flow"
  },
  {
    num: "03",
    title: "Get an instant estimate with the price",
    body: "Our AI tools build a complete estimate using property data and the customer's answers. You see it before they do.",
    mediaLabel: "Screen recording — estimate built"
  },
  {
    num: "04",
    title: "Send it or pass",
    body: "Worth your time? Send. Not worth driving across town for? Pass. Your call, every time.",
    mediaLabel: "Screen recording — send or pass"
  }
];

const PRIMARY_CTA_CLASSES =
  "rounded-xl bg-primary px-[26px] py-4 text-base font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_10px_24px_-8px_rgba(37,99,235,0.4)] transition-transform hover:bg-primary hover:-translate-y-px active:translate-y-px";
const SMALL_CTA_CLASSES =
  "rounded-xl bg-primary px-4 py-[9px] text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_18px_-8px_rgba(37,99,235,0.4)] transition-transform hover:bg-primary hover:-translate-y-px";

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <em
      className="not-italic bg-clip-text text-transparent"
      style={{ backgroundImage: "linear-gradient(135deg, #3FA1F7 0%, #174BB7 100%)" }}
    >
      {children}
    </em>
  );
}

function PhoneFrame({ label }: { label: string }) {
  return (
    <div className="relative z-[1] aspect-[256/520] w-[256px] rounded-[36px] bg-[#0B0E14] p-2 shadow-[0_24px_48px_-16px_rgba(11,14,20,0.22),0_2px_6px_rgba(11,14,20,0.06),0_0_0_1px_rgba(11,14,20,0.04)] lg:w-[280px]">
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px]"
        style={{
          backgroundColor: "#F2F4F8",
          backgroundImage:
            "repeating-linear-gradient(135deg, #F2F4F8 0 14px, rgba(11,14,20,0.025) 14px 15px)"
        }}
      >
        <div className="absolute left-1/2 top-[10px] h-6 w-[90px] -translate-x-1/2 rounded-xl bg-[#0B0E14]" />
        <div
          className="max-w-[80%] rounded-md border border-dashed border-[rgba(11,14,20,0.45)] px-3 py-1.5 text-center text-[11px] font-medium uppercase leading-[1.4] tracking-[0.08em] text-[rgba(11,14,20,0.45)]"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className={cn(manrope.variable, "min-h-screen w-full overflow-x-hidden bg-white text-[#0B0E14] antialiased")}>
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-[#0B0E14]/[0.08] bg-white/85 backdrop-blur-[12px] backdrop-saturate-[160%]">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-3.5 md:px-14 md:py-5">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="SnapQuote home">
            <BrandLogo size="sm" showWordmark={false} iconClassName="h-7 w-auto" />
            <span className="font-[var(--font-manrope)] text-lg font-bold tracking-[-0.02em] text-[#0B0E14]">
              SnapQuote
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-[#0B0E14]/[0.08] bg-[#0B0E14]/[0.04] px-4 py-2 text-sm font-medium text-[#0B0E14] transition-colors hover:bg-[#0B0E14]/[0.07]"
            >
              Log in
            </Link>
            <Button asChild className={cn(SMALL_CTA_CLASSES, "hidden md:inline-flex")}>
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO — asymmetric, left-aligned */}
      <section className="relative overflow-hidden px-[22px] pb-14 pt-7 md:px-14 md:pb-[148px] md:pt-[120px] lg:px-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(11,14,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(11,14,20,0.04) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 75%)"
          }}
        />
        <div className="relative z-[1] mx-auto w-full max-w-[1280px] text-left">
          <div
            className="mb-[18px] inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B0E14]/60 md:mb-6 md:text-xs"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            For outdoor service contractors
          </div>
          <h1
            className={cn(
              manrope.className,
              "m-0 mb-[22px] text-[60px] font-bold leading-[1.0] tracking-[-0.045em] text-[#0B0E14]",
              "md:text-[72px]",
              "lg:max-w-[14ch] lg:text-[96px]"
            )}
            style={{ textWrap: "balance" }}
          >
            {HEADLINE_LEAD}
            <GradientText>{HEADLINE_TAIL}</GradientText>
          </h1>
          <p className="m-0 mb-7 max-w-[620px] text-[18px] font-normal leading-[1.5] text-[#0B0E14]/60 md:text-[20px] lg:max-w-[640px] lg:text-[21px]">
            {SUBHEAD}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className={PRIMARY_CTA_CLASSES}>
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* DESKTOP DEMO — interactive ProductDemo (hidden on mobile per spec) */}
      <section className="hidden px-6 pb-20 lg:block lg:px-14 lg:pb-[120px] xl:px-24">
        <div className="mx-auto w-full max-w-[1180px]">
          <ProductDemo />
          <div
            className="mt-3.5 text-center text-xs text-[#0B0E14]/45"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            snapquote.us/app — your dashboard
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — 4 steps, alternating, with desktop connector line */}
      <section className="border-y border-[#0B0E14]/[0.08] bg-[#FAFAFB] px-6 py-20 md:px-14 md:py-[120px] lg:px-24">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="mb-14 text-left lg:mb-[88px] lg:text-center">
            <div
              className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              How it works
            </div>
            <h2
              className={cn(
                manrope.className,
                "m-0 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0B0E14]",
                "md:text-[44px]",
                "lg:mx-auto lg:max-w-[880px] lg:text-[56px]"
              )}
              style={{ textWrap: "balance" }}
            >
              Four steps. Then back to the work that pays.
            </h2>
          </div>

          <div className="relative flex flex-col gap-12 md:gap-[72px]">
            {/* Connector line — desktop only, behind the phones */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-10 left-1/2 top-10 hidden w-px -translate-x-1/2 lg:block"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(11,14,20,0.08) 8%, rgba(11,14,20,0.08) 92%, transparent 100%)"
              }}
            />

            {STEPS.map((step, i) => {
              const flip = i % 2 === 1;
              return (
                <div
                  key={step.num}
                  className={cn(
                    "relative flex flex-col items-center gap-7 text-center",
                    "lg:grid lg:grid-cols-2 lg:items-center lg:gap-20 lg:text-left"
                  )}
                >
                  <div className={cn("max-w-full lg:max-w-[460px]", flip ? "lg:order-2 lg:pl-10" : "lg:pr-10")}>
                    <div
                      className={cn(
                        manrope.className,
                        "mb-3 inline-block bg-clip-text text-[56px] font-bold leading-none tracking-[-0.04em] text-transparent lg:mb-4 lg:text-[88px]"
                      )}
                      style={{ backgroundImage: "linear-gradient(135deg, #3FA1F7 0%, #174BB7 100%)" }}
                    >
                      {step.num}
                    </div>
                    <h3
                      className={cn(
                        manrope.className,
                        "m-0 mb-3 text-[26px] font-bold leading-[1.15] tracking-[-0.025em] text-[#0B0E14] lg:mb-4 lg:text-[36px]"
                      )}
                    >
                      {step.title}
                    </h3>
                    <p className="m-0 max-w-[440px] text-base leading-[1.55] text-[#0B0E14]/60 lg:text-lg">
                      {step.body}
                    </p>
                  </div>
                  <div className={cn("flex justify-center", flip ? "lg:order-1" : "")}>
                    <PhoneFrame label={step.mediaLabel} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-white px-6 py-20 text-center md:px-14 md:py-[120px]">
        <div className="mx-auto w-full max-w-[720px]">
          <h2
            className={cn(
              manrope.className,
              "m-0 mb-8 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0B0E14]",
              "md:text-[44px]",
              "lg:mb-10 lg:text-[56px]"
            )}
            style={{ textWrap: "balance" }}
          >
            {HEADLINE_LEAD}
            <GradientText>{HEADLINE_TAIL}</GradientText>
          </h2>
          <Button asChild className={PRIMARY_CTA_CLASSES}>
            <Link href="/signup">Get Started Free</Link>
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#0B0E14]/[0.08] bg-white px-6 py-5 md:px-14 md:py-[22px]">
        <div className="flex items-center gap-2.5 text-xs text-[#0B0E14]/45">
          <BrandLogo size="sm" showWordmark={false} iconClassName="h-5 w-auto" />
          <span>© 2026 SnapQuote</span>
        </div>
        <div className="flex gap-5">
          <Link
            href="/privacy"
            className="text-xs text-[#0B0E14]/45 transition-colors hover:text-[#0B0E14]"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-xs text-[#0B0E14]/45 transition-colors hover:text-[#0B0E14]"
          >
            Terms
          </Link>
        </div>
      </footer>
    </main>
  );
}
