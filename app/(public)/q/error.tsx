"use client";

import Link from "next/link";

export default function QuoteError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load this estimate right now. Please try again or contact the contractor directly.
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-semibold text-primary hover:text-primary/90"
        >
          Go to SnapQuote
        </Link>
      </div>
    </main>
  );
}
