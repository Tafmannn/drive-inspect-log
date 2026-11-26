import { useState, useRef } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupVehicle, type VehicleLookupResult } from "@/lib/vehicleLookupApi";
import { complianceNotices, normalizeRegistration, type ComplianceSeverity } from "@/lib/vehicleCompliance";

function noticePrefix(severity: ComplianceSeverity) {
  if (severity === "stop") return "Do not drive — ";
  if (severity === "review") return "Review — ";
  return "";
}

export function VehicleComplianceSummary({ registration, result, earliestDelivery }: Readonly<{ registration: string; result: VehicleLookupResult | null; earliestDelivery?: string | null }>) {
  const valid = result?.success && result.registration && normalizeRegistration(result.registration) === normalizeRegistration(registration) ? result : null;
  const notices = complianceNotices(valid, registration, earliestDelivery);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border p-3 min-w-0">
          <p className="text-xs text-muted-foreground">MOT</p>
          <p className="text-sm font-semibold break-words">{valid?.motStatus || "Unverified"}</p>
          <p className="text-xs text-muted-foreground">{valid?.motExpiryDate ? "Expires " + valid.motExpiryDate : "Expiry not available"}</p>
        </div>
        <div className="rounded-lg border border-border p-3 min-w-0">
          <p className="text-xs text-muted-foreground">Road tax</p>
          <p className="text-sm font-semibold break-words">{valid?.taxStatus || "Unverified"}</p>
          <p className="text-xs text-muted-foreground">{valid?.taxDueDate ? "Due " + valid.taxDueDate : "Due date not available"}</p>
        </div>
      </div>
      <div aria-live="polite" className="space-y-1">
        {notices.map(n => <p key={n.message} className={`text-xs leading-relaxed ${n.severity === "stop" ? "text-destructive font-semibold" : "text-foreground"}`}>{noticePrefix(n.severity)}{n.message}</p>)}
      </div>
      <p className="text-xs text-muted-foreground">DVLA · {valid?.checkedAt && Number.isFinite(Date.parse(valid.checkedAt)) ? new Date(valid.checkedAt).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " UK" : "No verified timestamp"}</p>
      <p className="text-xs text-muted-foreground">Always verify insurance, roadworthiness and authorised trade plate use independently.</p>
    </div>
  );
}

export function VehicleComplianceCard({ registration, earliestDelivery }: Readonly<{ registration: string; earliestDelivery?: string | null }>) {
  const [result, setResult] = useState<VehicleLookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setResult(null);
    try {
      const next = await lookupVehicle(registration);
      if (next.success && next.registration && normalizeRegistration(next.registration) === normalizeRegistration(registration)) setResult(next);
      else setError(next.error || "DVLA could not verify this registration.");
    } catch { setError("DVLA lookup unavailable. Try again or verify manually."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Vehicle compliance">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Vehicle compliance</h2>
      <Button type="button" size="sm" variant="outline" disabled={busy || !registration.trim()} onClick={refresh}><RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} />{busy ? "Checking…" : "Check DVLA"}</Button>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <VehicleComplianceSummary registration={registration} result={result} earliestDelivery={earliestDelivery} />
  </section>;
}
