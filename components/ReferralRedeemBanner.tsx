"use client";

import { useState, type FormEvent } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

type State = "idle" | "submitting" | "success" | "error";

/**
 * Shown on the dashboard only when the server-side check in
 * app/app/page.tsx confirms eligibility: org has no inbound referral,
 * plan is still SOLO, and the org was created within the last 7 days.
 * Once any of those flips — including a successful submit here — the
 * server stops rendering this component. The local "success" state is
 * just so the user sees the confirmation before a navigation refreshes
 * the dashboard.
 */
export function ReferralRedeemBanner() {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (state === "success") {
    return (
      <div className="rounded-[14px] border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
        <strong className="font-semibold">Referral applied.</strong> Thanks —
        we&apos;ll let the contractor who referred you know.
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const normalized = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(normalized)) {
      setState("error");
      setMessage("Enter the 6–12 character code your referrer gave you.");
      return;
    }

    setState("submitting");
    try {
      const response = await fetch("/api/app/referrals/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setState("error");
        setMessage(body?.error ?? "Unable to apply that referral code.");
        return;
      }
      setState("success");
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">
            Were you referred by another contractor?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter their referral code within your first 7 days to credit them.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="referral-code" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Referral code
              </Label>
              <Input
                id="referral-code"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                placeholder="e.g. 8CCCR6FM"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  if (state === "error") {
                    setState("idle");
                    setMessage(null);
                  }
                }}
                disabled={state === "submitting"}
                className="h-11 rounded-xl border-border font-mono tracking-[0.2em] focus-visible:ring-primary/30"
              />
            </div>
            <Button
              type="submit"
              disabled={state === "submitting" || code.trim().length === 0}
              className="h-11 rounded-xl px-5 text-sm font-semibold"
            >
              {state === "submitting" ? "Applying..." : "Apply code"}
            </Button>
          </form>
          {state === "error" && message ? (
            <p className="mt-2 text-sm text-red-600">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
