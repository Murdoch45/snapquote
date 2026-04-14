import Link from "next/link";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  searchParams: Promise<{ token?: string; org?: string }>;
};

export const dynamic = "force-dynamic";

async function verifyToken(token: string, orgId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("contractor_profile")
    .select(
      "org_id, email_verification_token_hash, email_verification_target, email_verification_expires_at"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !profile) {
    return { ok: false, message: "We couldn't find this verification request." };
  }

  if (profile.email_verification_token_hash !== tokenHash) {
    return {
      ok: false,
      message: "This verification link is no longer valid. Request a new one from settings."
    };
  }

  const expiresAt = profile.email_verification_expires_at as string | null;
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return {
      ok: false,
      message: "This verification link has expired. Request a new one from settings."
    };
  }

  // Promote the verification: set email + email_verified, clear token.
  const target = profile.email_verification_target as string | null;
  const { error: updateError } = await admin
    .from("contractor_profile")
    .update({
      email: target,
      email_verified: true,
      email_verification_token_hash: null,
      email_verification_target: null,
      email_verification_expires_at: null
    })
    .eq("org_id", orgId);

  if (updateError) {
    return { ok: false, message: "Couldn't finish verification. Please try again." };
  }

  return { ok: true, message: "Email verified — you're all set." };
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  const orgId = params.org?.trim() ?? "";

  let result: { ok: boolean; message: string };
  if (!token || !orgId) {
    result = {
      ok: false,
      message: "This verification link is incomplete. Request a new one from settings."
    };
  } else {
    result = await verifyToken(token, orgId);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="mx-auto max-w-md space-y-4 rounded-[14px] border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          {result.ok ? "Email verified" : "Verification failed"}
        </h1>
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <Link
          href="/app/settings"
          className="inline-flex h-10 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Go to Settings
        </Link>
      </div>
    </main>
  );
}
