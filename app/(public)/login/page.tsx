import LoginForm from "@/components/LoginForm";
import Link from "next/link";
import { PublicBrandLink } from "@/components/PublicBrandLink";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <PublicBrandLink />
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          Access your SnapQuote dashboard.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-sm text-gray-600">
          No account yet? <Link href="/signup">Create one</Link>
        </p>
        </div>
      </div>
    </main>
  );
}
