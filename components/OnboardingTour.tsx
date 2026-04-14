"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  FileText,
  Link as LinkIcon,
  Settings,
  type LucideIcon
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type OnboardingTourProps = {
  enabled: boolean;
  slug?: string | null;
};

type TourStep = {
  icon: LucideIcon;
  title: string;
  body: string;
  previewType: "my-link" | "leads" | "estimates" | "settings";
};

const steps: TourStep[] = [
  {
    icon: LinkIcon,
    title: "Share your link, get leads",
    body: "Send this link directly to customers via text or email. You can also post it on your website or social media — every request comes straight to you with an AI estimate already built in.",
    previewType: "my-link"
  },
  {
    icon: FileText,
    title: "Leads come to you",
    body: "When a customer submits a request through your link, it shows up here with an AI estimate already built in. Unlock the ones worth your time.",
    previewType: "leads"
  },
  {
    icon: ClipboardList,
    title: "Send your price in seconds",
    body: "See all the estimates you've sent to customers right here — track which ones have been viewed, accepted, or are still waiting on a reply.",
    previewType: "estimates"
  },
  {
    icon: Settings,
    title: "Set up your profile",
    body: "Add your business name, phone number, and address so customers know exactly who they're hearing from.",
    previewType: "settings"
  }
];

const ONBOARDING_TOUR_STORAGE_PREFIX = "snapquote:onboarding-tour-completed";
const PREVIEW_CANVAS_WIDTH = 640;
const PREVIEW_CANVAS_HEIGHT = 295;
const PREVIEW_SCALE = 0.61;

function MiniMyLinkPreview({ slug }: { slug?: string | null }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted px-14">
      <div className="w-full max-w-[520px] rounded-[14px] border border-border bg-card p-8 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <p className="text-[14px] font-medium text-muted-foreground">Share your link</p>
        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-border bg-muted p-3">
          <div className="flex-1 rounded-[12px] bg-card px-4 py-3 text-[16px] font-medium text-slate-700 shadow-sm">
            snapquote.us/{slug || "your-link"}
          </div>
          <button
            type="button"
            className="rounded-[12px] bg-primary px-5 py-3 text-[14px] font-semibold text-white"
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
    <div className="h-full bg-muted p-10">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-semibold text-emerald-700">
              Pressure Washing
            </span>
            <p className="mt-4 text-[22px] font-semibold text-foreground">Scottsdale, AZ</p>
            <p className="mt-2 text-[15px] text-muted-foreground">4 photos</p>
          </div>
          <button
            type="button"
            className="rounded-[12px] border border-border bg-card px-4 py-2 text-[14px] font-semibold text-slate-700"
          >
            Unlock
          </button>
        </div>
        <div className="mt-6 rounded-[14px] bg-accent px-5 py-4">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-primary">
            AI Estimate
          </p>
          <p className="mt-2 text-[26px] font-semibold text-primary">$325 - $450</p>
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
    <div className="h-full bg-muted p-8">
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="grid grid-cols-[2.2fr_1.5fr_1fr_1fr] gap-4 border-b border-border px-5 py-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
            <span className="font-semibold text-foreground">{row[0]}</span>
            <span>{row[1]}</span>
            <span className="font-semibold text-foreground">{row[2]}</span>
            <span
              className={
                row[3] === "Accepted"
                  ? "font-semibold text-emerald-600"
                  : row[3] === "Viewed"
                    ? "font-semibold text-amber-600"
                    : "font-semibold text-muted-foreground"
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
    <div className="h-full bg-muted p-10">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.18)]">
        <div className="space-y-4">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="mb-2 text-[13px] font-medium text-muted-foreground">{label}</p>
              <div className="rounded-[12px] border border-border bg-muted px-4 py-3 text-[15px] text-slate-800">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderPreview(previewType: string, slug?: string | null) {
  switch (previewType) {
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

export function OnboardingTour({ enabled, slug }: OnboardingTourProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [hasResolvedVisibility, setHasResolvedVisibility] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStepVisible, setIsStepVisible] = useState(true);

  const currentStep = steps[stepIndex];
  const isDashboard = pathname === "/app" || pathname === "/app/";
  const isLast = stepIndex === steps.length - 1;

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

  const Icon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-5">
      <div
        className={`w-full max-w-[440px] rounded-[18px] bg-card p-5 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.25)] transition-all duration-200 sm:p-6 ${
          isStepVisible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        }`}
      >
        {/* Step dots */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === stepIndex
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Preview */}
        <div
          className="mb-5 overflow-hidden rounded-[14px] border border-border bg-muted"
          style={{ height: Math.round(PREVIEW_CANVAS_HEIGHT * PREVIEW_SCALE) }}
        >
          <div
            style={{
              width: PREVIEW_CANVAS_WIDTH,
              height: PREVIEW_CANVAS_HEIGHT,
              transform: `scale(${PREVIEW_SCALE})`,
              transformOrigin: "top left",
              fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif'
            }}
          >
            {renderPreview(currentStep.previewType, slug)}
          </div>
        </div>

        {/* Icon + Title */}
        <div className="mb-2.5 flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
            <Icon className="h-[18px] w-[18px] text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground sm:text-xl">
            {currentStep.title}
          </h3>
        </div>

        {/* Body */}
        <p className="mb-3.5 text-sm leading-relaxed text-muted-foreground">
          {currentStep.body}
        </p>

        {/* Counter */}
        <p className="mb-3.5 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          {stepIndex + 1} of {steps.length}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void completeTour()}
            disabled={isSubmitting}
            className="px-1 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
                disabled={isSubmitting}
                className="rounded-[10px] border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  void completeTour(true);
                  return;
                }
                setStepIndex((i) => Math.min(i + 1, steps.length - 1));
              }}
              disabled={isSubmitting}
              className="rounded-[10px] bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
