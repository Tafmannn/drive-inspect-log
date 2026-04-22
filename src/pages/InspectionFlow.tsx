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
import {
  probeLocalStorageHealth,
  logStorageSubmitFailure,
  type StorageHealth,
  type StorageFailure,
} from "@/lib/storageDiagnostics";
import { AlertTriangle } from "lucide-react";
import { JOB_STATUS } from "@/lib/statusConfig";
import {
  type InspectionFormState,
  INITIAL_INSPECTION_FORM,
  PHOTO_TYPES_BY_INSPECTION,
  REVIEW_CHECKLIST,
  SAVED_PICKUP_FIELDS,
  getTotalSteps,
  getSignatureStepNumber,
  validateInspectionStep,
  validateBeforeSubmit as validateBeforeSubmitPure,
  buildInspectionPayload,
  buildDamageItemsPayload,
} from "@/features/inspection/inspectionFormConfig";



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
  // from re-appearing after camera/photo capture or screen rotation causes a remount.
  // Backed by sessionStorage so it survives orientation-change remounts.
  const sessionKey = `axentra.inspection.session.${jobId}.${type}`;
  const sessionActive = useRef(
    typeof window !== "undefined" && sessionStorage.getItem(sessionKey) === "1"
  );
  const markSessionActive = useCallback(() => {
    sessionActive.current = true;
    try { sessionStorage.setItem(sessionKey, "1"); } catch { /* quota */ }
  }, [sessionKey]);

  // Photo label modal state
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [showPhotoLabelModal, setShowPhotoLabelModal] = useState(false);

  // Signature refs (new DPR-aware SignaturePad)
  const driverSigRef = useRef<SignaturePadRef>(null);
  const customerSigRef = useRef<SignaturePadRef>(null);
  const [driverSigned, setDriverSigned] = useState(false);
  const [customerSigned, setCustomerSigned] = useState(false);

  // Eagerly-captured signature File objects — stored when leaving the signature step
  const [driverSigFile, setDriverSigFile] = useState<File | null>(null);
  const [customerSigFile, setCustomerSigFile] = useState<File | null>(null);
  // Prevents double-tap on Next while async signature capture runs
  const [capturing, setCapturing] = useState(false);

  // Additional photos label (lifted out of PhotosStep to avoid remount)
  const [newPhotoLabel, setNewPhotoLabel] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);

  // Local-storage health: probed when entering the review step and after a
  // failed submit. If `blocked`, the Submit button is disabled and a
  // persistent recovery banner is shown. Memory-only fallback is intentionally
  // NOT supported — submitting without durable photo evidence is forbidden.
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [submitStorageFailure, setSubmitStorageFailure] = useState<StorageFailure | null>(null);
  const [probing, setProbing] = useState(false);

  const [formState, setFormState] = useState<InspectionFormState>(INITIAL_INSPECTION_FORM);

  const totalSteps = getTotalSteps(type);

  // Probe local storage health when the driver lands on the review step.
  // This surfaces blocked/quota issues BEFORE submit so they can recover
  // without losing context. Re-runs if the user navigates away & back.
  useEffect(() => {
    if (currentStep !== totalSteps) return;
    let cancelled = false;
    setProbing(true);
    probeLocalStorageHealth().then((h) => {
      if (!cancelled) {
        setStorageHealth(h);
        setProbing(false);
      }
    });
    return () => { cancelled = true; };
  }, [currentStep, totalSteps]);

  // ─── Memoized derived data (avoid recomputing on every render) ─────
  const standardPhotoCount = useMemo(
    () => Object.values(formState.standardPhotos).filter(Boolean).length,
    [formState.standardPhotos]
  );

  const capturedPhotos = useMemo(
    () => ({
      urls: formState.standardPhotoUrls,
      additional: formState.additionalPhotos,
    }),
    [formState.standardPhotoUrls, formState.additionalPhotos]
  );

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
  // Guard against false triggers from screen rotation / orientation change:
  // If the draft was saved <10 seconds ago, it's a remount, not a genuine interruption.
  // In that case, silently restore without showing the prompt.
  useEffect(() => {
    if (!dk || sessionActive.current) return;
    const draft = loadDraft<Record<string, unknown>>(dk);
    if (draft?.data) {
      // Only show prompt if draft has meaningful data (not just empty strings)
      const d = draft.data;
      const hasMeaningful = d.odometer || d.fuelLevel || d.notes || d.customerName || d.driverName ||
        d.vehicleCondition || d.lightCondition || d.numberOfKeys;
      if (hasMeaningful) {
        // Check if this is a rotation/remount (draft saved very recently)
        const savedAge = draft.savedAt
          ? Date.now() - new Date(draft.savedAt).getTime()
          : Infinity;
        if (savedAge < 10_000) {
          // Silent restore — rotation or brief remount, not a genuine interruption
          const { _currentStep, ...fields } = draft.data;
          setFormState(prev => ({ ...prev, ...fields }));
          if (typeof _currentStep === "number" && _currentStep >= 1 && _currentStep <= totalSteps) {
            setCurrentStep(_currentStep);
          }
          markSessionActive();
          return;
        }
        setShowDraftPrompt(true);
        return;
      }
    }
    // No meaningful draft — start fresh and mark session active
    markSessionActive();
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
    markSessionActive();
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    if (dk) clearDraft(dk);
    markSessionActive();
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
      driverName: prev.driverName || job.resolvedDriverName || job.driver_name || "",
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
      } else if (type === "delivery" && ([JOB_STATUS.PICKUP_COMPLETE, JOB_STATUS.IN_TRANSIT] as string[]).includes(freshJob.status)) {
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
    setDriverSigFile(null);
  }, []);

  const clearCustomerSignature = useCallback(() => {
    customerSigRef.current?.clear();
    setCustomerSigned(false);
    setCustomerSigFile(null);
  }, []);


  // tryUploadPhoto removed — all photos now go through background queue

  // ───────────────── PER-STEP VALIDATION ─────────────────

  const validateStep = (step: number): string[] =>
    validateInspectionStep(type, step, { formState, driverSigned, customerSigned });

  const validateBeforeSubmit = (): string[] =>
    validateBeforeSubmitPure(type, { formState, driverSigned, customerSigned });

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
      // Use eagerly-captured File objects stored when the user left the signature step.
      // Falls back to ref.toFile() only if files weren't captured (e.g. direct submit).
      let driverSigUrl: string | null = null;
      let customerSigUrl: string | null = null;

      const driverFile = driverSigFile ?? (driverSigRef.current && driverSigned ? await driverSigRef.current.toFile("driver.png") : null);
      if (driverFile) {
        const result = await storageService.uploadImage(
          driverFile,
          "jobs/" + jobId + "/signatures/" + type + "/driver"
        );
        driverSigUrl = result.url;
      }

      const customerFile = customerSigFile ?? (customerSigRef.current && customerSigned ? await customerSigRef.current.toFile("customer.png") : null);
      if (customerFile) {
        const result = await storageService.uploadImage(
          customerFile,
          "jobs/" + jobId + "/signatures/" + type + "/customer"
        );
        customerSigUrl = result.url;
      }

      // ── 2) Build damage items payload ──
      const damageItemsPayload = buildDamageItemsPayload(formState.damages);

      // ── 3) PRE-FLIGHT: persist ALL photos to IndexedDB BEFORE submitting the
      //     inspection. If local persistence fails (quota, blocked storage,
      //     private mode, etc.), we abort the entire submission so the driver
      //     never ends up with a "submitted" inspection that has no photo
      //     evidence. inspectionId / damageItemId get patched in afterwards
      //     by the background uploader using the queued items' job + index.
      const photoTypes = PHOTO_TYPES_BY_INSPECTION[type];
      type QueuedHandle = { id: string; kind: "damage" | "standard" | "additional"; index: number };
      const queued: QueuedHandle[] = [];

      const failPreflight = (err: unknown, queuedSoFar: number) => {
        const failure = logStorageSubmitFailure(err, {
          jobId: jobId!,
          inspectionType: type,
          queuedSoFar,
        });
        // Persist the failure on the review screen so the driver sees a
        // permanent, classified explanation — not just a transient toast.
        setSubmitStorageFailure(failure);
        // Also re-run the probe so the disabled state matches reality.
        probeLocalStorageHealth().then(setStorageHealth).catch(() => {});
        toast({
          title: failure.title,
          description: failure.description,
          variant: "destructive",
        });
      };

      try {
        // Snapshot the job's current_run_id so every queued photo is
        // tagged. The retry worker will refuse to upload items whose
        // runId no longer matches the job's current run (i.e. the job
        // was reopened in the meantime), preventing stale evidence
        // from polluting a fresh run.
        const queueRunId: string | null = (job as any)?.current_run_id ?? null;

        // Damage photos (inspectionId + damageItemId attached after submit)
        for (let i = 0; i < formState.damages.length; i++) {
          const d = formState.damages[i];
          if (!d.photo) continue;
          const item = await addPendingUpload(d.photo, {
            jobId,
            inspectionType: type,
            photoType: "damage_close_up",
            label: null,
            damageItemId: null,
            inspectionId: null,
            runId: queueRunId,
          });
          queued.push({ id: item.id, kind: "damage", index: i });
        }
        // Standard photos
        for (const pt of photoTypes) {
          const file = formState.standardPhotos[pt.key];
          if (!file) continue;
          const item = await addPendingUpload(file, {
            jobId,
            inspectionType: type,
            photoType: pt.key,
            label: null,
            inspectionId: null,
            runId: queueRunId,
          });
          queued.push({ id: item.id, kind: "standard", index: 0 });
        }
        // Additional photos
        for (let i = 0; i < formState.additionalPhotos.length; i++) {
          const ap = formState.additionalPhotos[i];
          const photoKey = type === "pickup" ? "pickup_other" : "delivery_other";
          const item = await addPendingUpload(ap.file, {
            jobId,
            inspectionType: type,
            photoType: photoKey,
            label: ap.label,
            inspectionId: null,
            runId: queueRunId,
          });
          queued.push({ id: item.id, kind: "additional", index: i });
        }
      } catch (err) {
        // Roll back any queued items so a retry doesn't double-upload.
        try {
          const { deletePendingUpload } = await import("@/lib/pendingUploads");
          await Promise.all(queued.map((q) => deletePendingUpload(q.id).catch(() => {})));
        } catch { /* best-effort cleanup */ }
        failPreflight(err, queued.length);
        setSubmitting(false);
        return;
      }

      // ── 4) Submit inspection metadata atomically (RPC writes 1 transaction) ──
      const inspPayload = buildInspectionPayload(type, formState, {
        driverSignatureUrl: driverSigUrl,
        customerSignatureUrl: customerSigUrl,
      });

      const submitResult = await submitMutation.mutateAsync({
        jobId,
        type,
        inspectionPayload: inspPayload as any,
        damageItems: damageItemsPayload as any,
      });

      const submitResultTyped = submitResult as { inspectionId: string; damageItemIds: string[] };
      const inspectionId: string | null = submitResultTyped?.inspectionId ?? null;
      const damageItemIds: string[] = submitResultTyped?.damageItemIds ?? [];

      // ── 4b) Patch inspectionId + damageItemId onto already-queued items.
      //     Best-effort: even if patching fails the photos still upload — they
      //     just won't be linked to a damage_item row.
      try {
        const { getAllPendingUploads } = await import("@/lib/pendingUploads");
        const { set, createStore } = await import("idb-keyval");
        const store = createStore("axentra-pending-uploads", "v2");
        const all = await getAllPendingUploads();
        const byId = new Map(all.map((u) => [u.id, u]));
        for (const q of queued) {
          const u = byId.get(q.id);
          if (!u) continue;
          u.inspectionId = inspectionId;
          if (q.kind === "damage") u.damageItemId = damageItemIds[q.index] ?? null;
        }
        await set("queue", Array.from(byId.values()), store);
      } catch { /* non-fatal */ }

      const pendingCount = queued.length;
      if (pendingCount > 0) {
        toast({
          title: `${pendingCount} photo${pendingCount > 1 ? "s" : ""} queued for upload`,
          description: "They'll upload automatically in the background.",
        });
      }

      // ── 5) Immediately trigger background retry (best-effort) ──
      import("@/lib/pendingUploads").then(m => m.retryAllPending()).catch(() => {});

      const jobRef = job?.external_job_number || jobId.slice(0, 8);
      const label = type === "pickup" ? "Pickup" : "Delivery";
      toast({ title: `${label} completed for job ${jobRef}.` });
      if (dk) clearDraft(dk);
      try { sessionStorage.removeItem(sessionKey); } catch { /* ignore */ }
      navigate(`/jobs/${jobId}`);
    } catch {
      toast({ title: "Submission failed. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Only show full-screen spinner on initial load (no cached data).
  // On rotation remounts, staleTime keeps the cached data so we skip the spinner.
  if (jobLoading && !job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine which step is the signature step
  const signatureStepNumber = getSignatureStepNumber(type);

  const nextStep = async () => {
    if (currentStep >= totalSteps || capturing) return;
    const missing = validateStep(currentStep);
    if (missing.length > 0) {
      toast({
        title: `Please complete ${missing.length} required field(s).`,
        variant: "destructive",
      });
      return;
    }

    // Eagerly capture signature files BEFORE the canvas unmounts
    if (currentStep === signatureStepNumber) {
      setCapturing(true);
      try {
        if (driverSigRef.current && driverSigned) {
          const file = await driverSigRef.current.toFile("driver.png");
          setDriverSigFile(file);
        }
        if (customerSigRef.current && customerSigned) {
          const file = await customerSigRef.current.toFile("customer.png");
          setCustomerSigFile(file);
        }
      } catch (e) {
        console.error("Signature capture failed:", e);
        toast({ title: "Could not capture signatures. Please try again.", variant: "destructive" });
        setCapturing(false);
        return;
      }
      setCapturing(false);
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




  const renderCurrentStep = () => {
    try {
      return type === "pickup"
        ? renderPickupStep(currentStep)
        : renderDeliveryStep(currentStep);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("InspectionFlow step render error:", e);
      // Only set error state if not already showing an error (avoid re-render loop)
      if (!stepError) {
        // Use queueMicrotask to avoid setState during render
        queueMicrotask(() => setStepError(msg));
      }
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
        onBack={() => navigate(`/jobs/${jobId}${window.location.search}`)}
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
          <>
            {renderCurrentStep()}
          </>
        )}

        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1 || capturing}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {currentStep < totalSteps && (
            <Button onClick={nextStep} disabled={capturing} className="gap-2">
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
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
