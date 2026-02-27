import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";

interface QrDisplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  eventType: string;
  jobRef: string;
}

export function QrDisplayModal({ isOpen, onClose, url, eventType, jobRef }: QrDisplayModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text in a temporary textarea
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Axentra ${eventType} confirmation – ${jobRef}`,
          text: `Please confirm the ${eventType} handover by visiting this link:`,
          url,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") {
          // Share failed — user can still copy
        }
      }
    }
  };

  // Generate a simple QR code using a public API (no dependency needed)
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="capitalize">{eventType} QR Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Show this QR code to the customer, or share the link.
          </p>
          <div className="flex justify-center">
            <img
              src={qrImageUrl}
              alt="QR Code"
              className="w-56 h-56 rounded border bg-white p-2"
            />
          </div>
          <p className="text-xs text-muted-foreground break-all">{url}</p>
          <div className="flex gap-2">
            <Button className="flex-1" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            {typeof navigator.share === "function" && (
              <Button className="flex-1" onClick={handleShare}>
                <ExternalLink className="h-4 w-4 mr-1" /> Share
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            If sharing is unavailable, please show the QR code on screen for the customer to scan.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
