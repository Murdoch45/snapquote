"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SERVICE_OPTIONS, type ServiceType } from "@/lib/services";
import { cn } from "@/lib/utils";

type ServiceOption = {
  label: string;
  value: ServiceType;
};

const serviceLabelOverrides: Partial<Record<ServiceType, string>> = {
  "Pool Service / Cleaning": "Pool Cleaning / Service"
};

const serviceOptions: ServiceOption[] = SERVICE_OPTIONS.map((value) => ({
  value,
  label: serviceLabelOverrides[value] ?? value
}));

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessAddressPlaceId, setBusinessAddressPlaceId] = useState<string | null>(null);
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLng, setBusinessLng] = useState<number | null>(null);
  const [mobileContractor, setMobileContractor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasResolvedAddress = Boolean(
    businessAddress.trim() &&
      businessAddressPlaceId &&
      businessLat !== null &&
      businessLng !== null
  );

  const toggleService = (service: ServiceType, checked: boolean) => {
    setError(null);
    setServices((current) => {
      if (checked) {
        return current.includes(service) ? current : [...current, service];
      }

      return current.filter((item) => item !== service);
    });
  };

  const handleContinue = () => {
    if (step === 0 && services.length === 0) {
      setError("Select at least one service to continue.");
      return;
    }

    if (step === 1 && businessName.trim().length === 0) {
      setError("Enter your business name to continue.");
      return;
    }

    setError(null);
    setStep((current) => Math.min(current + 1, 2));
  };

  const handleBack = () => {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleAddressChange = (value: string) => {
    setError(null);
    setBusinessAddress(value);
    setBusinessAddressPlaceId(null);
    setBusinessLat(null);
    setBusinessLng(null);
  };

  const handleFinish = async () => {
    if (!mobileContractor && !hasResolvedAddress) {
      setError("Select your business address or choose no fixed business location.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/public/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          services,
          mobileContractor,
          formattedAddress: mobileContractor ? null : businessAddress.trim(),
          placeId: mobileContractor ? null : businessAddressPlaceId,
          latitude: mobileContractor ? null : businessLat,
          longitude: mobileContractor ? null : businessLng
        })
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        throw new Error(json.error || "Failed to finish onboarding.");
      }

      router.replace("/dashboard");
    } catch (finishError) {
      console.error("Onboarding failed", finishError);
      setError(finishError instanceof Error ? finishError.message : "Failed to finish onboarding.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="space-y-4 border-b border-gray-200 pb-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">Step {step + 1} of 3</p>
          <div className="flex gap-2">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  index <= step ? "bg-primary" : "bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6 pt-6 md:p-8 md:pt-8">
        {step === 0 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                What type of services does your business offer?
              </h1>
              <p className="text-sm text-gray-500">
                SnapQuote currently only supports outdoor property services.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Select all that apply.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {serviceOptions.map((option) => {
                  const checked = services.includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                        checked
                          ? "border-blue-200 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleService(option.value, value === true)}
                        className="mt-0.5"
                      />
                      <span className="font-medium text-gray-800">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              {services.includes("Other") ? (
                <p className="text-sm text-amber-700">
                  SnapQuote&apos;s AI estimates are most accurate for the services listed above.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                What&apos;s your business&apos;s name?
              </h1>
              <p className="text-sm text-gray-500">
                This is the name that will appear on customer request forms.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(event) => {
                  setError(null);
                  setBusinessName(event.target.value);
                }}
                placeholder="Blue Ridge Outdoor Services"
                className="h-11"
                required
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Where is your business located?
              </h1>
            </div>

            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <AddressAutocomplete
                label="Business address"
                inputId="business-address"
                value={businessAddress}
                onAddressChange={handleAddressChange}
                onPlaceResolved={({ placeId, lat, lng }) => {
                  setError(null);
                  setBusinessAddressPlaceId(placeId ?? null);
                  setBusinessLat(lat ?? null);
                  setBusinessLng(lng ?? null);
                }}
                disabled={mobileContractor}
                required={!mobileContractor}
                invalid={!mobileContractor && businessAddress.trim().length > 0 && !hasResolvedAddress}
                helperText={
                  mobileContractor
                    ? "You can finish without an address when you do not have a fixed business location."
                    : hasResolvedAddress
                      ? "Google verified business address selected."
                      : "Choose your business address from the Google dropdown."
                }
              />

              <label className="flex items-start gap-3 text-sm text-gray-700">
                <Checkbox
                  checked={mobileContractor}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setError(null);
                    setMobileContractor(isChecked);
                    if (isChecked) {
                      setBusinessAddress("");
                      setBusinessAddressPlaceId(null);
                      setBusinessLat(null);
                      setBusinessLng(null);
                    }
                  }}
                  className="mt-0.5"
                />
                <span>I don&apos;t have a fixed business location</span>
              </label>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <Button type="button" onClick={handleContinue}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={handleFinish} disabled={submitting}>
              {submitting ? "Finishing..." : "Finish"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
