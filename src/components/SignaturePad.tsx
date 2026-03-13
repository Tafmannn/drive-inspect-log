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
    // Called by ResizeObserver with the canvas's real CSS dimensions.
    // Never called with 0×0 — observer only fires once the element is laid out.
    const initCanvas = useCallback((cssW: number, cssH: number) => {
      const canvas = canvasRef.current;
      if (!canvas || cssW === 0 || cssH === 0) return;

      const dpr = window.devicePixelRatio || 1;

      // Capture existing drawing before resizing backing store
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

      // Restore drawing after resize (best-effort)
      if (imageData && hasStrokes.current) {
        ctx.putImageData(imageData, 0, 0);
      }
    }, []);

    // ── ResizeObserver fires once with real size, then on every resize ──
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
      const canvas = canvasRef.current!​​​​​​​​​​​​​​​​
