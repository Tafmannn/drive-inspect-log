/**
 * OrganisationProfileDetail — read-only summary for a single organisation (super admin).
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
  Loader2, Pencil, FileText, Mail, Phone, Building2,
  Palette, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { scoreOrg } from "../lib/completion";
import { CompletionBadge } from "../components/CompletionBadge";

export default function OrganisationProfileDetail() {
  const navigate = useNavigate();
  const { orgId = "" } = useParams<{ orgId: string }>();

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any | null>(null);
  const [docs, setDocs] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("organisations").select("*").eq("id", orgId).maybeSingle();
      if (error) throw error;
      setOrg(data);
      const { data: docRows } = await supabase
        .from("onboarding_documents")
        .select("id, document_type, file_name, expires_at")
        .eq("related_type", "organisation")
        .eq("related_id", orgId)
        .order("created_at", { ascending: false });
      setDocs(docRows ?? []);
    } catch (e) {
      toast({ title: "Failed to load organisation", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Organisation" showBack onBack={() => navigate("/super-admin/orgs")} />
        <div className="p-6 max-w-lg mx-auto text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Organisation not found</h2>
          <p className="text-sm text-muted-foreground">This organisation may have been removed or the link is no longer valid.</p>
          <Button variant="outline" onClick={() => navigate("/super-admin/orgs")}>Back to organisations</Button>
        </div>
        <BottomNav />
      </div>
    );
  }
  const completion = scoreOrg(org);

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title="Organisation" showBack onBack={() => navigate("/super-admin/orgs")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              {org?.logo_url ? (
                <img src={org.logo_url} alt="" className="h-12 w-12 rounded-md object-contain bg-muted" />
              ) : (
                <div className="h-12 w-12 rounded-md flex items-center justify-center"
                     style={{ background: org?.primary_colour ?? "hsl(var(--muted))", color: "white" }}>
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold truncate">{org?.name}</h2>
                {org?.legal_name && <p className="text-xs text-muted-foreground truncate">{org.legal_name}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <CompletionBadge result={completion} />
                  <Badge variant="outline" className="text-[11px] capitalize">{org?.status}</Badge>
                  {org?.billing_plan && <Badge variant="outline" className="text-[11px] capitalize">{org.billing_plan}</Badge>}
                </div>
              </div>
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

        <SectionCard icon={<Building2 className="w-4 h-4" />} title="Identity">
          <KeyVal label="Company number" value={org?.company_number} mono />
          <KeyVal label="VAT number" value={org?.vat_number} mono />
          <KeyVal label="Registered address" value={org?.registered_address} />
          <KeyVal label="Trading address" value={org?.trading_address} />
        </SectionCard>

        <SectionCard icon={<Mail className="w-4 h-4" />} title="Main contact">
          <KeyVal label="Name" value={org?.main_contact_name} />
          <KeyVal label="Email" value={org?.main_contact_email} />
          <KeyVal label="Phone" value={org?.main_contact_phone} />
        </SectionCard>

        <SectionCard icon={<Palette className="w-4 h-4" />} title="Branding">
          <KeyVal label="Branding name" value={org?.branding_name} />
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-xs text-muted-foreground">Primary colour</span>
            <span className="flex items-center gap-2 font-mono text-xs">
              {org?.primary_colour && <span className="inline-block h-4 w-4 rounded border border-border" style={{ background: org.primary_colour }} />}
              {org?.primary_colour ?? "—"}
            </span>
          </div>
        </SectionCard>

        <SectionCard icon={<FileText className="w-4 h-4" />} title="Plan">
          <KeyVal label="Billing plan" value={org?.billing_plan} />
          <KeyVal label="Max users" value={org?.max_users} />
          <KeyVal label="Notes" value={org?.notes} />
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
          <Button className="w-full min-h-[48px]" onClick={() => navigate(`/super-admin/orgs/${orgId}/complete`)}>
            <Pencil className="w-4 h-4 mr-2" />
            {completion.pct >= 100 ? "Edit organisation" : "Resume onboarding"}
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
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
