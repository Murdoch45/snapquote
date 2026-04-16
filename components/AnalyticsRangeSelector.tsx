"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { AnalyticsRange } from "@/lib/db";
import { cn } from "@/lib/utils";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" }
];

type Props = {
  current: AnalyticsRange;
};

export function AnalyticsRangeSelector({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (next: AnalyticsRange) => {
    if (next === current) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "30d") {
      params.delete("range");
    } else {
      params.set("range", next);
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Analytics date range"
      className="flex flex-wrap gap-2"
    >
      {RANGES.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={isPending}
            onClick={() => handleSelect(option.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
