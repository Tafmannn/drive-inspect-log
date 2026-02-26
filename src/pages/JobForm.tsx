import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
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

export const JobForm = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const isEdit = !!jobId;
  const { data: existingJob, isLoading: jobLoading } = useJob(jobId ?? "");
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const [autoJobNumber, setAutoJobNumber] = useState<string | null>(null);
  const [autoJobLoading, setAutoJobLoading] = useState(false);

  const [form, setForm] = useState({
    external_job_number: "",
    vehicle_reg: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_colour: "",
    vehicle_year: "",
    pickup_contact_name: "",
    pickup_contact_phone: "",
    pickup_company: "",
    pickup_address_line1: "",
    pickup_address_line2: "",
    pickup_city: "",
    pickup_postcode: "",
    pickup_notes: "",
    delivery_contact_name: "",
    delivery_contact_phone: "",
    delivery_company: "",
    delivery_address_line1: "",
    delivery_address_line2: "",
    delivery_city: "",
    delivery_postcode: "",
    delivery_notes: "",
    earliest_delivery_date: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customMake, setCustomMake] = useState(false);
  const [customModel, setCustomModel] = useState(false);

  // Populate form when editing
  const [populated, setPopulated] = useState(false);
  useEffect(() => {
    if (isEdit && existingJob && !populated) {
      const makeKnown = CAR_MAKES.includes(existingJob.vehicle_make);
      const modelKnown =
        makeKnown &&
        getModelsForMake(existingJob.vehicle_make).includes(
          existingJob.vehicle_model,
        );
      setCustomMake(!makeKnown);
      setCustomModel(!modelKnown);
      setForm({
        external_job_number: existingJob.external_job_number ?? "",
        vehicle_reg: existingJob.vehicle_reg,
        vehicle_make: existingJob.vehicle_make,
        vehicle_model: existingJob.vehicle_model,
        vehicle_colour: existingJob.vehicle_colour,
        vehicle_year: existingJob.vehicle_year ?? "",
        pickup_contact_name: existingJob.pickup_contact_name,
        pickup_contact_phone: existingJob.pickup_contact_phone,
        pickup_company: existingJob.pickup_company ?? "",
        pickup_address_line1: existingJob.pickup_address_line1,
        pickup_address_line2: existingJob.pickup_address_line2 ?? "",
        pickup_city: existingJob.pickup_city,
        pickup_postcode: existingJob.pickup_postcode,
        pickup_notes: existingJob.pickup_notes ?? "",
        delivery_contact_name: existingJob.delivery_contact_name,
        delivery_contact_phone: existingJob.delivery_contact_phone,
        delivery_company: existingJob.delivery_company ?? "",
        delivery_address_line1: existingJob.delivery_address_line1,
        delivery_address_line2: existingJob.delivery_address_line2 ?? "",
        delivery_city: existingJob.delivery_city,
        delivery_postcode: existingJob.delivery_postcode,
        delivery_notes: existingJob.delivery_notes ?? "",
        earliest_delivery_date: existingJob.earliest_delivery_date ?? "",
      });
      setPopulated(true);
    }
  }, [isEdit, existingJob, populated]);

  // Auto-generate job number for new jobs (AX0001, AX0002, ...)
  useEffect(() => {
    if (isEdit) return; // don't auto-generate when editing existing job

    const generateNextJobNumber = async () => {
      setAutoJobLoading(true);
      try {
        const { data, error } = await supabase
          .from("jobs")
          .select("external_job_number")
          .ilike("external_job_number", "AX%")
          .order("external_job_number", { ascending: false })
          .limit(1);

        if (error) {
          console.error("Error generating job number", error);
          return;
        }

        let next = "AX0001";
        const last = data?.[0]?.external_job_number as
          | string
          | undefined;

        if (last && /^AX\d{4}$/.test(last)) {
          const n = parseInt(last.slice(2), 10) + 1;
          next = `AX${n.toString().padStart(4, "0")}`;
        }

        setAutoJobNumber(next);

        // If the user hasn't manually typed a job number yet, prefill it
        setForm((prev) =>
          prev.external_job_number
            ? prev
            : { ...prev, external_job_number: next },
        );
      } finally {
        setAutoJobLoading(false);
      }
    };

    void generateNextJobNumber();
  }, [isEdit]);

  const update = (field: string, value: string) => {
    let v = value;

    // Normalise vehicle registration: uppercase, no spaces
    if (field === "vehicle_reg") {
      v = value.toUpperCase().replace(/\s+/g, "");
    }

    // Normalise postcodes: uppercase, trimmed
    if (field.endsWith("_postcode")) {
      v = value.toUpperCase().trim();
    }

    setForm((prev) => ({ ...prev, [field]: v }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const models = getModelsForMake(form.vehicle_make);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
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
    for (const [f, msg] of required) {
      if (!(form as Record<string, string>)[f]?.trim()) e[f] = msg;
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

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const payload = {
        ...form,
        vehicle_year: form.vehicle_year || null,
        pickup_company: form.pickup_company || null,
        pickup_address_line2: form.pickup_address_line2 || null,
        pickup_notes: form.pickup_notes || null,
        delivery_company: form.delivery_company || null,
        delivery_address_line2: form.delivery_address_line2 || null,
        delivery_notes: form.delivery_notes || null,
        earliest_delivery_date: form.earliest_delivery_date || null,
        external_job_number:
          form.external_job_number || autoJobNumber || null,
      };

      if (isEdit && jobId) {
        await updateMutation.mutateAsync({ jobId, input: payload });
        toast({ title: "Job Updated" });
        navigate(`/jobs/${jobId}`);
      } else {
        const job = await createMutation.mutateAsync(payload);
        toast({
          title: "Job Created",
          description: `${job.external_job_number ?? ""} – ${job.vehicle_reg}`,
        });
        navigate(`/jobs/${job.id}`);
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (isEdit && jobLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const Field = ({
    label,
    field,
    required,
    placeholder,
    type,
  }: {
    label: string;
    field: string;
    required?: boolean;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      <Label className="text-sm font-medium">
        {label}
        {required && " *"}
      </Label>
      <Input
        type={type ?? "text"}
        value={(form as Record<string, string>)[field] ?? ""}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder ?? label}
        className="mt-1"
      />
      {errors[field] && (
        <p className="text-xs text-destructive mt-1">
          {errors[field]}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={isEdit ? "Edit Job" : "New Job"}
        showBack
        onBack={() => navigate(-1)}
      />
      <div className="p-4 space-y-6 max-w-lg mx-auto">
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Vehicle Details</h3>

          {/* Job Number */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">Job Number</Label>
            <Input
              type="text"
              value={form.external_job_number}
              onChange={(e) =>
                update("external_job_number", e.target.value)
              }
              placeholder={
                autoJobNumber
                  ? `${autoJobNumber} (auto – leave blank to use)`
                  : "Auto-generated if blank"
              }
              className="mt-1"
            />
            {autoJobLoading && (
              <p className="text-xs text-muted-foreground">
                Generating next AX number…
              </p>
            )}
          </div>

          <Field label="Registration" field="vehicle_reg" required />

          {/* Make dropdown */}
          <div>
            <Label className="text-sm font-medium">Make *</Label>
            {customMake ? (
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.vehicle_make}
                  onChange={(e) =>
                    update("vehicle_make", e.target.value)
                  }
                  placeholder="Enter make"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomMake(false)}
                >
                  List
                </Button>
              </div>
            ) : (
              <Select
                value={form.vehicle_make}
                onValueChange={(v) => {
                  if (v === "__other__") {
                    setCustomMake(true);
                    update("vehicle_make", "");
                    update("vehicle_model", "");
                  } else {
                    update("vehicle_make", v);
                    update("vehicle_model", "");
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
                  <SelectItem value="__other__">Other…</SelectItem>
                </SelectContent>
              </Select>
            )}
            {errors.vehicle_make && (
              <p className="text-xs text-destructive mt-1">
                {errors.vehicle_make}
              </p>
            )}
          </div>

          {/* Model dropdown */}
          <div>
            <Label className="text-sm font-medium">Model *</Label>
            {customModel || customMake ? (
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.vehicle_model}
                  onChange={(e) =>
                    update("vehicle_model", e.target.value)
                  }
                  placeholder="Enter model"
                />
                {!customMake && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomModel(false)}
                  >
                    List
                  </Button>
                )}
              </div>
            ) : (
              <Select
                value={form.vehicle_model}
                onValueChange={(v) => {
                  if (v === "__other__") {
                    setCustomModel(true);
                    update("vehicle_model", "");
                  } else {
                    update("vehicle_model", v);
                  }
                }}
                disabled={!form.vehicle_make}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue
                    placeholder={
                      form.vehicle_make
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
                  <SelectItem value="__other__">Other…</SelectItem>
                </SelectContent>
              </Select>
            )}
            {errors.vehicle_model && (
              <p className="text-xs text-destructive mt-1">
                {errors.vehicle_model}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour" field="vehicle_colour" required />
            <Field label="Year" field="vehicle_year" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Pickup</h3>
          <Field
            label="Contact Name"
            field="pickup_contact_name"
            required
          />
          <Field
            label="Phone"
            field="pickup_contact_phone"
            required
          />
          <Field label="Company" field="pickup_company" />
          <Field
            label="Address Line 1"
            field="pickup_address_line1"
            required
          />
          <Field
            label="Address Line 2"
            field="pickup_address_line2"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" field="pickup_city" required />
            <Field
              label="Postcode"
              field="pickup_postcode"
              required
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Pickup Notes</Label>
            <Textarea
              value={form.pickup_notes}
              onChange={(e) =>
                update("pickup_notes", e.target.value)
              }
              className="mt-1"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Delivery</h3>
          <Field
            label="Contact Name"
            field="delivery_contact_name"
            required
          />
          <Field
            label="Phone"
            field="delivery_contact_phone"
            required
          />
          <Field label="Company" field="delivery_company" />
          <Field
            label="Address Line 1"
            field="delivery_address_line1"
            required
          />
          <Field
            label="Address Line 2"
            field="delivery_address_line2"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" field="delivery_city" required />
            <Field
              label="Postcode"
              field="delivery_postcode"
              required
            />
          </div>
          <div>
            <Label className="text-sm font-medium">
              Delivery Notes
            </Label>
            <Textarea
              value={form.delivery_notes}
              onChange={(e) =>
                update("delivery_notes", e.target.value)
              }
              className="mt-1"
            />
          </div>
          <Field
            label="Earliest Delivery Date"
            field="earliest_delivery_date"
            type="date"
          />
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isMutating}
        >
          {isMutating && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {isEdit ? "Update Job" : "Create Job"}
        </Button>
      </div>
    </div>
  );
};