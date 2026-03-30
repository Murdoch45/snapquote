"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type OnboardingTourProps = {
  enabled: boolean;
  slug?: string | null;
};

type TourStep = {
  targetId: string;
  title: string;
  body: string;
};

const steps: TourStep[] = [
  {
    targetId: "my-link",
    title: "Share your link, get leads",
    body: "Send this link directly to customers via text or email. You can also post it on your website or social media — every request comes straight to you with an AI estimate already built in."
  },
  {
    targetId: "leads",
    title: "Leads come to you",
    body: "When a customer submits a request through your link, it shows up here with an AI estimate already built in. Unlock the ones worth your time."
  },
  {
    targetId: "estimates",
    title: "Send your price in seconds",
    body: "See all the estimates you've sent to customers right here — track which ones have been viewed, accepted, or are still waiting on a reply."
  },
  {
    targetId: "settings",
    title: "Set up your profile",
    body: "Add your business name, phone number, and address so customers know exactly who they're hearing from."
  }
];

const CARD_WIDTH = 480;
const PREVIEW_SCALE = 0.61;
const PREVIEW_CANVAS_WIDTH = 720;
const PREVIEW_CANVAS_HEIGHT = 360;
const ONBOARDING_TOUR_STORAGE_PREFIX = "snapquote:onboarding-tour-completed";

function MiniMyLinkPreview({ slug }: { slug?: string | null }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#F8F9FC] px-14">
      <div className="w-full max-w-[520px] rounded-[14px] border border-slate-200 bg-white p-8 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <p className="text-[14px] font-medium text-slate-500">Share your link</p>
        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-slate-200 bg-[#F8F9FC] p-3">
          <div className="flex-1 rounded-[12px] bg-white px-4 py-3 text-[16px] font-medium text-slate-700 shadow-sm">
            snapquote.us/{slug || "your-link"}
          </div>
          <button
            type="button"
            className="rounded-[12px] bg-[#2563EB] px-5 py-3 text-[14px] font-semibold text-white"
          >
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniLeadsPreview() {
  return (
    <div className="h-full bg-[#F8F9FC] p-10">
      <div className="rounded-[14px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-semibold text-emerald-700">
              Pressure Washing
            </span>
            <p className="mt-4 text-[22px] font-semibold text-slate-900">Scottsdale, AZ</p>
            <p className="mt-2 text-[15px] text-slate-500">4 photos</p>
          </div>
          <button
            type="button"
            className="rounded-[12px] border border-slate-200 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700"
          >
            Unlock
          </button>
        </div>
        <div className="mt-6 rounded-[14px] bg-[#EFF6FF] px-5 py-4">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#2563EB]">
            AI Estimate
          </p>
          <p className="mt-2 text-[26px] font-semibold text-[#2563EB]">$325 - $450</p>
        </div>
      </div>
    </div>
  );
}

function MiniEstimatesPreview() {
  const rows = [
    ["Maria Gonzalez", "Lawn Care", "$185", "Viewed"],
    ["James Patel", "Pressure Washing", "$420", "Accepted"],
    ["Tony Ruiz", "Fence Installation", "$1,100", "Sent"]
  ];

  return (
    <div className="h-full bg-[#F8F9FC] p-8">
      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="grid grid-cols-[2.2fr_1.5fr_1fr_1fr] gap-4 border-b border-slate-200 px-5 py-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span>Customer</span>
          <span>Service</span>
          <span>Amount</span>
          <span>Status</span>
        </div>
        {rows.map((row) => (
          <div
            key={row[0]}
            className="grid grid-cols-[2.2fr_1.5fr_1fr_1fr] gap-4 border-b border-slate-100 px-5 py-4 text-[14px] text-slate-700 last:border-b-0"
          >
            <span className="font-semibold text-slate-900">{row[0]}</span>
            <span>{row[1]}</span>
            <span className="font-semibold text-slate-900">{row[2]}</span>
            <span
              className={
                row[3] === "Accepted"
                  ? "font-semibold text-emerald-600"
                  : row[3] === "Viewed"
                    ? "font-semibold text-amber-600"
                    : "font-semibold text-slate-500"
              }
            >
              {row[3]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSettingsPreview() {
  const fields = [
    ["Business Name", "Rivera's Pressure Washing"],
    ["Phone", "(602) 555-0187"],
    ["Address", "4821 W Camelback Rd, Phoenix, AZ"]
  ];

  return (
    <div className="h-full bg-[#F8F9FC] p-10">
      <div className="rounded-[14px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="space-y-4">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="mb-2 text-[13px] font-medium text-slate-500">{label}</p>
              <div className="rounded-[12px] border border-slate-200 bg-[#F8F9FC] px-4 py-3 text-[15px] text-slate-800">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderPreview(targetId: TourStep["targetId"], slug?: string | null) {
  switch (targetId) {
    case "my-link":
      return <MiniMyLinkPreview slug={slug} />;
    case "leads":
      return <MiniLeadsPreview />;
    case "estimates":
      return <MiniEstimatesPreview />;
    case "settings":
      return <MiniSettingsPreview />;
    default:
      return null;
  }
}

function restoreHighlight(element: HTMLElement | null) {
  if (!element) return;
  element.style.position = element.dataset.tourPrevPosition ?? "";
  element.style.zIndex = element.dataset.tourPrevZIndex ?? "";
  element.style.boxShadow = element.dataset.tourPrevBoxShadow ?? "";
  element.style.background = element.dataset.tourPrevBackground ?? "";
  element.style.borderRadius = element.dataset.tourPrevBorderRadius ?? "";
  element.style.transition = element.dataset.tourPrevTransition ?? "";
  delete element.dataset.tourPrevPosition;
  delete element.dataset.tourPrevZIndex;
  delete element.dataset.tourPrevBoxShadow;
  delete element.dataset.tourPrevBackground;
  delete element.dataset.tourPrevBorderRadius;
  delete element.dataset.tourPrevTransition;
}

function highlightTarget(element: HTMLElement | null) {
  if (!element) return;
  element.dataset.tourPrevPosition = element.style.position;
  element.dataset.tourPrevZIndex = element.style.zIndex;
  element.dataset.tourPrevBoxShadow = element.style.boxShadow;
  element.dataset.tourPrevBackground = element.style.background;
  element.dataset.tourPrevBorderRadius = element.style.borderRadius;
  element.dataset.tourPrevTransition = element.style.transition;
  element.style.position = "relative";
  element.style.zIndex = "61";
  element.style.borderRadius = "12px";
  element.style.transition = "box-shadow 220ms ease, background-color 220ms ease";
  element.style.background = "rgba(239, 246, 255, 0.95)";
  element.style.boxShadow =
    "0 0 0 2px #3B82F6, 0 0 0 7px rgba(59,130,246,0.18), 0 14px 30px -18px rgba(37,99,235,0.65)";
}

export function OnboardingTour({ enabled, slug }: OnboardingTourProps) {
  const pathname = usePathname();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hasResolvedVisibility, setHasResolvedVisibility] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStepVisible, setIsStepVisible] = useState(true);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [tailOffset, setTailOffset] = useState<number | null>(null);

  const currentStep = steps[stepIndex];
  const isDashboard = pathname === "/app" || pathname === "/app/";

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setVisible(false);
      setStorageKey(null);
      setHasResolvedVisibility(true);
      return;
    }

    setHasResolvedVisibility(false);

    const resolveVisibility = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        const nextStorageKey = `${ONBOARDING_TOUR_STORAGE_PREFIX}:${user?.id ?? "anonymous"}`;
        if (cancelled) return;

        setStorageKey(nextStorageKey);
        setVisible(window.localStorage.getItem(nextStorageKey) !== "true");
      } catch {
        if (cancelled) return;
        setStorageKey(null);
        setVisible(false);
      } finally {
        if (!cancelled) {
          setHasResolvedVisibility(true);
        }
      }
    };

    void resolveVisibility();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!visible) return;
    setIsStepVisible(false);
    const timeout = window.setTimeout(() => setIsStepVisible(true), 60);
    return () => window.clearTimeout(timeout);
  }, [stepIndex, visible]);

  useEffect(() => {
    if (!visible || !isDashboard) return;

    const selector = `[data-tour-id="${currentStep.targetId}"]`;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;

    const updateLayout = () => {
      const rect = element.getBoundingClientRect();
      const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 520;
      const prefersMobileLayout = window.innerWidth < 768;

      if (prefersMobileLayout) {
        const mobileTop = Math.min(rect.bottom + 20, window.innerHeight - cardHeight - 24);
        setTooltipStyle({
          left: 16,
          top: Math.max(16, mobileTop),
          width: "calc(100vw - 32px)",
          maxWidth: CARD_WIDTH
        });
        setTailOffset(null);
        return;
      }

      const tailWidth = 14;
      const left = Math.min(rect.right + tailWidth + 14, window.innerWidth - CARD_WIDTH - 24);
      const top = Math.min(
        Math.max(rect.top + rect.height / 2 - cardHeight / 2, 24),
        window.innerHeight - cardHeight - 24
      );
      const targetCenterY = rect.top + rect.height / 2;
      const tailCenterY = Math.max(22, Math.min(cardHeight - 22, targetCenterY - top));

      setTooltipStyle({
        left,
        top,
        width: CARD_WIDTH
      });
      setTailOffset(tailCenterY);
    };

    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    highlightTarget(element);
    const frame = window.requestAnimationFrame(updateLayout);

    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.cancelAnimationFrame(frame);
      restoreHighlight(element);
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [currentStep.targetId, isDashboard, visible]);

  const completeTour = async (showDoneToast = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST"
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error || "Failed to complete onboarding tour.");
      }

      if (storageKey) {
        window.localStorage.setItem(storageKey, "true");
      }

      setVisible(false);
      if (showDoneToast) {
        toast.success("You're all set! Start by sharing your link.");
      }
      router.refresh();
      router.push("/app");
    } catch {
      toast.error("Couldn't save onboarding progress. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasResolvedVisibility || !visible || !enabled || !isDashboard) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div className="relative h-full w-full">
        <div
          ref={cardRef}
          className={`pointer-events-auto fixed rounded-[14px] border border-slate-700/80 bg-[#1e293b] p-5 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.65)] transition-all duration-300 ${
            isStepVisible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          style={tooltipStyle}
        >
          {tailOffset !== null ? (
            <div
              className="pointer-events-none absolute -left-[12px] h-0 w-0 border-y-[12px] border-y-transparent border-r-[12px] border-r-[#1e293b]"
              style={{ top: tailOffset - 12 }}
            />
          ) : null}
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-300">
            {stepIndex + 1} of {steps.length}
          </p>

          <div className="mt-4 h-[220px] overflow-hidden rounded-[12px] border border-slate-600 bg-[#F8F9FC]">
            <div
              style={{
                width: PREVIEW_CANVAS_WIDTH,
                height: PREVIEW_CANVAS_HEIGHT,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: "top left",
                fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif'
              }}
            >
              {renderPreview(currentStep.targetId, slug)}
            </div>
          </div>

          <h3 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-white">
            {currentStep.title}
          </h3>
          <p className="mt-3 text-[15px] leading-7 text-slate-200">{currentStep.body}</p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void completeTour()}
              disabled={isSubmitting}
              className="rounded-[10px] px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white disabled:opacity-60"
            >
              Skip
            </button>

            <button
              type="button"
              onClick={() => {
                if (stepIndex === steps.length - 1) {
                  void completeTour(true);
                  return;
                }
                setStepIndex((current) => Math.min(current + 1, steps.length - 1));
              }}
              disabled={isSubmitting}
              className="rounded-[10px] bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              {stepIndex === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
