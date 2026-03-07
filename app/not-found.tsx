import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">The page you requested does not exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium">
          Back to home
        </Link>
      </div>
    </main>
  );
}
