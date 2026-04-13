function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-border ${className ?? ""}`} />;
}

export default function AppLoading() {
  return (
    <div className="space-y-4">
      {/* Date header skeleton */}
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Stats row skeleton */}
      <div>
        <Skeleton className="mb-2 h-5 w-16" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-[140px] shrink-0 rounded-[14px] border border-border bg-card p-5"
            >
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Section header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Card skeletons */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[14px] border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-border pt-3.5">
              <div className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
