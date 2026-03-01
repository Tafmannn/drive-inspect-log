// src/pages/JobForm.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Native select used instead of Radix Select to avoid BubbleSelect DOM crash
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { CAR_MAKES, getModelsForMake } from "@/lib/carData";
import { isValidUkPostcode, calculateRoute, type RouteResult } from "@/lib/mapsApi";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { saveDraft, loadDraft, clearDraft, draftKey } from "@/lib/autosave";
import { lookupPostcode, type AddressSuggestion } from "@/lib/postcodeApi";
import { BusinessSearchInput } from "@/components/BusinessSearchInput";
import { getPlaceDetails, type BusinessResult } from "@/lib/businessSearchApi";

type ErrorMap = Record<string, string>;

interface JobFormDraft {
  vehicleMake: string;
  vehicleModel: string;
  customMake: boolean;
  customModel: boolean;
}

export const JobForm = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const isEdit = !!jobId;

  const { data: existingJob, isLoading: jobLoading } = useJob(jobId ?? "");
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const formRef = useRef<HTMLFormElement | null>(null);
  const [errors, setErrors] = useState<ErrorMap>({});

  // Vehicle make/model selection state
  const [vehicleMake, setVehicleMake] = useState<string>("");
  const [vehicleModel, setVehicleModel] = useState<string>("");
  const [customMake, setCustomMake] = useState(false);
  const [customModel, setCustomModel] = useState(false);

  // Autosave draft state
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const dk = isEdit ? "" : draftKey("newJob", "create");

  // Route calculation state
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapsEnabled, setMapsEnabled] = useState(false);
  const routeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Postcode lookup state
  const [pickupSuggestions, setPickupSuggestions] = useState<AddressSuggestion[]>([]);
  const [deliverySuggestions, setDeliverySuggestions] = useState<AddressSuggestion[]>([]);
  const [pickupLookupLoading, setPickupLookupLoading] = useState(false);
  const [deliveryLookupLoading, setDeliveryLookupLoading] = useState(false);
  const [pickupLookupError, setPickupLookupError] = useState("");
  const [deliveryLookupError, setDeliveryLookupError] = useState("");

  useEffect(() => {
    isFeatureEnabled("MAPS_ENABLED").then(setMapsEnabled);
  }, []);

  // Helper: check if draft has all required page-1 fields
  const isDraftComplete = (d: Record<string, string>): boolean => {
    const requiredFields = [
      "vehicle_reg", "pickup_contact_name", "pickup_contact_phone",
      "pickup_address_line1", "pickup_city", "pickup_postcode",
      "delivery_contact_name", "delivery_contact_phone",
      "delivery_address_line1", "delivery_city", "delivery_postcode",
    ];
    // vehicle_make/model may be stored as controlled state keys
    const hasMake = !!(d.vehicle_make || d.vehicleMake);
    const hasModel = !!(d.vehicle_model || d.vehicleModel);
    const hasColour = !!d.vehicle_colour;
    return hasMake && hasModel && hasColour &&
      requiredFields.every((f) => !!d[f]?.trim());
  };

  // ─── AUTOSAVE: check for draft on mount (new job only) ───
  useEffect(() => {
    if (!dk || isEdit) return;
    const draft = loadDraft<Record<string, string> & JobFormDraft>(dk);
    // Only show resume prompt if draft has all required page-1 fields
    if (draft?.data && isDraftComplete(draft.data)) {
      setShowDraftPrompt(true);
    }
  }, [dk, isEdit]);

  // ─── AUTOSAVE: save draft on form input (new job only) ───
  const saveDraftFromForm = useCallback(() => {
    if (!dk || isEdit || !formRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (!formRef.current) return;
      const data = new FormData(formRef.current);
      const draft: Record<string, string> = {};
      data.forEach((val, key) => {
        if (typeof val === "string") draft[key] = val;
      });
      saveDraft(dk, { ...draft, vehicleMake, vehicleModel, customMake, customModel });
    }, 800);
  }, [dk, isEdit, vehicleMake, vehicleModel, customMake, customModel]);

  const handleRestoreDraft = () => {
    if (!dk) return;
    const draft = loadDraft<Record<string, string> & JobFormDraft>(dk);
    if (draft?.data && formRef.current) {
      const d = draft.data;
      // Restore controlled state
      if (d.vehicleMake) setVehicleMake(d.vehicleMake);
      if (d.vehicleModel) setVehicleModel(d.vehicleModel);
      if (d.customMake != null) setCustomMake(!!d.customMake);
      if (d.customModel != null) setCustomModel(!!d.customModel);
      // Restore uncontrolled form fields
      requestAnimationFrame(() => {
        if (!formRef.current) return;
        const fields = formRef.current.elements;
        for (const [key, val] of Object.entries(d)) {
          if (["vehicleMake", "vehicleModel", "customMake", "customModel"].includes(key)) continue;
          const el = fields.namedItem(key);
          if (el && "value" in el && !(el instanceof RadioNodeList)) (el as HTMLInputElement).value = val as string;
        }
      });
      toast({ title: "Draft restored." });
    }
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    if (dk) clearDraft(dk);
    setShowDraftPrompt(false);
  };

  // Debounced route calculation
  const triggerRouteCalc = useCallback((pickupPC: string, deliveryPC: string) => {
    if (!mapsEnabled) return;
    if (routeDebounce.current) clearTimeout(routeDebounce.current);
    if (!isValidUkPostcode(pickupPC) || !isValidUkPostcode(deliveryPC)) {
      setRouteResult(null);
      return;
    }
    setRouteLoading(true);
    routeDebounce.current = setTimeout(async () => {
      try {
        const result = await calculateRoute(pickupPC, deliveryPC);
        setRouteResult(result);
      } catch {
        setRouteResult(null);
      } finally {
        setRouteLoading(false);
      }
    }, 750);
  }, [mapsEnabled]);

  // Postcode lookup handler
  const handleFindAddress = useCallback(async (side: "pickup" | "delivery") => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const pc = (fd.get(`${side}_postcode`) as string || "").trim();
    if (!pc || !isValidUkPostcode(pc)) {
      toast({ title: "Enter a valid postcode to search.", variant: "destructive" });
      return;
    }
    const setLoading = side === "pickup" ? setPickupLookupLoading : setDeliveryLookupLoading;
    const setSuggestions = side === "pickup" ? setPickupSuggestions : setDeliverySuggestions;
    const setError = side === "pickup" ? setPickupLookupError : setDeliveryLookupError;
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const results = await lookupPostcode(pc);
      if (results.length > 0) {
        setSuggestions(results);
      } else {
        setError("No addresses found. Please enter the address manually.");
      }
    } catch {
      setError("Couldn't fetch addresses. Please enter the address manually.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectSuggestion = useCallback((side: "pickup" | "delivery", suggestion: AddressSuggestion) => {
    if (!formRef.current) return;
    const fields = formRef.current.elements;
    const setVal = (name: string, val: string) => {
      const el = fields.namedItem(name);
      if (el && "value" in el && !(el instanceof RadioNodeList)) {
        const inputEl = el as HTMLInputElement;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        nativeInputValueSetter?.call(inputEl, val);
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    // Attempt to split line1 into house number + street
    const parts = suggestion.line1.match(/^(\d+\w?)\s+(.+)$/);
    if (parts) {
      setVal(`${side}_address_line1`, parts[1]);
      setVal(`${side}_address_line2`, parts[2]);
    } else {
      setVal(`${side}_address_line1`, suggestion.line1);
      setVal(`${side}_address_line2`, "");
    }
    setVal(`${side}_city`, suggestion.town);
    setVal(`${side}_postcode`, suggestion.postcode);

    // Clear suggestions
    if (side === "pickup") setPickupSuggestions([]);
    else setDeliverySuggestions([]);

    // Trigger route calc if both postcodes now valid
    const fd = new FormData(formRef.current);
    const pickupPC = side === "pickup" ? suggestion.postcode : (fd.get("pickup_postcode") as string || "");
    const deliveryPC = side === "delivery" ? suggestion.postcode : (fd.get("delivery_postcode") as string || "");
    if (pickupPC && deliveryPC) triggerRouteCalc(pickupPC, deliveryPC);

    saveDraftFromForm();
  }, [triggerRouteCalc, saveDraftFromForm]);

  // Business search selection handler — always overrides fields with fresh data
  const handleBusinessSelect = useCallback(async (side: "pickup" | "delivery", result: BusinessResult) => {
    if (!formRef.current) return;
    const fields = formRef.current.elements;
    const setVal = (name: string, val: string) => {
      const el = fields.namedItem(name);
      if (el && "value" in el && !(el instanceof RadioNodeList)) {
        const inputEl = el as HTMLInputElement;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        nativeInputValueSetter?.call(inputEl, val);
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    // Fetch full place details
    const details = await getPlaceDetails(result.placeId);
    if (!details) return;

    const addr = details.parsedAddress;

    // Split address: house → line1, street → line2 when both available
    if (addr.house && addr.street) {
      setVal(`${side}_address_line1`, addr.house);
      setVal(`${side}_address_line2`, addr.street);
    } else {
      // Fallback: combined into line1, blank line2
      setVal(`${side}_address_line1`, addr.line1);
      setVal(`${side}_address_line2`, "");
    }

    // Always overwrite city & postcode when valid
    if (addr.city) setVal(`${side}_city`, addr.city);
    if (addr.postcode) setVal(`${side}_postcode`, addr.postcode);

    // Phone: only fill if currently empty
    if (details.phone) {
      const phoneEl = fields.namedItem(`${side}_contact_phone`) as HTMLInputElement | null;
      if (phoneEl && !phoneEl.value.trim()) {
        setVal(`${side}_contact_phone`, details.phone);
      }
    }

    // Trigger route calc
    if (addr.postcode) {
      const fd = new FormData(formRef.current);
      const pickupPC = side === "pickup" ? addr.postcode : (fd.get("pickup_postcode") as string || "");
      const deliveryPC = side === "delivery" ? addr.postcode : (fd.get("delivery_postcode") as string || "");
      if (pickupPC && deliveryPC) triggerRouteCalc(pickupPC, deliveryPC);
    }

    saveDraftFromForm();
  }, [triggerRouteCalc, saveDraftFromForm]);

  // Sync make/model when editing once job is loaded
  useEffect(() => {
    if (isEdit && existingJob) {
      const makeKnown = CAR_MAKES.includes(existingJob.vehicle_make);
      const modelKnown =
        makeKnown &&
        getModelsForMake(existingJob.vehicle_make).includes(
          existingJob.vehicle_model,
        );

      setVehicleMake(existingJob.vehicle_make);
      setVehicleModel(existingJob.vehicle_model);
      setCustomMake(!makeKnown);
      setCustomModel(!modelKnown);
    }
  }, [isEdit, existingJob]);

  const models = getModelsForMake(vehicleMake || "");

  // ─────────────────────────────────────────────
  // Validation based on FormData (uncontrolled)
  // ─────────────────────────────────────────────

  const validate = (data: FormData): boolean => {
    const e: ErrorMap = {};
    const required: [string, string][] = [
      ["vehicle_reg", "Registration is required"],
      ["vehicle_make", "Make is required"],
      ["vehicle_model", "Model is required"],
      ["vehicle_colour", "Colour is required"],
      ["pickup_contact_name", "Pickup contact name is required"],
      ["pickup_contact_phone", "Pickup phone is required"],
      ["pickup_address_line1", "Pickup address is required"],
      ["pickup_city", "Pickup city is required"],
      ["pickup_postcode", "Pickup postcode is required"],
      ["delivery_contact_name", "Delivery contact name is required"],
      ["delivery_contact_phone", "Delivery phone is required"],
      ["delivery_address_line1", "Delivery address is required"],
      ["delivery_city", "Delivery city is required"],
      ["delivery_postcode", "Delivery postcode is required"],
    ];

    for (const [field, msg] of required) {
      const val = (data.get(field) as string | null)?.trim() ?? "";
      if (!val) e[field] = msg;
    }

    setErrors(e);

    if (Object.keys(e).length > 0) {
      toast({
        title: `Please complete ${Object.keys(e).length} required field(s).`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Helper to pull string safely
  const getStr = (data: FormData, key: string): string => {
    const v = data.get(key);
    return (typeof v === "string" ? v : "").trim();
  };

  const handleSubmit = async () => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);

    // Make/model come from controlled Selects if not using "custom" inputs
    if (!customMake) {
      data.set("vehicle_make", vehicleMake);
    }
    if (!customModel) {
      data.set("vehicle_model", vehicleModel);
    }

    if (!validate(data)) return;

    const payload = {
      external_job_number: getStr(data, "external_job_number") || null,
      vehicle_reg: getStr(data, "vehicle_reg"),
      vehicle_make: getStr(data, "vehicle_make"),
      vehicle_model: getStr(data, "vehicle_model"),
      vehicle_colour: getStr(data, "vehicle_colour"),
      vehicle_year: getStr(data, "vehicle_year") || null,

      pickup_contact_name: getStr(data, "pickup_contact_name"),
      pickup_contact_phone: getStr(data, "pickup_contact_phone"),
      pickup_company: getStr(data, "pickup_company") || null,
      pickup_address_line1: getStr(data, "pickup_address_line1"),
      pickup_address_line2: getStr(data, "pickup_address_line2") || null,
      pickup_city: getStr(data, "pickup_city"),
      pickup_postcode: getStr(data, "pickup_postcode"),
      pickup_notes: getStr(data, "pickup_notes") || null,

      delivery_contact_name: getStr(data, "delivery_contact_name"),
      delivery_contact_phone: getStr(data, "delivery_contact_phone"),
      delivery_company: getStr(data, "delivery_company") || null,
      delivery_address_line1: getStr(data, "delivery_address_line1"),
      delivery_address_line2: getStr(data, "delivery_address_line2") || null,
      delivery_city: getStr(data, "delivery_city"),
      delivery_postcode: getStr(data, "delivery_postcode"),
      delivery_notes: getStr(data, "delivery_notes") || null,

      earliest_delivery_date: getStr(data, "earliest_delivery_date") || null,
      // Include route data if calculated
      ...(routeResult?.valid ? {
        route_distance_miles: routeResult.distanceMiles,
        route_eta_minutes: routeResult.etaMinutes,
        maps_validated: true,
      } : {}),
    };

    try {
      if (isEdit && jobId) {
        await updateMutation.mutateAsync({ jobId, input: payload });
        const updRef = payload.external_job_number || jobId.slice(0, 8);
        toast({ title: `Job ${updRef} updated.` });
        navigate(`/jobs/${jobId}`);
      } else {
        if (dk) clearDraft(dk);
        const job = await createMutation.mutateAsync(payload);
        const newRef = job.external_job_number || job.id.slice(0, 8);
        toast({ title: `Job ${newRef} created.` });
        navigate(`/jobs/${job.id}`);
      }
    } catch {
      toast({ title: "Save failed. Please try again.", variant: "destructive" });
    }
  };

  const isMutating =
    createMutation.isPending || updateMutation.isPending;

  // Show loader while fetching existing job
  if (isEdit && jobLoading && !existingJob) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Small field helper just for error display; inputs themselves are uncontrolled
  const ErrorText = ({ field }: { field: string }) =>
    errors[field] ? (
      <p className="text-xs text-destructive mt-1">
        {errors[field]}
      </p>
    ) : null;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Draft restore prompt */}
      <Dialog open={showDraftPrompt} onOpenChange={setShowDraftPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">You have an unsaved job form from a previous session. Would you like to restore it?</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={handleDiscardDraft}>Discard</Button>
            <Button onClick={handleRestoreDraft}>Restore Draft</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AppHeader
        title={isEdit ? "Edit Job" : "New Job"}
        showBack
        onBack={() => navigate(-1)}
      />
      <div className="p-4 space-y-6 max-w-lg mx-auto">
        <form
          ref={formRef}
          className="space-y-8"
          onChange={saveDraftFromForm}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {/* VEHICLE DETAILS */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">
              Vehicle Details
            </h3>

            {/* Job Number */}
            <div>
              <Label className="text-sm font-medium">
                Job Number
              </Label>
              <Input
                name="external_job_number"
                placeholder="Auto-generated if left blank"
                defaultValue={
                  existingJob?.external_job_number ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="external_job_number" />
            </div>

            {/* Registration */}
            <div>
              <Label className="text-sm font-medium">
                Registration *
              </Label>
              <Input
                name="vehicle_reg"
                placeholder="Vehicle registration"
                defaultValue={existingJob?.vehicle_reg ?? ""}
                autoCapitalize="characters"
                className="mt-1"
              />
              <ErrorText field="vehicle_reg" />
            </div>

            {/* Make */}
            <div>
              <Label className="text-sm font-medium">Make *</Label>
              {customMake ? (
                <div className="flex gap-2 mt-1">
                  <Input
                    name="vehicle_make"
                    placeholder="Enter make"
                    defaultValue={existingJob?.vehicle_make ?? ""}
                    onBlur={(e) => {
                      setVehicleMake(e.target.value);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setCustomMake(false);
                      setVehicleMake("");
                      setVehicleModel("");
                    }}
                  >
                    List
                  </Button>
                </div>
              ) : (
                <>
                  <select
                    name="vehicle_make"
                    value={vehicleMake}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__other__") {
                        setCustomMake(true);
                        setVehicleMake("");
                        setVehicleModel("");
                      } else {
                        setVehicleMake(v);
                        setVehicleModel("");
                        setCustomModel(false);
                      }
                    }}
                    className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 mt-1"
                  >
                    <option value="">Select make</option>
                    {CAR_MAKES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__other__">Other…</option>
                  </select>
                </>
              )}
              <ErrorText field="vehicle_make" />
            </div>

            {/* Model */}
            <div>
              <Label className="text-sm font-medium">
                Model *
              </Label>
              {customModel || customMake ? (
                <div className="flex gap-2 mt-1">
                  <Input
                    name="vehicle_model"
                    placeholder="Enter model"
                    defaultValue={existingJob?.vehicle_model ?? ""}
                    onBlur={(e) => {
                      setVehicleModel(e.target.value);
                    }}
                  />
                  {!customMake && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setCustomModel(false)}
                    >
                      List
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <select
                    name="vehicle_model"
                    value={vehicleModel}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__other__") {
                        setCustomModel(true);
                        setVehicleModel("");
                      } else {
                        setVehicleModel(v);
                      }
                    }}
                    disabled={!vehicleMake}
                    className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                  >
                    <option value="">
                      {vehicleMake ? "Select model" : "Select make first"}
                    </option>
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__other__">Other…</option>
                  </select>
                </>
              )}
              <ErrorText field="vehicle_model" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">
                  Colour *
                </Label>
                <Input
                  name="vehicle_colour"
                  placeholder="e.g. Metallic Black"
                  defaultValue={
                    existingJob?.vehicle_colour ?? ""
                  }
                  className="mt-1"
                />
                <ErrorText field="vehicle_colour" />
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Year
                </Label>
                <Input
                  name="vehicle_year"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 2020"
                  defaultValue={existingJob?.vehicle_year ?? ""}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* PICKUP */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Pickup</h3>
            <div>
              <Label className="text-sm font-medium">
                Contact Name *
              </Label>
              <Input
                name="pickup_contact_name"
                defaultValue={
                  existingJob?.pickup_contact_name ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="pickup_contact_name" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Phone *
              </Label>
              <Input
                name="pickup_contact_phone"
                defaultValue={
                  existingJob?.pickup_contact_phone ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="pickup_contact_phone" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Company
              </Label>
              <BusinessSearchInput
                name="pickup_company"
                defaultValue={existingJob?.pickup_company ?? ""}
                postcode={(() => {
                  if (!formRef.current) return undefined;
                  return (new FormData(formRef.current).get("pickup_postcode") as string) || undefined;
                })()}
                onSelect={(r) => handleBusinessSelect("pickup", r)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Address Line 1 *
              </Label>
              <Input
                name="pickup_address_line1"
                defaultValue={
                  existingJob?.pickup_address_line1 ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="pickup_address_line1" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Address Line 2
              </Label>
              <Input
                name="pickup_address_line2"
                defaultValue={
                  existingJob?.pickup_address_line2 ?? ""
                }
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">
                  City *
                </Label>
                <Input
                  name="pickup_city"
                  defaultValue={
                    existingJob?.pickup_city ?? ""
                  }
                  className="mt-1"
                />
                <ErrorText field="pickup_city" />
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Postcode *
                </Label>
                <Input
                  name="pickup_postcode"
                  defaultValue={
                    existingJob?.pickup_postcode ?? ""
                  }
                  className="mt-1"
                  onBlur={(e) => {
                    const deliveryPC = formRef.current ? new FormData(formRef.current).get("delivery_postcode") as string : "";
                    if (deliveryPC) triggerRouteCalc(e.target.value, deliveryPC);
                  }}
                />
                <ErrorText field="pickup_postcode" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={pickupLookupLoading}
              onClick={() => handleFindAddress("pickup")}
            >
              {pickupLookupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Find Address
            </Button>
            {pickupLookupError && (
              <p className="text-xs text-muted-foreground">{pickupLookupError}</p>
            )}
            {pickupSuggestions.length > 0 && (
              <div className="border border-border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                {pickupSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
                    onClick={() => handleSelectSuggestion("pickup", s)}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
                  onClick={() => setPickupSuggestions([])}
                >
                  Can't find it? Enter address manually instead.
                </button>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">
                Pickup Notes
              </Label>
              <Textarea
                name="pickup_notes"
                defaultValue={existingJob?.pickup_notes ?? ""}
                className="mt-1"
              />
            </div>
          </div>

          {/* DELIVERY */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Delivery</h3>
            <div>
              <Label className="text-sm font-medium">
                Contact Name *
              </Label>
              <Input
                name="delivery_contact_name"
                defaultValue={
                  existingJob?.delivery_contact_name ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="delivery_contact_name" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Phone *
              </Label>
              <Input
                name="delivery_contact_phone"
                defaultValue={
                  existingJob?.delivery_contact_phone ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="delivery_contact_phone" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Company
              </Label>
              <BusinessSearchInput
                name="delivery_company"
                defaultValue={existingJob?.delivery_company ?? ""}
                postcode={(() => {
                  if (!formRef.current) return undefined;
                  return (new FormData(formRef.current).get("delivery_postcode") as string) || undefined;
                })()}
                onSelect={(r) => handleBusinessSelect("delivery", r)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Address Line 1 *
              </Label>
              <Input
                name="delivery_address_line1"
                defaultValue={
                  existingJob?.delivery_address_line1 ?? ""
                }
                className="mt-1"
              />
              <ErrorText field="delivery_address_line1" />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Address Line 2
              </Label>
              <Input
                name="delivery_address_line2"
                defaultValue={
                  existingJob?.delivery_address_line2 ?? ""
                }
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">
                  City *
                </Label>
                <Input
                  name="delivery_city"
                  defaultValue={
                    existingJob?.delivery_city ?? ""
                  }
                  className="mt-1"
                />
                <ErrorText field="delivery_city" />
              </div>
              <div>
                <Label className="text-sm font-medium">
                  Postcode *
                </Label>
                <Input
                  name="delivery_postcode"
                  defaultValue={
                    existingJob?.delivery_postcode ?? ""
                  }
                  className="mt-1"
                  onBlur={(e) => {
                    const pickupPC = formRef.current ? new FormData(formRef.current).get("pickup_postcode") as string : "";
                    if (pickupPC) triggerRouteCalc(pickupPC, e.target.value);
                  }}
                />
                <ErrorText field="delivery_postcode" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={deliveryLookupLoading}
              onClick={() => handleFindAddress("delivery")}
            >
              {deliveryLookupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Find Address
            </Button>
            {deliveryLookupError && (
              <p className="text-xs text-muted-foreground">{deliveryLookupError}</p>
            )}
            {deliverySuggestions.length > 0 && (
              <div className="border border-border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                {deliverySuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
                    onClick={() => handleSelectSuggestion("delivery", s)}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
                  onClick={() => setDeliverySuggestions([])}
                >
                  Can't find it? Enter address manually instead.
                </button>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">
                Delivery Notes
              </Label>
              <Textarea
                name="delivery_notes"
                defaultValue={
                  existingJob?.delivery_notes ?? ""
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">
                Earliest Delivery Date
              </Label>
              <Input
                name="earliest_delivery_date"
                type="date"
                defaultValue={
                  existingJob?.earliest_delivery_date ?? ""
                }
                className="mt-1"
              />
            </div>
            </div>

          {/* Route estimate (Maps) */}
          {mapsEnabled && (routeLoading || routeResult) && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" /> Route Estimate
              </h3>
              {routeLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating route…
                </div>
              ) : routeResult?.valid ? (
                <div className="flex gap-4">
                  <Badge variant="outline" className="text-sm">
                    <MapPin className="h-3 w-3 mr-1" /> {routeResult.distanceText ?? `${routeResult.distanceMiles} mi`}
                  </Badge>
                  <Badge variant="outline" className="text-sm">
                    🕐 {routeResult.durationText ?? `${routeResult.etaMinutes} min`}
                  </Badge>
                </div>
              ) : (
                <p className="text-xs text-destructive">{routeResult?.error || "No route found"}</p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            type="submit"
            disabled={isMutating}
          >
            {isMutating && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isEdit ? "Update Job" : "Create Job"}
          </Button>
        </form>
      </div>
      <BottomNav />
    </div>
  );
};