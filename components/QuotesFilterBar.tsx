"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Statuses the filter surfaces. Matches the chip set the contractor sees
// in the list — DRAFT is deliberately absent because it's infrastructure-
// only and filtered server-side on /app/quotes.
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "SENT", label: "Sent" },
  { value: "VIEWED", label: "Viewed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "EXPIRED", label: "Expired" }
];

// Debounce window for the search input. Short enough that typing "Smith"
// feels live-ish; long enough to avoid a route push on every keystroke.
const SEARCH_DEBOUNCE_MS = 300;

export function QuotesFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQ = searchParams.get("q") ?? "";
  const currentStatus = searchParams.get("status") ?? "";

  const [localQ, setLocalQ] = useState(currentQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local input with URL if the URL changes externally (e.g., nav
  // back/forward). Without this the input would keep showing the stale
  // user-typed value after a history pop.
  useEffect(() => {
    setLocalQ(currentQ);
  }, [currentQ]);

  const pushParams = (next: { q?: string | null; status?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if ("q" in next) {
      const value = (next.q ?? "").trim();
      if (value) params.set("q", value);
      else params.delete("q");
    }
    if ("status" in next) {
      const value = next.status ?? "";
      if (value) params.set("status", value);
      else params.delete("status");
    }
    // Any filter change resets cursor — otherwise the next-page URL from
    // a different result set leaks through and produces empty pages.
    params.delete("cursor");

    const qs = params.toString();
    router.push(qs ? `/app/quotes?${qs}` : "/app/quotes");
  };

  const onSearchChange = (value: string) => {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: value });
    }, SEARCH_DEBOUNCE_MS);
  };

  const onClearSearch = () => {
    setLocalQ("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pushParams({ q: null });
  };

  const onStatusChange = (value: string) => {
    pushParams({ status: value });
  };

  const hasFilters = Boolean(currentQ) || Boolean(currentStatus);

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center sm:p-4">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={localQ}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search customer name, email, or phone"
          aria-label="Search estimates"
          className="h-10 pl-9 pr-9"
        />
        {localQ ? (
          <button
            type="button"
            onClick={onClearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:w-auto">
        <label htmlFor="quote-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="quote-status-filter"
          value={currentStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="h-10 min-w-[10rem] rounded-[10px] border border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => pushParams({ q: null, status: null })}
            className="h-10 whitespace-nowrap text-sm"
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
