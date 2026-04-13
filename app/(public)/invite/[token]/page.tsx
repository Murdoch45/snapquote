import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { InviteSignupForm } from "@/components/auth/InviteSignupForm";
import { createAdminClient } from "@/lib/supabase/admin";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  if (!token) notFound();

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("pending_invites")
    .select("id,org_id,status,expires_at,used_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status !== "PENDING" || invite.used_at) {
    return (
      <AuthShell
        title="Invite link unavailable"
        description="This team invite is no longer valid. Ask the account owner for a new link."
        footer={null}
      >
        <div className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
          The invite may have already been used or revoked.
        </div>
      </AuthShell>
    );
  }

  if (invite.expires_at && new Date(invite.expires_at as string) <= new Date()) {
    return (
      <AuthShell
        title="Invite link expired"
        description="This invite link has expired. Ask the account owner to generate a new one."
        footer={null}
      >
        <div className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
          Team invite links stay active for 7 days.
        </div>
      </AuthShell>
    );
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .single();

  return (
    <AuthShell
      title={`Join ${organization?.name ?? "your team"} on SnapQuote`}
      description="Create your account to access the shared workspace."
      footer={null}
    >
      <InviteSignupForm token={token} />
    </AuthShell>
  );
}
