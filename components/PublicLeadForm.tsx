"use client";

import { useMemo, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { MultiServiceForm, type MultiServiceEntry } from "@/components/forms/MultiServiceForm";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubscriptionRequiredModal } from "@/components/SubscriptionRequiredModal";
import { Textarea } from "@/components/ui/textarea";
import {
  getRequiredQuestionIssues,
  OTHER_OUTDOOR_QUESTION_KEY,
  normalizeServiceQuestionAnswers,
  type ServiceQuestionAnswerValue
} from "@/lib/serviceQuestions";
import type { ServiceType } from "@/lib/services";

type Props = {
  contractorSlug: string;
};

const hasGooglePlacesKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
const MAX_PHOTO_UPLOADS = 10;
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function PublicLeadForm({ contractorSlug }: Props) {
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressPlaceId, setAddressPlaceId] = useState<string | undefined>(undefined);
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [services, setServices] = useState<MultiServiceEntry[]>([
    { service: "", answers: {}, addAnother: "no" }
  ]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const hasSelectedAddress = Boolean(
    addressPlaceId && address.trim().length >= 5 && lat !== undefined && lng !== undefined
  );

  const canSubmit = useMemo(() => {
    const hasSelectedServices =
      services.length > 0 && services.every((serviceEntry) => Boolean(serviceEntry.service));
    const hasRequiredAnswers = services
      .filter((serviceEntry): serviceEntry is MultiServiceEntry & { service: ServiceType } =>
        Boolean(serviceEntry.service)
      )
      .every((serviceEntry) => getRequiredQuestionIssues(serviceEntry.service, serviceEntry.answers).length === 0);

    return (
      hasGooglePlacesKey &&
      customerFirstName.trim().length >= 2 &&
      customerEmail.trim().length > 0 &&
      hasSelectedAddress &&
      hasSelectedServices &&
      hasRequiredAnswers &&
      photos.length >= 1
    );
  }, [customerFirstName, customerEmail, hasSelectedAddress, services, photos.length]);

  const handleAddressChange = (nextAddress: string) => {
    setAddress(nextAddress);
    setAddressPlaceId(undefined);
    setLat(undefined);
    setLng(undefined);
  };

  const handleServiceChange = (index: number, service: ServiceType | "") => {
    setServices((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              service,
              answers: {}
            }
          : entry
      )
    );
  };

  const handleAnswerChange = (index: number, key: string, value: ServiceQuestionAnswerValue) => {
    setServices((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? (() => {
              if (
                entry.service === "Other" &&
                key === OTHER_OUTDOOR_QUESTION_KEY &&
                typeof value === "string" &&
                value === "No"
              ) {
                return {
                  ...entry,
                  answers: {
                    [OTHER_OUTDOOR_QUESTION_KEY]: "No"
                  }
                };
              }

              return {
                ...entry,
                answers: {
                  ...entry.answers,
                  [key]: value
                }
              };
            })()
          : entry
      )
    );
  };

  const handleAddAnotherChange = (index: number, value: "no" | "yes") => {
    setServices((current) => {
      const next = current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, addAnother: value } : entry
      );

      if (value === "yes") {
        if (index === next.length - 1) {
          next.push({ service: "", answers: {}, addAnother: "no" });
        }
        return next;
      }

      return next.slice(0, index + 1);
    });
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasGooglePlacesKey) {
      toast.error("Google Places is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY first.");
      return;
    }

    if (!hasSelectedAddress) {
      toast.error("Select an address from the Google suggestions before submitting.");
      return;
    }

    if (!canSubmit) {
      toast.error("Complete all required fields, answer all service questions, and upload at least one photo.");
      return;
    }

    const selectedServiceEntries = services.filter(
      (serviceEntry): serviceEntry is MultiServiceEntry & { service: ServiceType } => Boolean(serviceEntry.service)
    );
    const missingQuestionIssue = selectedServiceEntries.flatMap((serviceEntry) =>
      getRequiredQuestionIssues(serviceEntry.service, serviceEntry.answers)
    )[0];

    if (missingQuestionIssue) {
      toast.error(missingQuestionIssue.message);
      return;
    }

    if (photos.length < 1) {
      toast.error("Upload at least one photo before submitting.");
      return;
    }

    if (photos.length > MAX_PHOTO_UPLOADS) {
      toast.error(`Upload up to ${MAX_PHOTO_UPLOADS} photos before submitting.`);
      return;
    }

    if (!turnstileToken) {
      toast.error("Bot verification failed.");
      return;
    }

    setLoading(true);
    try {
      const submitPath = "/api/public/lead-submit";
      const customerName = [customerFirstName.trim(), customerLastName.trim()]
        .filter(Boolean)
        .join(" ");
      const formData = new FormData();
      const selectedServiceAnswers = selectedServiceEntries
        .map((serviceEntry) => ({
          service: serviceEntry.service,
          answers: normalizeServiceQuestionAnswers(serviceEntry.service, serviceEntry.answers)
        }));

      formData.append("contractorSlug", contractorSlug);
      formData.append("customerName", customerName);
      formData.append("customerPhone", customerPhone.trim());
      formData.append("customerEmail", customerEmail.trim());
      formData.append("addressFull", address.trim());
      if (addressPlaceId) formData.append("addressPlaceId", addressPlaceId);
      if (lat !== undefined) formData.append("lat", String(lat));
      if (lng !== undefined) formData.append("lng", String(lng));
      selectedServiceAnswers.forEach((serviceEntry) => formData.append("services[]", serviceEntry.service));
      formData.append("serviceQuestionAnswers", JSON.stringify(selectedServiceAnswers));
      formData.append("description", description.trim());
      formData.append("turnstileToken", turnstileToken);
      photos.forEach((photo) => formData.append("photos", photo));

      const res = await fetch(submitPath, {
        method: "POST",
        credentials: "same-origin",
        body: formData
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
        photoUploadPartialFailure?: boolean;
      };
      if (res.status === 402 || json.code === "SUBSCRIPTION_INACTIVE") {
        setShowSubscriptionModal(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Failed to submit request.");
      setSubmitted(true);
      toast.success("Request sent.");
      if (json.photoUploadPartialFailure) {
        toast.error("Some photos failed to upload. Please try again.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] p-6 text-center">
        <p className="text-base font-semibold text-[#16A34A]">
          Request sent - you will receive your estimate shortly.
        </p>
      </div>
    );
  }

  return (
    <>
      <form className="space-y-5" onSubmit={onSubmit}>
        <p className="text-xs text-[#6B7280]">* Required fields</p>
        <AddressAutocomplete
          variant="public"
          label={
            <span>
              Address <span className="text-[#2563EB]">*</span>
            </span>
          }
          value={address}
          onAddressChange={handleAddressChange}
          onPlaceResolved={({ placeId, lat: latVal, lng: lngVal }) => {
            setAddressPlaceId(placeId);
            setLat(latVal);
            setLng(lngVal);
          }}
          invalid={address.trim().length > 0 && !hasSelectedAddress}
          helperText={
            hasGooglePlacesKey
              ? hasSelectedAddress
                ? "Google verified address selected."
                : "Start typing and choose one of the Google address suggestions."
              : "Google Places autocomplete requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."
          }
        />

        <MultiServiceForm
          services={services}
          onServiceChange={handleServiceChange}
          onAnswerChange={handleAnswerChange}
          onAddAnotherChange={handleAddAnotherChange}
        />

        <div className="space-y-2">
          <Label
            htmlFor="description"
            className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
          >
            Description
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us what work you need done."
            className="min-h-28 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
        </div>

        <PhotoUploader files={photos} setFiles={setPhotos} maxFiles={MAX_PHOTO_UPLOADS} required />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="customer-first-name"
              className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
            >
              First name <span className="text-[#2563EB]">*</span>
            </Label>
            <Input
              id="customer-first-name"
              value={customerFirstName}
              onChange={(e) => setCustomerFirstName(e.target.value)}
              required
              className="h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="customer-last-name"
              className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
            >
              Last name
            </Label>
            <Input
              id="customer-last-name"
              value={customerLastName}
              onChange={(e) => setCustomerLastName(e.target.value)}
              className="h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="customer-phone"
              className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
            >
              Phone
            </Label>
            <Input
              id="customer-phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="customer-email"
            className="mb-1.5 block text-[13px] font-semibold text-[#374151]"
          >
            Email <span className="text-[#2563EB]">*</span>
          </Label>
          <Input
            id="customer-email"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
            className="h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
        </div>

        {turnstileSiteKey ? (
          <div className="pt-2">
            <Turnstile
              siteKey={turnstileSiteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
          </div>
        ) : null}

        <Button
          className="mt-6 w-full rounded-[10px] py-3 text-base font-bold"
          disabled={!canSubmit || !turnstileToken || loading}
        >
          {loading ? "Sending..." : "Get My Estimate"}
        </Button>
      </form>
      <SubscriptionRequiredModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </>
  );
}
