/**
 * Notifications popover for the Control Centre topbar.
 * Shows top active attention exceptions with an unread count badge.
 *
 * - Clicking a notification navigates to that exception's own action route
 *   (driver profile for compliance gaps, the job for timing/evidence, etc.),
 *   not a generic dashboard.
 * - The red badge counts UNSEEN exceptions only: opening the popover marks
 *   everything currently listed as seen (persisted per-browser), so the
 *   badge clears once viewed and only reappears when something new fires.
 *   Exceptions stay listed until they are actually resolved/acknowledged.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";

const DEFAULT_FILTERS: AttentionFiltersState = {
  severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-destructive",
  high: "text-warning",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

const SEEN_STORAGE_KEY = "axentra-notifications-seen-v1";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort — private mode / quota
  }
}

export function NotificationsPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds());
  const { data, isLoading } = useAttentionData({
    scope: "org",
    filters: DEFAULT_FILTERS,
  });

  const exceptions = data?.exceptions ?? [];
  const activeCount = exceptions.length;
  const unseenCount = exceptions.filter((ex) => !seenIds.has(ex.id)).length;
  const top5 = exceptions.slice(0, 5);

  // Opening the popover = viewing the notifications: mark everything
  // currently active as seen. Persisted pruned to active ids so the set
  // never grows unboundedly and a resolved-then-refired exception counts
  // as new again.
  useEffect(() => {
    if (!open || exceptions.length === 0) return;
    const allSeen = exceptions.every((ex) => seenIds.has(ex.id));
    if (allSeen) return;
    const next = new Set(exceptions.map((ex) => ex.id));
    setSeenIds(next);
    persistSeenIds(next);
  }, [open, exceptions, seenIds]);

  const openException = (route: string | undefined) => {
    setOpen(false);
    navigate(route || "/control");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label={
            unseenCount > 0
              ? `Notifications (${unseenCount} unread)`
              : activeCount > 0
              ? `Notifications (${activeCount} active)`
              : "Notifications"
          }
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
              {unseenCount > 99 ? "99+" : unseenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-[11px] text-muted-foreground">
            {activeCount} active exception{activeCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : top5.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No active exceptions
            </p>
          ) : (
            <ul className="divide-y">
              {top5.map((ex) => (
                <li
                  key={ex.id}
                  className="px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
                  onClick={() => openException(ex.actionRoute)}
                >
                  <p className="text-xs font-medium truncate">{ex.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {ex.detail}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase ${SEVERITY_COLORS[ex.severity] ?? ""}`}
                      >
                        {ex.severity}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{ex.category}</span>
                    </div>
                    <span className="text-[10px] text-primary font-medium shrink-0">
                      {ex.actionLabel || "View"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeCount > 5 && (
          <div className="border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7"
              onClick={() => {
                setOpen(false);
                navigate("/control");
              }}
            >
              View all {activeCount} exceptions
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
