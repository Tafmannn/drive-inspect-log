import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodFormResolver } from "../lib/zodFormResolver";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingButton } from "./MarketingButton";
import { FieldShell } from "./FormControls";
import { describedBy, fieldInputClass } from "./formHelpers";
import {
  driverApplicationSchema,
  type DriverApplicationValues,
} from "../lib/marketingSchema";
import { submitDriverApplication } from "../lib/submitDriverApplication";
import { useMarketingAnalytics } from "../hooks/useMarketingAnalytics";

const consentFields: { name: keyof DriverApplicationValues; label: string }[] = [
  { name: "licenceHeld", label: "I hold a full, valid driving licence and appropriate right to work." },
  { name: "hasSmartphone", label: "I have a smartphone capable of completing digital inspections." },
  { name: "consentContact", label: "I agree to Axentra using these details to respond to my application." },
  { name: "consentPrivacy", label: "I have read the privacy policy." },
];

export function DriverApplicationForm() {
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
  } = useForm<DriverApplicationValues>({
    resolver: zodFormResolver(driverApplicationSchema),
    defaultValues: {
      companyWebsite: "",
      licenceHeld: false,
      hasSmartphone: false,
      consentContact: false,
      consentPrivacy: false,
    },
  });

  const markStarted = () => {
    if (!startedRef.current) {
      startedRef.current = true;
      track("driver_application_started");
    }
  };

  const onSubmit = async (values: DriverApplicationValues) => {
    setResult({ status: "submitting" });
    const res = await submitDriverApplication(values, idempotencyKey.current);
    if (res.ok && res.reference) {
      track("driver_application_submitted");
      setResult({ status: "success", reference: res.reference });
      return;
    }
    track("driver_application_submission_failed", { reason: res.reason ?? "server" });
    idempotencyKey.current = crypto.randomUUID();
    setResult({
      status: "error",
      message:
        "We could not submit your application at the moment. Please try again or contact Axentra using the details on this page.",
    });
  };

  if (result.status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-marketing-success/30 bg-marketing-success/10 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-marketing-success" aria-hidden="true" />
        <h3 className="mt-4 font-heading text-xl font-semibold text-marketing-text">
          Thank you for your interest in driving with Axentra
        </h3>
        <p className="mt-2 text-marketing-text-secondary">
          Reference: <span className="font-mono font-semibold text-marketing-text">{result.reference}</span>
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-marketing-text-secondary">
          Your application has been received for review. Submission does not guarantee approval or
          access to work.
        </p>
      </div>
    );
  }

  const submitting = result.status === "submitting";

  return (
    <form noValidate onChange={markStarted} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="driver-companyWebsite">Company website</label>
        <input id="driver-companyWebsite" tabIndex={-1} autoComplete="off" {...register("companyWebsite")} />
      </div>

      {result.status === "error" && (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm text-marketing-text">{result.message}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell id="d-fullName" label="Full name" required error={errors.fullName?.message}>
          <input id="d-fullName" autoComplete="name" className={fieldInputClass}
            aria-invalid={!!errors.fullName} {...register("fullName")} />
        </FieldShell>
        <FieldShell id="d-postcode" label="Home postcode" required error={errors.postcode?.message}>
          <input id="d-postcode" autoComplete="postal-code" className={cn(fieldInputClass, "uppercase")}
            aria-invalid={!!errors.postcode} {...register("postcode")} />
        </FieldShell>
        <FieldShell id="d-email" label="Email" required error={errors.email?.message}>
          <input id="d-email" type="email" inputMode="email" autoComplete="email" className={fieldInputClass}
            aria-invalid={!!errors.email} {...register("email")} />
        </FieldShell>
        <FieldShell id="d-telephone" label="Telephone" required error={errors.telephone?.message}>
          <input id="d-telephone" type="tel" inputMode="tel" autoComplete="tel" className={fieldInputClass}
            aria-invalid={!!errors.telephone} {...register("telephone")} />
        </FieldShell>
        <FieldShell id="d-years" label="Years driving" error={errors.yearsDriving?.message}>
          <input id="d-years" inputMode="numeric" className={fieldInputClass} {...register("yearsDriving")} />
        </FieldShell>
        <FieldShell id="d-availability" label="Availability" error={errors.availability?.message}
          hint="e.g. weekdays, weekends, flexible">
          <input id="d-availability" className={fieldInputClass}
            aria-describedby={describedBy("d-availability", "hint", errors.availability?.message)} {...register("availability")} />
        </FieldShell>
        <FieldShell id="d-experience" label="Vehicle movement experience" error={errors.experience?.message} className="sm:col-span-2"
          hint="Briefly describe relevant experience and sectors (dealership, auction, rental, leasing).">
          <textarea id="d-experience" rows={4} className={fieldInputClass}
            aria-describedby={describedBy("d-experience", "hint", errors.experience?.message)} {...register("experience")} />
        </FieldShell>
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">Confirmations</legend>
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
          "Apply to drive with Axentra"
        )}
      </MarketingButton>
      <p className="text-xs text-marketing-text-muted">
        Applying registers your interest. It does not guarantee approval, work or specific earnings.
      </p>
    </form>
  );
}
