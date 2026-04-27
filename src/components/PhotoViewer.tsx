import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PhotoItem {
  /** Stable identity (photo row id). Falls back to url+index when absent. */
  id?: string;
  url: string;
  label?: string;
}

interface PhotoViewerProps {
  photos: PhotoItem[];
  title: string;
  /** Total photos expected from DB — shows partial-load indicator when > photos.length */
  totalExpected?: number;
  /** Called when user taps retry for missing photos */
  onRetry?: () => void;
}

export const PhotoViewer = ({ photos, title, totalExpected, onRetry }: PhotoViewerProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  // Track which thumbnails failed to load so we render a single, idempotent
  // placeholder per photo. The previous implementation imperatively appended
  // a <div> on every onError fire which, combined with React re-renders,
  // could stack hundreds of placeholder boxes ("282 preview boxes" bug).
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  const keyFor = (p: PhotoItem, idx: number) => p.id ?? `${p.url}#${idx}`;

  const openPhoto = (idx: number) => {
    setSelectedIndex(idx);
    setZoom(1);
  };

  const close = () => {
    setSelectedIndex(null);
    setZoom(1);
  };

  const prev = () => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : photos.length - 1);
    setZoom(1);
  };

  const next = () => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex < photos.length - 1 ? selectedIndex + 1 : 0);
    setZoom(1);
  };

  const toggleZoom = () => {
    setZoom((z) => (z === 1 ? 2 : z === 2 ? 3 : 1));
  };

  const handleDownload = useCallback(async () => {
    if (selectedIndex === null || downloading) return;
    const photo = photos[selectedIndex];
    if (!photo?.url) return;

    setDownloading(true);
    try {
      const response = await fetch(photo.url, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const filename = photo.label
        ? `${photo.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`
        : `photo_${selectedIndex + 1}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[PhotoViewer] Download failed", err);
      try {
        window.open(photo.url, "_blank");
      } catch {
        toast({ title: "Download failed", description: "Could not download image.", variant: "destructive" });
      }
    } finally {
      setDownloading(false);
    }
  }, [selectedIndex, photos, downloading]);

  const hasMissing = totalExpected != null && totalExpected > photos.length;

  if (photos.length === 0 && !hasMissing) return null;

  const markFailed = (key: string) => {
    setFailedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-foreground">
          {title} ({photos.length}{hasMissing ? '/' + totalExpected : ''})
        </h4>
        {hasMissing && onRetry && (
          <button
            onClick={onRetry}
            className="text-[11px] text-primary font-medium hover:underline"
          >
            Retry {(totalExpected ?? 0) - photos.length} missing
          </button>
        )}
      </div>
      {hasMissing && !onRetry && (
        <p className="text-[11px] text-muted-foreground">
          {(totalExpected ?? 0) - photos.length} photo(s) couldn't be loaded
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo, idx) => {
          const k = keyFor(photo, idx);
          const failed = failedKeys.has(k);
          return (
            <button
              key={k}
              onClick={() => openPhoto(idx)}
              className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {failed ? (
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-[10px] text-center p-1">
                  Image unavailable
                </div>
              ) : (
                <img
                  src={photo.url}
                  alt={photo.label || `Photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => markFailed(k)}
                />
              )}
              {photo.label && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                  {photo.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={selectedIndex !== null} onOpenChange={() => close()}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 border-none bg-black/95 [&>button]:hidden">
          <div className="relative w-full h-full flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 z-10">
              <span className="text-white text-sm truncate mr-2">
                {selectedIndex !== null && photos[selectedIndex]?.label
                  ? photos[selectedIndex].label
                  : `Photo ${(selectedIndex ?? 0) + 1} of ${photos.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={handleDownload} disabled={downloading} className="text-white hover:bg-white/20">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={toggleZoom} className="text-white hover:bg-white/20">
                  {zoom > 1 ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={close} className="text-white hover:bg-white/20">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center overflow-auto touch-pinch-zoom">
              {selectedIndex !== null && (
                failedKeys.has(keyFor(photos[selectedIndex], selectedIndex)) ? (
                  <div className="flex items-center justify-center text-white text-sm">
                    Image could not be loaded
                  </div>
                ) : (
                  <img
                    src={photos[selectedIndex].url}
                    alt={photos[selectedIndex].label || "Photo"}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                    draggable={false}
                    onError={() =>
                      markFailed(keyFor(photos[selectedIndex], selectedIndex))
                    }
                  />
                )
              )}
            </div>

            {/* Navigation */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 z-10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 z-10"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}

            {/* Dot indicators */}
            {photos.length > 1 && photos.length <= 20 && (
              <div className="flex justify-center gap-1.5 py-3 bg-black/80">
                {photos.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedIndex(idx); setZoom(1); }}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === selectedIndex ? "bg-white" : "bg-white/30"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
