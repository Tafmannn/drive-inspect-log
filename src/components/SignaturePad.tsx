// src/components/SignaturePad.tsx
// DPR-aware, pointer-event-based signature pad for mobile reliability.
// Uses ResizeObserver to guarantee canvas backing-store is sized correctly
// even when rendered inside sheets, dialogs, or lazy-mounted step flows
// where getBoundingClientRect() returns 0×0 at initial useEffect time.

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";

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
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignStart, className = "", height = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const hasStrokes = useRef(false);
    const [signed, setSigned] = useState(false);

    // ── Canvas initialisation ──────────────────────────────────────────
    const initCanvas = useCallback((cssW: number, cssH: number) => {
      const canvas = canvasRef.current;
      if (!canvas || cssW === 0 || cssH === 0) return;

      const dpr = window.devicePixelRatio || 1;

      let imageData: ImageData | null = null;
      const prevCtx = canvas.getContext("2d");
      if (hasStrokes.current && prevCtx && canvas.width > 0 && canvas.height > 0) {
        try { imageData = prevCtx.getImageData(0, 0, canvas.width, canvas.height); } catch { /* ok */ }
      }

      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "hsl(215 28% 17%)";
      ctx.lineWidth = 2;

      if (imageData && hasStrokes.current) {
        ctx.putImageData(imageData, 0, 0);
      }
    }, []);

    // ── ResizeObserver ──────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height: h } = entry.contentRect;
          initCanvas(width, h);
        }
      });
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [initCanvas]);

    // ── Coordinate helper ──────────────────────────────────────────────
    const getPos = useCallback((e: PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }, []);

    // ── Pointer handlers ───────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drawing.current = true;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        if (!hasStrokes.current) {
          hasStrokes.current = true;
          setSigned(true);
          onSignStart?.();
        }
      };

      const onMove = (e: PointerEvent) => {
        if (!drawing.current) return;
        e.preventDefault();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      };

      const onUp = (e: PointerEvent) => {
        if (!drawing.current) return;
        drawing.current = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
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
    }, [getPos, onSignStart]);

    // ── Imperative API ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasStrokes.current = false;
        setSigned(false);
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
        return !hasStrokes.current;
      },
    }), []);

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
