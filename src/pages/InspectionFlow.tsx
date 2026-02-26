import { useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VehicleDiagram } from "@/components/VehicleDiagram";
import { VehicleDamageModal } from "@/components/VehicleDamageModal";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  X,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useJob, useSubmitInspection } from "@/hooks/useJobs";
import { storageService } from "@/lib/storage";
import { insertPhoto } from "@/lib/api";
import { addPendingUpload } from "@/lib/pendingUploads";
import { toast } from "@/hooks/use-toast";
import { FUEL_LEVEL_MAP } from "@/lib/types";
import type {
  InspectionType,
  DamageItemDraft,
  AdditionalPhotoDraft,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

interface InspectionFormState {
  odometer: string;
  fuelLevel: string;
  vehicleCondition: string;
  lightCondition: string;
  oilLevel: string;
  waterLevel: string;
  notes: string;
  handbook: string;
  serviceBook: string;
  mot: string;
  v5: string;
  parcelShelf: string;
  spareWheel: string;
  toolKit: string;
  tyreInflationKit: string;
  lockingWheelNut: string;
  satNavWorking: string;
  alloysOrTrims: string;
  alloysDamaged: string;
  wheelTrimsDamaged: string;
  numberOfKeys: string;
  evChargingCables: string;
  aerial: string;
  customerPaperwork: string;
  damages: DamageItemDraft[];
  standardPhotos: Record<string, File | null>;
  standardPhotoUrls: Record<string, string>;
  additionalPhotos: AdditionalPhotoDraft[];
  driverName: string;
  customerName: string;
}

const PHOTO_TYPES_BY_INSPECTION: Record<
  InspectionType,
  { key: string; label: string }[]
> = {
  pickup: [
    { key: "pickup_exterior_front", label: "Front" },
    { key: "pickup_exterior_rear", label: "Rear" },
    { key: "pickup_exterior_driver_side", label: "Driver Side" },
    { key: "pickup_exterior_passenger_side", label: "Passenger Side" },
    { key: "pickup_interior", label: "Interior" },
    { key: "pickup_dashboard", label: "Dashboard" },
    { key: "pickup_fuel_gauge", label: "Fuel Gauge" },
  ],
  delivery: [
    { key: "delivery_exterior_front", label: "Front" },
    { key: "delivery_exterior_rear", label: "Rear" },
    { key: "delivery_exterior_driver_side", label: "Driver Side" },
    { key: "delivery_exterior_passenger_side", label: "Passenger Side" },
    { key: "delivery_interior", label: "Interior" },
    { key: "delivery_dashboard", label: "Dashboard" },
    { key: "delivery_fuel_gauge", label: "Fuel Gauge" },
  ],
};

// ─────────────────────────────────────────────────────────────
// STEP COMPONENTS (TOP LEVEL, STABLE)
// ─────────────────────────────────────────────────────────────

interface OdometerFuelProps {
  odometer: string;
  fuelLevel: string;
  onChange: (field: "odometer" | "fuelLevel", value: string) => void;
}

const OdometerFuel = ({
  odometer,
  fuelLevel,
  onChange,
}: OdometerFuelProps) => (
  <div className="space-y-6">
    <h2 className="text-xl font-semibold text-center">
      Odometer &amp; Fuel Level
    </h2>
    <div className="space-y-4">
      <div>
        <Label
          htmlFor="odometer"
          className="text-base font-medium"
        >
          Odometer *
        </Label>
        <Input
          id="odometer"
          type="number"
          inputMode="numeric"
          placeholder="Enter mileage"
          value={odometer}
          onChange={(e) => onChange("odometer", e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-base font-medium">Fuel Level *</Label>
        <RadioGroup
          value={fuelLevel}
          onValueChange={(v) => onChange("fuelLevel", v)}
          className="mt-2"
        >
          {["Empty", "1/4", "1/2", "3/4", "Full"].map((level) => (
            <div
              key={level}
              className="flex items-center space-x-2"
            >
              <RadioGroupItem value={level} id={`fuel-${level}`} />
              <Label htmlFor={`fuel-${level}`}>{level}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  </div>
);

interface DamageStepProps {
  inspectionType: InspectionType;
  damages: DamageItemDraft[];
  onAddDamage: (pos: { x: number; y: number }) => void;
  onRemoveDamage: (tempId: string) => void;
}

const DamageStep = ({
  inspectionType,
  damages,
  onAddDamage,
  onRemoveDamage,
}: DamageStepProps) => (
  <div className="space-y-4">
    <h2 className="text-xl font-semibold text-center">
      {inspectionType === "pickup" ? "Pickup" : "Delivery"} Damage
    </h2>
    <VehicleDiagram
      onAddDamage={onAddDamage}
      damages={damages.map((d) => ({
        id: d.tempId,
        x: d.x,
        y: d.y,
        area: d.area,
        item: d.item,
        damageTypes: d.damageTypes,
      }))}
    />
    {damages.length > 0 && (
      <div className="space-y-2">
        <h3 className="font-medium text-sm">
          Recorded Damages ({damages.length})
        </h3>
        {damages.map((d) => (
          <div
            key={d.tempId}
            className="flex items-center justify-between p-2 bg-muted rounded text-sm"
          >
            <span>
              {d.area} – {d.item}: {d.damageTypes.join(", ")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveDamage(d.tempId)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    )}
  </div>
);

interface PhotosStepProps {
  inspectionType: InspectionType;
  standardPhotoUrls: Record<string, string>;
  onCaptureStandard: (photoKey: string, file: File) => void;
  additionalPhotos: AdditionalPhotoDraft[];
  onAddAdditional: (file: File, label: string) => void;
  onRemoveAdditional: (tempId: string) => void;
}

const PhotosStep = ({
  inspectionType,
  standardPhotoUrls,
  onCaptureStandard,
  additionalPhotos,
  onAddAdditional,
  onRemoveAdditional,
}: PhotosStepProps) => {
  const photoTypes = PHOTO_TYPES_BY_INSPECTION[inspectionType];
  const [newLabel, setNewLabel] = useState("");

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Photos</h2>
      <p className="text-center text-muted-foreground">
        Capture required vehicle photos
      </p>
      <div className="grid grid-cols-2 gap-4">
        {photoTypes.map((pt) => (
          <div key={pt.key} className="space-y-2">
            <Label className="text-sm font-medium">{pt.label}</Label>
            {standardPhotoUrls[pt.key] ? (
              <img
                src={standardPhotoUrls[pt.key]}
                alt={pt.label}
                className="w-full h-24 object-cover rounded border"
              />
            ) : (
              <div className="w-full h-24 bg-muted rounded border flex items-center justify-center">
                <Camera className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              id={`photo-${pt.key}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onCaptureStandard(pt.key, f);
              }}
            />
            <Label
              htmlFor={`photo-${pt.key}`}
              className="cursor-pointer"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1"
                asChild
              >
                <span>
                  <Camera className="h-3 w-3" />
                  {standardPhotoUrls[pt.key] ? "Retake" : "Capture"}
                </span>
              </Button>
            </Label>
          </div>
        ))}
      </div>

      {/* Additional labelled photos */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="font-medium">Additional Photos</h3>
        {additionalPhotos.map((ap) => (
          <div
            key={ap.tempId}
            className="flex items-center gap-3 p-2 bg-muted rounded"
          >
            <img
              src={ap.previewUrl}
              alt={ap.label}
              className="w-12 h-12 object-cover rounded"
            />
            <span className="text-sm flex-1">
              {ap.label || "Unlabelled"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveAdditional(ap.tempId)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Label (e.g. Boot interior)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1"
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            id="additional-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onAddAdditional(f, newLabel || "Unlabelled");
                setNewLabel("");
              }
              e.target.value = "";
            }}
          />
          <Label
            htmlFor="additional-photo-input"
            className="cursor-pointer"
          >
            <Button variant="outline" size="sm" asChild>
              <span>
                <Plus className="h-4 w-4" />
              </span>
            </Button>
          </Label>
        </div>
      </div>
    </div>
  );
};

interface SignaturesStepProps {
  driverName: string;
  customerName: string;
  onChangeName: (field: "driverName" | "customerName", value: string) => void;
  driverCanvasRef: React.RefObject<HTMLCanvasElement>;
  customerCanvasRef: React.RefObject<HTMLCanvasElement>;
  setupCanvas: (canvas: HTMLCanvasElement, who: "driver" | "customer") => void;
  driverSigned: boolean;
  customerSigned: boolean;
}

const SignaturesStep = ({
  driverName,
  customerName,
  onChangeName,
  driverCanvasRef,
  customerCanvasRef,
  setupCanvas,
  driverSigned,
  customerSigned,
}: SignaturesStepProps) => (
  <div className="space-y-6">
    <h2 className="text-xl font-semibold text-center">Signatures</h2>
    <Card className="p-4 space-y-3">
      <h3 className="font-medium">Driver</h3>
      <div>
        <Label className="text-sm">Driver Name *</Label>
        <Input
          value={driverName}
          onChange={(e) => onChangeName("driverName", e.target.value)}
          placeholder="Driver full name"
          className="mt-1"
        />
      </div>
      <canvas
        ref={(el) => {
          if (el) {
            (driverCanvasRef as any).current = el;
            setupCanvas(el, "driver");
          }
        }}
        width={320}
        height={120}
        className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg bg-white touch-none"
      />
      {driverSigned && (
        <p className="text-xs text-success">Signed ✓</p>
      )}
    </Card>
    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
      <p className="text-sm text-warning font-medium">
        Please pass the device to the customer for their signature.
      </p>
    </div>
    <Card className="p-4 space-y-3">
      <h3 className="font-medium">Customer</h3>
      <div>
        <Label className="text-sm">Customer Name *</Label>
        <Input
          value={customerName}
          onChange={(e) => onChangeName("customerName", e.target.value)}
          placeholder="Customer full name"
          className="mt-1"
        />
      </div>
      <canvas
        ref={(el) => {
          if (el) {
            (customerCanvasRef as any).current = el;
            setupCanvas(el, "customer");
          }
        }}
        width={320}
        height={120}
        className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg bg-white touch-none"
      />
      {customerSigned && (
        <p className="text-xs text-success">Signed ✓</p>
      )}
    </Card>
  </div>
);

interface ReviewStepProps {
  formState: InspectionFormState;
  inspectionType: InspectionType;
  jobRef: string | undefined;
  reg: string | undefined;
  driverSigned: boolean;
  customerSigned: boolean;
  submitting: boolean;
  onRequestSubmit: () => void;
}

const ReviewStep = ({
  formState,
  inspectionType,
  jobRef,
  reg,
  driverSigned,
  customerSigned,
  submitting,
  onRequestSubmit,
}: ReviewStepProps) => {
  const photoCount = Object.values(formState.standardPhotos).filter(
    Boolean,
  ).length;
  const additionalCount = formState.additionalPhotos.length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">
        Review &amp; Submit
      </h2>
      <Card className="p-6 space-y-3">
        <h3 className="font-medium">Inspection Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Job:</span>
            <span className="font-medium">
              {jobRef} – {reg}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type:</span>
            <span className="capitalize font-medium">
              {inspectionType}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Odometer:</span>
            <span>{formState.odometer || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fuel Level:</span>
            <span>{formState.fuelLevel || "—"}</span>
          </div>
          {inspectionType === "pickup" && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Condition:
                </span>
                <span>{formState.vehicleCondition || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Light:</span>
                <span>{formState.lightCondition || "—"}</span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Damages:</span>
            <span>{formState.damages.length}</span>
          </div>
          {formState.damages.length > 0 && (
            <ul className="list-disc list-inside text-xs text-muted-foreground pl-2">
              {formState.damages.map((d) => (
                <li key={d.tempId}>
                  {d.area} – {d.item}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Standard Photos:
            </span>
            <span>{photoCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Additional Photos:
            </span>
            <span>{additionalCount}</span>
          </div>
          {formState.additionalPhotos.length > 0 && (
            <ul className="list-disc list-inside text-xs text-muted-foreground pl-2">
              {formState.additionalPhotos.map((p) => (
                <li key={p.tempId}>{p.label}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Driver:</span>
            <span>
              {formState.driverName || "—"}{" "}
              {driverSigned ? "✓" : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer:</span>
            <span>
              {formState.customerName || "—"}{" "}
              {customerSigned ? "✓" : "—"}
            </span>
          </div>
        </div>
      </Card>
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
        <p className="text-sm text-warning">
          Please ensure all provided information is correct. You will
          not be able to make changes after submission.
        </p>
      </div>
      <Button
        className="w-full"
        size="lg"
        onClick={onRequestSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Report"
        )}
      </Button>
    </div>
  );
};

interface CollectionChecklistProps {
  formState: InspectionFormState;
  updateField: (field: keyof InspectionFormState, value: string) => void;
}

const CollectionChecklist = ({
  formState,
  updateField,
}: CollectionChecklistProps) => (
  <div className="space-y-6">
    <h2 className="text-xl font-semibold text-center">
      Collection Checklist
    </h2>
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium">
          Vehicle Condition
        </Label>
        <RadioGroup
          value={formState.vehicleCondition}
          onValueChange={(v) => updateField("vehicleCondition", v)}
          className="mt-2"
        >
          {["Clean", "Dirty", "Wet", "Snow Covered", "Iced Over"].map(
            (c) => (
              <div
                key={c}
                className="flex items-center space-x-2"
              >
                <RadioGroupItem value={c} id={`vc-${c}`} />
                <Label htmlFor={`vc-${c}`}>{c}</Label>
              </div>
            ),
          )}
        </RadioGroup>
      </div>
      <div>
        <Label className="text-base font-medium">Light</Label>
        <RadioGroup
          value={formState.lightCondition}
          onValueChange={(v) => updateField("lightCondition", v)}
          className="mt-2"
        >
          {["Good", "Poor", "Dark", "Artificial", "Raining"].map(
            (l) => (
              <div
                key={l}
                className="flex items-center space-x-2"
              >
                <RadioGroupItem value={l} id={`lc-${l}`} />
                <Label htmlFor={`lc-${l}`}>{l}</Label>
              </div>
            ),
          )}
        </RadioGroup>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-base font-medium">Oil Level</Label>
          <RadioGroup
            value={formState.oilLevel}
            onValueChange={(v) => updateField("oilLevel", v)}
            className="mt-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Ok" id="oil-ok" />
              <Label htmlFor="oil-ok">Ok</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Issue" id="oil-issue" />
              <Label htmlFor="oil-issue">Issue</Label>
            </div>
          </RadioGroup>
        </div>
        <div>
          <Label className="text-base font-medium">Water Level</Label>
          <RadioGroup
            value={formState.waterLevel}
            onValueChange={(v) => updateField("waterLevel", v)}
            className="mt-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Ok" id="water-ok" />
              <Label htmlFor="water-ok">Ok</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Issue" id="water-issue" />
              <Label htmlFor="water-issue">Issue</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
      <div>
        <Label
          htmlFor="notes"
          className="text-base font-medium"
        >
          Notes
        </Label>
        <Textarea
          id="notes"
          placeholder="Notes"
          value={formState.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-medium">Equipment Checklist</h3>
        {(
          [
            { key: "handbook", label: "Handbook" },
            { key: "serviceBook", label: "Service Book" },
            { key: "mot", label: "MOT" },
            { key: "v5", label: "V5" },
            { key: "parcelShelf", label: "Parcel Shelf", hasNA: true },
            { key: "toolKit", label: "Tool Kit & Jack" },
            { key: "tyreInflationKit", label: "Tyre Inflation Kit" },
            { key: "lockingWheelNut", label: "Locking Wheel Nut" },
            {
              key: "evChargingCables",
              label: "EV Charging Cables",
              hasNA: true,
            },
            { key: "aerial", label: "Aerial", hasNA: true },
            { key: "customerPaperwork", label: "Customer Paperwork" },
          ] as const
        ).map((item) => (
          <div key={item.key}>
            <Label className="text-sm font-medium">
              {item.label}
            </Label>
            <RadioGroup
              value={formState[item.key] as string}
              onValueChange={(v) =>
                updateField(
                  item.key as keyof InspectionFormState,
                  v,
                )
              }
              className="mt-1 flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Present"
                  id={`${item.key}-p`}
                />
                <Label htmlFor={`${item.key}-p`}>Present</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Not Present"
                  id={`${item.key}-np`}
                />
                <Label htmlFor={`${item.key}-np`}>
                  Not Present
                </Label>
              </div>
              {"hasNA" in item &&
                item.hasNA && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="N/A"
                      id={`${item.key}-na`}
                    />
                    <Label htmlFor={`${item.key}-na`}>N/A</Label>
                  </div>
                )}
            </RadioGroup>
          </div>
        ))}
        <div>
          <Label className="text-sm font-medium">
            Spare Wheel
          </Label>
          <RadioGroup
            value={formState.spareWheel}
            onValueChange={(v) => updateField("spareWheel", v)}
            className="mt-1 flex flex-wrap gap-4"
          >
            {["Ok", "Deflated", "Damaged", "Missing"].map((c) => (
              <div
                key={c}
                className="flex items-center space-x-2"
              >
                <RadioGroupItem
                  value={c}
                  id={`spare-${c}`}
                />
                <Label htmlFor={`spare-${c}`}>{c}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div>
          <Label className="text-sm font-medium">
            Sat Nav Working
          </Label>
          <RadioGroup
            value={formState.satNavWorking}
            onValueChange={(v) => updateField("satNavWorking", v)}
            className="mt-1 flex gap-6"
          >
            {["Yes", "No", "N/A"].map((v) => (
              <div
                key={v}
                className="flex items-center space-x-2"
              >
                <RadioGroupItem value={v} id={`sn-${v}`} />
                <Label htmlFor={`sn-${v}`}>{v}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div>
          <Label className="text-sm font-medium">
            Alloys or Wheel Trims
          </Label>
          <RadioGroup
            value={formState.alloysOrTrims}
            onValueChange={(v) => updateField("alloysOrTrims", v)}
            className="mt-1 flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Alloys" id="at-a" />
              <Label htmlFor="at-a">Alloys</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="Wheel Trims"
                id="at-wt"
              />
              <Label htmlFor="at-wt">Wheel Trims</Label>
            </div>
          </RadioGroup>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium">
              Alloys Damaged
            </Label>
            <RadioGroup
              value={formState.alloysDamaged}
              onValueChange={(v) =>
                updateField("alloysDamaged", v)
              }
              className="mt-1 flex flex-wrap gap-2"
            >
              {["0", "1", "2", "3", "4"].map((n) => (
                <div
                  key={n}
                  className="flex items-center space-x-2"
                >
                  <RadioGroupItem
                    value={n}
                    id={`ad-${n}`}
                  />
                  <Label htmlFor={`ad-${n}`}>{n}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label className="text-sm font-medium">
              Wheel Trims Damaged
            </Label>
            <RadioGroup
              value={formState.wheelTrimsDamaged}
              onValueChange={(v) =>
                updateField("wheelTrimsDamaged", v)
              }
              className="mt-1 flex flex-wrap gap-2"
            >
              {["0", "1", "2", "3", "4"].map((n) => (
                <div
                  key={n}
                  className="flex items-center space-x-2"
                >
                  <RadioGroupItem
                    value={n}
                    id={`wtd-${n}`}
                  />
                  <Label htmlFor={`wtd-${n}`}>{n}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
        <div>
          <Label
            htmlFor="numberOfKeys"
            className="text-sm font-medium"
          >
            Number of Keys
          </Label>
          <Input
            id="numberOfKeys"
            inputMode="numeric"
            placeholder="Number of Keys"
            value={formState.numberOfKeys}
            onChange={(e) =>
              updateField("numberOfKeys", e.target.value)
            }
            className="mt-1"
          />
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// MAIN CONTAINER COMPONENT
// ─────────────────────────────────────────────────────────────

export const InspectionFlow = () => {
  const navigate = useNavigate();
  const { jobId, inspectionType } = useParams<{
    jobId: string;
    inspectionType: string;
  }>();
  const type = (inspectionType as InspectionType) || "pickup";
  const { data: job, isLoading: jobLoading } = useJob(jobId ?? "");
  const submitMutation = useSubmitInspection();

  const [currentStep, setCurrentStep] = useState(1);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] =
    useState(false);
  const [pendingDamagePosition, setPendingDamagePosition] =
    useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const driverCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [driverSigned, setDriverSigned] = useState(false);
  const [customerSigned, setCustomerSigned] = useState(false);

  const [formState, setFormState] = useState<InspectionFormState>({
    odometer: "",
    fuelLevel: "",
    vehicleCondition: "",
    lightCondition: "",
    oilLevel: "",
    waterLevel: "",
    notes: "",
    handbook: "",
    serviceBook: "",
    mot: "",
    v5: "",
    parcelShelf: "",
    spareWheel: "",
    toolKit: "",
    tyreInflationKit: "",
    lockingWheelNut: "",
    satNavWorking: "",
    alloysOrTrims: "",
    alloysDamaged: "",
    wheelTrimsDamaged: "",
    numberOfKeys: "",
    evChargingCables: "",
    aerial: "",
    customerPaperwork: "",
    damages: [],
    standardPhotos: {},
    standardPhotoUrls: {},
    additionalPhotos: [],
    driverName: "",
    customerName: "",
  });

  const pickupStepCount = 6;
  const deliveryStepCount = 4;
  const totalSteps =
    type === "pickup" ? pickupStepCount : deliveryStepCount;

  const updateField = useCallback(
    (field: keyof InspectionFormState, value: string) => {
      setFormState((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const addDamage = (position: { x: number; y: number }) => {
    setPendingDamagePosition(position);
    setShowDamageModal(true);
  };

  const handleDamageSubmit = (damage: {
    area: string;
    location: string;
    item: string;
    damageTypes: string[];
    notes: string;
    photo?: File;
  }) => {
    const pos = pendingDamagePosition || { x: 50, y: 50 };
    const draft: DamageItemDraft = {
      tempId: Date.now().toString(),
      x: pos.x,
      y: pos.y,
      area: damage.area,
      location: damage.location,
      item: damage.item,
      damageTypes: damage.damageTypes,
      notes: damage.notes,
      photo: damage.photo,
    };
    setFormState((prev) => ({
      ...prev,
      damages: [...prev.damages, draft],
    }));
    setPendingDamagePosition(null);
  };

  const removeDamage = (tempId: string) => {
    setFormState((prev) => ({
      ...prev,
      damages: prev.damages.filter((d) => d.tempId !== tempId),
    }));
  };

  const handlePhotoCapture = (photoKey: string, file: File) => {
    const url = URL.createObjectURL(file);
    setFormState((prev) => ({
      ...prev,
      standardPhotos: { ...prev.standardPhotos, [photoKey]: file },
      standardPhotoUrls: {
        ...prev.standardPhotoUrls,
        [photoKey]: url,
      },
    }));
  };

  const addAdditionalPhoto = (file: File, label: string) => {
    const draft: AdditionalPhotoDraft = {
      tempId: Date.now().toString(),
      file,
      label,
      previewUrl: URL.createObjectURL(file),
    };
    setFormState((prev) => ({
      ...prev,
      additionalPhotos: [...prev.additionalPhotos, draft],
    }));
  };

  const removeAdditionalPhoto = (tempId: string) => {
    setFormState((prev) => ({
      ...prev,
      additionalPhotos: prev.additionalPhotos.filter(
        (p) => p.tempId !== tempId,
      ),
    }));
  };

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, who: "driver" | "customer") => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let drawing = false;

      const getPos = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        const clientX =
          "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY =
          "touches" in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
      };

      const start = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        drawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      };

      const move = (e: MouseEvent | TouchEvent) => {
        if (!drawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = "hsl(215 28% 17%)";
        ctx.lineWidth = 2;
        ctx.stroke();
      };

      const end = () => {
        drawing = false;
        if (who === "driver") setDriverSigned(true);
        else setCustomerSigned(true);
      };

      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("mousemove", move);
      canvas.addEventListener("mouseup", end);
      canvas.addEventListener("mouseleave", end);
      canvas.addEventListener("touchstart", start, {
        passive: false,
      });
      canvas.addEventListener("touchmove", move, {
        passive: false,
      });
      canvas.addEventListener("touchend", end);
    },
    [],
  );

  const canvasToFile = async (
    canvas: HTMLCanvasElement,
    name: string,
  ): Promise<File> => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(new File([blob!], name, { type: "image/png" }));
      }, "image/png");
    });
  };

  async function tryUploadPhoto(
    file: File,
    pathHint: string,
    photoType: string,
    label: string | null,
  ): Promise<{
    url: string;
    backend: string;
    backendRef: string | null;
  } | null> {
    try {
      const result = await storageService.uploadImage(
        file,
        pathHint,
      );
      return {
        url: result.url,
        backend: result.backend,
        backendRef: result.backendRef ?? null,
      };
    } catch {
      await addPendingUpload(file, {
        id:
          Date.now().toString() +
          Math.random().toString(36).slice(2),
        jobId: jobId!,
        inspectionType: type,
        photoType,
        label,
      });
      return null;
    }
  }

  const validateBeforeSubmit = (): string[] => {
    const missing: string[] = [];
    if (!formState.odometer) missing.push("Odometer");
    if (!formState.fuelLevel) missing.push("Fuel level");
    if (!formState.driverName) missing.push("Driver name");
    if (!driverSigned) missing.push("Driver signature");
    if (!formState.customerName) missing.push("Customer name");
    if (!customerSigned) missing.push("Customer signature");
    return missing;
  };

  const handleFinalSubmit = async () => {
    if (!jobId) return;
    const missing = validateBeforeSubmit();
    if (missing.length > 0) {
      toast({
        title: "Missing fields",
        description: missing.join(", "),
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    let pendingCount = 0;
    try {
      const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];
      for (const pt of photoTypes) {
        const file = formState.standardPhotos[pt.key];
        if (file) {
          const result = await tryUploadPhoto(
            file,
            `jobs/${jobId}/${type}/${pt.key}/${Date.now()}`,
            pt.key,
            null,
          );
          if (result) {
            await insertPhoto({
              job_id: jobId,
              inspection_id: null,
              type: pt.key,
              url: result.url,
              thumbnail_url: null,
              backend: result.backend,
              backend_ref: result.backendRef,
              label: null,
            });
          } else {
            pendingCount++;
          }
        }
      }

      for (const ap of formState.additionalPhotos) {
        const photoKey =
          type === "pickup" ? "pickup_other" : "delivery_other";
        const result = await tryUploadPhoto(
          ap.file,
          `jobs/${jobId}/${type}/additional/${ap.tempId}`,
          photoKey,
          ap.label,
        );
        if (result) {
          await insertPhoto({
            job_id: jobId,
            inspection_id: null,
            type: photoKey,
            url: result.url,
            thumbnail_url: null,
            backend: result.backend,
            backend_ref: result.backendRef,
            label: ap.label,
          });
        } else {
          pendingCount++;
        }
      }

      const damageItemsPayload = [];
      for (const d of formState.damages) {
        let photoUrl: string | null = null;
        if (d.photo) {
          const result = await tryUploadPhoto(
            d.photo,
            `jobs/${jobId}/${type}/damage/${d.tempId}`,
            "damage_close_up",
            null,
          );
          if (result) {
            await insertPhoto({
              job_id: jobId,
              inspection_id: null,
              type: "damage_close_up",
              url: result.url,
              thumbnail_url: null,
              backend: result.backend,
              backend_ref: result.backendRef,
              label: null,
            });
            photoUrl = result.url;
          } else {
            pendingCount++;
          }
        }
        damageItemsPayload.push({
          x: d.x,
          y: d.y,
          area: d.area,
          location: d.location,
          item: d.item,
          damage_types: d.damageTypes,
          notes: d.notes,
          photo_url: photoUrl,
        });
      }

      let driverSigUrl: string | null = null;
      let customerSigUrl: string | null = null;
      if (driverCanvasRef.current && driverSigned) {
        const file = await canvasToFile(
          driverCanvasRef.current,
          "driver.png",
        );
        const result = await storageService.uploadImage(
          file,
          `jobs/${jobId}/signatures/${type}/driver`,
        );
        driverSigUrl = result.url;
      }
      if (customerCanvasRef.current && customerSigned) {
        const file = await canvasToFile(
          customerCanvasRef.current,
          "customer.png",
        );
        const result = await storageService.uploadImage(
          file,
          `jobs/${jobId}/signatures/${type}/customer`,
        );
        customerSigUrl = result.url;
      }

      const inspPayload: Record<string, unknown> = {
        odometer: formState.odometer
          ? parseInt(formState.odometer)
          : null,
        fuel_level_percent:
          FUEL_LEVEL_MAP[formState.fuelLevel] ?? null,
        inspected_by_name: formState.driverName || null,
        customer_name: formState.customerName || null,
        driver_signature_url: driverSigUrl,
        customer_signature_url: customerSigUrl,
        notes: formState.notes || null,
      };

      if (type === "pickup") {
        Object.assign(inspPayload, {
          vehicle_condition: formState.vehicleCondition || null,
          light_condition: formState.lightCondition || null,
          oil_level_status: formState.oilLevel || null,
          water_level_status: formState.waterLevel || null,
          handbook: formState.handbook || null,
          service_book: formState.serviceBook || null,
          mot: formState.mot || null,
          v5: formState.v5 || null,
          parcel_shelf: formState.parcelShelf || null,
          spare_wheel_status: formState.spareWheel || null,
          tool_kit: formState.toolKit || null,
          tyre_inflation_kit: formState.tyreInflationKit || null,
          locking_wheel_nut: formState.lockingWheelNut || null,
          sat_nav_working: formState.satNavWorking || null,
          alloys_or_trims: formState.alloysOrTrims || null,
          alloys_damaged: formState.alloysDamaged || null,
          wheel_trims_damaged: formState.wheelTrimsDamaged || null,
          number_of_keys: formState.numberOfKeys || null,
          ev_charging_cables: formState.evChargingCables || null,
          aerial: formState.aerial || null,
          customer_paperwork: formState.customerPaperwork || null,
        });
      }

      await submitMutation.mutateAsync({
        jobId,
        type,
        inspection: inspPayload as any,
        damageItems: damageItemsPayload,
      });

      const jobRef =
        job?.external_job_number || jobId.slice(0, 8);
      const reg = job?.vehicle_reg || "";
      let desc = `${
        type === "pickup" ? "Pickup" : "Delivery"
      } inspection submitted for ${jobRef} (${reg}).`;
      if (pendingCount > 0)
        desc += ` ${pendingCount} photo(s) pending upload.`;
      toast({ title: "Success", description: desc });
      navigate(`/jobs/${jobId}`);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description:
          e instanceof Error ? e.message : "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep((s) => s + 1);
  };
  const prevStep = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const renderPickupStep = (step: number) => {
    switch (step) {
      case 1:
        return (
          <OdometerFuel
            odometer={formState.odometer}
            fuelLevel={formState.fuelLevel}
            onChange={(field, value) =>
              updateField(field, value)
            }
          />
        );
      case 2:
        return (
          <CollectionChecklist
            formState={formState}
            updateField={updateField}
          />
        );
      case 3:
        return (
          <DamageStep
            inspectionType={type}
            damages={formState.damages}
            onAddDamage={addDamage}
            onRemoveDamage={removeDamage}
          />
        );
      case 4:
        return (
          <PhotosStep
            inspectionType={type}
            standardPhotoUrls={formState.standardPhotoUrls}
            onCaptureStandard={handlePhotoCapture}
            additionalPhotos={formState.additionalPhotos}
            onAddAdditional={addAdditionalPhoto}
            onRemoveAdditional={removeAdditionalPhoto}
          />
        );
      case 5:
        return (
          <SignaturesStep
            driverName={formState.driverName}
            customerName={formState.customerName}
            onChangeName={(field, value) =>
              updateField(field, value)
            }
            driverCanvasRef={driverCanvasRef}
            customerCanvasRef={customerCanvasRef}
            setupCanvas={setupCanvas}
            driverSigned={driverSigned}
            customerSigned={customerSigned}
          />
        );
      case 6: {
        const jobRef =
          job?.external_job_number || jobId?.slice(0, 8);
        return (
          <ReviewStep
            formState={formState}
            inspectionType={type}
            jobRef={jobRef}
            reg={job?.vehicle_reg}
            driverSigned={driverSigned}
            customerSigned={customerSigned}
            submitting={submitting}
            onRequestSubmit={() =>
              setShowConfirmationModal(true)
            }
          />
        );
      }
      default:
        return null;
    }
  };

  const renderDeliveryStep = (step: number) => {
    switch (step) {
      case 1:
        return (
          <OdometerFuel
            odometer={formState.odometer}
            fuelLevel={formState.fuelLevel}
            onChange={(field, value) =>
              updateField(field, value)
            }
          />
        );
      case 2:
        return (
          <DamageStep
            inspectionType={type}
            damages={formState.damages}
            onAddDamage={addDamage}
            onRemoveDamage={removeDamage}
          />
        );
      case 3:
        return (
          <SignaturesStep
            driverName={formState.driverName}
            customerName={formState.customerName}
            onChangeName={(field, value) =>
              updateField(field, value)
            }
            driverCanvasRef={driverCanvasRef}
            customerCanvasRef={customerCanvasRef}
            setupCanvas={setupCanvas}
            driverSigned={driverSigned}
            customerSigned={customerSigned}
          />
        );
      case 4: {
        const jobRef =
          job?.external_job_number || jobId?.slice(0, 8);
        return (
          <ReviewStep
            formState={formState}
            inspectionType={type}
            jobRef={jobRef}
            reg={job?.vehicle_reg}
            driverSigned={driverSigned}
            customerSigned={customerSigned}
            submitting={submitting}
            onRequestSubmit={() =>
              setShowConfirmationModal(true)
            }
          />
        );
      }
      default:
        return null;
    }
  };

  const renderCurrentStep = () => {
    return type === "pickup"
      ? renderPickupStep(currentStep)
      : renderDeliveryStep(currentStep);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={`${
          type === "pickup" ? "Pickup" : "Delivery"
        } — Step ${currentStep}/${totalSteps}`}
        showBack
        onBack={() => navigate(`/jobs/${jobId}`)}
      />

      <div className="px-4 py-2 bg-muted/30">
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(currentStep / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="p-4">
        {renderCurrentStep()}

        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          {currentStep < totalSteps && (
            <Button onClick={nextStep} className="gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <VehicleDamageModal
        isOpen={showDamageModal}
        onClose={() => setShowDamageModal(false)}
        onSubmit={handleDamageSubmit}
      />

      <Dialog
        open={showConfirmationModal}
        onOpenChange={setShowConfirmationModal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Confirmation
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirmationModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Please confirm that{" "}
              <strong>{formState.driverName}</strong> (driver) and{" "}
              <strong>{formState.customerName}</strong> (customer)
              have reviewed all details.
            </p>
            <p className="text-sm text-destructive font-medium">
              You will not be able to make any changes after
              confirming.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowConfirmationModal(false)}
                className="flex-1"
              >
                CLOSE
              </Button>
              <Button
                onClick={() => {
                  setShowConfirmationModal(false);
                  void handleFinalSubmit();
                }}
                className="flex-1"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "CONFIRM"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};