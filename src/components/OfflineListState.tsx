import { WifiOff } from "lucide-react";

/**
 * Shown INSTEAD of an empty state when a list's fetch failed while the
 * device is offline. "No jobs assigned" on a dropped connection reads as
 * "your work vanished"; this says plainly that nothing could be loaded and
 * the data is still there on the server.
 */
export function OfflineListState({
  noun = "jobs",
}: {
  /** What the list holds, e.g. "jobs", "expenses". */
  noun?: string;
}) {
  return (
    <div className="text-center py-12 space-y-4" role="status">
      <WifiOff className="w-12 h-12 mx-auto text-muted-foreground stroke-[1.5]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">You're offline</p>
        <p className="text-[13px] text-muted-foreground max-w-xs mx-auto">
          Your {noun} couldn't be loaded. Nothing is lost — they'll appear
          when your connection comes back.
        </p>
      </div>
    </div>
  );
}
