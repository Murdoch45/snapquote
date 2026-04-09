"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordField } from "@/components/auth/PasswordField";
import { useOAuthLoadingReset } from "@/components/auth/useOAuthLoadingReset";

type Provider = "google" | "apple";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

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

  // Window-level safety net (BFCache restore, popstate, focus, etc.).
  useOAuthLoadingReset(
    useCallback(() => {
      clearOAuthTimeout();
      setLoadingProvider(null);
    }, [clearOAuthTimeout])
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) {
      toast.error(loginError.message);
      setSubmitting(false);
      return;
    }

    toast.success("Welcome back!");
    router.replace("/dashboard");
  };

  const handleOAuth = async (provider: Provider) => {
    // Clear any in-flight reset timer from a previous click before arming a
    // new one. Each click gets its own independent 5s window.
    clearOAuthTimeout();
    setLoadingProvider(provider);
    oauthTimeoutRef.current = window.setTimeout(() => {
      oauthTimeoutRef.current = null;
      setLoadingProvider(null);
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
      toast.error(oauthError.message);
      setLoadingProvider(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-11 rounded-xl border-slate-300 focus-visible:ring-primary/30"
        />
      </div>

      <PasswordField
        id="login-password"
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />

      <Button
        type="submit"
        disabled={submitting || loadingProvider !== null}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {submitting ? "Logging in..." : "Log In"}
      </Button>

      <OAuthButtons
        googleLabel="Sign in with Google"
        appleLabel="Sign in with Apple"
        loadingProvider={loadingProvider}
        onProviderClick={handleOAuth}
      />
    </form>
  );
}
