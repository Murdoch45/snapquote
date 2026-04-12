"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password
    });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    toast.success("Password updated successfully.");
    router.replace("/app");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PasswordField
        id="new-password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />

      <PasswordField
        id="confirm-password"
        label="Confirm password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {submitting ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
