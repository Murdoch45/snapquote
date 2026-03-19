import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

type AuthShellProps = {
  title: string;
  description?: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthShell({ title, description, footer, children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.16),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-md flex-col justify-center">
        <Link
          href="/"
          className="mx-auto mb-8 inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <BrandLogo size="sm" />
        </Link>

        <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_40px_80px_-48px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h1>
            {description ? (
              <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
            ) : null}
          </div>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </main>
  );
}
