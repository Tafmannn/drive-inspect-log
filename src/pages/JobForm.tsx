// src/pages/JobForm.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateJob, useUpdateJob, useJob } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { CAR_MAKES, getModelsForMake } from "@/lib/carData";

type ErrorMap = Record<string, string>;

export const JobForm = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const isEdit = !!jobId;

  const { data: existingJob, isLoading: jobLoading } = useJob(jobId ?? "");
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const formRef = useRef<HTMLFormElement | null>(null);
  const [errors, setErrors] = useState<ErrorMap>({});

  // Vehicle make/model selection state (not per-keystroke typing)
  const [vehicleMake, setVehicleMake] = useState<string>("");
  const [vehicleModel, setVehicleModel] = useState<string>("");
  const [customMake, setCustomMake] = useState(false);
  const [customModel, setCustomModel] = useState(false);

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
        title: "Validation Error",
        description: `${Object.keys(e).length} field(s) require attention.`,
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
    };

    try {
      if (isEdit && jobId) {
        await updateMutation.mutateAsync({ jobId, input: payload });
        toast({ title: "Job Updated" });
        navigate(`/jobs/${jobId}`);
      } else {
        const job = await createMutation.mutateAsync(payload);
        toast({
          title: "Job Created",
          description: `${job.external_job_number ?? ""} – ${
            job.vehicle_reg
          }`,
        });
        navigate(`/jobs/${job.id}`);
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description:
          e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
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
    <div className="min-h-screen bg-background">
      <AppHeader
        title={isEdit ? "Edit Job" : "New Job"}
        showBack
        onBack={() => navigate(-1)}
      />
      <div className="p-4 space-y-6 max-w-lg mx-auto">
        <form
          ref={formRef}
          className="space-y-8"
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
                  {/* controlled Select, plus hidden input so value goes into FormData */}
                  <input
                    type="hidden"
                    name="vehicle_make"
                    value={vehicleMake}
                  />
                  <Select
                    value={vehicleMake}
                    onValueChange={(v) => {
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
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select make" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAR_MAKES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="__other__">
                        Other…
                      </SelectItem>
                    </SelectContent>
                  </Select>
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
                  <input
                    type="hidden"
                    name="vehicle_model"
                    value={vehicleModel}
                  />
                  <Select
                    value={vehicleModel}
                    onValueChange={(v) => {
                      if (v === "__other__") {
                        setCustomModel(true);
                        setVehicleModel("");
                      } else {
                        setVehicleModel(v);
                      }
                    }}
                    disabled={!vehicleMake}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue
                        placeholder={
                          vehicleMake
                            ? "Select model"
                            : "Select make first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="__other__">
                        Other…
                      </SelectItem>
                    </SelectContent>
                  </Select>
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
              <Input
                name="pickup_company"
                defaultValue={existingJob?.pickup_company ?? ""}
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
                />
                <ErrorText field="pickup_postcode" />
              </div>
            </div>
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
              <Input
                name="delivery_company"
                defaultValue={
                  existingJob?.delivery_company ?? ""
                }
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
                />
                <ErrorText field="delivery_postcode" />
              </div>
            </div>
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
    </div>
  );
};