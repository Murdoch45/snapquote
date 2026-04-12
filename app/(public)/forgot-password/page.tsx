import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email linked to your SnapQuote account."
      footer={
        <>
          Remembered it? <Link href="/login">Back to login</Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
