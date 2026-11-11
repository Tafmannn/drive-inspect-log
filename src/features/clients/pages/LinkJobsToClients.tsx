/**
 * Link jobs to clients — admin screen.
 *
 * Lists every job without a client_id, grouped by the client details the
 * job recorded, with a suggested client per group (see
 * ../lib/jobClientMatch.ts). Nothing is linked until an admin confirms.
 * Linking goes through the link_jobs_to_client RPC (SECURITY INVOKER,
 * admin-only, links only jobs in the client's organisation).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Link2, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ControlShell, ControlHeader, ControlSection } from "@/features/control/components/shared/ControlShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { ClientFormModal } from "../components/ClientFormModal";
import {
  groupUnlinkedJobs,
  type MatchClient,
  type UnlinkedGroup,
} from "../lib/jobClientMatch";

interface UnlinkedJob {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  client_company: string | null;
  client_name: string | null;
  client_email: string | null;
  status: string | null;
  created_at: string;
  pickup_city: string | null;
  delivery_city: string | null;
}

type ClientRow = MatchClient & { name: string | null; company: string | null };

const QK = ["link-jobs"] as const;

async function linkJobs(jobIds: string[], clientId: string): Promise<number> {
  const { data, error } = await (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: number | null; error: { message: string } | null }>;
  }).rpc("link_jobs_to_client", { p_job_ids: jobIds, p_client_id: clientId });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

function clientLabel(c: Pick<ClientRow, "name" | "company">): string {
  const company = c.company?.trim();
  const name = c.name?.trim();
  if (company && name && company.toLowerCase() !== name.toLowerCase()) return `${company} — ${name}`;
  return company || name || "Unnamed client";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function statusText(s: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function LinkJobsToClients() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const jobsQ = useQuery({
    queryKey: [...QK, "unlinked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, client_company, client_name, client_email, status, created_at, pickup_city, delivery_city",
        )
        .is("client_id", null)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as UnlinkedJob[];
    },
  });

  const totalQ = useQuery({
    queryKey: [...QK, "total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_hidden", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const clientsQ = useQuery({
    queryKey: [...QK, "clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company, email, billing_email, contact_name, contact_email, is_active")
        .order("company", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const groups = useMemo(() => groupUnlinkedJobs(jobsQ.data ?? [], clients), [jobsQ.data, clients]);

  // Per-group choices. Absent entries fall back to the defaults below.
  const [chosenClient, setChosenClient] = useState<Record<string, string>>({});
  const [chosenJobs, setChosenJobs] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newClientFor, setNewClientFor] = useState<UnlinkedGroup<UnlinkedJob> | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const clientFor = (g: UnlinkedGroup<UnlinkedJob>) => chosenClient[g.key] ?? g.suggestion?.clientId ?? "";
  // Groups with recorded details default to all jobs ticked; the
  // "no client recorded" group defaults to none, since those jobs are
  // unrelated to each other.
  const jobsFor = (g: UnlinkedGroup<UnlinkedJob>) => chosenJobs[g.key] ?? (g.key ? g.jobs.map((j) => j.id) : []);
  const isExpanded = (g: UnlinkedGroup<UnlinkedJob>) => expanded[g.key] ?? !g.key;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: QK });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["portal-access"] });
  };

  const link = useMutation({
    mutationFn: ({ jobIds, clientId }: { jobIds: string[]; clientId: string; groupKey: string }) =>
      linkJobs(jobIds, clientId),
    onSuccess: (count, { jobIds, clientId, groupKey }) => {
      const c = clientsById.get(clientId);
      const name = c ? clientLabel(c) : "the client";
      toast({
        title: `Linked ${count} job${count === 1 ? "" : "s"} to ${name}`,
        description:
          count < jobIds.length
            ? `${jobIds.length - count} belong to a different organisation from this client and were left unlinked.`
            : undefined,
      });
      setChosenJobs((prev) => {
        const { [groupKey]: _done, ...rest } = prev;
        return rest;
      });
      refresh();
    },
    onError: (e) => toast({ title: "Couldn't link jobs", description: (e as Error).message, variant: "destructive" }),
  });

  const exactGroups = groups.filter((g) => g.suggestion?.confidence === "exact");
  const exactJobCount = exactGroups.reduce((n, g) => n + g.jobs.length, 0);
  const exactClientCount = new Set(exactGroups.map((g) => g.suggestion!.clientId)).size;

  const linkAllExact = useMutation({
    mutationFn: async () => {
      let total = 0;
      for (const g of exactGroups) {
        total += await linkJobs(g.jobs.map((j) => j.id), g.suggestion!.clientId);
      }
      return total;
    },
    onSuccess: (count) => {
      toast({ title: `Linked ${count} job${count === 1 ? "" : "s"} to their clients` });
      refresh();
    },
    onError: (e) => {
      toast({ title: "Some jobs couldn't be linked", description: (e as Error).message, variant: "destructive" });
      refresh();
    },
  });

  const loading = jobsQ.isLoading || clientsQ.isLoading;
  const error = jobsQ.error || clientsQ.error;
  const unlinkedCount = jobsQ.data?.length ?? 0;
  const total = totalQ.data ?? 0;
  const busy = link.isPending || linkAllExact.isPending;

  return (
    <ControlShell>
      <ControlHeader
        title="Link jobs to clients"
        subtitle="Jobs only appear in a client's portal and invoice list once they're linked to the client."
        actions={
          <Button size="sm" variant="outline" onClick={() => navigate("/control/clients")}>
            Back to clients
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive py-8 text-center">
          Couldn't load jobs: {(error as Error).message}
        </p>
      ) : (
        <>
          <ControlSection>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <p className="text-sm">
                <span className="font-semibold">{Math.max(total - unlinkedCount, 0)}</span> of{" "}
                <span className="font-semibold">{total}</span> jobs are linked to a client.{" "}
                {unlinkedCount > 0 && (
                  <span className="text-muted-foreground">{unlinkedCount} still to link.</span>
                )}
              </p>
              {exactJobCount > 0 && (
                <Button size="sm" disabled={busy} onClick={() => setConfirmAll(true)}>
                  {linkAllExact.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4 mr-1.5" />
                  )}
                  Link all exact matches ({exactJobCount})
                </Button>
              )}
            </div>
          </ControlSection>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-success" />
                <p className="text-sm font-medium">Every job is linked to a client.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const selectedClient = clientFor(g);
                const selectedJobs = jobsFor(g);
                const open = isExpanded(g);
                const pendingHere = link.isPending && link.variables?.groupKey === g.key;
                return (
                  <Card key={g.key || "__none__"}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="font-semibold truncate">
                            {g.key ? g.company || g.contact || g.jobs[0].client_email : "No client recorded"}
                          </p>
                          {g.key && g.company && g.contact && (
                            <p className="text-xs text-muted-foreground truncate">Contact: {g.contact}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-[11px]">
                              {g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}
                            </Badge>
                            {g.suggestion?.confidence === "exact" && (
                              <Badge className="text-[11px] bg-success/15 text-success border-success/30" variant="outline">
                                Exact match
                              </Badge>
                            )}
                            {g.suggestion?.confidence === "likely" && (
                              <Badge className="text-[11px] bg-warning/15 text-warning border-warning/30" variant="outline">
                                Check: {g.suggestion.reason.toLowerCase()}
                              </Badge>
                            )}
                            {g.key && !g.suggestion && (
                              <span className="text-[11px] text-muted-foreground">No matching client — pick one or create it</span>
                            )}
                            {!g.key && (
                              <span className="text-[11px] text-muted-foreground">
                                Tick the jobs that belong to one client, then choose the client
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center lg:w-[28rem] shrink-0">
                          <Select
                            value={selectedClient}
                            onValueChange={(v) => setChosenClient((prev) => ({ ...prev, [g.key]: v }))}
                          >
                            <SelectTrigger className="h-9 sm:flex-1 min-w-0" aria-label="Client to link to">
                              <SelectValue placeholder="Choose client…" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {clientLabel(c)}
                                  {c.is_active === false ? " (archived)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9"
                              onClick={() => setNewClientFor(g)}
                            >
                              <Plus className="w-4 h-4 mr-1" /> New
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-9 flex-1 sm:flex-none"
                              disabled={busy || !selectedClient || selectedJobs.length === 0}
                              onClick={() => link.mutate({ jobIds: selectedJobs, clientId: selectedClient, groupKey: g.key })}
                            >
                              {pendingHere && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                              Link {selectedJobs.length}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !open }))}
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {open ? "Hide jobs" : `Show jobs (${selectedJobs.length} of ${g.jobs.length} ticked)`}
                      </button>

                      {open && (
                        <div className="border border-border/60 rounded-md divide-y divide-border/60">
                          <label className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground cursor-pointer">
                            <Checkbox
                              checked={
                                selectedJobs.length === g.jobs.length
                                  ? true
                                  : selectedJobs.length > 0
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={(v) =>
                                setChosenJobs((prev) => ({
                                  ...prev,
                                  [g.key]: v === true ? g.jobs.map((j) => j.id) : [],
                                }))
                              }
                              aria-label="Tick all jobs in this group"
                            />
                            Tick all
                          </label>
                          {g.jobs.map((j) => {
                            const checked = selectedJobs.includes(j.id);
                            return (
                              <label key={j.id} className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={checked}
                                  onCheckedChange={(v) =>
                                    setChosenJobs((prev) => {
                                      const current = prev[g.key] ?? jobsFor(g);
                                      const next = v === true
                                        ? [...new Set([...current, j.id])]
                                        : current.filter((id) => id !== j.id);
                                      return { ...prev, [g.key]: next };
                                    })
                                  }
                                  aria-label={`Include ${j.vehicle_reg ?? "job"}`}
                                />
                                <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[8rem_1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                                  <span className="font-mono font-semibold">{j.vehicle_reg || "—"}</span>
                                  <span className="text-muted-foreground truncate">
                                    {j.external_job_number || j.id.slice(0, 8)}
                                    {(j.vehicle_make || j.vehicle_model) && ` · ${[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ")}`}
                                    {(j.pickup_city || j.delivery_city) && (
                                      <>
                                        {" · "}
                                        {j.pickup_city || "—"} <ArrowRight className="inline w-3 h-3" /> {j.delivery_city || "—"}
                                      </>
                                    )}
                                  </span>
                                  <span className="text-xs text-muted-foreground sm:text-right">
                                    {statusText(j.status)} · {fmtDate(j.created_at)}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <ClientFormModal
        open={!!newClientFor}
        onOpenChange={(o) => !o && setNewClientFor(null)}
        initialCompany={newClientFor?.company || newClientFor?.contact || ""}
        onCreated={(c) => {
          if (newClientFor) setChosenClient((prev) => ({ ...prev, [newClientFor.key]: c.id }));
          setNewClientFor(null);
          void qc.invalidateQueries({ queryKey: [...QK, "clients"] });
        }}
      />

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link {exactJobCount} jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              Each job is linked to the client whose company name or email matches exactly ({exactClientCount}{" "}
              client{exactClientCount === 1 ? "" : "s"}). Those clients will see these jobs in their portal. Groups
              marked “Check” are left for you to confirm one by one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => linkAllExact.mutate()}>Link {exactJobCount} jobs</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ControlShell>
  );
}
