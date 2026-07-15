import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodFormResolver } from "../lib/zodFormResolver";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingButton } from "./MarketingButton";
import { FieldShell, NativeSelect } from "./FormControls";
import { describedBy, fieldInputClass } from "./formHelpers";
import {
  movementRequestSchema,
  type MovementRequestValues,
} from "../lib/marketingSchema";
import { submitMovementRequest } from "../lib/submitMovementRequest";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

const customerTypeOptions = [
  { value: "dealership", label: "Dealership" },
  { value: "dealer_group", label: "Dealer group" },
  { value: "fleet", label: "Fleet" },
  { value: "rental", label: "Rental" },
  { value: "leasing", label: "Leasing" },
  { value: "auction", label: "Auction or remarketing" },
  { value: "trade", label: "Automotive trade" },
  { value: "private", label: "Private customer" },
  { value: "other", label: "Other" },
];
const runningOptions = [
  { value: "runs_and_drives", label: "Runs and drives" },
  { value: "starts_uncertain", label: "Starts but condition uncertain" },
  { value: "non_running", label: "Non-running" },
  { value: "unknown", label: "Unknown" },
];
const roadworthyOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Unsure" },
];
const motOptions = [
  { value: "valid", label: "Valid" },
  { value: "expired", label: "Expired" },
  { value: "unknown", label: "Unknown" },
  { value: "not_applicable", label: "Not applicable" },
];
const arrangementOptions = [
  { value: "confirmed", label: "Customer confirms legal movement arrangements" },
  { value: "needs_discussion", label: "Needs discussion" },
  { value: "unknown", label: "Unknown" },
];
const frequencyOptions = [
  { value: "one_off", label: "One-off" },
  { value: "recurring", label: "Recurring" },
];

const consentFields: { name: keyof MovementRequestValues; label: string }[] = [
  { name: "consentAccurate", label: "I confirm that the information supplied is accurate to the best of my knowledge." },
  { name: "consentNotBooking", label: "I understand that submitting this request does not confirm a booking." },
  { name: "consentContact", label: "I agree to Axentra using these details to respond to my enquiry." },
  { name: "consentPrivacy", label: "I have read the privacy policy." },
];

export function QuoteForm() {
  const { track } = useMarketingAnalytics();
  const startedRef = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [result, setResult] = useState<
    | { status: "idle" | "submitting" }
    | { status: "success"; reference: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MovementRequestValues>({
    resolver: zodFormResolver(movementRequestSchema),
    defaultValues: {
      companyWebsite: "",
      dateFlexible: false,
      consentAccurate: false,
      consentNotBooking: false,
      consentContact: false,
      consentPrivacy: false,
    },
  });

  const markStarted = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("movement_form_started");
    }
  };

  const onSubmit = async (values: MovementRequestValues) => {
    setResult({ status: "submitting" });
    const res = await submitMovementRequest(values, idempotencyKey.current);
    if (res.ok && res.reference) {
      track("movement_form_submitted");
      setResult({ status: "success", reference: res.reference });
      return;
    }
    track("movement_form_submission_failed", { reason: res.reason ?? "server" });
    // fresh key so the user can safely retry
    idempotencyKey.current = crypto.randomUUID();
    setResult({
      status: "error",
      message:
        "We could not submit your request at the moment. Your booking has not been created. Please try again or contact Axentra using the details on this page.",
    });
  };

  const onInvalid = () => track("movement_form_validation_failed");

  if (result.status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-marketing-success/30 bg-marketing-success/10 p-8 text-center"
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-marketing-success" aria-hidden="true" />
        <h3 className="mt-4 font-heading text-xl font-semibold text-marketing-text">
          Your movement request has been received
        </h3>
        <p className="mt-2 text-marketing-text-secondary">
          Reference: <span className="font-mono font-semibold text-marketing-text">{result.reference}</span>
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-marketing-text-secondary">
          This is not yet a confirmed booking. Axentra will review the vehicle, route, date and
          service requirements before responding with availability and pricing.
        </p>
      </div>
    );
  }

  const submitting = result.status === "submitting";

  return (
    <form noValidate onChange={markStarted} onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">
      {/* honeypot — visually hidden, not announced */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="companyWebsite">Company website</label>
        <input id="companyWebsite" tabIndex={-1} autoComplete="off" {...register("companyWebsite")} />
      </div>

      {result.status === "error" && (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm text-marketing-text">{result.message}</p>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-semibold text-marketing-text">Your details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="fullName" label="Full name" required error={errors.fullName?.message}>
            <input id="fullName" autoComplete="name" className={fieldInputClass}
              aria-invalid={!!errors.fullName} aria-describedby={describedBy("fullName", undefined, errors.fullName?.message)}
              {...register("fullName")} />
          </FieldShell>
          <FieldShell id="companyName" label="Company name" error={errors.companyName?.message}>
            <input id="companyName" autoComplete="organization" className={fieldInputClass} {...register("companyName")} />
          </FieldShell>
          <FieldShell id="email" label="Email" required error={errors.email?.message}>
            <input id="email" type="email" inputMode="email" autoComplete="email" className={fieldInputClass}
              aria-invalid={!!errors.email} aria-describedby={describedBy("email", undefined, errors.email?.message)}
              {...register("email")} />
          </FieldShell>
          <FieldShell id="telephone" label="Telephone" required error={errors.telephone?.message}>
            <input id="telephone" type="tel" inputMode="tel" autoComplete="tel" className={fieldInputClass}
              aria-invalid={!!errors.telephone} aria-describedby={describedBy("telephone", undefined, errors.telephone?.message)}
              {...register("telephone")} />
          </FieldShell>
          <FieldShell id="customerType" label="Customer type" required error={errors.customerType?.message} className="sm:col-span-2">
            <NativeSelect id="customerType" placeholder="Select customer type" options={customerTypeOptions}
              aria-invalid={!!errors.customerType} aria-describedby={describedBy("customerType", undefined, errors.customerType?.message)}
              {...register("customerType")} />
          </FieldShell>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-semibold text-marketing-text">Vehicle</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="vehicleRegistration" label="Registration" required error={errors.vehicleRegistration?.message}>
            <input id="vehicleRegistration" className={cn(fieldInputClass, "uppercase")}
              aria-invalid={!!errors.vehicleRegistration} aria-describedby={describedBy("vehicleRegistration", undefined, errors.vehicleRegistration?.message)}
              {...register("vehicleRegistration")} />
          </FieldShell>
          <div className="grid grid-cols-2 gap-4">
            <FieldShell id="vehicleMake" label="Make" required error={errors.vehicleMake?.message}>
              <input id="vehicleMake" className={fieldInputClass} aria-invalid={!!errors.vehicleMake} {...register("vehicleMake")} />
            </FieldShell>
            <FieldShell id="vehicleModel" label="Model" required error={errors.vehicleModel?.message}>
              <input id="vehicleModel" className={fieldInputClass} aria-invalid={!!errors.vehicleModel} {...register("vehicleModel")} />
            </FieldShell>
          </div>
          <FieldShell id="runningStatus" label="Running status" required error={errors.runningStatus?.message}>
            <NativeSelect id="runningStatus" placeholder="Select" options={runningOptions}
              aria-invalid={!!errors.runningStatus} {...register("runningStatus")} />
          </FieldShell>
          <FieldShell id="roadworthy" label="Is the vehicle roadworthy?" required error={errors.roadworthy?.message}>
            <NativeSelect id="roadworthy" placeholder="Select" options={roadworthyOptions}
              aria-invalid={!!errors.roadworthy} {...register("roadworthy")} />
          </FieldShell>
          <FieldShell id="motStatus" label="MOT status" required error={errors.motStatus?.message}>
            <NativeSelect id="motStatus" placeholder="Select" options={motOptions}
              aria-invalid={!!errors.motStatus} {...register("motStatus")} />
          </FieldShell>
          <FieldShell id="movementArrangement" label="Tax / trade-plate arrangements" required error={errors.movementArrangement?.message}>
            <NativeSelect id="movementArrangement" placeholder="Select" options={arrangementOptions}
              aria-invalid={!!errors.movementArrangement} {...register("movementArrangement")} />
          </FieldShell>
          <FieldShell id="knownDamage" label="Known damage or condition concerns" error={errors.knownDamage?.message} className="sm:col-span-2">
            <textarea id="knownDamage" rows={2} className={fieldInputClass} {...register("knownDamage")} />
          </FieldShell>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-semibold text-marketing-text">Collection &amp; delivery</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="collectionPostcode" label="Collection postcode" required error={errors.collectionPostcode?.message}>
            <input id="collectionPostcode" autoComplete="postal-code" className={cn(fieldInputClass, "uppercase")}
              aria-invalid={!!errors.collectionPostcode} {...register("collectionPostcode")} />
          </FieldShell>
          <FieldShell id="collectionContactName" label="Collection contact" required error={errors.collectionContactName?.message}>
            <input id="collectionContactName" className={fieldInputClass} aria-invalid={!!errors.collectionContactName} {...register("collectionContactName")} />
          </FieldShell>
          <FieldShell id="deliveryPostcode" label="Delivery postcode" required error={errors.deliveryPostcode?.message}>
            <input id="deliveryPostcode" autoComplete="postal-code" className={cn(fieldInputClass, "uppercase")}
              aria-invalid={!!errors.deliveryPostcode} {...register("deliveryPostcode")} />
          </FieldShell>
          <FieldShell id="deliveryContactName" label="Delivery contact" required error={errors.deliveryContactName?.message}>
            <input id="deliveryContactName" className={fieldInputClass} aria-invalid={!!errors.deliveryContactName} {...register("deliveryContactName")} />
          </FieldShell>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-heading text-lg font-semibold text-marketing-text">Movement requirements</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="preferredDate" label="Preferred movement date" error={errors.preferredDate?.message}
            hint="Approximate is fine — e.g. next week, or a specific date.">
            <input id="preferredDate" className={fieldInputClass}
              aria-describedby={describedBy("preferredDate", "hint", errors.preferredDate?.message)} {...register("preferredDate")} />
          </FieldShell>
          <FieldShell id="frequency" label="One-off or recurring?" required error={errors.frequency?.message}>
            <NativeSelect id="frequency" placeholder="Select" options={frequencyOptions}
              aria-invalid={!!errors.frequency} {...register("frequency")} />
          </FieldShell>
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 rounded border-marketing-border text-marketing-primary focus:ring-marketing-primary/30" {...register("dateFlexible")} />
            <span className="text-sm text-marketing-text">My preferred date is flexible</span>
          </label>
          <FieldShell id="additionalInstructions" label="Additional instructions" error={errors.additionalInstructions?.message} className="sm:col-span-2">
            <textarea id="additionalInstructions" rows={3} className={fieldInputClass} {...register("additionalInstructions")} />
          </FieldShell>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="sr-only">Consent</legend>
        {consentFields.map((c) => (
          <div key={c.name}>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-1 h-5 w-5 rounded border-marketing-border text-marketing-primary focus:ring-marketing-primary/30"
                aria-invalid={!!errors[c.name]} {...register(c.name)} />
              <span className="text-sm text-marketing-text-secondary">{c.label}</span>
            </label>
            {errors[c.name]?.message && (
              <p className="ml-8 mt-1 text-xs font-medium text-destructive">{errors[c.name]?.message as string}</p>
            )}
          </div>
        ))}
      </fieldset>

      <MarketingButton type="submit" variant="primary" size="lg" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Submitting…
          </>
        ) : (
          "Request a vehicle movement"
        )}
      </MarketingButton>
      <p className="text-xs text-marketing-text-muted">
        Submitting this form does not confirm a booking. Please wait for written confirmation from
        Axentra before making arrangements around the movement.
      </p>
    </form>
  );
}
