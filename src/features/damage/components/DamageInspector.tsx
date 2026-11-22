/**
 * Vehicle Damage step (pickup & delivery): five-view panel-selectable diagram,
 * numbered pins, recorded-damage list and the damage editor.
 *
 * Flow: pick a view → tap the panel (that also pinpoints the spot) →
 * "Add damage" → details + photos → Save.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, ChevronUp, Info, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { DamageItem, DamageItemDraft, DamagePhotoDraft } from "@/lib/types";
import { BODY_TYPES, BODY_TYPE_LABELS, type BodyType, type BodyTypeResolution } from "../bodyTypes";
import { getDiagram, panelsForBodyType, VIEW_IDS, VIEW_LABELS, type ViewId } from "../geometry/views";
import type { Pt } from "../geometry/poly";
import { fromPanelUV, hasPanel, toPanelUV } from "../hitTest";
import { DIAGRAM_VERSION, panelLabel, ukSide } from "../panels";
import {
  SEVERITY_DOT, SEVERITY_LABELS, damageLabel, damagePhotoFiles, newId, savedDamageDescription, savedDamageLabel, withLegacyFields,
} from "../damageModel";
import { VehicleDiagramSvg, type DiagramPin } from "./VehicleDiagramSvg";
import { DamageEditor } from "./DamageEditor";
import { ViewGlyph } from "./ViewGlyph";
import { PanelGlyph } from "./PanelGlyph";

export interface DamageInspectorProps {
  inspectionType: "pickup" | "delivery";
  damages: DamageItemDraft[];
  onDamagesChange: (updater: (prev: DamageItemDraft[]) => DamageItemDraft[]) => void;
  bodyType: BodyTypeResolution;
  onChooseBodyType: (bt: BodyType) => void;
  noDamageConfirmed: boolean;
  onNoDamageConfirmedChange: (v: boolean) => void;
  /** Delivery: damage recorded at collection, shown for reference only. */
  referenceDamages?: DamageItem[];
  captureAttr?: "environment";
  onPhotoAdded?: (damageTempId: string, photo: DamagePhotoDraft) => void;
  onPhotoRemoved?: (damageTempId: string, photo: DamagePhotoDraft) => void;
  onDamageDeleted?: (damage: DamageItemDraft) => void;
  onDamageRestored?: (damage: DamageItemDraft) => void;
}

/** Labels for the viewer's left/right edge of each view (vehicle-relative). */
const EDGE_LABELS: Record<ViewId, [string, string]> = {
  top: ["Left · nearside", "Right · offside"],
  front: ["Right · offside", "Left · nearside"],
  rear: ["Left · nearside", "Right · offside"],
  left: ["◀ Front", "Rear"],
  right: ["Rear", "Front ▶"],
};

function useMediaQuery(q: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [q]);
  return m;
}

interface Editing {
  draft: DamageItemDraft;
  isNew: boolean;
}

export function DamageInspector(props: DamageInspectorProps) {
  const {
    inspectionType, damages, onDamagesChange, bodyType: resolution, onChooseBodyType,
    noDamageConfirmed, onNoDamageConfirmedChange, referenceDamages = [], captureAttr,
    onPhotoAdded, onPhotoRemoved, onDamageDeleted, onDamageRestored,
  } = props;
  const bodyType = resolution.bodyType;
  const wide = useMediaQuery("(min-width: 1024px)");
  const [view, setView] = useState<ViewId>("top");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pt | null>(null);
  const [chooser, setChooser] = useState<{ ids: string[]; pt: Pt } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ d: DamageItemDraft; index: number } | null>(null);
  const [pickingBody, setPickingBody] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [dir, setDir] = useState(1);

  const diagram = bodyType ? getDiagram(bodyType, view) : null;
  const available = useMemo(() => (bodyType ? panelsForBodyType(bodyType) : []), [bodyType]);
  const activeKey = editing?.draft.tempId ?? null;

  const pins: DiagramPin[] = useMemo(() => {
    if (!diagram) return [];
    const out: DiagramPin[] = [];
    damages.forEach((d, i) => {
      if (!d.panelId || !hasPanel(diagram, d.panelId)) return;
      const onThisView = d.viewId === view && typeof d.panelU === "number" && typeof d.panelV === "number";
      const pt = onThisView ? fromPanelUV(diagram, d.panelId, { u: d.panelU!, v: d.panelV! }) : null;
      const anchor = diagram.panels.find((p) => p.id === d.panelId)!.anchor;
      const [x, y] = pt ?? anchor;
      out.push({
        key: d.tempId,
        number: i + 1,
        x, y,
        ghost: !pt,
        active: d.tempId === activeKey,
        tone: d.severity === "severe" ? "severe" : "default",
      });
    });
    // spread ghost pins that share an anchor so each stays tappable
    const seen = new Map<string, number>();
    for (const p of out) {
      if (!p.ghost) continue;
      const k = `${p.x.toFixed(0)}:${p.y.toFixed(0)}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      p.x += n * 9;
    }
    if (pending && selected) {
      out.push({ key: "__pending", number: damages.length + 1, x: pending[0], y: pending[1], active: true });
    }
    return out;
  }, [diagram, damages, view, activeKey, pending, selected]);

  const damagedPanels = useMemo(() => new Set(damages.map((d) => d.panelId).filter(Boolean) as string[]), [damages]);

  const switchView = (v: ViewId) => {
    if (v === view) return;
    setDir(VIEW_IDS.indexOf(v) > VIEW_IDS.indexOf(view) ? 1 : -1);
    setView(v);
    setChooser(null);
    // keep the panel selected only if it exists on the new view; the pending
    // pin belonged to the old view's geometry, so drop it.
    setPending(null);
    if (selected && bodyType && !hasPanel(getDiagram(bodyType, v), selected)) setSelected(null);
  };

  const selectAt = (panelId: string, pt: Pt | null) => {
    setSelected(panelId);
    setChooser(null);
    const anchor = diagram?.panels.find((p) => p.id === panelId)?.anchor ?? null;
    setPending(pt ?? anchor);
    if (!wide) return;
    if (editing?.isNew && diagram) {
      // Desktop: re-target the record being written instead of starting over
      // (keeps any photos already attached to it).
      const at = pt ?? anchor;
      const uv = at ? toPanelUV(diagram, panelId, at) : null;
      setEditing({
        ...editing,
        draft: withLegacyFields({ ...editing.draft, panelId, viewId: view, panelU: uv?.u ?? null, panelV: uv?.v ?? null }),
      });
    } else {
      openNew(panelId, pt ?? anchor);
    }
  };

  const openNew = (panelId: string, pt: Pt | null) => {
    if (!diagram || !bodyType) return;
    const uv = pt ? toPanelUV(diagram, panelId, pt) : null;
    const vb = diagram.viewBox;
    const draft: DamageItemDraft = withLegacyFields({
      tempId: newId(),
      x: pt ? ((pt[0] - vb.x) / vb.w) * 100 : 50,
      y: pt ? ((pt[1] - vb.y) / vb.h) * 100 : 50,
      area: "", location: "", item: "",
      damageTypes: [], notes: "",
      panelId, viewId: view,
      panelU: uv?.u ?? null, panelV: uv?.v ?? null,
      bodyType, diagramVersion: DIAGRAM_VERSION,
      severity: null, photos: [],
    });
    setEditing({ draft, isNew: true });
  };

  const openExisting = (tempId: string) => {
    const d = damages.find((x) => x.tempId === tempId);
    if (!d) return;
    if (d.viewId && d.viewId !== view) switchView(d.viewId);
    setSelected(d.panelId ?? null);
    setPending(null);
    setEditing({ draft: { ...d, photos: d.photos ?? [] }, isNew: false });
  };

  const closeEditor = (discardNew = true) => {
    if (editing?.isNew && discardNew) {
      // photos captured into a cancelled new record are released
      for (const p of editing.draft.photos ?? []) onPhotoRemoved?.(editing.draft.tempId, p);
    }
    setEditing(null);
    setPending(null);
  };

  const saveEditing = () => {
    if (!editing) return;
    const d = withLegacyFields(editing.draft);
    onDamagesChange((prev) =>
      editing.isNew ? [...prev, d] : prev.map((x) => (x.tempId === d.tempId ? d : x)),
    );
    if (editing.isNew) onNoDamageConfirmedChange(false);
    setEditing(null);
    setPending(null);
  };

  const deleteEditing = () => {
    if (!editing) return;
    const id = editing.draft.tempId;
    const index = damages.findIndex((x) => x.tempId === id);
    const original = damages[index];
    if (original) {
      setLastDeleted({ d: original, index });
      onDamagesChange((prev) => prev.filter((x) => x.tempId !== id));
      onDamageDeleted?.(original);
    }
    setEditing(null);
    setSelected(null);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    const { d, index } = lastDeleted;
    onDamagesChange((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, d);
      return next;
    });
    onDamageRestored?.(d);
    setLastDeleted(null);
  };

  // ── body type gate ────────────────────────────────────────────────
  if (!bodyType || pickingBody) {
    return (
      <BodyTypePicker
        current={bodyType}
        raw={resolution.raw}
        onPick={(bt) => {
          onChooseBodyType(bt);
          setPickingBody(false);
          setSelected(null);
          setPending(null);
        }}
        onCancel={bodyType ? () => setPickingBody(false) : undefined}
      />
    );
  }

  const editor = editing && (
    <DamageEditor
      key={editing.draft.tempId}
      value={editing.draft}
      onChange={(draft) => setEditing((e) => (e ? { ...e, draft } : e))}
      onSave={saveEditing}
      onCancel={() => closeEditor(true)}
      onDelete={editing.isNew ? undefined : deleteEditing}
      isNew={editing.isNew}
      number={editing.isNew ? damages.length + 1 : damages.findIndex((d) => d.tempId === editing.draft.tempId) + 1}
      availablePanels={available}
      captureAttr={captureAttr}
      onPhotoAdded={(p) => onPhotoAdded?.(editing.draft.tempId, p)}
      onPhotoRemoved={(p) => onPhotoRemoved?.(editing.draft.tempId, p)}
    />
  );

  const [edgeL, edgeR] = EDGE_LABELS[view];
  const sourceLabel =
    resolution.source === "job" ? "from job" : resolution.source === "catalogue" ? "from catalogue" : "chosen manually";

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ViewGlyph bodyType={bodyType} view="left" className="h-7 w-9" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight tracking-tight">Record vehicle damage</h2>
          <p className="text-sm text-muted-foreground">Select a view, tap a panel, then add the damage.</p>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-medium">{BODY_TYPE_LABELS[bodyType]}</span>
          <span className="text-muted-foreground"> · {sourceLabel}</span>
        </span>
        <button type="button" className="shrink-0 font-medium text-primary" onClick={() => setPickingBody(true)}>
          Change
        </button>
      </div>

      <div className={cn("grid gap-4", wide && editing && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
        <section className="rounded-3xl border bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.18)] sm:p-4">
          {/* View tabs */}
          <div role="tablist" aria-label="Vehicle view" className="grid grid-cols-5 gap-1 rounded-2xl bg-muted/70 p-1">
            {VIEW_IDS.map((v) => {
              const on = v === view;
              return (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => switchView(v)}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-[background-color,color,box-shadow] duration-200",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-background/70",
                  )}
                >
                  <ViewGlyph bodyType={bodyType} view={v} className={cn("h-4 w-7", v === "top" && "h-5 w-4")} />
                  {VIEW_LABELS[v]}
                </button>
              );
            })}
          </div>

          {/* Diagram */}
          <div className="relative mt-3 select-none">
            <div className="pointer-events-none absolute inset-x-1 top-0 z-10 flex justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>{edgeL}</span>
              {view === "top" && <span>▲ Front</span>}
              <span>{edgeR}</span>
            </div>
            <div
              key={`${bodyType}-${view}`}
              className={cn(
                "pt-5 animate-in fade-in-0 duration-200 motion-reduce:animate-none",
                dir > 0 ? "slide-in-from-right-3" : "slide-in-from-left-3",
              )}
            >
              <VehicleDiagramSvg
                diagram={diagram!}
                selectedPanelId={selected}
                damagedPanelIds={damagedPanels}
                pins={pins}
                onTap={(r, pt) => {
                  if (r.candidates.length > 1) {
                    setChooser({ ids: r.candidates, pt });
                    return;
                  }
                  if (!r.panelId) {
                    setSelected(null);
                    setPending(null);
                    setChooser(null);
                    return;
                  }
                  selectAt(r.panelId, r.inside ? pt : null);
                }}
                onPinTap={(key) => key !== "__pending" && openExisting(key)}
                ariaLabel={`${BODY_TYPE_LABELS[bodyType]} ${VIEW_LABELS[view].toLowerCase()} view. Tap a panel to select it.`}
                className={cn("mx-auto block w-full", view === "top" ? "h-[340px] sm:h-[420px]" : "h-[240px] sm:h-[320px]")}
              />
            </div>

            {chooser && (
              <div role="dialog" aria-label="Which panel?" className="absolute inset-x-4 bottom-2 z-20 rounded-2xl border bg-popover p-2 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Which panel did you mean?</p>
                {chooser.ids.map((id) => (
                  <button key={id} type="button" className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium hover:bg-muted" onClick={() => selectAt(id, null)}>
                    {panelLabel(id)} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selection / guidance */}
          {selected ? (
            <div className="mt-2 flex items-center gap-3 rounded-2xl bg-primary/[0.07] p-2.5 pl-3">
              <PanelGlyph className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{panelLabel(selected)}</p>
                <p className="text-xs text-muted-foreground">
                  {ukSide(selected) ? `${ukSide(selected)} · ` : ""}Tap again to move the pin
                </p>
              </div>
              {!wide && (
                <Button type="button" className="h-11 shrink-0 gap-1.5 rounded-xl" onClick={() => openNew(selected, pending)}>
                  <MapPin className="h-4 w-4" /> Add damage
                </Button>
              )}
            </div>
          ) : (
            <p className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" /> Tap a panel to record damage
            </p>
          )}

          {lastDeleted && (
            <div className="mt-2 flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
              <span>Damage removed</span>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-primary" onClick={undoDelete}>
                <RotateCcw className="h-4 w-4" /> Undo
              </Button>
            </div>
          )}
        </section>

        {wide && editing && (
          <aside className="rounded-3xl border bg-card p-4 shadow-sm animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">
            {editor}
          </aside>
        )}
      </div>

      {/* Recorded damages */}
      {damages.length > 0 ? (
        <section className="rounded-3xl border bg-card shadow-sm">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
            <h3 className="text-lg font-bold tracking-tight">Recorded damages ({damages.length})</h3>
            <ChevronUp className={cn("h-5 w-5 transition-transform", !listOpen && "rotate-180")} />
          </button>
          {listOpen && (
            <ul className="divide-y border-t">
              {damages.map((d, i) => {
                const thumb = d.photos?.[0]?.previewUrl;
                const photoCount = damagePhotoFiles(d).length;
                return (
                  <li key={d.tempId}>
                    <button type="button" onClick={() => openExisting(d.tempId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", d.severity === "severe" ? "bg-red-600" : "bg-primary")}>
                        {i + 1}
                      </span>
                      <span className="h-14 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
                        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{damageLabel(d)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <span className="truncate">{d.damageTypes.join(", ") || "—"}</span>
                          {d.severity && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                              <span className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[d.severity])} aria-hidden />
                              {SEVERITY_LABELS[d.severity]}
                            </span>
                          )}
                          <span className="text-xs">{photoCount} photo{photoCount === 1 ? "" : "s"}</span>
                          {!d.panelId && <span className="text-xs text-amber-700">Not linked to a panel</span>}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed bg-card p-5 text-center">
          <p className="font-semibold">No damage recorded</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Tap a vehicle panel to record any scratches, dents or other damage.
          </p>
          <button
            type="button"
            role="checkbox"
            aria-checked={noDamageConfirmed}
            onClick={() => onNoDamageConfirmedChange(!noDamageConfirmed)}
            className={cn(
              "mx-auto mt-4 flex min-h-[48px] w-full max-w-sm items-center gap-3 rounded-2xl border px-4 text-left text-sm font-medium transition-colors",
              noDamageConfirmed ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "hover:bg-muted",
            )}
          >
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", noDamageConfirmed && "border-emerald-600 bg-emerald-600 text-white")}>
              {noDamageConfirmed && <Check className="h-4 w-4" />}
            </span>
            {noDamageConfirmed ? (
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> I've checked the vehicle — no damage found</span>
            ) : (
              "I've checked the whole vehicle and found no damage"
            )}
          </button>
        </section>
      )}

      {inspectionType === "delivery" && referenceDamages.length > 0 && (
        <section className="rounded-3xl border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">Noted at collection ({referenceDamages.length})</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            For comparison only. Record anything you see now, including damage that was already there.
          </p>
          <ul className="space-y-1.5 text-sm">
            {referenceDamages.map((r) => {
              const { label, legacy } = savedDamageLabel(r);
              return (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {label}
                    {legacy && <span className="text-xs text-muted-foreground"> (legacy location)</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{savedDamageDescription(r)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!wide && (
        <Drawer open={!!editing} onOpenChange={(o) => !o && closeEditor(true)}>
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-1 text-left">
              <DrawerTitle>{editing?.isNew ? "Add damage" : "Edit damage"}</DrawerTitle>
              <DrawerDescription className="sr-only">Damage type, severity, notes and photos</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{editor}</div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

function BodyTypePicker({
  current, raw, onPick, onCancel,
}: { current: BodyType | null; raw: string | null; onPick: (b: BodyType) => void; onCancel?: () => void }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">What shape is this vehicle?</h2>
        <p className="text-sm text-muted-foreground">
          {current
            ? "Choose the diagram that best matches the vehicle in front of you."
            : raw
              ? `The job says “${raw}”, which doesn't match one diagram. Choose the closest shape.`
              : "The job doesn't record a body type. Choose the closest shape so panels line up."}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BODY_TYPES.map((bt) => (
          <button
            key={bt}
            type="button"
            onClick={() => onPick(bt)}
            aria-pressed={bt === current}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border bg-card p-2 pb-2.5 text-xs font-semibold transition-colors hover:border-primary",
              bt === current && "border-primary ring-1 ring-primary",
            )}
          >
            <ViewGlyph bodyType={bt} view="left" className="h-10 w-full text-foreground/80" />
            {BODY_TYPE_LABELS[bt]}
          </button>
        ))}
      </div>
      {onCancel && (
        <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
          Keep current diagram
        </Button>
      )}
    </section>
  );
}
