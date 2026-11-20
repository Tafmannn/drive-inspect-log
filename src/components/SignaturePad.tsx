// src/components/SignaturePad.tsx
// DPR-aware, pointer-event-based signature pad for mobile reliability.
//
// Strokes are kept as vectors, not just as canvas pixels. Rotating the phone
// resizes the canvas (it is width:100%), which wipes its backing store; the
// previous version copied the old pixels back, so a signature drawn across a
// wide landscape canvas was permanently clipped when the canvas shrank back
// to portrait. Now every resize redraws the strokes, uniformly scaled to fit,
// and new strokes are mapped into the same space so they land under the finger.

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { fitScale } from "@/lib/signatureDraft";

export interface SignaturePadRef {
  clear: () => void;
  toFile: (name: string) => Promise<File>;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  onSignStart?: () => void;
  className?: string;
  /** Rendered CSS height in px (width is always 100% of container) */
  height?: number;
  /**
   * When set, strokes are kept in sessionStorage under this key, so the
   * signature survives the page being reloaded in the same tab (iOS reloads
   * backgrounded tabs under memory pressure). Cleared by `clear()`.
   */
  persistKey?: string;
}

type Point = [number, number];
interface StrokeData {
  /** CSS size of the canvas the strokes' coordinates are expressed in. */
  ref: { w: number; h: number };
  strokes: Point[][];
}

const STROKE_COLOR = "hsl(215 28% 17%)";
const LINE_WIDTH = 2; // CSS px

function loadPersisted(key?: string): StrokeData | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StrokeData;
    if (!parsed?.ref?.w || !parsed?.ref?.h || !Array.isArray(parsed.strokes)) return null;
    return parsed.strokes.length ? parsed : null;
  } catch {
    return null;
  }
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignStart, className = "", height = 120, persistKey }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const data = useRef<StrokeData>(loadPersisted(persistKey) ?? { ref: { w: 0, h: 0 }, strokes: [] });
    const size = useRef({ w: 0, h: 0 }); // current CSS content size
    const onSignStartRef = useRef(onSignStart);
    onSignStartRef.current = onSignStart;

    const context = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return null;
      const dpr = window.devicePixelRatio || 1;
      const s = fitScale(data.current.ref, size.current.w, size.current.h);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = STROKE_COLOR;
      ctx.fillStyle = STROKE_COLOR;
      ctx.lineWidth = LINE_WIDTH / s;
      return ctx;
    }, []);

    const drawStroke = (ctx: CanvasRenderingContext2D, pts: Point[]) => {
      if (pts.length === 0) return;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = context();
      if (!canvas || !ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      for (const pts of data.current.strokes) drawStroke(ctx, pts);
    }, [context]);

    const persist = useCallback(() => {
      if (!persistKey) return;
      try {
        if (data.current.strokes.length) sessionStorage.setItem(persistKey, JSON.stringify(data.current));
        else sessionStorage.removeItem(persistKey);
      } catch { /* quota / private mode: in-memory strokes still work */ }
    }, [persistKey]);

    // A restored signature counts as signed for the parent's validation.
    useEffect(() => {
      if (data.current.strokes.length) onSignStartRef.current?.();
    }, []);

    // ── Size the backing store to the element and redraw on every resize ──
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height: h } = entry.contentRect;
          if (width === 0 || h === 0) continue; // hidden (e.g. inactive step)
          const dpr = window.devicePixelRatio || 1;
          size.current = { w: width, h };
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(h * dpr);
          redraw();
        }
      });
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [redraw]);

    // ── Pointer handlers ───────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Pointer position in the strokes' reference space. clientLeft/Top
      // skip the border so the ink lands exactly under the finger.
      const toRef = (e: PointerEvent): Point => {
        const rect = canvas.getBoundingClientRect();
        const s = fitScale(data.current.ref, size.current.w, size.current.h);
        return [
          (e.clientX - rect.left - canvas.clientLeft) / s,
          (e.clientY - rect.top - canvas.clientTop) / s,
        ];
      };

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        if (size.current.w === 0) return;
        canvas.setPointerCapture(e.pointerId);
        drawing.current = true;
        if (data.current.strokes.length === 0) {
          // First stroke defines the reference space.
          data.current.ref = { w: size.current.w, h: size.current.h };
        }
        const p = toRef(e);
        data.current.strokes.push([p]);
        const ctx = context();
        if (ctx) drawStroke(ctx, [p]);
        if (data.current.strokes.length === 1) onSignStartRef.current?.();
      };

      const onMove = (e: PointerEvent) => {
        if (!drawing.current) return;
        e.preventDefault();
        const stroke = data.current.strokes[data.current.strokes.length - 1];
        const prev = stroke[stroke.length - 1];
        const p = toRef(e);
        stroke.push(p);
        const ctx = context();
        if (ctx) drawStroke(ctx, [prev, p]);
      };

      const onUp = (e: PointerEvent) => {
        if (!drawing.current) return;
        drawing.current = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
        persist();
      };

      canvas.addEventListener("pointerdown", onDown, { passive: false });
      canvas.addEventListener("pointermove", onMove, { passive: false });
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      return () => {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
      };
    }, [context, persist]);

    // ── Imperative API ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      clear() {
        data.current = { ref: { w: 0, h: 0 }, strokes: [] };
        redraw();
        persist();
      },
      async toFile(name: string): Promise<File> {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not available");
        return new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("Canvas toBlob failed"));
              resolve(new File([blob], name, { type: "image/png" }));
            },
            "image/png"
          );
        });
      },
      isEmpty() {
        return data.current.strokes.length === 0;
      },
    }), [redraw, persist]);

    return (
      <canvas
        ref={canvasRef}
        className={`w-full border rounded-md bg-white touch-none ${className}`}
        style={{ height }}
      />
    );
  }
);

SignaturePad.displayName = "SignaturePad";
