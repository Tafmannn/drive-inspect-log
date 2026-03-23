/**
 * Control Centre — Clients Management Page
 * Premium admin UI for managing billing client profiles.
 */
import { useState } from "react";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip, type KpiItem } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useClients,
  useClientStats,
  useArchiveClient,
  useRestoreClient,
} from "@/hooks/useClients";
import { ClientFormModal } from "@/features/clients/components/ClientFormModal";
import type { Client } from "@/lib/clientApi";
import {
  Building2,
  Plus,
  Search,
  Users,
  Archive,
  RotateCcw,
  Mail,
  Phone,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export function ControlClients() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const { data: clients, isLoading } = useClients({
    search,
    includeArchived: showArchived,
  });
  const { data: stats, isLoading: statsLoading } = useClientStats();
  const archiveMutation = useArchiveClient();
  const restoreMutation = useRestoreClient();

  const kpis: KpiItem[] = [
    {
      label: "Total Clients",
      value: stats?.total,
      icon: Users,
      variant: "default",
      loading: statsLoading,
    },
    {
      label: "Active",
      value: stats?.active,
      icon: Building2,
      variant: "success",
      loading: statsLoading,
    },
    {
      label: "Archived",
      value: stats?.archived,
      icon: Archive,
      variant: "warning",
      loading: statsLoading,
    },
  ];

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setModalOpen(true);
  };

  const handleArchive = async (client: Client) => {
    try {
      await archiveMutation.mutateAsync(client.id);
      toast({ title: `${client.name} archived` });
    } catch (err: any) {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRestore = async (client: Client) => {
    try {
      await restoreMutation.mutateAsync(client.id);
      toast({ title: `${client.name} restored` });
    } catch (err: any) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    }
  };

  const columns: CompactColumn<Client>[] = [
    {
      key: "name",
      header: "Client",
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
          {row.company && (
            <p className="text-xs text-muted-foreground truncate">{row.company}</p>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <div className="space-y-0.5">
          {row.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.email}</span>
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{row.phone}</span>
            </div>
          )}
          {!row.email && !row.phone && (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (row) =>
        row.is_active ? (
          <Badge variant="outline" className="text-success border-success/30 bg-success/5 text-[11px]">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground border-border text-[11px]">
            Archived
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              Edit
            </DropdownMenuItem>
            {row.is_active ? (
              <DropdownMenuItem
                onClick={() => handleArchive(row)}
                className="text-destructive focus:text-destructive"
              >
                Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => handleRestore(row)}>
                Restore
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Clients"
        subtitle="Manage billing client profiles"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingClient(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Client
          </Button>
        }
      />

      <KpiStrip items={kpis} />

      <ControlSection flush>
        {/* Search & filters */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
              Show archived
            </Label>
          </div>
        </div>

        <CompactTable
          columns={columns}
          data={clients ?? []}
          loading={isLoading}
          emptyMessage="No clients found. Create your first client profile."
          onRowClick={handleEdit}
        />
      </ControlSection>

      <ClientFormModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditingClient(null);
        }}
        client={editingClient}
      />
    </ControlShell>
  );
}
