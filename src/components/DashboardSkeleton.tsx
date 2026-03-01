export const DashboardSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="flex items-center justify-between p-4 rounded-xl bg-card border border-border"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
            <div className="h-3 w-40 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
      </div>
    ))}
  </div>
);
