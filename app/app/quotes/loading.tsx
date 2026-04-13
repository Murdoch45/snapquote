function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-border ${className ?? ""}`} />;
}

export default function QuotesLoading() {
  return (
    <div className="space-y-3">
      {/* Header */}
      <Skeleton className="h-6 w-32" />

      {/* Quote rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
