"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordCard() {
  const supabase = createClient();
  const [isEmailUser, setIsEmailUser] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const provider = data.user?.app_metadata?.provider;
      setIsEmailUser(provider === "email");
    });
  }, [supabase]);

  if (isEmailUser === null || !isEmailUser) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    toast.success("Password updated.");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
      <h2 className="mb-4 text-base font-semibold text-[#111827]">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="newPassword"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
            >
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
            >
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#DC2626]">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </form>
    </section>
  );
}
