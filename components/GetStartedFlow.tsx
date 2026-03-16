"use client";

import { useMemo, useState } from "react";
import { ArrowRight, MapPin, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ServiceMultiSelectField } from "@/components/ServiceMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ServiceType } from "@/lib/services";

export function GetStartedFlow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<ServiceType[]>([]);
  const [areaInput, setAreaInput] = useState("");
  const [areas, setAreas] = useState<string[]>([]);

  const canContinue = step === 0 ? selectedWorkTypes.length > 0 : areas.length > 0;

  const subtitle = useMemo(() => {
    if (step === 0) {
      return "Tell us what type of work you do so we can shape the setup flow around your business.";
    }

    return "Add the cities, counties, or service areas you cover. We can wire this to autocomplete later.";
  }, [step]);

  const reset = () => {
    setOpen(false);
    setStep(0);
    setSelectedWorkTypes([]);
    setAreaInput("");
    setAreas([]);
  };

  const toggleWorkType = (value: ServiceType) => {
    setSelectedWorkTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const addArea = () => {
    const value = areaInput.trim();
    if (!value) return;
    if (!areas.some((area) => area.toLowerCase() === value.toLowerCase())) {
      setAreas((current) => [...current, value]);
    }
    setAreaInput("");
  };

  const removeArea = (value: string) => {
    setAreas((current) => current.filter((area) => area !== value));
  };

  const goToSignup = () => {
    const params = new URLSearchParams();
    if (selectedWorkTypes.length > 0) params.set("workTypes", selectedWorkTypes.join("|"));
    if (areas.length > 0) params.set("areas", areas.join("|"));
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
          <div className="relative w-full max-w-xl rounded-2xl border border-blue-100 bg-white p-6 shadow-2xl">
            <button
              type="button"
              aria-label="Close setup"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              onClick={reset}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6 flex items-center gap-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className={`h-2 flex-1 rounded-full ${
                    index <= step ? "bg-blue-600" : "bg-blue-100"
                  }`}
                />
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">
                Step {step + 1} of 2
              </p>
              <h2 className="text-2xl font-semibold text-gray-900">
                {step === 0 ? "What type of work do you do?" : "What areas do you cover?"}
              </h2>
              <p className="max-w-lg text-sm text-gray-600">{subtitle}</p>
            </div>

            {step === 0 ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-sm text-gray-600">
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
            ) : (
              <div className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="service-area">Search service area</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="service-area"
                        value={areaInput}
                        onChange={(event) => setAreaInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addArea();
                          }
                        }}
                        placeholder="Start typing a city, county, or area"
                        className="pl-9"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={addArea}>
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Placeholder search for now. Google Maps autocomplete can plug into this later.
                  </p>
                </div>

                <div className="min-h-16 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3">
                  {areas.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {areas.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => removeArea(area)}
                          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
                        >
                          {area}
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No service areas added yet. Add at least one to continue.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => (step === 0 ? reset() : setStep(0))}
              >
                {step === 0 ? "Cancel" : "Back"}
              </Button>
              <Button
                type="button"
                disabled={!canContinue}
                onClick={() => (step === 0 ? setStep(1) : goToSignup())}
              >
                {step === 0 ? "Continue" : "Continue to create account"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
