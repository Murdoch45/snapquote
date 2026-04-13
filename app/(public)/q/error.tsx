"use client";

import Link from "next/link";

export default function QuoteError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-[#111827]">Something went wrong</h1>
        <p className="text-sm text-[#6B7280]">
          We couldn&apos;t load this estimate right now. Please try again or contact the contractor directly.
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
        >
          Go to SnapQuote
        </Link>
      </div>
    </main>
  );
}
