// Helpers for SignaturePad's vector strokes (kept out of the component file
// so React Fast Refresh can treat SignaturePad.tsx as components-only).

/** Uniform scale that fits the reference box inside the current canvas. */
export function fitScale(ref: { w: number; h: number }, cssW: number, cssH: number): number {
  if (!ref.w || !ref.h || !cssW || !cssH) return 1;
  return Math.min(cssW / ref.w, cssH / ref.h);
}

/** sessionStorage key for an inspection's signature strokes. */
export function signatureDraftKey(inspectionType: string, jobId: string, who: "driver" | "customer"): string {
  return `axentra.signature.${inspectionType}.${jobId}.${who}`;
}

/** Forget both signatures for an inspection (after submit or "Start fresh"). */
export function clearSignatureDrafts(inspectionType: string, jobId: string): void {
  try {
    sessionStorage.removeItem(signatureDraftKey(inspectionType, jobId, "driver"));
    sessionStorage.removeItem(signatureDraftKey(inspectionType, jobId, "customer"));
  } catch { /* ignore */ }
}
