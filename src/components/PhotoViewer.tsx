import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PhotoItem {
  url: string;
  label?: string;
}

interface PhotoViewerProps {
  photos: PhotoItem[];
  title: string;
}

export const PhotoViewer = ({ photos, title }: PhotoViewerProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);

  if (photos.length === 0) return null;

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
      // Fetch via proxy to handle CORS/signed URLs
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
      // Fallback: open in new tab
      try {
        window.open(photo.url, "_blank");
      } catch {
        toast({ title: "Download failed", description: "Could not download image.", variant: "destructive" });
      }
    } finally {
      setDownloading(false);
    }
  }, [selectedIndex, photos, downloading]);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">
        {title} ({photos.length})
      </h4>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo, idx) => (
          <button
            key={idx}
            onClick={() => openPhoto(idx)}
            className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <img
              src={photo.url}
              alt={photo.label || `Photo ${idx + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
              crossOrigin="anonymous"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.className = 'absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-[10px] text-center p-1';
                placeholder.textContent = 'Image unavailable';
                target.parentNode?.appendChild(placeholder);
              }}
            />
            {photo.label && (
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                {photo.label}
              </span>
            )}
          </button>
        ))}
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
                <img
                  src={photos[selectedIndex].url}
                  alt={photos[selectedIndex].label || "Photo"}
                  className="max-w-full max-h-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                  crossOrigin="anonymous"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'flex items-center justify-center text-white text-sm';
                    placeholder.textContent = 'Image could not be loaded';
                    target.parentNode?.appendChild(placeholder);
                  }}
                />
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
