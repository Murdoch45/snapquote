import Link from "next/link";
import { cookies } from "next/headers";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  RECOVERY_COOKIE_NAME,
  verifyRecoveryToken
} from "@/lib/auth/recoveryCookie";

// Audit 8 H5: this page must only render the "set new password" form
// when the visitor just completed a Supabase password-recovery OTP.
// Without this gate, any authenticated user (or attacker holding a
// hijacked session cookie) could navigate here and change the account
// password without re-entering the current one.
//
// The recovery cookie is set by `app/auth/confirm/route.ts` on
// `type=recovery`, signed with HMAC over `${userId}.${expiresAtMs}`,
// HttpOnly, 10-minute TTL. We require: cookie present + signature
// valid + cookie's userId matches the active session.
export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(RECOVERY_COOKIE_NAME)?.value ?? null;
  const verified = verifyRecoveryToken(cookieValue);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const recoveryAuthorized = Boolean(verified && user && verified.userId === user.id);

  if (!recoveryAuthorized) {
    return (
      <AuthShell
        title="Reset link expired"
        description="This password-reset link is no longer valid. Request a new email to continue."
        footer={
          <>
            Already have your password? <Link href="/login">Log in</Link>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Password resets must start from the &ldquo;Forgot your password?&rdquo;
            email link. The link is valid for 10 minutes after you click it.
          </p>
          <Link
            href="/forgot-password"
            className="block w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
          >
            Send a new reset email
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a strong password for your account."
      footer={
        <>
          Back to <Link href="/login">Log in</Link>
        </>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
