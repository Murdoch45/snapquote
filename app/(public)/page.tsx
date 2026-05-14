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

type PhoneFrameVariant = "default" | "web";

type Step = {
  num: string;
  title: string;
  body: string;
  mediaLabel: string;
  videoSrc: string;
  variant?: PhoneFrameVariant;
  // Per-step horizontal object-position override for variant="web". Pixel-
  // accurate content midpoints (measured via pngjs frame analysis at
  // multiple timestamps) determine each video's offset from source center;
  // these values recenter the form/UI inside the phone frame. Default for
  // web variant is "60% 50%" — only set this when a step needs different.
  webObjectPosition?: string;
  // When true, suppress the synthetic IOSHomeIndicator overlay. Used for
  // steps whose source recording already shows the real iPhone home
  // indicator pill baked into the bottom of the video — drawing the
  // synthetic one on top would create a visible double-pill at the bottom.
  hideHomeIndicator?: boolean;
};

const STEPS: Step[] = [
  {
    num: "01",
    title: "Share your link",
    body: "Drop your personal SnapQuote link in a text, share it on social media, or put it in your bio.",
    mediaLabel: "Screen recording — share link",
    videoSrc: "/videos/landing/step-1.mp4",
    variant: "web",
    // step-1's share-sheet scene (around t=3) has content extending
    // further right than the My-Link scene: rightmost non-white pixel at
    // source x=911 vs ~879 in the earlier scenes. At the web variant's
    // default 60% bias that share-sheet scene's content lands with
    // margins ~12.7 display px left / ~3.4 display px right in the mobile
    // 240-wide container — visibly offset right. Override to 70% to bias
    // the visible window further right (= content visually shifts left),
    // producing ~8.8 left / ~7.3 right at the share-sheet scene while
    // keeping the hamburger / "My Link" left edge (source x=128) inside
    // the container at ~8 display px from container left.
    webObjectPosition: "70% 50%"
  },
  {
    num: "02",
    title: "Customer tells you about the job",
    body: "They open the link and answer a few questions about what they need. Takes them under a minute.",
    mediaLabel: "Screen recording — customer flow",
    videoSrc: "/videos/landing/step-2.mp4",
    variant: "web"
  },
  {
    num: "03",
    title: "Get an instant estimate with the price",
    body: "Our AI tools build a complete estimate using property data and the customer's answers. You see it before they do.",
    mediaLabel: "Screen recording — estimate built",
    videoSrc: "/videos/landing/step-3.mp4",
    variant: "web",
    // step-3's leads-list content is essentially horizontally centered in the
    // source (measured avg offset ~0 source px across t=0.5/2/3) — using the
    // default 60% bias would push it visibly left of the phone frame's center.
    webObjectPosition: "50% 50%",
    // Source recording (iPhone app screen) already contains the real
    // iPhone home indicator pill at the bottom — skip the synthetic one
    // to avoid stacking two indicators.
    hideHomeIndicator: true
  },
  {
    num: "04",
    title: "Send it or pass",
    body: "Worth your time? Send. Not worth driving across town for? Pass. Your call, every time.",
    mediaLabel: "Screen recording — send or pass",
    videoSrc: "/videos/landing/step-4.mp4",
    variant: "web",
    // Same as step-3: real iPhone home indicator pill is part of the
    // recording at the bottom of the video; suppress the synthetic one.
    hideHomeIndicator: true
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

// iOS status bar overlay for variant="web" phone frames. Renders a synthetic
// status bar (time on the left, signal/wifi/battery glyphs on the right) that
// sits flush above the recorded form video so the result reads as a real
// iPhone screen instead of a Safari-chrome-cropped recording. The Canva source
// for step-2 is cropped with deliberate ~80px top whitespace at full
// resolution; at the phone-frame's display scale that maps to ~28px which the
// status bar covers — so the form starts immediately below the status bar.
function IOSStatusBar() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[28px] items-center justify-between bg-white px-[18px] text-[11px] font-semibold leading-none text-[#0B0E14] lg:h-[31px] lg:px-[20px] lg:text-[12px]"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
        fontFeatureSettings: '"tnum"'
      }}
    >
      <span className="tracking-[-0.01em]">9:41</span>
      <div className="flex items-center gap-[5px]">
        <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="2.8" height="3" rx="0.6" />
          <rect x="4.4" y="5" width="2.8" height="5" rx="0.6" />
          <rect x="8.8" y="2.5" width="2.8" height="7.5" rx="0.6" />
          <rect x="13.2" y="0" width="2.8" height="10" rx="0.6" />
        </svg>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
          <path
            d="M1 3.2C2.7 1.7 4.8.9 7 .9c2.2 0 4.3.8 6 2.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M3 5.4c1.1-1 2.5-1.5 4-1.5s2.9.5 4 1.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M5.2 7.6c.5-.5 1.1-.7 1.8-.7s1.3.2 1.8.7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="7" cy="9.2" r="0.9" fill="currentColor" />
        </svg>
        <svg width="24" height="11" viewBox="0 0 24 11" fill="none" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="20"
            height="10"
            rx="2.5"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <rect x="2" y="2" width="17" height="7" rx="1.3" fill="currentColor" />
          <path
            d="M22 4.2v2.6"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

// iOS home indicator overlay — the swipe-up affordance hint pill at the bottom
// of the screen. Position is matched to where it sits on iPhone 14/15 (small
// margin from the bottom edge of the safe area). The Canva recording's own
// faint home indicator falls slightly lower / thinner; this overlay sits above
// it without overlapping in practice.
function IOSHomeIndicator() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-[6px] left-1/2 z-10 h-[3.5px] w-[88px] -translate-x-1/2 rounded-full bg-[#0B0E14]/85 lg:bottom-[7px] lg:w-[96px]"
    />
  );
}

function PhoneFrame({
  label,
  videoSrc,
  variant = "default",
  webObjectPosition,
  hideHomeIndicator = false
}: {
  label: string;
  videoSrc?: string;
  variant?: PhoneFrameVariant;
  webObjectPosition?: string;
  hideHomeIndicator?: boolean;
}) {
  return (
    <div className="relative z-[1] aspect-[256/520] w-[256px] rounded-[36px] bg-[#0B0E14] p-2 shadow-[0_24px_48px_-16px_rgba(11,14,20,0.22),0_2px_6px_rgba(11,14,20,0.06),0_0_0_1px_rgba(11,14,20,0.04)] lg:w-[280px]">
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[28px]"
        style={
          videoSrc
            ? { backgroundColor: "#0B0E14" }
            : {
                backgroundColor: "#F2F4F8",
                backgroundImage:
                  "repeating-linear-gradient(135deg, #F2F4F8 0 14px, rgba(11,14,20,0.025) 14px 15px)"
              }
        }
      >
        {videoSrc ? (
          <>
            <video
              src={videoSrc}
              aria-label={label}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className={cn(
                "absolute inset-0 block h-full w-full object-cover",
                // Default variant keeps Tailwind's object-center. Web variant
                // applies its object-position via inline style so each step
                // can pass its own (most steps share "60% 50%" — see STEPS).
                variant === "web" ? null : "object-center"
              )}
              style={
                variant === "web"
                  ? { objectPosition: webObjectPosition ?? "60% 50%" }
                  : undefined
              }
            />
            {variant === "web" ? (
              <>
                <IOSStatusBar />
                {hideHomeIndicator ? null : <IOSHomeIndicator />}
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="absolute left-1/2 top-[10px] h-6 w-[90px] -translate-x-1/2 rounded-xl bg-[#0B0E14]" />
            <div
              className="max-w-[80%] rounded-md border border-dashed border-[rgba(11,14,20,0.45)] px-3 py-1.5 text-center text-[11px] font-medium uppercase leading-[1.4] tracking-[0.08em] text-[rgba(11,14,20,0.45)]"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {label}
            </div>
          </>
        )}
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

      {/* PROMO BANNER — slim black strip below the nav divider */}
      <div className="flex w-full items-center justify-center gap-3 bg-black px-4 py-1.5 text-white">
        <span className="whitespace-nowrap text-xs font-medium tracking-tight text-white">
          Now on the App Store
        </span>
        <a
          href="https://apps.apple.com/app/snapquote-contractor-leads/id6761979056"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download SnapQuote on the App Store"
          className="inline-flex transition-transform hover:-translate-y-px"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/app-store-badge.svg"
            alt="Download on the App Store"
            width={78}
            height={26}
            className="block h-6 w-auto"
          />
        </a>
      </div>

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
            className="mb-[18px] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B0E14]/60 md:mb-6 md:text-xs"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
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
                    <PhoneFrame
                      label={step.mediaLabel}
                      videoSrc={step.videoSrc}
                      variant={step.variant}
                      webObjectPosition={step.webObjectPosition}
                      hideHomeIndicator={step.hideHomeIndicator}
                    />
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
      <footer className="flex flex-col items-center gap-4 border-t border-[#0B0E14]/[0.08] bg-white px-6 py-5 md:flex-row md:flex-wrap md:justify-between md:gap-3 md:px-14 md:py-[22px]">
        <a
          href="https://apps.apple.com/app/snapquote-contractor-leads/id6761979056"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download SnapQuote on the App Store"
          className="inline-flex transition-transform hover:-translate-y-px md:order-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/app-store-badge.svg"
            alt="Download on the App Store"
            width={120}
            height={40}
            className="block h-10 w-auto"
          />
        </a>
        <div className="flex items-center gap-2.5 text-xs text-[#0B0E14]/45 md:order-2">
          <BrandLogo size="sm" showWordmark={false} iconClassName="h-5 w-auto" />
          <span>© 2026 SnapQuote</span>
        </div>
        <div className="flex gap-5 md:order-3">
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
