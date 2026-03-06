// src/components/SignaturePad.tsx
// DPR-aware, pointer-event-based signature pad for mobile reliability.

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";

export interface SignaturePadRef {
  clear: () => void;
  toFile: (name: string) => Promise<File>;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  onSignStart?: () => void;
  className?: string;
  width?: number;
  height?: number;
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignStart, className = "", width = 320, height = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const hasStrokes = useRef(false);
    const [signed, setSigned] = useState(false);

    // Setup DPR-aware canvas
    const setupCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      // Set backing store size to match display size * DPR
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "hsl(215 28% 17%)";
        ctx.lineWidth = 2;
      }
    }, []);

    useEffect(() => {
      setupCanvas();
      // Re-setup on resize/orientation change
      const handleResize = () => {
        if (!hasStrokes.current) {
          setupCanvas();
        }
      };
      window.addEventListener("resize", handleResize);
      window.addEventListener("orientationchange", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("orientationchange", handleResize);
      };
    }, [setupCanvas]);

    const getPos = useCallback((e: PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }, []);

    const handlePointerDown = useCallback((e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
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
        onSignStart?.();
      }
    }, [getPos, onSignStart]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      if (!drawing.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }, [getPos]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
      if (!drawing.current) return;
      drawing.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture(e.pointerId);
      }
      setSigned(true);
    }, []);

    const handlePointerCancel = useCallback((e: PointerEvent) => {
      drawing.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      }
    }, []);

    // Attach pointer events
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointercancel", handlePointerCancel);
      canvas.addEventListener("pointerleave", handlePointerUp);

      return () => {
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerCancel);
        canvas.removeEventListener("pointerleave", handlePointerUp);
      };
    }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        hasStrokes.current = false;
        drawing.current = false;
        setSigned(false);
      },
      toFile: async (name: string) => {
        const canvas = canvasRef.current!;
        return new Promise<File>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(new File([blob!], name, { type: "image/png" }));
          }, "image/png");
        });
      },
      isEmpty: () => !hasStrokes.current,
    }));

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, height: `${height}px` }}
          className={`w-full border-2 border-dashed border-muted-foreground/25 rounded-lg bg-white touch-none ${className}`}
        />
        {signed && (
          <p className="text-xs text-success mt-1">Signed ✓</p>
        )}
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
