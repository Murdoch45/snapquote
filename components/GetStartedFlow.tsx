"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ServiceMultiSelectField } from "@/components/ServiceMultiSelectField";
import { Button } from "@/components/ui/button";
import { type ServiceType } from "@/lib/services";

export function GetStartedFlow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<ServiceType[]>([]);

  const canContinue = selectedWorkTypes.length > 0;

  const reset = () => {
    setOpen(false);
    setSelectedWorkTypes([]);
  };

  const toggleWorkType = (value: ServiceType) => {
    setSelectedWorkTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const goToSignup = () => {
    const params = new URLSearchParams();
    if (selectedWorkTypes.length > 0) params.set("workTypes", selectedWorkTypes.join("|"));
    router.push(`/signup?${params.toString()}`);
  };

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        Get started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="relative w-full max-w-[calc(100vw-2rem)] rounded-2xl border border-blue-100 bg-card p-4 shadow-2xl sm:max-w-xl sm:p-6">
            <button
              type="button"
              aria-label="Close setup"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground/80"
              onClick={reset}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6">
              <div className="h-2 rounded-full bg-blue-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">
                What type of work do you do?
              </h2>
              <p className="max-w-lg text-sm text-muted-foreground">
                Tell us what type of work you do so we can shape the setup flow around your business.
              </p>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-sm text-muted-foreground">
                  Choose the services you want SnapQuote to match to your business profile.
                </p>
              </div>
              <ServiceMultiSelectField
                legend="Services offered"
                helperText="Choose every service your business wants to receive leads for."
                selectedServices={selectedWorkTypes}
                onToggle={toggleWorkType}
              />
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button type="button" disabled={!canContinue} onClick={goToSignup}>
                Continue to create account
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
