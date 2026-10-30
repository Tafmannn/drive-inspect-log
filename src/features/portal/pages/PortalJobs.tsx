import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Search, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePortalJobs, type PortalJobSummary } from "../api";
import { isActiveStage, portalStage } from "../lib/portalStatus";
import { StageBadge, StageProgress } from "../components/PortalStatus";
import { fmtDate } from "../lib/format";

type Tab = "active" | "completed";

function place(city: string | null, postcode: string | null): string {
  return [city, postcode].filter(Boolean).join(" ") || "—";
}

export default function PortalJobs() {
  const { data: jobs, isLoading, error } = usePortalJobs();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const { active, completed } = useMemo(() => {
    const a: PortalJobSummary[] = [];
    const c: PortalJobSummary[] = [];
    for (const j of jobs ?? []) (isActiveStage(portalStage(j.status)) ? a : c).push(j);
    return { active: a, completed: c };
  }, [jobs]);

  const list = useMemo(() => {
    const base = tab === "active" ? active : completed;
    const s = search.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return base;
    return base.filter((j) =>
      [j.vehicle_reg, j.job_ref, j.vehicle_make, j.vehicle_model, j.pickup_city, j.delivery_city]
        .some((v) => v?.toLowerCase().replace(/\s+/g, "").includes(s)),
    );
  }, [tab, active, completed, search]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">Couldn't load your vehicle moves. Please refresh to try again.</p>;
  }

  const tabClass = (t: Tab) =>
    cn(
      "px-3 py-1.5 text-sm rounded-md font-medium",
      tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex gap-1" role="tablist">
          <button role="tab" aria-selected={tab === "active"} className={tabClass("active")} onClick={() => setTab("active")}>
            In progress ({active.length})
          </button>
          <button role="tab" aria-selected={tab === "completed"} className={tabClass("completed")} onClick={() => setTab("completed")}>
            Completed ({completed.length})
          </button>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search registration or reference"
            className="pl-8"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Truck className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">
              {search ? "No moves match your search." : tab === "active" ? "No vehicle moves in progress." : "No completed moves yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((j) => {
            const stage = portalStage(j.status);
            return (
              <li key={j.id}>
                <Link to={`/portal/jobs/${j.id}`} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold tracking-wide">{j.vehicle_reg}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[j.vehicle_make, j.vehicle_model, j.vehicle_colour].filter(Boolean).join(" · ") || "Vehicle"} · Ref {j.job_ref}
                          </p>
                        </div>
                        <StageBadge stage={stage} />
                      </div>
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="truncate">{place(j.pickup_city, j.pickup_postcode)}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{place(j.delivery_city, j.delivery_postcode)}</span>
                      </div>
                      {tab === "active" ? (
                        <StageProgress stage={stage} />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {stage === "delivered" ? `Delivered ${fmtDate(j.completed_at)}` : `Booked ${fmtDate(j.created_at)}`}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
