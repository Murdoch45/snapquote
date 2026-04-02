"use client";

import { useState, type ReactNode } from "react";

type Props = {
  cards: ReactNode[];
  total: number;
};

export function DashboardLeadList({ cards, total }: Props) {
  const [visibleCount, setVisibleCount] = useState(5);
  const visible = cards.slice(0, visibleCount);
  const capped = Math.min(total, 20);

  return (
    <div className="space-y-3">
      {visible}

      {visibleCount < capped ? (
        <div className="flex flex-col items-center gap-1 py-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => Math.min(prev + 5, 20))}
            className="text-[15px] font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
          >
            Load more
          </button>
          <p className="text-xs text-[#6B7280]">
            Showing {visible.length} of {capped}
          </p>
        </div>
      ) : null}
    </div>
  );
}
