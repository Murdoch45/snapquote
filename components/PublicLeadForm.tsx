"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { MultiServiceForm, type MultiServiceEntry } from "@/components/forms/MultiServiceForm";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { PhotoUploader, type PhotoEntry } from "@/components/PhotoUploader";
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

// Browser-safe v4 UUID. Used for the tempLeadId — generated once at form
// mount, becomes the lead row's id at submit time, and is the path
// segment under which photos upload to Storage. crypto.randomUUID is
// available in all browsers we target (HTTPS-only contexts) so no
// polyfill needed.
function generateTempLeadId(): string {
  return crypto.randomUUID();
}

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
  // Photos use per-entry state because each one uploads independently
  // as the customer picks it. submit doesn't wait for in-flight
  // uploads — anything not "done" at submit time attaches itself to
  // the lead row in the background via /api/public/lead-photo-upload.
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  // Generated once when the form mounts. This becomes the lead row's
  // primary key on successful submit, AND it's already encoded in every
  // photo's storage path (uploaded via /api/public/lead-photo-upload),
  // which is how in-flight photos attach to the lead row when they
  // finish — no rename or move needed.
  const [tempLeadId] = useState<string>(() => generateTempLeadId());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Track in-flight uploads via AbortController so we can cancel them
  // on remove (otherwise a removed photo could still successfully land
  // in Storage and have its setState race against a removed entry —
  // mostly cosmetic but worth being clean about).
  const inflightControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    const map = inflightControllersRef.current;
    return () => {
      // On unmount, abort everything still in-flight. The customer is
      // either at the thank-you screen (submitted) or has navigated
      // away. submitted=true implies the lead row exists so a late
      // upload would still attach via the upload endpoint's
      // auto-attach branch — but during dev / mid-form-fill teardown
      // we don't want orphan requests to keep running.
      map.forEach((controller) => controller.abort());
      map.clear();
    };
  }, []);

  const hasSelectedAddress = Boolean(
    addressPlaceId && address.trim().length >= 5 && lat !== undefined && lng !== undefined
  );

  const photoCounts = useMemo(() => {
    let done = 0;
    let uploading = 0;
    let failed = 0;
    for (const entry of photoEntries) {
      if (entry.status === "done") done += 1;
      else if (entry.status === "uploading") uploading += 1;
      else failed += 1;
    }
    return { done, uploading, failed };
  }, [photoEntries]);

  const canSubmit = useMemo(() => {
    const hasSelectedServices =
      services.length > 0 && services.every((serviceEntry) => Boolean(serviceEntry.service));
    const hasRequiredAnswers = services
      .filter((serviceEntry): serviceEntry is MultiServiceEntry & { service: ServiceType } =>
        Boolean(serviceEntry.service)
      )
      .every((serviceEntry) => getRequiredQuestionIssues(serviceEntry.service, serviceEntry.answers).length === 0);

    // At least one photo must be picked. It can be done OR still
    // uploading — we don't gate submit on uploads finishing. But any
    // failed photos must be retried or removed first; otherwise they're
    // dropped silently and we'd be lying to the customer about what was
    // sent.
    const hasUsablePhotos = photoCounts.done + photoCounts.uploading >= 1;
    const hasNoFailedPhotos = photoCounts.failed === 0;

    return (
      hasGooglePlacesKey &&
      customerFirstName.trim().length >= 2 &&
      customerEmail.trim().length > 0 &&
      hasSelectedAddress &&
      hasSelectedServices &&
      hasRequiredAnswers &&
      hasUsablePhotos &&
      hasNoFailedPhotos
    );
  }, [
    customerFirstName,
    customerEmail,
    hasSelectedAddress,
    services,
    photoCounts.done,
    photoCounts.uploading,
    photoCounts.failed
  ]);

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

  // Fires the per-photo upload to /api/public/lead-photo-upload. Updates
  // the matching entry's status when it resolves. Aborted on remove.
  const uploadEntry = async (entry: PhotoEntry) => {
    const controller = new AbortController();
    inflightControllersRef.current.set(entry.localId, controller);

    try {
      const formData = new FormData();
      formData.append("photo", entry.file);
      formData.append("contractorSlug", contractorSlug);
      formData.append("tempLeadId", tempLeadId);

      const res = await fetch("/api/public/lead-photo-upload", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        storagePath?: string;
        publicUrl?: string;
        error?: string;
      } | null;

      if (!res.ok || !json?.success || !json.storagePath) {
        const message = json?.error || `Upload failed (${res.status}).`;
        setPhotoEntries((prev) =>
          prev.map((existing) =>
            existing.localId === entry.localId
              ? { ...existing, status: "failed", errorMessage: message }
              : existing
          )
        );
        return;
      }

      setPhotoEntries((prev) =>
        prev.map((existing) =>
          existing.localId === entry.localId
            ? {
                ...existing,
                status: "done",
                storagePath: json.storagePath,
                publicUrl: json.publicUrl,
                errorMessage: undefined
              }
            : existing
        )
      );
    } catch (error) {
      // AbortError = customer removed / replaced this entry; no UI
      // change needed because the entry is already gone from state.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPhotoEntries((prev) =>
        prev.map((existing) =>
          existing.localId === entry.localId
            ? {
                ...existing,
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Upload failed."
              }
            : existing
        )
      );
    } finally {
      inflightControllersRef.current.delete(entry.localId);
    }
  };

  const handleAddPhotos = (files: File[]) => {
    if (files.length === 0) return;
    const newEntries: PhotoEntry[] = files.map((file) => ({
      localId: crypto.randomUUID(),
      file,
      status: "uploading"
    }));
    setPhotoEntries((prev) => [...prev, ...newEntries]);
    // Fire all uploads in parallel — each is its own request, and the
    // browser caps concurrency naturally.
    newEntries.forEach((entry) => {
      void uploadEntry(entry);
    });
  };

  const handleRemovePhoto = (localId: string) => {
    const controller = inflightControllersRef.current.get(localId);
    if (controller) {
      controller.abort();
      inflightControllersRef.current.delete(localId);
    }
    setPhotoEntries((prev) => prev.filter((entry) => entry.localId !== localId));
  };

  const handleRetryPhoto = (localId: string) => {
    const target = photoEntries.find((entry) => entry.localId === localId);
    if (!target) return;
    setPhotoEntries((prev) =>
      prev.map((existing) =>
        existing.localId === localId
          ? { ...existing, status: "uploading", errorMessage: undefined }
          : existing
      )
    );
    void uploadEntry({ ...target, status: "uploading", errorMessage: undefined });
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

    if (photoCounts.done + photoCounts.uploading < 1) {
      toast.error("Upload at least one photo before submitting.");
      return;
    }
    if (photoCounts.failed > 0) {
      toast.error("Retry or remove failed photos before submitting.");
      return;
    }
    if (photoEntries.length > MAX_PHOTO_UPLOADS) {
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
      const selectedServiceAnswers = selectedServiceEntries.map((serviceEntry) => ({
        service: serviceEntry.service,
        answers: normalizeServiceQuestionAnswers(serviceEntry.service, serviceEntry.answers)
      }));

      // Snapshot the photo entries that have already finished uploading
      // by submit time. In-flight uploads (status === "uploading") are
      // intentionally NOT awaited — they'll attach to the lead row in
      // the background once they finish, via the auto-attach branch in
      // /api/public/lead-photo-upload. The form returns success
      // immediately whether they finish before or after.
      const donePhotoStoragePaths = photoEntries
        .filter((entry) => entry.status === "done" && entry.storagePath && entry.publicUrl)
        .map((entry) => ({
          storagePath: entry.storagePath as string,
          publicUrl: entry.publicUrl as string
        }));

      const submitBody = {
        contractorSlug,
        tempLeadId,
        customerName,
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        addressFull: address.trim(),
        addressPlaceId: addressPlaceId ?? "",
        lat,
        lng,
        services: selectedServiceAnswers.map((entry) => entry.service),
        description: description.trim(),
        serviceQuestionAnswers: selectedServiceAnswers,
        turnstileToken,
        photoStoragePaths: donePhotoStoragePaths
      };

      const res = await fetch(submitPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBody)
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
      };
      if (res.status === 402 || json.code === "SUBSCRIPTION_INACTIVE") {
        setShowSubscriptionModal(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Failed to submit request.");
      setSubmitted(true);
      toast.success("Request sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-[12px] border border-[#BBF7D0] bg-green-50 dark:bg-green-950/30 p-6 text-center"
      >
        <p className="text-base font-semibold text-green-600 dark:text-green-400">
          Request sent - you will receive your estimate shortly.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        aria-labelledby="lead-form-heading"
        className="min-w-0 max-w-full space-y-5"
        noValidate
        onSubmit={onSubmit}
      >
        <p className="text-xs text-muted-foreground">* Required fields</p>
        <AddressAutocomplete
          variant="public"
          label={
            <span>
              Address <span className="text-primary">*</span>
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
            className="mb-1.5 block text-[13px] font-semibold text-foreground"
          >
            Description
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us what work you need done."
            className="min-h-28 rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
        </div>

        <PhotoUploader
          entries={photoEntries}
          onAddFiles={handleAddPhotos}
          onRemove={handleRemovePhoto}
          onRetry={handleRetryPhoto}
          maxFiles={MAX_PHOTO_UPLOADS}
          required
        />

        <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label
              htmlFor="customer-first-name"
              className="mb-1.5 block text-[13px] font-semibold text-foreground"
            >
              First name <span className="text-primary">*</span>
            </Label>
            <Input
              id="customer-first-name"
              value={customerFirstName}
              onChange={(e) => setCustomerFirstName(e.target.value)}
              required
              aria-required="true"
              className="h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label
              htmlFor="customer-last-name"
              className="mb-1.5 block text-[13px] font-semibold text-foreground"
            >
              Last name
            </Label>
            <Input
              id="customer-last-name"
              value={customerLastName}
              onChange={(e) => setCustomerLastName(e.target.value)}
              className="h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
          </div>
        </div>

        <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label
              htmlFor="customer-phone"
              className="mb-1.5 block text-[13px] font-semibold text-foreground"
            >
              Phone
            </Label>
            <Input
              id="customer-phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              aria-describedby="customer-phone-consent"
              className="h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
            />
            {/* 10DLC opt-in disclosure. Submitting the form with a phone
                number constitutes consent to receive a confirmation text
                and a follow-up estimate text from the contractor; carriers
                require this language to be visible at the point of
                collection. */}
            <p
              id="customer-phone-consent"
              className="text-[11px] leading-snug text-muted-foreground"
            >
              By providing your phone number, you agree to receive text
              messages about your estimate. Message and data rates may
              apply. Reply STOP at any time to opt out.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="customer-email"
            className="mb-1.5 block text-[13px] font-semibold text-foreground"
          >
            Email <span className="text-primary">*</span>
          </Label>
          <Input
            id="customer-email"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
            aria-required="true"
            className="h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
          />
        </div>

        {turnstileSiteKey ? (
          <div aria-label="Bot verification challenge" className="pt-2">
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
          aria-disabled={!canSubmit || !turnstileToken || loading}
          aria-live="polite"
        >
          {loading ? "Sending..." : "Get My Estimate"}
        </Button>
      </form>
      <SubscriptionRequiredModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        variant="customer"
      />
    </>
  );
}
