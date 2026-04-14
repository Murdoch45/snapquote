"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { EstimateTemplateEditor } from "@/components/quote-template/QuoteTemplateEditor";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOMER_NAME_TOKEN,
  DEFAULT_ESTIMATE_SMS_TEMPLATE
} from "@/lib/quote-template";
import { type ServiceType } from "@/lib/services";

type SettingsData = {
  business_name: string;
  public_slug: string;
  phone: string | null;
  email: string | null;
  services: ServiceType[] | null;
  business_address_full: string | null;
  business_address_place_id: string | null;
  business_lat: number | null;
  business_lng: number | null;
  quote_sms_template: string | null;
  travel_pricing_disabled: boolean;
  notification_lead_email: boolean;
  notification_accept_email: boolean;
};

type SlugStatus =
  | { type: "idle"; message: string | null }
  | { type: "checking"; message: string }
  | { type: "available"; message: string }
  | { type: "taken"; message: string }
  | { type: "invalid"; message: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getSlugValidationMessage(slug: string): string | null {
  if (!slug) return "Enter a public URL slug.";
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug !== slug.toLowerCase()) return "Use lowercase letters only.";
  if (slug.includes(" ")) return "Spaces are not allowed.";
  if (!SLUG_PATTERN.test(slug)) {
    return "Use only lowercase letters, numbers, and hyphens.";
  }

  return null;
}

function removeCustomerNameToken(template: string): string {
  return template
    .replaceAll(CUSTOMER_NAME_TOKEN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureCustomerNameToken(template: string): string {
  if (template.includes(CUSTOMER_NAME_TOKEN)) {
    return template;
  }

  return `${template}${template.length > 0 ? " " : ""}${CUSTOMER_NAME_TOKEN}`;
}

export function SettingsForm({ initial }: { initial: SettingsData }) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const initialTemplate = initial.quote_sms_template ?? DEFAULT_ESTIMATE_SMS_TEMPLATE;
  const [savedTemplate, setSavedTemplate] = useState(initialTemplate);
  const [mounted, setMounted] = useState(false);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: initial.business_name,
    publicSlug: initial.public_slug,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    businessAddressFull: initial.business_address_full ?? "",
    businessAddressPlaceId: initial.business_address_place_id ?? "",
    businessLat: initial.business_lat ?? null,
    businessLng: initial.business_lng ?? null,
    quoteSmsTemplate: initialTemplate,
    travelPricingDisabled: initial.travel_pricing_disabled,
    notificationLeadEmail: initial.notification_lead_email,
    notificationAcceptEmail: initial.notification_accept_email
  });
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ type: "idle", message: null });
  const [autoInsertCustomerName, setAutoInsertCustomerName] = useState(
    initialTemplate.includes(CUSTOMER_NAME_TOKEN)
  );
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const activeTheme = mounted ? theme ?? "light" : "light";
  const tokenDisplayValues = {
    companyName: form.businessName.trim() || "Your Company",
    contractorPhone: form.phone.trim() || "Your Phone Number",
    contractorEmail: form.email.trim() || "your@email.com"
  };

  const trimmedSlug = form.publicSlug.trim();
  const hasSelectedBusinessAddress = Boolean(
    form.businessAddressPlaceId &&
      form.businessAddressFull.trim().length >= 5 &&
      form.businessLat !== null &&
      form.businessLng !== null
  );

  useEffect(() => {
    setMounted(true);
    supabase.auth.getUser().then(({ data }) => {
      setIsEmailUser(data.user?.app_metadata?.provider === "email");
    });
  }, [supabase]);

  useEffect(() => {
    const validationMessage = getSlugValidationMessage(trimmedSlug);

    if (validationMessage) {
      setSlugStatus({ type: "invalid", message: validationMessage });
      return;
    }

    if (trimmedSlug === initial.public_slug) {
      setSlugStatus({ type: "available", message: "This public URL is available." });
      return;
    }

    setSlugStatus({ type: "checking", message: "Checking availability..." });

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/app/settings/check-slug?slug=${encodeURIComponent(trimmedSlug)}`,
          {
            method: "GET",
            cache: "no-store"
          }
        );
        const json = (await response.json()) as { available?: boolean };

        if (cancelled) return;

        if (!response.ok || typeof json.available !== "boolean") {
          setSlugStatus({
            type: "invalid",
            message: "Unable to verify this public URL right now. Try again."
          });
          return;
        }

        setSlugStatus({
          type: json.available ? "available" : "taken",
          message: json.available
            ? "This public URL is available."
            : "This public URL is already taken."
        });
      } catch {
        if (!cancelled) {
          setSlugStatus({
            type: "invalid",
            message: "Unable to verify this public URL right now. Try again."
          });
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedSlug, initial.public_slug]);

  const handleBusinessAddressChange = (businessAddressFull: string) => {
    setForm((prev) => ({
      ...prev,
      businessAddressFull,
      businessAddressPlaceId: "",
      businessLat: null,
      businessLng: null
    }));
  };

  const handleCustomerNameToggle = (checked: boolean) => {
    setAutoInsertCustomerName(checked);
    setForm((prev) => ({
      ...prev,
      quoteSmsTemplate: checked
        ? ensureCustomerNameToken(prev.quoteSmsTemplate)
        : removeCustomerNameToken(prev.quoteSmsTemplate)
    }));
  };

  const saveSettings = async (options?: { templateOnly?: boolean }) => {
    if (
      slugStatus.type === "invalid" ||
      slugStatus.type === "taken" ||
      slugStatus.type === "checking"
    ) {
      toast.error(slugStatus.message || "Enter a valid public URL.");
      return;
    }

    if (!form.travelPricingDisabled && !hasSelectedBusinessAddress) {
      toast.error("Select a valid business address or disable travel distance pricing.");
      return;
    }

    // Validate password fields if either is filled in.
    const hasPassword = newPassword.length > 0 || confirmPassword.length > 0;
    if (hasPassword && !options?.templateOnly) {
      setPasswordError(null);
      if (newPassword.length < 8) {
        setPasswordError("Password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("Passwords do not match.");
        return;
      }
    }

    if (options?.templateOnly) {
      setSavingTemplate(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/app/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          publicSlug: trimmedSlug,
          phone: form.phone,
          email: form.email,
          businessAddressFull: form.businessAddressFull,
          businessAddressPlaceId: form.businessAddressPlaceId,
          businessLat: form.businessLat,
          businessLng: form.businessLng,
          quoteSmsTemplate: form.quoteSmsTemplate,
          travelPricingDisabled: form.travelPricingDisabled,
          notificationLeadEmail: form.notificationLeadEmail,
          notificationAcceptEmail: form.notificationAcceptEmail
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed.");

      // Update password if fields were filled in.
      if (hasPassword && !options?.templateOnly) {
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
        if (pwError) {
          setPasswordError(pwError.message);
          toast.error("Settings saved but password update failed.");
          return;
        }
        setNewPassword("");
        setConfirmPassword("");
        setShowNew(false);
        setShowConfirm(false);
        setPasswordError(null);
      }

      toast.success("Settings updated.");
      setSavedTemplate(form.quoteSmsTemplate);
      if (!options?.templateOnly && trimmedSlug !== initial.public_slug) {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
      throw error;
    } finally {
      if (options?.templateOnly) {
        setSavingTemplate(false);
      } else {
        setLoading(false);
      }
    }
  };

  const submit = async () => {
    await saveSettings();
  };

  const saveTemplate = async () => {
    try {
      await saveSettings({ templateOnly: true });
      setIsEditingTemplate(false);
    } catch {}
  };

  const cancelTemplateEdit = () => {
    setForm((prev) => ({ ...prev, quoteSmsTemplate: savedTemplate }));
    setAutoInsertCustomerName(savedTemplate.includes(CUSTOMER_NAME_TOKEN));
    setIsEditingTemplate(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Business Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="businessName"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
          >
            Business name
          </Label>
          <Input
            id="businessName"
            value={form.businessName}
            onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
            className="h-11 rounded-[8px] border-border bg-card px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
          >
            Phone
          </Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className="h-11 rounded-[8px] border-border bg-card px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="publicSlug"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
          >
            Public URL
          </Label>
          <Input
            id="publicSlug"
            value={form.publicSlug}
            onChange={(e) => setForm((prev) => ({ ...prev, publicSlug: e.target.value }))}
            aria-invalid={slugStatus.type === "invalid" || slugStatus.type === "taken"}
            className={
              slugStatus.type === "invalid" || slugStatus.type === "taken"
                ? "h-11 rounded-[8px] border-red-200 dark:border-red-800 bg-card px-[14px] text-sm text-foreground focus-visible:ring-[#DC2626]"
                : "h-11 rounded-[8px] border-border bg-card px-[14px] text-sm text-foreground focus-visible:ring-ring"
            }
          />
          <p className="text-sm text-muted-foreground">
            Your public URL: snapquote.us/{trimmedSlug || "[your-slug]"}
          </p>
          <p
            className={`rounded-[8px] border px-4 py-3 text-sm ${
              slugStatus.type === "invalid" || slugStatus.type === "taken"
                ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                : slugStatus.type === "available"
                  ? "border-[#BBF7D0] bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400"
                  : "border-border bg-card text-muted-foreground"
            }`}
          >
            {slugStatus.message || "Use lowercase letters, numbers, and hyphens only."}
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="email"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="h-11 rounded-[8px] border-border bg-card px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>
      </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Business Address</h2>
        <div className="space-y-3 rounded-[8px] border border-border bg-muted p-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Used to estimate travel distance for new leads when mobile-only pricing is off.
          </p>
        </div>

        <AddressAutocomplete
          label="Business address"
          inputId="business-address"
          value={form.businessAddressFull}
          onAddressChange={handleBusinessAddressChange}
          onPlaceResolved={({ placeId, lat, lng }) =>
            setForm((prev) => ({
              ...prev,
              businessAddressPlaceId: placeId ?? "",
              businessLat: lat ?? null,
              businessLng: lng ?? null
            }))
          }
          required={!form.travelPricingDisabled}
          invalid={
            !form.travelPricingDisabled &&
            form.businessAddressFull.trim().length > 0 &&
            !hasSelectedBusinessAddress
          }
          helperText={
            form.travelPricingDisabled
              ? "Travel distance is disabled. You can leave this blank."
              : hasSelectedBusinessAddress
                ? "Google verified business address selected."
                : "Select your business address from the Google dropdown so travel can be calculated."
          }
        />

        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
            checked={form.travelPricingDisabled}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, travelPricingDisabled: checked === true }))
            }
          />
          <span>I operate mobile and do not want travel distance included in estimates.</span>
        </label>
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Appearance</h2>
        <div className="space-y-3 rounded-[8px] border border-border bg-muted p-4">
          <p className="text-sm text-muted-foreground">Choose how SnapQuote looks across the app.</p>
          <div className="flex flex-wrap gap-3">
            {["light", "dark"].map((option) => {
              const selected = activeTheme === option;

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option)}
                  className={
                    selected
                      ? "inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-primary bg-accent px-4 text-sm font-medium capitalize text-primary transition-colors"
                      : "inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-border bg-card px-4 text-sm font-medium capitalize text-foreground transition-colors hover:bg-muted"
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </section>


      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-foreground">Estimate Message Template</h2>
        <div className="space-y-2">
        <Label
          htmlFor="quoteSmsTemplate"
          className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
        >
          Estimate message template
        </Label>
        <div className="space-y-3 rounded-[8px] border border-border bg-muted p-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              className="data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              checked={autoInsertCustomerName}
              onCheckedChange={(checked) => handleCustomerNameToggle(checked === true)}
            />
            <span>Automatically insert customer&apos;s name into estimate message</span>
          </label>
        </div>

        <EstimateTemplateEditor
          id="quoteSmsTemplate"
          value={form.quoteSmsTemplate}
          tokenDisplayValues={tokenDisplayValues}
          showCustomerNameChip={autoInsertCustomerName}
          isEditing={isEditingTemplate}
          isSaving={savingTemplate}
          onEdit={() => setIsEditingTemplate(true)}
          onSave={() => void saveTemplate()}
          onCancel={cancelTemplateEdit}
          onChange={(nextValue) =>
            setForm((prev) => ({
              ...prev,
              quoteSmsTemplate: autoInsertCustomerName
                ? ensureCustomerNameToken(nextValue)
                : removeCustomerNameToken(nextValue)
            }))
          }
        />
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-1 text-base font-semibold text-foreground">Email Notifications</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Choose which email alerts SnapQuote sends you.
        </p>
        <div className="space-y-3 rounded-[8px] border border-border bg-muted p-4">
          <label className="flex items-start gap-3 text-sm text-foreground">
            <Checkbox
              className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              checked={form.notificationLeadEmail}
              onCheckedChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  notificationLeadEmail: checked === true
                }))
              }
            />
            <span className="leading-snug">
              Email me when a new lead comes in
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <Checkbox
              className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              checked={form.notificationAcceptEmail}
              onCheckedChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  notificationAcceptEmail: checked === true
                }))
              }
            />
            <span className="leading-snug">
              Email me when a customer accepts an estimate
            </span>
          </label>
        </div>
      </section>

      {isEmailUser ? (
        <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          <h2 className="mb-4 text-base font-semibold text-foreground">Change Password</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="newPassword"
                className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
              >
                New password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                  minLength={8}
                  placeholder="New password"
                  className="h-11 rounded-[8px] border-border bg-card pr-11 px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
              >
                Confirm password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  minLength={8}
                  placeholder="Confirm new password"
                  className="h-11 rounded-[8px] border-border bg-card pr-11 px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          {passwordError ? (
            <p className="mt-4 rounded-[8px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {passwordError}
            </p>
          ) : null}
        </section>
      ) : null}

      <Button
        onClick={submit}
        disabled={
          loading ||
          slugStatus.type === "invalid" ||
          slugStatus.type === "taken" ||
          slugStatus.type === "checking"
        }
      >
        {loading ? "Saving..." : "Save settings"}
      </Button>

    </div>
  );
}

export function ReplayTourCard() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  return (
    <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
      <h2 className="text-base font-semibold text-foreground">Product tour</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Want a refresher on how SnapQuote works? Replay the guided tour you
        saw when you first signed up.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        disabled={resetting}
        onClick={async () => {
          setResetting(true);
          try {
            const res = await fetch("/api/onboarding/reset", { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              toast.error(json.error || "Couldn't reset the tour.");
              return;
            }
            toast.success("Tour reset — heading back to the dashboard.");
            router.push("/app");
            router.refresh();
          } catch {
            toast.error("Couldn't reset the tour.");
          } finally {
            setResetting(false);
          }
        }}
      >
        {resetting ? "Resetting..." : "Replay product tour"}
      </Button>
    </section>
  );
}

export function SignOutCard() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <section className="rounded-[14px] border border-red-200 dark:border-red-800 bg-card p-4">
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
        className="inline-flex w-full items-center justify-center rounded-[10px] border border-red-300 dark:border-red-700 bg-card px-5 py-3 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
      >
        Sign Out
      </button>
    </section>
  );
}

export function DeleteAccountCard() {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  return (
    <section className="rounded-[14px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
      <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
        Delete Account
      </h2>
      <p className="mb-4 text-sm leading-5 text-red-800 dark:text-red-400/80">
        Permanently delete your account and all associated data. This action
        cannot be undone.
      </p>
      <button
        type="button"
        disabled={deleting}
        onClick={async () => {
          const confirmed = window.confirm(
            "Are you sure you want to delete your account? This will permanently delete all your data, cancel any active subscriptions, and cannot be undone."
          );
          if (!confirmed) return;

          setDeleting(true);
          try {
            const {
              data: { session }
            } = await supabase.auth.getSession();
            const res = await fetch("/api/app/account/delete", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(session?.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : {})
              }
            });
            const json = await res.json();
            if (!res.ok)
              throw new Error(json.error || "Failed to delete account.");

            await supabase.auth.signOut();
            router.push("/login");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to delete account."
            );
            setDeleting(false);
          }
        }}
        className="inline-flex items-center justify-center rounded-[10px] bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
      >
        {deleting ? "Deleting..." : "Delete Account"}
      </button>
    </section>
  );
}
