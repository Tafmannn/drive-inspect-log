import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ViewerPhoto {
  id: string;
  url: string;
  caption: string;
}

/**
 * In-page photo viewer for a report's photos: next/previous buttons, arrow
 * keys, Esc to close (from the dialog), a "3 of 12" counter, and a link to
 * the full-size original for clients who need to zoom or keep a copy.
 */
export function PhotoViewer({
  title,
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  title: string;
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index != null && index >= 0 && index < photos.length;
  const count = photos.length;
  const go = useCallback(
    (delta: number) => {
      if (index == null || count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const photo = open ? photos[index] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] p-3 sm:p-4 gap-3">
        {photo && (
          <>
            <div className="pr-8">
              <DialogTitle className="text-sm font-medium">{photo.caption}</DialogTitle>
              <DialogDescription className="text-xs">
                {title} · {index! + 1} of {count}
              </DialogDescription>
            </div>
            <div className="relative bg-muted rounded-md overflow-hidden flex items-center justify-center min-h-[40vh]">
              <img src={photo.url} alt={photo.caption} className="max-h-[70vh] w-auto max-w-full object-contain" />
              {count > 1 && (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                    onClick={() => go(-1)}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full shadow"
                    onClick={() => go(1)}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open full size <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
