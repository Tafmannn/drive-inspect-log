/**
 * Development-only QA gallery: all 9 body families × 5 views, with optional
 * panel-id labels and click-to-test hit resolution. Mounted at
 * /dev/damage-diagrams only when import.meta.env.DEV is true.
 */
import { useState } from "react";
import { BODY_TYPES, BODY_TYPE_LABELS, type BodyType } from "../bodyTypes";
import { getDiagram, VIEW_IDS, VIEW_LABELS, type ViewId } from "../geometry/views";
import { VehicleDiagramSvg } from "../components/VehicleDiagramSvg";
import { panelLabel } from "../panels";

export default function DamageDiagramGallery() {
  const params = new URLSearchParams(window.location.search);
  const [labels, setLabels] = useState(params.get("labels") === "1");
  const only = params.get("type") as BodyType | null;
  const [sel, setSel] = useState<Record<string, string | null>>({});
  const types = only && BODY_TYPES.includes(only) ? [only] : BODY_TYPES;
  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Damage diagram gallery · {types.length * 5} views</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Panel ids
        </label>
      </div>
      <div className="space-y-6">
        {types.map((bt) => (
          <section key={bt} data-body-type={bt} className="rounded-2xl bg-card p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">{BODY_TYPE_LABELS[bt]}</h2>
            <div className={"grid gap-3 " + (params.get("big") ? "grid-cols-2" : "grid-cols-5")}>
              {VIEW_IDS.map((v: ViewId) => {
                const key = `${bt}:${v}`;
                return (
                  <figure key={v} className="rounded-xl border bg-background p-2">
                    <VehicleDiagramSvg
                      diagram={getDiagram(bt, v)}
                      selectedPanelId={sel[key]}
                      showPanelIds={labels}
                      onTap={(r) => setSel((s) => ({ ...s, [key]: r.panelId }))}
                      className={params.get("big") ? "h-[420px] w-full" : "h-56 w-full"}
                    />
                    <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                      {VIEW_LABELS[v]} {sel[key] ? `· ${panelLabel(sel[key])}` : ""}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
