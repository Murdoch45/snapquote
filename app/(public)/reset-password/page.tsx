import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
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
