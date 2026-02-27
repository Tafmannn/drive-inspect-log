import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PhotoLabelModalProps {
  isOpen: boolean;
  previewUrl: string | null;
  onSave: (label: string) => void;
  onSkip: () => void;
}

export function PhotoLabelModal({ isOpen, previewUrl, onSave, onSkip }: PhotoLabelModalProps) {
  const [label, setLabel] = useState("");

  const handleSave = () => {
    onSave(label.trim() || "Unlabelled");
    setLabel("");
  };

  const handleSkip = () => {
    onSkip();
    setLabel("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Label this photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover rounded border" />
          )}
          <div className="space-y-1.5">
            <Label>Photo Label</Label>
            <Input
              placeholder="e.g. Boot interior, Wheel arch"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave}>Save</Button>
            <Button variant="outline" className="flex-1" onClick={handleSkip}>Skip</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
