import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you requested does not exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium">
          Back to home
        </Link>
      </div>
    </main>
  );
}
