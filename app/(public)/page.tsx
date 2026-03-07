import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GetStartedFlow } from "@/components/GetStartedFlow";
import { PublicBrandLink } from "@/components/PublicBrandLink";

export default async function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-blue-50 to-cyan-50">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-8 px-6 py-20 md:py-28">
        <PublicBrandLink />
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-gray-900 md:text-6xl">
          Close jobs faster with instant AI-assisted quotes.
        </h1>
        <p className="max-w-2xl text-lg text-gray-600">
          SnapQuote captures leads, suggests pricing ranges, and helps your team send approved
          quotes in minutes.
        </p>
        <div className="flex gap-3">
          <GetStartedFlow />
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
