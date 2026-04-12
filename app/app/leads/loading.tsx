function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#E5E7EB] ${className ?? ""}`} />;
}

export default function LeadsLoading() {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Lead cards */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-[#E5E7EB] bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-[#E5E7EB] pt-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
