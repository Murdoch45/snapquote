"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordField } from "@/components/auth/PasswordField";
import { useOAuthLoadingReset } from "@/components/auth/useOAuthLoadingReset";

type Provider = "google" | "apple";
const OAUTH_SIGNUP_TOAST_KEY = "snapquote-oauth-signup-success";

export function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  // Reset the "Redirecting..." state if the user backs out of the OAuth flow
  // and the page is restored from BFCache (mobile back button). Also clear the
  // pending welcome-toast flag since signup never actually completed.
  useOAuthLoadingReset(
    useCallback(() => {
      setLoadingProvider(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(OAUTH_SIGNUP_TOAST_KEY);
      }
    }, [])
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    const bootstrapResponse = await fetch("/api/public/auth/bootstrap", {
      method: "POST"
    });
    const bootstrapJson = (await bootstrapResponse.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!bootstrapResponse.ok) {
      setError(bootstrapJson?.error || "Unable to finish setting up your account.");
      setSubmitting(false);
      return;
    }

    window.sessionStorage.setItem(OAUTH_SIGNUP_TOAST_KEY, "1");
    router.replace("/onboarding");
  };

  const handleOAuth = async (provider: Provider) => {
    setError(null);
    setLoadingProvider(provider);
    window.sessionStorage.setItem(OAUTH_SIGNUP_TOAST_KEY, "1");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Point at the PKCE callback route, which exchanges ?code=... for a
        // session before forwarding to /app. Without this hop the user lands
        // on /app with no session and gets bounced to /login.
        redirectTo: `${window.location.origin}/auth/callback?next=/app`
      }
    });

    if (oauthError) {
      window.sessionStorage.removeItem(OAUTH_SIGNUP_TOAST_KEY);
      setError(oauthError.message);
      setLoadingProvider(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-11 rounded-xl border-slate-300 focus-visible:ring-primary/30"
        />
      </div>

      <PasswordField
        id="signup-password"
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />

      <Button
        type="submit"
        disabled={submitting || loadingProvider !== null}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {submitting ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-slate-600 underline underline-offset-4 hover:text-slate-900">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-slate-600 underline underline-offset-4 hover:text-slate-900">
          Privacy Policy
        </Link>
        .
      </p>

      <OAuthButtons
        googleLabel="Sign up with Google"
        appleLabel="Sign up with Apple"
        loadingProvider={loadingProvider}
        onProviderClick={handleOAuth}
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
