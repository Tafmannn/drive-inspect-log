/**
 * ClientProfileDetail — read-only summary for a single client (admin).
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Pencil, FileText, Mail, Phone, Globe,
  Building2, Banknote, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { scoreClient } from "../lib/completion";
import { CompletionBadge } from "../components/CompletionBadge";

export default function ClientProfileDetail() {
  const navigate = useNavigate();
  const { clientId = "" } = useParams<{ clientId: string }>();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any | null>(null);
  const [docs, setDocs] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      setClient(data);
      if (data) {
        const { data: docRows } = await supabase
          .from("onboarding_documents")
          .select("id, document_type, file_name, expires_at")
          .eq("related_type", "client")
          .eq("related_id", clientId)
          .order("created_at", { ascending: false });
        setDocs(docRows ?? []);
      }
    } catch (e) {
      toast({ title: "Failed to load client", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const completion = scoreClient(client);

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title="Client Profile" showBack onBack={() => navigate("/control/clients")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{client?.company || client?.name || "Client"}</h2>
              {client?.trading_name && <p className="text-xs text-muted-foreground">Trading as {client.trading_name}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <CompletionBadge result={completion} />
                <Badge variant={client?.is_active ? "default" : "secondary"} className="text-[11px]">{client?.is_active ? "Active" : "Archived"}</Badge>
                {client?.client_type && <Badge variant="outline" className="text-[11px] capitalize">{String(client.client_type).replace(/_/g, " ")}</Badge>}
              </div>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-border/60 text-sm">
              {client?.billing_email && <RowItem icon={<Mail className="h-3.5 w-3.5" />} value={client.billing_email} href={`mailto:${client.billing_email}`} />}
              {client?.main_phone && <RowItem icon={<Phone className="h-3.5 w-3.5" />} value={client.main_phone} href={`tel:${client.main_phone}`} />}
              {client?.website && <RowItem icon={<Globe className="h-3.5 w-3.5" />} value={client.website} href={client.website} />}
            </div>
          </CardContent>
        </Card>

        {completion.missing.length > 0 && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold mb-1">{completion.missing.length} field{completion.missing.length === 1 ? "" : "s"} outstanding</p>
                <p className="text-muted-foreground">{completion.missing.slice(0, 4).join(" · ")}{completion.missing.length > 4 ? "…" : ""}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <SectionCard icon={<Building2 className="w-4 h-4" />} title="Business">
          <KeyVal label="Company number" value={client?.company_number} mono />
          <KeyVal label="VAT number" value={client?.vat_number} mono />
          <KeyVal label="Primary contact" value={client?.contact_name} />
          <KeyVal label="Contact email" value={client?.contact_email} />
          <KeyVal label="Contact mobile" value={client?.contact_mobile} />
        </SectionCard>

        <SectionCard icon={<Banknote className="w-4 h-4" />} title="Billing">
          <KeyVal label="Payment terms" value={client?.payment_terms} />
          <KeyVal label="Rate type" value={client?.rate_type?.replace(/_/g, " ")} />
          <KeyVal label="Rate value" value={client?.rate_value != null ? `£${client.rate_value}` : "—"} />
          <KeyVal label="Minimum charge" value={client?.minimum_charge != null ? `£${client.minimum_charge}` : "—"} />
          <KeyVal label="Credit limit" value={client?.credit_limit != null ? `£${client.credit_limit}` : "—"} />
          <KeyVal label="Billing address" value={client?.billing_address} />
        </SectionCard>

        <SectionCard icon={<FileText className="w-4 h-4" />} title="Operations">
          <KeyVal label="Signature required" value={client?.signature_required ? "Yes" : "No"} />
          <KeyVal label="Opening hours" value={client?.opening_hours} />
          <KeyVal label="Handover" value={client?.handover_requirements} />
        </SectionCard>

        <Card>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Documents</CardTitle></CardHeader>
          <CardContent className="p-4 pt-2">
            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
            ) : (
              <ul className="space-y-2">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">{d.document_type.replace(/_/g, " ")}</p>
                      <p className="text-xs truncate">{d.file_name}</p>
                    </div>
                    {d.expires_at && <Badge variant="outline" className="text-[10px] shrink-0">Exp {fmtDate(d.expires_at)}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-16 inset-x-0 px-4 py-3 bg-background/95 backdrop-blur border-t border-border z-30 lg:bottom-0">
        <div className="max-w-lg mx-auto">
          <Button className="w-full min-h-[48px]" onClick={() => navigate(`/admin/clients/${clientId}/complete`)}>
            <Pencil className="w-4 h-4 mr-2" />
            {completion.pct >= 100 ? "Edit profile" : "Resume onboarding"}
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2"><CardTitle className="text-sm flex items-center gap-2">{icon} {title}</CardTitle></CardHeader>
      <CardContent className="p-4 pt-2 space-y-1.5">{children}</CardContent>
    </Card>
  );
}
function KeyVal({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={"text-right truncate " + (mono ? "font-mono text-xs" : "")}>{value || "—"}</span>
    </div>
  );
}
function RowItem({ icon, value, href }: { icon: React.ReactNode; value: string; href?: string }) {
  const inner = <span className="flex items-center gap-2 text-sm text-muted-foreground"><span className="text-foreground">{icon}</span>{value}</span>;
  return href ? <a href={href} className="block" target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{inner}</a> : inner;
}
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
