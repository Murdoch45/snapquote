import { AuthShell } from "@/components/auth/AuthShell";
import { InviteAcceptAfterLogin } from "@/components/auth/InviteAcceptAfterLogin";

type InviteAcceptPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function InviteAcceptPage({ searchParams }: InviteAcceptPageProps) {
  const { token } = await searchParams;
  const normalizedToken = token?.trim();

  if (!normalizedToken) {
    return (
      <AuthShell
        title="Invite link unavailable"
        description="This team invite is missing required details. Go back to the original invite link and try again."
        footer={null}
      >
        <div className="rounded-xl border border-border bg-slate-50 px-4 py-4 text-sm text-muted-foreground">
          We couldn&apos;t find an invite token to finish joining this workspace.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Joining your team"
      description="We&apos;re finishing your invite now that you&apos;re logged in."
      footer={null}
    >
      <InviteAcceptAfterLogin token={normalizedToken} />
    </AuthShell>
  );
}
