/**
 * DriverProfileDetail — read-only operational summary for a single driver.
 *
 * Provides at-a-glance status of the driver's onboarding completeness,
 * compliance docs and operational fields, with a one-tap link into the
 * onboarding wizard to resume editing.
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
  Loader2, Pencil, FileText, Phone, Mail, MapPin,
  ShieldCheck, Truck, CreditCard, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { scoreDriver } from "../lib/completion";
import { CompletionBadge } from "../components/CompletionBadge";

type DocRow = {
  id: string; document_type: string; file_name: string; expires_at: string | null;
};

export default function DriverProfileDetail() {
  const navigate = useNavigate();
  const { userId = "" } = useParams<{ userId: string }>();

  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dp, up] = await Promise.all([
        supabase.from("driver_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_profiles").select("*").eq("auth_user_id", userId).maybeSingle(),
      ]);
      setDriver(dp.data);
      setProfile(up.data);
      if (dp.data?.id) {
        const { data: docRows } = await supabase
          .from("onboarding_documents")
          .select("id, document_type, file_name, expires_at")
          .eq("related_type", "driver")
          .eq("related_id", dp.data.id)
          .order("created_at", { ascending: false });
        setDocs(docRows ?? []);
      }
    } catch (e) {
      toast({ title: "Failed to load", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!driver && !profile) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Driver Profile" showBack onBack={() => navigate("/admin/drivers")} />
        <div className="p-6 max-w-lg mx-auto text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Driver not found</h2>
          <p className="text-sm text-muted-foreground">
            This driver may have been archived or the link is no longer valid.
          </p>
          <Button variant="outline" onClick={() => navigate("/admin/drivers")}>
            Back to drivers
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const completion = scoreDriver(driver);
  const name = driver?.full_name || profile?.full_name || profile?.email || "Driver";

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title="Driver Profile" showBack onBack={() => navigate("/admin/drivers")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Identity card */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{name}</h2>
                {driver?.display_name && driver.display_name !== name && (
                  <p className="text-xs text-muted-foreground">"{driver.display_name}"</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <CompletionBadge result={completion} />
                  <Badge variant={driver?.is_active ? "default" : "secondary"} className="text-[11px]">
                    {driver?.is_active ? "Active" : "Inactive"}
                  </Badge>
                  {profile?.account_status && profile.account_status !== "active" && (
                    <Badge variant="outline" className="text-[11px] capitalize">{String(profile.account_status).replace(/_/g, " ")}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/60 text-sm">
              {driver?.phone && <RowItem icon={<Phone className="h-3.5 w-3.5" />} value={driver.phone} href={`tel:${driver.phone}`} />}
              {profile?.email && <RowItem icon={<Mail className="h-3.5 w-3.5" />} value={profile.email} href={`mailto:${profile.email}`} />}
              {(driver?.address_line1 || driver?.city || driver?.postcode) && (
                <RowItem
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  value={[driver?.address_line1, driver?.city, driver?.postcode].filter(Boolean).join(", ")}
                />
              )}
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

        {/* Compliance */}
        <SectionCard icon={<ShieldCheck className="w-4 h-4" />} title="Compliance">
          <KeyVal label="Licence number" value={driver?.licence_number} mono />
          <KeyVal label="Licence expiry" value={fmtDate(driver?.licence_expiry)} />
          <KeyVal label="Categories" value={(driver?.licence_categories ?? []).join(", ") || "—"} />
          <KeyVal label="Right to work" value={driver?.right_to_work?.replace(/_/g, " ") ?? "—"} />
          <KeyVal label="Endorsements" value={driver?.endorsements} />
          <KeyVal label="Trade plate" value={driver?.trade_plate_number} mono />
          <KeyVal label="Employment" value={driver?.employment_type} />
        </SectionCard>

        {/* Operations */}
        <SectionCard icon={<Truck className="w-4 h-4" />} title="Operations">
          <KeyVal label="Home postcode" value={driver?.home_postcode} mono />
          <KeyVal label="Max daily distance" value={driver?.max_daily_distance ? `${driver.max_daily_distance} mi` : "—"} />
          <KeyVal label="Preferred regions" value={(driver?.preferred_regions ?? []).join(", ") || "—"} />
          <KeyVal label="EV capable" value={driver?.ev_capable ? "Yes" : "No"} />
          <KeyVal label="Prestige approved" value={driver?.prestige_approved ? "Yes" : "No"} />
          <KeyVal label="Manual / Automatic" value={[driver?.manual_capable && "Manual", driver?.automatic_capable && "Automatic"].filter(Boolean).join(" + ") || "—"} />
        </SectionCard>

        {/* Finance */}
        <SectionCard icon={<CreditCard className="w-4 h-4" />} title="Finance">
          <KeyVal label="Payout terms" value={driver?.payout_terms} />
          <KeyVal label="Bank captured" value={driver?.bank_captured ? "Yes" : "No"} />
        </SectionCard>

        {/* Documents */}
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
                    {d.expires_at && (
                      <Badge variant="outline" className="text-[10px] shrink-0">Exp {fmtDate(d.expires_at)}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky edit bar */}
      <div className="fixed bottom-16 inset-x-0 px-4 py-3 bg-background/95 backdrop-blur border-t border-border z-30 lg:bottom-0">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full min-h-[48px]"
            onClick={() => navigate(`/admin/drivers/${userId}/complete`)}
          >
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
  return href ? <a href={href} className="block">{inner}</a> : inner;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
