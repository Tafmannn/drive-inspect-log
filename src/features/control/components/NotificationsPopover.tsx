/**
 * Notifications popover for the Control Centre topbar.
 * Shows top active attention exceptions with unread count badge.
 */
import { useState } from "react";
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

export function NotificationsPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useAttentionData({
    scope: "org",
    filters: DEFAULT_FILTERS,
  });

  const exceptions = data?.exceptions ?? [];
  const count = exceptions.length;
  const top5 = exceptions.slice(0, 5);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-[11px] text-muted-foreground">
            {count} active exception{count !== 1 ? "s" : ""}
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
                  onClick={() => {
                    setOpen(false);
                    navigate("/control");
                  }}
                >
                  <p className="text-xs font-medium truncate">{ex.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {ex.detail}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className={`text-[9px] uppercase ${SEVERITY_COLORS[ex.severity] ?? ""}`}
                    >
                      {ex.severity}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{ex.category}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {count > 5 && (
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
              View all {count} exceptions
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
