/**
 * Command Palette (⌘K) for the Control Centre.
 * Searches navigation items and jobs by reg/ref.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { CONTROL_NAV } from "../config/navigation";
import {
  LayoutDashboard, Truck, ClipboardCheck, Users, ShieldCheck,
  PoundSterling, Settings, Crown, Search,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Truck, ClipboardCheck, Users, ShieldCheck,
  PoundSterling, Settings, Crown,
};

function useJobSearch(query: string) {
  return useQuery({
    queryKey: ["control", "commandPalette", "jobs", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase
        .from("jobs")
        .select("id, vehicle_reg, external_job_number, status, pickup_city, delivery_city")
        .or(`vehicle_reg.ilike.%${query}%,external_job_number.ilike.%${query}%`)
        .limit(5);
      return data ?? [];
    },
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: jobs } = useJobSearch(search);

  // Collect flat nav items
  const navItems = CONTROL_NAV.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupLabel: group.label,
      Icon: ICON_MAP[item.icon] ?? LayoutDashboard,
    }))
  );

  const handleSelect = useCallback(
    (path: string) => {
      onOpenChange(false);
      setSearch("");
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  // Reset search on close
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, jobs by reg…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {navItems.map((item) => (
            <CommandItem
              key={item.path}
              value={`${item.label} ${item.groupLabel}`}
              onSelect={() => handleSelect(item.path)}
            >
              <item.Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{item.label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {item.groupLabel}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {jobs && jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jobs">
              {jobs.map((job) => (
                <CommandItem
                  key={job.id}
                  value={`${job.vehicle_reg} ${job.external_job_number ?? ""}`}
                  onSelect={() => handleSelect(`/jobs/${job.id}`)}
                >
                  <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{job.vehicle_reg}</span>
                  {job.external_job_number && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {job.external_job_number}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {job.pickup_city} → {job.delivery_city}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
