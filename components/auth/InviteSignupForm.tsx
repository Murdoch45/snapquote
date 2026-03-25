"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/auth/PasswordField";

export function InviteSignupForm({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password
      });

      if (signupError) {
        throw signupError;
      }

      const response = await fetch("/api/public/invite/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(json?.error || "Failed to accept invite.");
      }

      toast.success("Invite accepted. Welcome to SnapQuote.");
      router.replace("/app");
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Failed to join the team workspace.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-11 rounded-xl border-slate-300 focus-visible:ring-primary/30"
        />
      </div>

      <PasswordField
        id="invite-password"
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {submitting ? "Joining team..." : "Create account and join team"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-600 underline underline-offset-4 hover:text-slate-900">
          Log in
        </Link>
      </p>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
