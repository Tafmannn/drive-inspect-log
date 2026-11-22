/**
 * Development-only harness: renders the real DamageInspector exactly as the
 * inspection step does, with local state, so it can be QA'd in a browser
 * without a signed-in job. Mounted at /dev/damage-inspector (DEV only).
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DamageInspector } from "../components/DamageInspector";
import { resolveBodyType, type BodyType } from "../bodyTypes";
import { withLegacyFields } from "../damageModel";
import { DIAGRAM_VERSION } from "../panels";
import type { DamageItemDraft } from "@/lib/types";

const seed = (bt: BodyType): DamageItemDraft[] => [
  withLegacyFields({
    tempId: "demo-1", x: 0, y: 0, area: "", location: "", item: "", damageTypes: ["Scratch"],
    notes: "Light surface scratch, ~5 cm", panelId: "front_left_door", viewId: "top", panelU: 0.5, panelV: 0.4,
    bodyType: bt, diagramVersion: DIAGRAM_VERSION, severity: "minor", photos: [],
  }),
  withLegacyFields({
    tempId: "demo-2", x: 0, y: 0, area: "", location: "", item: "", damageTypes: ["Dent"],
    notes: "", panelId: "rear_bumper", viewId: "top", panelU: 0.5, panelV: 0.5,
    bodyType: bt, diagramVersion: DIAGRAM_VERSION, severity: "moderate", photos: [],
  }),
];

export default function DamageInspectorPreview() {
  const q = new URLSearchParams(window.location.search);
  const vt = q.get("vehicleType") ?? "Saloon";
  const [damages, setDamages] = useState<DamageItemDraft[]>(() =>
    q.get("empty") ? [] : seed((resolveBodyType({ jobVehicleType: vt }).bodyType ?? "saloon") as BodyType),
  );
  const [manual, setManual] = useState("");
  const [none, setNone] = useState(false);
  const type = q.get("type") === "delivery" ? "delivery" : "pickup";
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary px-4 py-3 text-primary-foreground">
        <p className="text-sm font-semibold tracking-wide">DEV PREVIEW · real DamageInspector component</p>
      </div>
      <div className="px-4 pt-3">
        <h1 className="text-2xl font-bold tracking-tight">{type === "pickup" ? "Pickup" : "Delivery"} Inspection</h1>
        <p className="text-sm font-medium text-muted-foreground">Step {type === "pickup" ? "3 of 6" : "2 of 5"} · Vehicle Damage</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: type === "pickup" ? "50%" : "40%" }} />
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <DamageInspector
          inspectionType={type}
          damages={damages}
          onDamagesChange={(u) => setDamages(u)}
          bodyType={resolveBodyType({ manual, jobVehicleType: vt })}
          onChooseBodyType={(b) => setManual(b)}
          noDamageConfirmed={none}
          onNoDamageConfirmedChange={setNone}
        />
        <div className="mt-8 flex justify-between border-t pt-6">
          <Button variant="outline" className="h-12 gap-2 px-5"><ChevronLeft className="h-4 w-4" />Previous</Button>
          <Button className="h-12 gap-2 px-6">Next<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
