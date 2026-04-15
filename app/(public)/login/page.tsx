import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    invite_token?: string;
    email?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { invite_token: inviteToken, email } = await searchParams;
  const hasInviteToken = Boolean(inviteToken?.trim());

  return (
    <AuthShell
      title="Log in to SnapQuote"
      description={
        hasInviteToken
          ? "Log in to accept your team invite."
          : "Access your SnapQuote workspace."
      }
      footer={
        hasInviteToken ? (
          <>
            Need a new account instead?{" "}
            <Link href={`/invite/${encodeURIComponent(inviteToken!.trim())}`}>Back to your invite</Link>
          </>
        ) : (
          <>
            Don&apos;t have an account? <Link href="/signup">Sign up</Link>
          </>
        )
      }
    >
      <LoginForm inviteToken={inviteToken} initialEmail={email} />
    </AuthShell>
  );
}
