import { useRef, useState, type RefObject, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { lookupVehicle, type VehicleLookupResult } from "@/lib/vehicleLookupApi";
import { normalizeRegistration } from "@/lib/vehicleCompliance";
import { VehicleComplianceSummary } from "./VehicleComplianceCard";

type Props = Readonly<{
  formRef: RefObject<HTMLFormElement>;
  initialRegistration: string;
  disabled: boolean;
  onFound: (result: VehicleLookupResult) => void;
  children?: ReactNode;
}>;

function readRegistration(form: HTMLFormElement | null) {
  const value = form && new FormData(form).get("vehicle_reg");
  return typeof value === "string" ? value.trim() : "";
}
export function JobVehicleLookup({ formRef, initialRegistration, disabled, onFound, children }: Props) {
  const [result, setResult] = useState<VehicleLookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  async function check() {
    if (inFlight.current) return;
    const reg = readRegistration(formRef.current);
    if (!reg) {
      toast({ title: "Enter a registration first.", variant: "destructive" });
      return;
    }
    const started = revision.current;
    inFlight.current = true;
    setBusy(true); setResult(null);
    try {
      const next = await lookupVehicle(reg);
      if (started !== revision.current || normalizeRegistration(readRegistration(formRef.current)) !== normalizeRegistration(reg)) return;
      if (!next.success || !next.registration || normalizeRegistration(next.registration) !== normalizeRegistration(reg)) {
        toast({ title: next.error || "DVLA could not verify this registration.", variant: "destructive" });
        return;
      }
      setResult(next);
      onFound(next);
      toast({ title: `Found: ${next.make} (${next.colour})` });
    } catch {
      toast({ title: "DVLA lookup failed", variant: "destructive" });
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }
  return <div>
    <Label htmlFor="vehicle_reg" className="text-sm font-medium">Registration *</Label>
    <div className="flex gap-2 mt-1">
      <Input id="vehicle_reg" name="vehicle_reg" placeholder="Vehicle registration" defaultValue={initialRegistration} autoCapitalize="characters" className="flex-1" onChange={() => { revision.current++; setResult(null); }} />
      <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" disabled={disabled || busy} onClick={check}>
        <Search className="w-4 h-4" />{busy ? "Checking…" : "DVLA"}
      </Button>
    </div>
    {children}
    {result ? <div className="mt-3"><VehicleComplianceSummary registration={result.registration ?? ""} result={result} /></div> : <p className="mt-2 text-xs text-muted-foreground">MOT and tax unverified until DVLA lookup succeeds.</p>}
  </div>;
}
