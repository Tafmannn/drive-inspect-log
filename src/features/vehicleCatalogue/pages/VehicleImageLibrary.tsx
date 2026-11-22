/**
 * Super admin: add studio renders to the vehicle catalogue from a phone.
 *
 * Pick PNGs named make-model-yearfrom-yearto-colour.png. Each name is parsed
 * and checked (format, overlaps in the batch, overlaps with the library)
 * before anything is uploaded. Saving uploads to the public `vehicle-images`
 * bucket and inserts a vehicle_catalogue_images row; jobs pick the image up
 * automatically via the DB trigger.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImagePlus, Loader2, CheckCircle2, AlertCircle, MinusCircle, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { vehicleCatalogueImageUrl } from "@/lib/vehicleCatalogueImage";
import {
  CATALOGUE_BODY_TYPES,
  findOverlaps,
  parseVehicleImageName,
  type ParsedVehicleImage,
} from "../lib/vehicleImageName";
import { listCatalogueImages, uploadCatalogueImage, type CatalogueImageRow } from "../api";

type RowStatus = "ready" | "invalid" | "uploading" | "saved" | "skipped" | "failed";

interface PendingRow {
  id: string;
  file: File;
  previewUrl: string;
  parsed: ParsedVehicleImage | null;
  make: string;
  model: string;
  bodyType: string;
  problem: string | null;
  status: RowStatus;
  message?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

function yearsLabel(from: number, to: number) {
  return from === to ? String(from) : `${from}–${to}`;
}

function overlapsLibrary(p: ParsedVehicleImage, make: string, model: string, library: CatalogueImageRow[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return library.find(
    (r) =>
      norm(r.make) === norm(make) &&
      norm(r.model) === norm(model) &&
      norm(r.colour) === norm(p.colour) &&
      p.yearFrom <= r.year_to &&
      r.year_from <= p.yearTo,
  );
}

export function VehicleImageLibrary() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<CatalogueImageRow[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadLibrary = useCallback(async () => {
    try {
      setLibrary(await listCatalogueImages());
      setLibraryError(null);
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : "Could not load the library");
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // Release object URLs when rows go away.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = rows.map((r) => r.previewUrl);
  }, [rows]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Re-validate whenever rows or the library change.
  const checked = useMemo(() => {
    const parsedRows = rows.filter((r) => r.parsed && !["saved", "skipped"].includes(r.status));
    const batchClash = findOverlaps(
      parsedRows.map((r) => ({ ...(r.parsed as ParsedVehicleImage), make: r.make, model: r.model })),
    );
    const names = new Set(library.map((l) => l.image_path));
    return rows.map((r) => {
      if (["uploading", "saved", "skipped", "failed"].includes(r.status)) return r;
      let problem = r.problem;
      if (!problem && r.parsed) {
        if (!r.make.trim() || !r.model.trim()) problem = "Make and model are required";
        else if (names.has(r.file.name)) problem = "Already in the library";
        else if (batchClash.has(r.file.name)) problem = "Overlaps another image in this batch";
        else {
          const hit = overlapsLibrary(r.parsed, r.make, r.model, library);
          if (hit) problem = `Overlaps ${hit.image_path}`;
        }
      }
      return { ...r, status: (problem ? "invalid" : "ready") as RowStatus, problem };
    });
  }, [rows, library]);

  const readyCount = checked.filter((r) => r.status === "ready").length;

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added: PendingRow[] = Array.from(list).map((file) => {
      const res = parseVehicleImageName(file.name);
      let problem: string | null = "error" in res ? res.error : null;
      if (!problem && !/^image\/(png|webp)$/.test(file.type)) problem = "File must be a PNG or WebP image";
      if (!problem && file.size > MAX_BYTES) problem = "File is larger than 10 MB";
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        parsed: res.ok ? res.value : null,
        make: res.ok ? res.value.make : "",
        model: res.ok ? res.value.model : "",
        bodyType: "",
        problem,
        status: "ready" as RowStatus,
      };
    });
    setRows((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function update(id: string, patch: Partial<PendingRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  /** User edit: a failed row becomes retryable once its details change. */
  function edit(id: string, patch: Partial<PendingRow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ...patch, ...(r.status === "failed" ? { status: "ready" as RowStatus, message: undefined } : {}) } : r,
      ),
    );
  }

  function remove(id: string) {
    setRows((prev) => {
      const gone = prev.find((r) => r.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  }

  function setAllBodyTypes(value: string) {
    setRows((prev) => prev.map((r) => (r.status === "saved" ? r : { ...r, bodyType: value })));
  }

  async function saveAll() {
    const todo = checked.filter((r) => r.status === "ready" && r.parsed);
    if (!todo.length) return;
    setSaving(true);
    let saved = 0;
    let other = 0;
    for (const r of todo) {
      update(r.id, { status: "uploading" });
      const p = r.parsed as ParsedVehicleImage;
      const out = await uploadCatalogueImage({
        file: r.file,
        fileName: r.file.name,
        make: r.make,
        model: r.model,
        yearFrom: p.yearFrom,
        yearTo: p.yearTo,
        colour: p.colour,
        bodyType: r.bodyType || null,
      });
      if (out.status === "saved") saved++;
      else other++;
      update(r.id, { status: out.status, message: out.status === "saved" ? undefined : out.reason });
    }
    setSaving(false);
    await loadLibrary();
    toast({
      title: `${saved} image${saved === 1 ? "" : "s"} saved`,
      description: other ? `${other} not saved — see the list for reasons.` : "Matching jobs now show these images.",
    });
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Vehicle images" showBack onBack={() => navigate("/super-admin/settings")} />
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Add images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Name each file <span className="font-mono">make-model-yearfrom-yearto-colour.png</span>, e.g.{" "}
              <span className="font-mono">bmw-x5-2019-2023-black.png</span>. Jobs with a matching vehicle show the image
              automatically.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button className="w-full gap-2" variant="outline" onClick={() => inputRef.current?.click()} disabled={saving}>
              <ImagePlus className="h-4 w-4" /> Choose images
            </Button>
          </CardContent>
        </Card>

        {checked.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2">
              <CardTitle className="text-sm font-medium">
                Review ({readyCount} ready of {checked.length})
              </CardTitle>
              <select
                aria-label="Set body type for all"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                defaultValue=""
                onChange={(e) => e.target.value && setAllBodyTypes(e.target.value)}
                disabled={saving}
              >
                <option value="">Body type for all…</option>
                {CATALOGUE_BODY_TYPES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </CardHeader>
            <CardContent className="space-y-2">
              {checked.map((r) => {
                const locked = r.status === "uploading" || r.status === "saved" || r.status === "skipped";
                return (
                  <div key={r.id} className="flex gap-3 rounded-lg border border-border p-2">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                      <img src={r.previewUrl} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{r.file.name}</p>
                        {!locked && (
                          <button
                            type="button"
                            aria-label={`Remove ${r.file.name}`}
                            className="text-muted-foreground"
                            onClick={() => remove(r.id)}
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {r.parsed ? (
                        <>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input
                              aria-label="Make"
                              value={r.make}
                              onChange={(e) => edit(r.id, { make: e.target.value })}
                              disabled={locked || saving}
                              className="h-8 text-xs"
                            />
                            <Input
                              aria-label="Model"
                              value={r.model}
                              onChange={(e) => edit(r.id, { model: e.target.value })}
                              disabled={locked || saving}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">
                              {yearsLabel(r.parsed.yearFrom, r.parsed.yearTo)}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] capitalize">{r.parsed.colour}</Badge>
                            <select
                              aria-label="Body type"
                              className="h-6 rounded-md border border-input bg-background px-1 text-[11px]"
                              value={r.bodyType}
                              onChange={(e) => edit(r.id, { bodyType: e.target.value })}
                              disabled={locked || saving}
                            >
                              <option value="">Body type</option>
                              {CATALOGUE_BODY_TYPES.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      ) : null}
                      <RowStatusLine row={r} />
                    </div>
                  </div>
                );
              })}
              <Button className="w-full" onClick={saveAll} disabled={saving || readyCount === 0}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  `Save ${readyCount} image${readyCount === 1 ? "" : "s"}`
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Library ({library.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {libraryError && <p className="text-xs text-destructive">{libraryError}</p>}
            {!libraryError && library.length === 0 && (
              <p className="text-xs text-muted-foreground">No images yet.</p>
            )}
            {library.map((l) => (
              <div key={l.id} className="flex items-center gap-3">
                <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
                  <img
                    src={vehicleCatalogueImageUrl(l.image_path) ?? undefined}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {l.make} {l.model}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {yearsLabel(l.year_from, l.year_to)} · <span className="capitalize">{l.colour}</span>
                    {l.body_type ? ` · ${l.body_type}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <BottomNav />
    </div>
  );
}

function RowStatusLine({ row }: { row: PendingRow }) {
  switch (row.status) {
    case "invalid":
      return (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" /> {row.problem}
        </p>
      );
    case "uploading":
      return (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      );
    case "saved":
      return (
        <p className="flex items-center gap-1 text-[11px] text-success">
          <CheckCircle2 className="h-3 w-3" /> Saved
        </p>
      );
    case "skipped":
      return (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MinusCircle className="h-3 w-3" /> {row.message}
        </p>
      );
    case "failed":
      return (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" /> {row.message}
        </p>
      );
    default:
      return <p className="text-[11px] text-muted-foreground">Ready</p>;
  }
}
