/**
 * Damage details form: panel (auto-identified, explicit override), types,
 * severity, notes, close-up photos. Pure controlled component — the parent
 * owns the record and decides where it renders (bottom sheet / side panel).
 */
import { useId, useRef, useState } from "react";
import { Camera, ChevronDown, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { prepareCapturedPhoto } from "@/lib/capturedPhoto";
import type { DamageItemDraft, DamagePhotoDraft } from "@/lib/types";
import { DAMAGE_TYPES, SEVERITIES, SEVERITY_DOT, SEVERITY_LABELS, newId, validateDamage } from "../damageModel";
import { OTHER_PANEL_ID, PANELS, panelLabel, ukSide } from "../panels";
import { PanelGlyph } from "./PanelGlyph";

interface Props {
  value: DamageItemDraft;
  onChange: (next: DamageItemDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew: boolean;
  number: number;
  /** Panels the current body-type template can show (for the override list). */
  availablePanels: string[];
  /** Camera only for drivers; admins may also pick from the gallery. */
  captureAttr?: "environment";
  onPhotoAdded?: (photo: DamagePhotoDraft) => void;
  onPhotoRemoved?: (photo: DamagePhotoDraft) => void;
}

export function DamageEditor({
  value, onChange, onSave, onCancel, onDelete, isNew, number, availablePanels,
  captureAttr, onPhotoAdded, onPhotoRemoved,
}: Props) {
  const uid = useId();
  const [showErrors, setShowErrors] = useState(false);
  const [overriding, setOverriding] = useState(!value.panelId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removePhoto, setRemovePhoto] = useState<DamagePhotoDraft | null>(null);
  const [processing, setProcessing] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const missing = validateDamage(value);
  const photos = value.photos ?? [];
  const set = (patch: Partial<DamageItemDraft>) => onChange({ ...value, ...patch });

  const toggleType = (t: string) =>
    set({
      damageTypes: value.damageTypes.includes(t)
        ? value.damageTypes.filter((x) => x !== t)
        : [...value.damageTypes, t],
    });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setProcessing((n) => n + list.length);
    for (const f of list) {
      try {
        const safe = await prepareCapturedPhoto(f);
        const photo: DamagePhotoDraft = { id: newId("ph"), file: safe, previewUrl: URL.createObjectURL(safe) };
        onChange({ ...valueRef.current, photos: [...(valueRef.current.photos ?? []), photo] });
        onPhotoAdded?.(photo);
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  };
  // addFiles awaits between photos; always extend the latest record.
  const valueRef = useRef(value);
  valueRef.current = value;

  const side = value.panelId ? ukSide(value.panelId) : null;
  const panelOptions = availablePanels
    .filter((id) => id !== OTHER_PANEL_ID)
    .sort((a, b) => panelLabel(a).localeCompare(panelLabel(b)));

  return (
    <div className="flex flex-col gap-5">
      {/* Panel */}
      <section className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PanelGlyph className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            Damage {number} · {value.panelId ? "Selected panel" : "Choose a panel"}
          </p>
          <p className="truncate text-base font-semibold leading-tight">
            {value.panelId ? panelLabel(value.panelId, value.customLabel) : "Not linked to a panel"}
          </p>
          {side && <p className="text-xs text-muted-foreground">{side} side</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1 text-primary"
          onClick={() => setOverriding((o) => !o)}
          aria-expanded={overriding}
        >
          <Pencil className="h-3.5 w-3.5" /> Change
        </Button>
      </section>
      {overriding && (
        <section className="-mt-2 space-y-2 rounded-2xl border p-3">
          <label htmlFor={`${uid}-panel`} className="text-sm font-medium">
            Panel on this vehicle
          </label>
          <div className="relative">
            <select
              id={`${uid}-panel`}
              className="h-11 w-full appearance-none rounded-xl border bg-background px-3 pr-9 text-base"
              value={value.panelId ?? ""}
              onChange={(e) => set({ panelId: e.target.value || null })}
            >
              <option value="">Select…</option>
              {panelOptions.map((id) => (
                <option key={id} value={id}>
                  {PANELS[id].label}
                  {ukSide(id) ? ` (${ukSide(id)!.toLowerCase()})` : ""}
                </option>
              ))}
              <option value={OTHER_PANEL_ID}>Other / not on diagram…</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>
          {value.panelId === OTHER_PANEL_ID && (
            <Input
              className="h-11 text-base"
              placeholder="Describe where (e.g. interior – driver seat)"
              value={value.customLabel ?? ""}
              onChange={(e) => set({ customLabel: e.target.value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            The diagram is a generic template. Change the panel only if the real vehicle differs.
          </p>
        </section>
      )}

      {/* Damage types */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Damage type <span className="font-normal text-muted-foreground">(select all that apply)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TYPES.map((t) => {
            const on = value.damageTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  "min-h-[40px] rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[0.97] motion-reduce:transform-none",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Severity */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Severity <span className="font-normal text-muted-foreground">(your assessment)</span></legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {SEVERITIES.map((sv) => {
            const on = value.severity === sv;
            return (
              <button
                key={sv}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ severity: sv })}
                className={cn(
                  "flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
                  on ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary" : "bg-background hover:bg-muted",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", SEVERITY_DOT[sv])} aria-hidden />
                {SEVERITY_LABELS[sv]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Notes */}
      <div>
        <label htmlFor={`${uid}-notes`} className="mb-2 block text-sm font-medium">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`${uid}-notes`}
          rows={2}
          className="text-base"
          placeholder="e.g. Light surface scratch, ~5 cm"
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      {/* Photos */}
      <div>
        <p className="mb-2 text-sm font-medium">
          Photos <span className="font-normal text-muted-foreground">({photos.length})</span>
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
              <img src={p.previewUrl} alt={`Damage ${number} photo ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Saved on device
              </span>
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setRemovePhoto(p)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-foreground shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {Array.from({ length: processing }).map((_, i) => (
            <div key={`p${i}`} className="flex aspect-square items-center justify-center rounded-xl border bg-muted">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Camera className="h-6 w-6" />
            {photos.length ? "Add another" : "Add photo"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture={captureAttr}
          multiple={!captureAttr}
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {showErrors && missing.length > 0 && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Still needed: {missing.join(", ")}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {!isNew && onDelete && (
          <Button
            type="button"
            variant="outline"
            className="h-12 border-destructive/40 px-3 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete this damage"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" className="h-12 flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-12 flex-[2] text-base"
          disabled={processing > 0}
          onClick={() => {
            if (missing.length) {
              setShowErrors(true);
              return;
            }
            onSave();
          }}
        >
          {isNew ? "Save damage" : "Save changes"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete damage ${number}?`}
        description="This removes the damage and its photos from this inspection. You can undo straight after."
        confirmLabel="Delete damage"
        tone="danger"
        onConfirm={() => onDelete?.()}
      />
      <ConfirmDialog
        open={!!removePhoto}
        onOpenChange={(o) => !o && setRemovePhoto(null)}
        title="Remove this photo?"
        description="The photo will not be attached to this damage."
        confirmLabel="Remove photo"
        tone="danger"
        onConfirm={() => {
          if (!removePhoto) return;
          set({ photos: photos.filter((p) => p.id !== removePhoto.id) });
          onPhotoRemoved?.(removePhoto);
          setRemovePhoto(null);
        }}
      />
    </div>
  );
}
