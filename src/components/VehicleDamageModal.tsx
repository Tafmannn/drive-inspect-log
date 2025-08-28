import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Camera, Plus, X } from "lucide-react";

interface VehicleDamageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (damage: DamageReport) => void;
}

interface DamageReport {
  area: string;
  location: string;
  item: string;
  damageTypes: string[];
  notes: string;
  photo?: File;
}

const damageAreas = [
  "Front of Vehicle",
  "Nearside", 
  "Rear of Vehicle",
  "Roof",
  "Offside",
  "Interior"
];

const damageLocations = {
  "Front of Vehicle": ["Panels", "Glass"],
  "Nearside": ["Panels", "Glass"],
  "Rear of Vehicle": ["Panels", "Glass"],
  "Roof": ["Panels", "Glass"],
  "Offside": ["Panels", "Glass"],
  "Interior": ["Panels", "Glass"]
};

const damageItems = {
  "Front of Vehicle": {
    "Panels": ["Bonnet", "Grill", "Bumper", "Valance", "Spoiler"],
    "Glass": ["Windscreen", "Side Window"]
  },
  "Nearside": {
    "Panels": ["Door", "Wing", "Sill", "Wheel Arch"],
    "Glass": ["Window", "Mirror"]
  },
  "Rear of Vehicle": {
    "Panels": ["Boot", "Bumper", "Panel"],
    "Glass": ["Rear Window", "Light"]
  },
  "Roof": {
    "Panels": ["Roof Panel", "Sunroof"],
    "Glass": ["Sunroof Glass"]
  },
  "Offside": {
    "Panels": ["Door", "Wing", "Sill", "Wheel Arch"],
    "Glass": ["Window", "Mirror"]
  },
  "Interior": {
    "Panels": ["Dashboard", "Seat", "Door Panel"],
    "Glass": ["Mirror", "Screen"]
  }
};

const damageTypes = [
  "Dent",
  "Scratch", 
  "Rust",
  "Paint Chip",
  "Collision Damage",
  "Scuff",
  "Missing"
];

export const VehicleDamageModal = ({ isOpen, onClose, onSubmit }: VehicleDamageModalProps) => {
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedDamageTypes, setSelectedDamageTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const handleDamageTypeChange = (damageType: string, checked: boolean) => {
    if (checked) {
      setSelectedDamageTypes([...selectedDamageTypes, damageType]);
    } else {
      setSelectedDamageTypes(selectedDamageTypes.filter(type => type !== damageType));
    }
  };

  const handleSubmit = () => {
    const damage: DamageReport = {
      area: selectedArea,
      location: selectedLocation,
      item: selectedItem,
      damageTypes: selectedDamageTypes,
      notes,
      photo: photo || undefined
    };
    onSubmit(damage);
    onClose();
    // Reset form
    setSelectedArea("");
    setSelectedLocation("");
    setSelectedItem("");
    setSelectedDamageTypes([]);
    setNotes("");
    setPhoto(null);
  };

  const availableLocations = selectedArea ? damageLocations[selectedArea as keyof typeof damageLocations] || [] : [];
  const availableItems = selectedArea && selectedLocation 
    ? damageItems[selectedArea as keyof typeof damageItems]?.[selectedLocation as keyof typeof damageItems[keyof typeof damageItems]] || []
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Please provide details and evidence of the damage
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image Upload */}
          <div>
            <h3 className="font-medium mb-3">Image Upload</h3>
            <Card className="p-6 text-center">
              <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center mb-3">
                {photo ? (
                  <span className="text-sm text-success">Photo selected</span>
                ) : (
                  <Plus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                id="damage-photo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPhoto(file);
                }}
              />
              <Label htmlFor="damage-photo" className="cursor-pointer">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <span>
                    <Camera className="h-4 w-4" />
                    Take Photo
                  </span>
                </Button>
              </Label>
            </Card>
          </div>

          {/* Details */}
          <div>
            <h3 className="font-medium mb-3">Details</h3>
            
            {/* Area */}
            <div className="mb-4">
              <Label className="text-sm font-medium">Area</Label>
              <RadioGroup 
                value={selectedArea} 
                onValueChange={(value) => {
                  setSelectedArea(value);
                  setSelectedLocation("");
                  setSelectedItem("");
                }}
                className="mt-2"
              >
                {damageAreas.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <RadioGroupItem 
                      value={area} 
                      id={`area-${area}`}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Label htmlFor={`area-${area}`} className="text-sm">{area}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Location */}
            {availableLocations.length > 0 && (
              <div className="mb-4">
                <Label className="text-sm font-medium">Location</Label>
                <RadioGroup 
                  value={selectedLocation} 
                  onValueChange={(value) => {
                    setSelectedLocation(value);
                    setSelectedItem("");
                  }}
                  className="mt-2"
                >
                  {availableLocations.map((location) => (
                    <div key={location} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={location} 
                        id={`location-${location}`}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label htmlFor={`location-${location}`} className="text-sm">{location}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Item */}
            {availableItems.length > 0 && (
              <div className="mb-4">
                <Label className="text-sm font-medium">Item</Label>
                <RadioGroup 
                  value={selectedItem} 
                  onValueChange={setSelectedItem}
                  className="mt-2"
                >
                  {availableItems.map((item) => (
                    <div key={item} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={item} 
                        id={`item-${item}`}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label htmlFor={`item-${item}`} className="text-sm">{item}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Damage Types */}
            <div className="mb-4">
              <Label className="text-sm font-medium">Options</Label>
              <div className="mt-2 space-y-2">
                {damageTypes.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`damage-${type}`}
                      checked={selectedDamageTypes.includes(type)}
                      onChange={(e) => handleDamageTypeChange(type, e.target.checked)}
                      className="rounded border-input"
                    />
                    <Label htmlFor={`damage-${type}`} className="text-sm">{type}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="damage-notes" className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                id="damage-notes"
                placeholder="Any further details regarding the damage"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              CANCEL
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="flex-1"
              disabled={!selectedArea || !selectedLocation || !selectedItem || selectedDamageTypes.length === 0}
            >
              SUBMIT
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};