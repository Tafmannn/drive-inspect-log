/**
 * A combobox for picking or clearing a client profile.
 * Used on JobForm and JobDetail for optional client linking.
 */
import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClients } from "@/hooks/useClients";
import { Building2, ChevronsUpDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  onSelect: (clientId: string | null, clientName?: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ClientPickerCombobox({ value, onSelect, className, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: clients } = useClients({ search: "" });

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search.trim()) return clients;
    const s = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.company?.toLowerCase().includes(s)
    );
  }, [clients, search]);

  const selected = clients?.find((c) => c.id === value);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal text-sm h-10"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {selected
                ? `${selected.name}${selected.company ? ` — ${selected.company}` : ""}`
                : "Link client profile..."}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No clients found
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                    c.id === value && "bg-primary/5 font-medium"
                  )}
                  onClick={() => {
                    onSelect(c.id, c.name);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.company && (
                    <span className="text-muted-foreground text-xs ml-1.5">
                      — {c.company}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onSelect(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
