import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleDiagram } from "@/components/VehicleDiagram";
import { VehicleDamageModal } from "@/components/VehicleDamageModal";
import { PhotoLabelModal } from "@/components/PhotoLabelModal";
import { SignaturePad, type SignaturePadRef } from "@/components/SignaturePad";
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
import { addPendingUpload } from "@/lib/pendingUploads";
import { toast } from "@/hooks/use-toast";
import { FUEL_LEVEL_MAP } from "@/lib/types";
import type {
  Job,
  InspectionType,
  DamageItemDraft,
  AdditionalPhotoDraft,
} from "@/lib/types";
import * as api from "@/lib/api";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useAuth } from "@/context/AuthContext";
import { saveDraft, loadDraft, clearDraft, draftKey } from "@/lib/autosave";
import { JOB_STATUS } from "@/lib/statusConfig";

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

export const InspectionFlow = () => {
  const navigate = useNavigate();
  const { canUseGallery } = useAuth();
  const { jobId, inspectionType } = useParams<{
    jobId: string;
    inspectionType: string;
  }>();

  const type: InspectionType =
    (inspectionType as InspectionType) === "delivery" ? "delivery" : "pickup";

  // Role-based: only admin can pick from gallery; drivers get camera only
  const captureAttr = canUseGallery ? undefined : ("environment" as const);

  // ─── Memoized derived data ─────────────────────────────────────────

  const { data: job, isLoading: jobLoading } = useJob(jobId ?? "");
  const submitMutation = useSubmitInspection();

  const [currentStep, setCurrentStep] = useState(1);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [pendingDamagePosition, setPendingDamagePosition] =
    useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  // Tracks that we're in an active editing session — prevents draft modal
  // from re-appearing after camera/photo capture causes a remount.
  const sessionActive = useRef(false);

  // Photo label modal state
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [showPhotoLabelModal, setShowPhotoLabelModal] = useState(false);

  // Signature refs (new DPR-aware SignaturePad)
  const driverSigRef = useRef<SignaturePadRef>(null);
  const customerSigRef = useRef<SignaturePadRef>(null);
  const [driverSigned, setDriverSigned] = useState(false);
  const [customerSigned, setCustomerSigned] = useState(false);

  // Additional photos label (lifted out of PhotosStep to avoid remount)
  const [newPhotoLabel, setNewPhotoLabel] = useState("");

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
  const deliveryStepCount = 5;
  const totalSteps = type === "pickup" ? pickupStepCount : deliveryStepCount;

  // ─── AUTOSAVE: save draft on every form change ───
  const dk = jobId ? draftKey(type, jobId) : "";

  useEffect(() => {
    if (!dk || !sessionActive.current) return;
    // Only save serializable fields (exclude File objects)
    const { standardPhotos, additionalPhotos, ...serializable } = formState;
    const draftPayload = { ...serializable, _currentStep: currentStep };
    const timer = setTimeout(() => saveDraft(dk, draftPayload), 500);
    return () => clearTimeout(timer);
  }, [formState, currentStep, dk]);

  // ─── DRAFT RESTORE: check on mount (once) ───
  useEffect(() => {
    if (!dk || sessionActive.current) return;
    const draft = loadDraft<Record<string, unknown>>(dk);
    if (draft?.data) {
      // Only show prompt if draft has meaningful data (not just empty strings)
      const d = draft.data;
      const hasMeaningful = d.odometer || d.fuelLevel || d.notes || d.customerName || d.driverName ||
        d.vehicleCondition || d.lightCondition || d.numberOfKeys;
      if (hasMeaningful) {
        setShowDraftPrompt(true);
        return;
      }
    }
    // No meaningful draft — start fresh and mark session active
    sessionActive.current = true;
  }, [dk]);

  const handleRestoreDraft = () => {
    if (!dk) return;
    const draft = loadDraft<Record<string, unknown>>(dk);
    if (draft?.data) {
      const { _currentStep, ...fields } = draft.data;
      setFormState(prev => ({ ...prev, ...fields }));
      if (typeof _currentStep === "number" && _currentStep >= 1 && _currentStep <= totalSteps) {
        setCurrentStep(_currentStep);
      }
      toast({ title: "Draft restored." });
    }
    sessionActive.current = true;
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    if (dk) clearDraft(dk);
    sessionActive.current = true;
    setShowDraftPrompt(false);
  };

  // ─── AUTO-POPULATE: prefill driver/customer names ───
  useEffect(() => {
    if (!job) return;
    // Use the correct contact based on inspection type
    const contactName = type === "pickup"
      ? job.pickup_contact_name
      : job.delivery_contact_name;
    setFormState(prev => ({
      ...prev,
      customerName: prev.customerName || contactName || "",
      driverName: prev.driverName || "Driver",
    }));
  }, [job, type]);

  // ─── PHASE 3: Set job status to in_progress on first data entry ───
  const statusMarked = useRef(false);
  const markInProgress = useCallback(async () => {
    if (statusMarked.current || !jobId || !job) return;
    statusMarked.current = true; // prevent double-fire regardless of outcome

    // K: Re-fetch current status from DB to avoid stale-closure race condition
    try {
      const freshJob = await api.getJob(jobId);
      const terminalStatuses: string[] = [
        JOB_STATUS.COMPLETED, JOB_STATUS.POD_READY,
        JOB_STATUS.DELIVERY_COMPLETE, JOB_STATUS.CANCELLED,
        JOB_STATUS.FAILED, JOB_STATUS.ARCHIVED,
      ];
      if (terminalStatuses.includes(freshJob.status)) return;

      const targetStatus = type === "pickup" ? JOB_STATUS.PICKUP_IN_PROGRESS : JOB_STATUS.DELIVERY_IN_PROGRESS;
      const earlyStatuses: string[] = [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.PICKUP_COMPLETE, JOB_STATUS.IN_TRANSIT];
      if (type === "pickup" && earlyStatuses.includes(freshJob.status)) {
        api.updateJob(jobId, { status: targetStatus } as Partial<Job>).catch(() => {});
      } else if (type === "delivery" && [JOB_STATUS.PICKUP_COMPLETE, JOB_STATUS.IN_TRANSIT].includes(freshJob.status as any)) {
        api.updateJob(jobId, { status: targetStatus } as Partial<Job>).catch(() => {});
      }
    } catch {
      // Non-critical — status update is best-effort
    }
  }, [jobId, job, type]);

  const updateField = useCallback(
    (field: keyof InspectionFormState, value: string) => {
      setFormState((prev) => ({ ...prev, [field]: value }));
      markInProgress();
    },
    [markInProgress]
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
      standardPhotoUrls: { ...prev.standardPhotoUrls, [photoKey]: url },
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
        (p) => p.tempId !== tempId
      ),
    }));
  };

  // ───────────────── SIGNATURE HELPERS (using SignaturePad refs) ─────────────────

  const clearDriverSignature = useCallback(() => {
    driverSigRef.current?.clear();
    setDriverSigned(false);
  }, []);

  const clearCustomerSignature = useCallback(() => {
    customerSigRef.current?.clear();
    setCustomerSigned(false);
  }, []);


  // tryUploadPhoto removed — all photos now go through background queue

  // ───────────────── PER-STEP VALIDATION ─────────────────

  const validateStep = (step: number): string[] => {
    const missing: string[] = [];

    if (type === "pickup") {
      switch (step) {
        case 1:
          if (!formState.odometer) missing.push("Odometer reading");
          if (!formState.fuelLevel) missing.push("Fuel level");
          break;
        case 2:
          if (!formState.vehicleCondition) missing.push("Vehicle condition");
          if (!formState.lightCondition) missing.push("Light condition");
          if (!formState.numberOfKeys) missing.push("Number of keys");
          break;
        case 3: // Damage – optional
          break;
        case 4: {
          const hasPhotos = Object.values(formState.standardPhotos).filter(Boolean).length > 0;
          if (!hasPhotos) missing.push("At least one pickup photo");
          break;
        }
        case 5:
          if (!formState.driverName) missing.push("Driver name");
          if (!driverSigned) missing.push("Driver signature");
          if (!formState.customerName) missing.push("Customer name");
          if (!customerSigned) missing.push("Customer signature");
          break;
      }
    } else {
      switch (step) {
        case 1:
          if (!formState.odometer) missing.push("Odometer reading");
          if (!formState.fuelLevel) missing.push("Fuel level");
          break;
        case 2: // Damage – optional
          break;
        case 3: {
          const hasPhotos =
            Object.values(formState.standardPhotos).filter(Boolean).length > 0 ||
            formState.additionalPhotos.length > 0;
          if (!hasPhotos) missing.push("At least one delivery photo");
          break;
        }
        case 4:
          if (!formState.driverName) missing.push("Driver name");
          if (!driverSigned) missing.push("Driver signature");
          if (!formState.customerName) missing.push("Customer name");
          if (!customerSigned) missing.push("Customer signature");
          break;
      }
    }
    return missing;
  };

  const validateBeforeSubmit = (): string[] => {
    // Aggregate all steps
    const allMissing: string[] = [];
    for (let s = 1; s < totalSteps; s++) {
      allMissing.push(...validateStep(s));
    }
    return allMissing;
  };

  const handleFinalSubmit = async () => {
    if (!jobId) return;
    const missing = validateBeforeSubmit();
    if (missing.length > 0) {
      toast({
        title: `Please complete ${missing.length} required field(s).`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      // ── 1) Upload signatures (critical for POD — do these synchronously) ──
      let driverSigUrl: string | null = null;
      let customerSigUrl: string | null = null;

      if (driverSigRef.current && driverSigned) {
        const file = await driverSigRef.current.toFile("driver.png");
        const result = await storageService.uploadImage(
          file,
          `jobs/${jobId}/signatures/${type}/driver`
        );
        driverSigUrl = result.url;
      }

      if (customerSigRef.current && customerSigned) {
        const file = await customerSigRef.current.toFile("customer.png");
        const result = await storageService.uploadImage(
          file,
          `jobs/${jobId}/signatures/${type}/customer`
        );
        customerSigUrl = result.url;
      }

      // ── 2) Build damage items payload (photos queued, not blocking) ──
      const damageItemsPayload: any[] = [];
      for (const d of formState.damages) {
        // Queue damage photo to background — don't block submission
        if (d.photo) {
          try {
            await addPendingUpload(d.photo, {
              jobId,
              inspectionType: type,
              photoType: "damage_close_up",
              label: null,
            });
            toast({ title: "Photo saved offline", description: "We'll upload it when you're online." });
          } catch (err) {
            const msg = String(err).toLowerCase();
            const isStorageError = msg.includes("storage") || msg.includes("quota") || msg.includes("localstorage");
            toast({
              title: isStorageError ? "Photo not saved – storage issue" : "Photo could not be saved",
              description: isStorageError ? "Your device storage is full or blocked. Clear space and try again." : "Please try again.",
              variant: "destructive",
            });
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
          photo_url: null, // Will be populated when upload completes
        });
      }

      // ── 3) Submit inspection metadata IMMEDIATELY (non-blocking) ──
      const inspPayload: Record<string, unknown> = {
        odometer: formState.odometer
          ? parseInt(formState.odometer, 10)
          : null,
        fuel_level_percent: FUEL_LEVEL_MAP[formState.fuelLevel] ?? null,
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
        inspectionPayload: inspPayload as any,
        damageItems: damageItemsPayload,
      });

      // ── 4) Queue ALL photos to background upload (fire-and-forget) ──
      let pendingCount = 0;
      const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];
      for (const pt of photoTypes) {
        const file = formState.standardPhotos[pt.key];
        if (file) {
          pendingCount++;
          try {
            await addPendingUpload(file, {
              jobId,
              inspectionType: type,
              photoType: pt.key,
              label: null,
            });
            toast({ title: "Photo saved offline", description: "We'll upload it when you're online." });
          } catch (err) {
            const msg = String(err).toLowerCase();
            const isStorageError = msg.includes("storage") || msg.includes("quota") || msg.includes("localstorage");
            toast({
              title: isStorageError ? "Photo not saved – storage issue" : "Photo could not be saved",
              description: isStorageError ? "Your device storage is full or blocked. Clear space and try again." : "Please try again.",
              variant: "destructive",
            });
          }
        }
      }

      for (const ap of formState.additionalPhotos) {
        const photoKey = type === "pickup" ? "pickup_other" : "delivery_other";
        pendingCount++;
        try {
          await addPendingUpload(ap.file, {
            jobId,
            inspectionType: type,
            photoType: photoKey,
            label: ap.label,
          });
          toast({ title: "Photo saved offline", description: "We'll upload it when you're online." });
        } catch (err) {
          const msg = String(err).toLowerCase();
          const isStorageError = msg.includes("storage") || msg.includes("quota") || msg.includes("localstorage");
          toast({
            title: isStorageError ? "Photo not saved – storage issue" : "Photo could not be saved",
            description: isStorageError ? "Your device storage is full or blocked. Clear space and try again." : "Please try again.",
            variant: "destructive",
          });
        }
      }

      // ── 5) Immediately trigger background retry (best-effort) ──
      import("@/lib/pendingUploads").then(m => m.retryAllPending()).catch(() => {});

      const jobRef = job?.external_job_number || jobId.slice(0, 8);
      const label = type === "pickup" ? "Pickup" : "Delivery";
      toast({ title: `${label} completed for job ${jobRef}.` });
      if (dk) clearDraft(dk);
      navigate(`/jobs/${jobId}`);
    } catch {
      toast({ title: "Submission failed. Please try again.", variant: "destructive" });
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
    if (currentStep >= totalSteps) return;
    const missing = validateStep(currentStep);
    if (missing.length > 0) {
      toast({
        title: `Please complete ${missing.length} required field(s).`,
        variant: "destructive",
      });
      return;
    }
    setCurrentStep((s) => s + 1);
  };
  const prevStep = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  // ───────────────── STEP CONTENT (inline JSX, NOT components) ─────────────────
  // These are plain functions that return JSX, called as renderX(), never <X />.
  // This prevents React from unmounting/remounting them on parent re-render,
  // which would destroy input focus (keyboard bug) and clear canvas (signature bug).

  const renderOdometerFuel = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">
        Odometer & Fuel Level
      </h2>
      <div className="space-y-4">
        <div>
          <Label htmlFor="odometer" className="text-base font-medium">
            Odometer *
          </Label>
          <Input
            id="odometer"
            type="number"
            inputMode="numeric"
            placeholder="Enter mileage"
            value={formState.odometer}
            onChange={(e) => updateField("odometer", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-base font-medium">Fuel Level *</Label>
          <RadioGroup
            value={formState.fuelLevel}
            onValueChange={(v) => updateField("fuelLevel", v)}
            className="mt-2"
          >
            {["Empty", "1/4", "1/2", "3/4", "Full"].map((level) => (
              <div key={level} className="flex items-center space-x-2">
                <RadioGroupItem value={level} id={`fuel-${level}`} />
                <Label htmlFor={`fuel-${level}`}>{level}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>
    </div>
  );

  const renderDamageStep = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-center">
        {type === "pickup" ? "Pickup" : "Delivery"} Damage
      </h2>
      <VehicleDiagram
        onAddDamage={addDamage}
        damages={formState.damages.map((d) => ({
          id: d.tempId,
          x: d.x,
          y: d.y,
          area: d.area,
          item: d.item,
          damageTypes: d.damageTypes,
        }))}
      />
      {formState.damages.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm">
            Recorded Damages ({formState.damages.length})
          </h3>
          {formState.damages.map((d) => (
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
                onClick={() => removeDamage(d.tempId)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPhotosStep = () => {
    const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];

    // Build list of captured photos for viewer
    const capturedPhotos = [
      ...photoTypes
        .filter(pt => formState.standardPhotoUrls[pt.key])
        .map(pt => ({ url: formState.standardPhotoUrls[pt.key], label: pt.label })),
      ...formState.additionalPhotos.map(ap => ({ url: ap.previewUrl, label: ap.label })),
    ];

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-center">Photos</h2>
        <p className="text-center text-muted-foreground text-sm">
          Capture clear photos at{" "}
          {type === "pickup" ? "collection" : "delivery"} for your records.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {photoTypes.map((pt) => (
            <div key={pt.key} className="space-y-2">
              <Label className="text-sm font-medium">{pt.label}</Label>
              {formState.standardPhotoUrls[pt.key] ? (
                <img
                  src={formState.standardPhotoUrls[pt.key]}
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
                capture={captureAttr}
                className="hidden"
                id={`photo-${pt.key}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoCapture(pt.key, f);
                }}
              />
              <Label htmlFor={`photo-${pt.key}`} className="cursor-pointer">
                <Button variant="outline" size="sm" className="w-full gap-1" asChild>
                  <span>
                    <Camera className="h-3 w-3" />
                    {formState.standardPhotoUrls[pt.key] ? "Retake" : "Capture"}
                  </span>
                </Button>
              </Label>
            </div>
          ))}
        </div>

        {/* Additional labelled photos */}
        <div className="space-y-3 pt-4 border-t">
          <h3 className="font-medium text-sm">Additional Photos</h3>
          {formState.additionalPhotos.map((ap) => (
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
                onClick={() => removeAdditionalPhoto(ap.tempId)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              capture={captureAttr}
              className="hidden"
              id="additional-photo-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  // Show label modal after capture
                  setPendingPhotoFile(f);
                  setPendingPhotoPreview(URL.createObjectURL(f));
                  setShowPhotoLabelModal(true);
                }
                e.target.value = "";
              }}
            />
            <Label htmlFor="additional-photo-input" className="cursor-pointer w-full">
              <Button variant="outline" size="sm" className="w-full gap-1" asChild>
                <span>
                  <Plus className="h-4 w-4" /> Add Photo
                </span>
              </Button>
            </Label>
          </div>
        </div>

        {/* Photo Gallery Viewer for captured photos */}
        {capturedPhotos.length > 0 && (
          <div className="pt-4 border-t">
            <PhotoViewer
              title={`${type === "pickup" ? "Collection" : "Delivery"} Photos`}
              photos={capturedPhotos}
            />
          </div>
        )}
      </div>
    );
  };

  const renderSignaturesStep = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">Signatures</h2>
      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Driver</h3>
        <div>
          <Label className="text-sm">Driver Name *</Label>
          <Input
            value={formState.driverName}
            onChange={(e) => updateField("driverName", e.target.value)}
            placeholder="Driver full name"
            className="mt-1"
          />
        </div>
        <SignaturePad
          ref={driverSigRef}
          onSignStart={() => setDriverSigned(true)}
          className="w-full"
        />
        <div className="flex items-center justify-between">
          {driverSigned && <p className="text-xs text-success">Signed ✓</p>}
          {driverSigned && (
            <Button variant="ghost" size="sm" onClick={clearDriverSignature}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      <div className="bg-warning border-2 border-warning rounded-lg p-4">
        <p className="text-sm text-foreground font-bold">
          ⚠ PLEASE PASS THE DEVICE TO THE CUSTOMER FOR THEIR SIGNATURE
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Customer</h3>
        <div>
          <Label className="text-sm">Customer Name *</Label>
          <Input
            value={formState.customerName}
            onChange={(e) => updateField("customerName", e.target.value)}
            placeholder="Customer full name"
            className="mt-1"
          />
        </div>
        <SignaturePad
          ref={customerSigRef}
          onSignStart={() => setCustomerSigned(true)}
          className="w-full"
        />
        <div className="flex items-center justify-between">
          {customerSigned && <p className="text-xs text-success">Signed ✓</p>}
          {customerSigned && (
            <Button variant="ghost" size="sm" onClick={clearCustomerSignature}>
              Clear
            </Button>
          )}
        </div>
      </Card>
    </div>
  );

  const renderReviewStep = () => {
    const photoCount = Object.values(formState.standardPhotos).filter(
      Boolean
    ).length;
    const additionalCount = formState.additionalPhotos.length;
    const jobRef = job?.external_job_number || jobId?.slice(0, 8);

    // Determine "Collected" status – pickup inspection is complete if job already has one,
    // or if we're currently submitting a pickup with all mandatory fields filled
    const hasPickupComplete = job?.has_pickup_inspection === true;
    const isCollected =
      hasPickupComplete ||
      (type === "pickup" &&
        !!formState.odometer &&
        !!formState.fuelLevel &&
        !!formState.driverName &&
        driverSigned &&
        !!formState.customerName &&
        customerSigned);

    // Checklist items for the review – only shown for pickup type
    const REVIEW_CHECKLIST = [
      { field: "vehicleCondition" as const, label: "Vehicle Condition" },
      { field: "lightCondition" as const, label: "Light Condition" },
      { field: "oilLevel" as const, label: "Oil Level" },
      { field: "waterLevel" as const, label: "Water Level" },
      { field: "handbook" as const, label: "Handbook" },
      { field: "serviceBook" as const, label: "Service Book" },
      { field: "mot" as const, label: "MOT" },
      { field: "v5" as const, label: "V5" },
      { field: "parcelShelf" as const, label: "Parcel Shelf" },
      { field: "spareWheel" as const, label: "Spare Wheel" },
      { field: "toolKit" as const, label: "Tool Kit" },
      { field: "tyreInflationKit" as const, label: "Tyre Inflation Kit" },
      { field: "lockingWheelNut" as const, label: "Locking Wheel Nut" },
      { field: "satNavWorking" as const, label: "Sat Nav Working" },
      { field: "alloysOrTrims" as const, label: "Alloys / Trims" },
      { field: "alloysDamaged" as const, label: "Alloys Damaged" },
      { field: "wheelTrimsDamaged" as const, label: "Wheel Trims Damaged" },
      { field: "numberOfKeys" as const, label: "Number of Keys" },
      { field: "evChargingCables" as const, label: "EV Charging Cables" },
      { field: "aerial" as const, label: "Aerial" },
      { field: "customerPaperwork" as const, label: "Customer Paperwork" },
    ];

    // For delivery review, show the saved pickup checklist from the job data
    const savedPickup = job?.inspections?.find((i) => i.type === "pickup") ?? null;

    return (
      <div className="space-y-6">
        {/* Header with status pills */}
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-xl font-semibold">Review & Submit</h2>
          <div className="flex items-center gap-2">
            {isCollected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success-foreground">
                ✓ Collected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                Collection Incomplete
              </span>
            )}
            {type === "delivery" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                ✓ Delivering
              </span>
            )}
          </div>
        </div>

        {/* Job header pill */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{jobRef}</span>
          <span>–</span>
          <span className="font-medium text-foreground">{job?.vehicle_reg}</span>
        </div>

        <Card className="p-6 space-y-3">
          <h3 className="font-medium">Inspection Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span className="capitalize font-medium">{type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Odometer:</span>
              <span>{formState.odometer || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fuel Level:</span>
              <span>{formState.fuelLevel || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Damages:</span>
              <span>{formState.damages.length}</span>
            </div>
            {formState.damages.length > 0 && (
              <ul className="list-disc list-inside text-xs text-muted-foreground pl-2">
                {formState.damages.map((d) => (
                  <li key={d.tempId}>
                    {d.area} – {d.item}: {d.damageTypes.join(", ")}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Standard Photos:</span>
              <span>{photoCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Additional Photos:</span>
              <span>{additionalCount}</span>
            </div>
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

        {/* Current inspection checklist (pickup) */}
        {type === "pickup" && (
          <Card className="p-6 space-y-3">
            <h3 className="font-medium">Pickup Checklist</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {REVIEW_CHECKLIST.map(({ field, label }) => {
                const val = formState[field];
                if (!val) return null;
                return (
                  <div key={field} className="flex justify-between py-0.5">
                    <span className="text-muted-foreground text-xs">{label}:</span>
                    <span className="font-medium text-xs">{val}</span>
                  </div>
                );
              })}
            </div>
            {formState.notes && (
              <div className="text-xs">
                <span className="font-medium">Notes:</span>{" "}
                <span className="text-muted-foreground">{formState.notes}</span>
              </div>
            )}
          </Card>
        )}

        {/* Saved pickup checklist (shown on delivery review) */}
        {type === "delivery" && savedPickup && (
          <Card className="p-6 space-y-3">
            <h3 className="font-medium">Pickup Checklist (from collection)</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {[
                { key: "vehicle_condition" as const, label: "Vehicle Condition" },
                { key: "light_condition" as const, label: "Light Condition" },
                { key: "oil_level_status" as const, label: "Oil Level" },
                { key: "water_level_status" as const, label: "Water Level" },
                { key: "handbook" as const, label: "Handbook" },
                { key: "service_book" as const, label: "Service Book" },
                { key: "mot" as const, label: "MOT" },
                { key: "v5" as const, label: "V5" },
                { key: "parcel_shelf" as const, label: "Parcel Shelf" },
                { key: "spare_wheel_status" as const, label: "Spare Wheel" },
                { key: "tool_kit" as const, label: "Tool Kit" },
                { key: "tyre_inflation_kit" as const, label: "Tyre Inflation Kit" },
                { key: "locking_wheel_nut" as const, label: "Locking Wheel Nut" },
                { key: "sat_nav_working" as const, label: "Sat Nav Working" },
                { key: "alloys_or_trims" as const, label: "Alloys / Trims" },
                { key: "alloys_damaged" as const, label: "Alloys Damaged" },
                { key: "wheel_trims_damaged" as const, label: "Wheel Trims Damaged" },
                { key: "number_of_keys" as const, label: "Number of Keys" },
                { key: "ev_charging_cables" as const, label: "EV Charging Cables" },
                { key: "aerial" as const, label: "Aerial" },
                { key: "customer_paperwork" as const, label: "Customer Paperwork" },
              ].map(({ key, label }) => {
                const val = savedPickup[key];
                if (!val || val === "") return null;
                return (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-muted-foreground text-xs">{label}:</span>
                    <span className="font-medium text-xs">{String(val)}</span>
                  </div>
                );
              })}
            </div>
            {savedPickup.notes && (
              <div className="text-xs">
                <span className="font-medium">Notes:</span>{" "}
                <span className="text-muted-foreground">{savedPickup.notes}</span>
              </div>
            )}
          </Card>
        )}

        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <p className="text-sm text-foreground">
            Please ensure all information is correct. You will not be
            able to make changes after submission.
          </p>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={() => setShowConfirmationModal(true)}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit Report"
          )}
        </Button>
      </div>
    );
  };

  const renderCollectionChecklist = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-center">
        Collection Checklist
      </h2>
      <div className="space-y-6">
        <div>
          <Label className="text-base font-medium">Vehicle Condition</Label>
          <RadioGroup
            value={formState.vehicleCondition}
            onValueChange={(v) => updateField("vehicleCondition", v)}
            className="mt-2"
          >
            {["Clean", "Dirty", "Wet", "Snow Covered", "Iced Over"].map(
              (c) => (
                <div key={c} className="flex items-center space-x-2">
                  <RadioGroupItem value={c} id={`vc-${c}`} />
                  <Label htmlFor={`vc-${c}`}>{c}</Label>
                </div>
              )
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
                <div key={l} className="flex items-center space-x-2">
                  <RadioGroupItem value={l} id={`lc-${l}`} />
                  <Label htmlFor={`lc-${l}`}>{l}</Label>
                </div>
              )
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
          <Label htmlFor="notes" className="text-base font-medium">
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

        {/* Equipment checklist items */}
        <div className="space-y-4">
          <h3 className="font-medium">Equipment</h3>
          {[
            { field: "handbook" as const, label: "Handbook" },
            { field: "serviceBook" as const, label: "Service Book" },
            { field: "mot" as const, label: "MOT" },
            { field: "v5" as const, label: "V5" },
            { field: "parcelShelf" as const, label: "Parcel Shelf" },
            { field: "spareWheel" as const, label: "Spare Wheel" },
            { field: "toolKit" as const, label: "Tool Kit" },
            { field: "tyreInflationKit" as const, label: "Tyre Inflation Kit" },
            { field: "lockingWheelNut" as const, label: "Locking Wheel Nut" },
            { field: "satNavWorking" as const, label: "Sat Nav Working" },
          ].map(({ field, label }) => (
            <div key={field}>
              <Label className="text-sm font-medium">{label}</Label>
              <RadioGroup
                value={formState[field]}
                onValueChange={(v) => updateField(field, v)}
                className="mt-1 flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="Yes" id={`${field}-yes`} />
                  <Label htmlFor={`${field}-yes`} className="text-sm">Yes</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="No" id={`${field}-no`} />
                  <Label htmlFor={`${field}-no`} className="text-sm">No</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="N/A" id={`${field}-na`} />
                  <Label htmlFor={`${field}-na`} className="text-sm">N/A</Label>
                </div>
              </RadioGroup>
            </div>
          ))}

          {/* Number of Keys – numeric stepper */}
          <div>
            <Label className="text-sm font-medium">Number of Keys *</Label>
            <div className="flex items-center gap-3 mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-10 text-lg"
                onClick={() => {
                  const cur = parseInt(formState.numberOfKeys, 10) || 0;
                  if (cur > 0) updateField("numberOfKeys", String(cur - 1));
                }}
                disabled={!formState.numberOfKeys || parseInt(formState.numberOfKeys, 10) <= 0}
              >
                −
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={formState.numberOfKeys}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  updateField("numberOfKeys", v);
                }}
                className="w-20 text-center text-lg font-semibold"
                placeholder="0"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-10 text-lg"
                onClick={() => {
                  const cur = parseInt(formState.numberOfKeys, 10) || 0;
                  updateField("numberOfKeys", String(cur + 1));
                }}
              >
                +
              </Button>
            </div>
          </div>

          {[
            { field: "evChargingCables" as const, label: "EV Charging Cables" },
            { field: "aerial" as const, label: "Aerial" },
            { field: "customerPaperwork" as const, label: "Customer Paperwork" },
          ].map(({ field, label }) => (
            <div key={field}>
              <Label className="text-sm font-medium">{label}</Label>
              <RadioGroup
                value={formState[field]}
                onValueChange={(v) => updateField(field, v)}
                className="mt-1 flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="Yes" id={`${field}-yes`} />
                  <Label htmlFor={`${field}-yes`} className="text-sm">Yes</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="No" id={`${field}-no`} />
                  <Label htmlFor={`${field}-no`} className="text-sm">No</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="N/A" id={`${field}-na`} />
                  <Label htmlFor={`${field}-na`} className="text-sm">N/A</Label>
                </div>
              </RadioGroup>
            </div>
          ))}

          <div>
            <Label className="text-sm font-medium">Alloys or Trims</Label>
            <RadioGroup
              value={formState.alloysOrTrims}
              onValueChange={(v) => updateField("alloysOrTrims", v)}
              className="mt-1 flex gap-4"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="Alloys" id="aot-alloys" />
                <Label htmlFor="aot-alloys" className="text-sm">Alloys</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="Trims" id="aot-trims" />
                <Label htmlFor="aot-trims" className="text-sm">Trims</Label>
              </div>
            </RadioGroup>
          </div>

          {formState.alloysOrTrims === "Alloys" && (
            <div>
              <Label className="text-sm font-medium">Alloys Damaged?</Label>
              <RadioGroup
                value={formState.alloysDamaged}
                onValueChange={(v) => updateField("alloysDamaged", v)}
                className="mt-1 flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="Yes" id="ad-yes" />
                  <Label htmlFor="ad-yes" className="text-sm">Yes</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="No" id="ad-no" />
                  <Label htmlFor="ad-no" className="text-sm">No</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {formState.alloysOrTrims === "Trims" && (
            <div>
              <Label className="text-sm font-medium">Wheel Trims Damaged?</Label>
              <RadioGroup
                value={formState.wheelTrimsDamaged}
                onValueChange={(v) => updateField("wheelTrimsDamaged", v)}
                className="mt-1 flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="Yes" id="wtd-yes" />
                  <Label htmlFor="wtd-yes" className="text-sm">Yes</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="No" id="wtd-no" />
                  <Label htmlFor="wtd-no" className="text-sm">No</Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ───────────────── RENDER BY STEP ─────────────────

  const renderPickupStep = (step: number) => {
    switch (step) {
      case 1: return renderOdometerFuel();
      case 2: return renderCollectionChecklist();
      case 3: return renderDamageStep();
      case 4: return renderPhotosStep();
      case 5: return renderSignaturesStep();
      case 6: return renderReviewStep();
      default: return null;
    }
  };

  const renderDeliveryStep = (step: number) => {
    switch (step) {
      case 1: return renderOdometerFuel();
      case 2: return renderDamageStep();
      case 3: return renderPhotosStep();
      case 4: return renderSignaturesStep();
      case 5: return renderReviewStep();
      default: return null;
    }
  };

  // Per-step error state for recoverable rendering failures
  const [stepError, setStepError] = useState<string | null>(null);

  const renderCurrentStep = () => {
    // Clear previous step error on re-render attempt
    try {
      setStepError(null);
      return type === "pickup"
        ? renderPickupStep(currentStep)
        : renderDeliveryStep(currentStep);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("InspectionFlow step render error:", e);
      setStepError(msg);
      return null;
    }
  };

  // ───────────────── SHELL ─────────────────

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
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-4">
        {stepError ? (
          <Card className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">Something went wrong on this step</p>
            <p className="text-xs text-muted-foreground">{stepError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStepError(null);
                // Force a re-render by toggling step
                setCurrentStep((s) => s);
              }}
            >
              Tap to retry
            </Button>
          </Card>
        ) : (
          renderCurrentStep()
        )}

        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {currentStep < totalSteps && (
            <Button onClick={nextStep} className="gap-2">
              Next
              <ChevronRight className="h-4 w-4" />
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
              <strong>{formState.driverName || "Driver"}</strong> and{" "}
              <strong>{formState.customerName || "Customer"}</strong> have
              reviewed all details.
            </p>
            <p className="text-sm text-destructive font-medium">
              You will not be able to make any changes after confirming.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowConfirmationModal(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setShowConfirmationModal(false);
                  handleFinalSubmit();
                }}
                className="flex-1"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Draft restore prompt */}
      <Dialog open={showDraftPrompt} onOpenChange={setShowDraftPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume from draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have an unsaved draft for this inspection. Would you like to continue where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDiscardDraft}>Start Fresh</Button>
            <Button className="flex-1" onClick={handleRestoreDraft}>Resume</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo label modal */}
      <PhotoLabelModal
        isOpen={showPhotoLabelModal}
        previewUrl={pendingPhotoPreview}
        onSave={(label) => {
          if (pendingPhotoFile) {
            addAdditionalPhoto(pendingPhotoFile, label);
          }
          if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
          setPendingPhotoFile(null);
          setPendingPhotoPreview(null);
          setShowPhotoLabelModal(false);
        }}
        onSkip={() => {
          if (pendingPhotoFile) {
            addAdditionalPhoto(pendingPhotoFile, "Unlabelled");
          }
          if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
          setPendingPhotoFile(null);
          setPendingPhotoPreview(null);
          setShowPhotoLabelModal(false);
        }}
      />
    </div>
  );
};
