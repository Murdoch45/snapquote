"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordField } from "@/components/auth/PasswordField";
import { useOAuthLoadingReset } from "@/components/auth/useOAuthLoadingReset";

type Provider = "google" | "apple";
const OAUTH_SIGNUP_TOAST_KEY = "snapquote-oauth-signup-success";
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function SignupForm() {
  const router = useRouter();
  const urlParams = useSearchParams();
  const workTypes = urlParams.get("workTypes");
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Per-click reset timer. Every OAuth click installs a fresh 5s timeout that
  // wipes the loading state if the user is still on this page when it fires.
  // This is the primary defense against the "stuck on Redirecting..." bug on
  // iPhone Safari, where window-level event listeners are unreliable across
  // repeated cancellations.
  const oauthTimeoutRef = useRef<number | null>(null);
  const clearOAuthTimeout = useCallback(() => {
    if (oauthTimeoutRef.current !== null) {
      window.clearTimeout(oauthTimeoutRef.current);
      oauthTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (oauthTimeoutRef.current !== null) {
        window.clearTimeout(oauthTimeoutRef.current);
      }
    };
  }, []);

  // Window-level safety net (BFCache restore, popstate, focus, etc.). Also
  // clears the pending welcome-toast flag since signup never actually completed.
  useOAuthLoadingReset(
    useCallback(() => {
      clearOAuthTimeout();
      setLoadingProvider(null);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(OAUTH_SIGNUP_TOAST_KEY);
      }
    }, [clearOAuthTimeout])
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!turnstileToken) {
      setError("Bot verification is still loading. Please wait a moment and try again.");
      return;
    }

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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken })
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
    const onboardingUrl = workTypes ? `/onboarding?workTypes=${encodeURIComponent(workTypes)}` : "/onboarding";
    router.replace(onboardingUrl);
  };

  const handleOAuth = async (provider: Provider) => {
    setError(null);
    // Clear any in-flight reset timer from a previous click before arming a
    // new one. Each click gets its own independent 5s window.
    clearOAuthTimeout();
    setLoadingProvider(provider);
    window.sessionStorage.setItem(OAUTH_SIGNUP_TOAST_KEY, "1");
    oauthTimeoutRef.current = window.setTimeout(() => {
      oauthTimeoutRef.current = null;
      setLoadingProvider(null);
      window.sessionStorage.removeItem(OAUTH_SIGNUP_TOAST_KEY);
    }, 2000);

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
      clearOAuthTimeout();
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
          className="h-11 rounded-xl border-border focus-visible:ring-primary/30"
        />
      </div>

      <PasswordField
        id="signup-password"
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />

      {turnstileSiteKey ? (
        <Turnstile
          siteKey={turnstileSiteKey}
          options={{ appearance: "interaction-only" }}
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken(null)}
          onError={() => setTurnstileToken(null)}
        />
      ) : null}

      <Button
        type="submit"
        disabled={submitting || loadingProvider !== null || !turnstileToken}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {submitting ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
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
