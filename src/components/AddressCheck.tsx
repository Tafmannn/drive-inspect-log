import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { validateAddress, type AddressCheckResult } from "@/lib/addressValidateApi";

interface Props {
  /** The job form. Its address inputs are uncontrolled, so we read and write them by name. */
  formRef: RefObject<HTMLFormElement | null>;
  side: "pickup" | "delivery";
}

function readField(form: HTMLFormElement, side: string, field: string): string {
  const el = form.elements.namedItem(`${side}_${field}`) as HTMLInputElement | null;
  return el?.value?.trim() ?? "";
}

function writeField(form: HTMLFormElement, side: string, field: string, value: string) {
  const el = form.elements.namedItem(`${side}_${field}`) as HTMLInputElement | null;
  if (!el) return;
  // Use the native setter so React-attached listeners (e.g. the postcode
  // route estimate) see the change.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * "Check address" button + advisory result. Warns only — never blocks saving.
 */
export function AddressCheck({ formRef, side }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AddressCheckResult | null>(null);

  const run = async () => {
    const form = formRef.current;
    if (!form) return;
    setLoading(true);
    try {
      setResult(
        await validateAddress({
          line1: readField(form, side, "address_line1"),
          line2: readField(form, side, "address_line2"),
          city: readField(form, side, "city"),
          postcode: readField(form, side, "postcode"),
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const useSuggested = () => {
    const form = formRef.current;
    const s = result?.suggested;
    if (!form || !s) return;
    writeField(form, side, "address_line1", s.line1);
    writeField(form, side, "address_line2", s.line2);
    writeField(form, side, "city", s.city);
    writeField(form, side, "postcode", s.postcode);
    setResult({ status: "ok", message: "Address updated.", missing: [] });
  };

  const warn = result && (result.status === "incomplete" || result.status === "unconfirmed");
  const good = result && (result.status === "ok" || result.status === "corrected");
  const canApply =
    !!result?.suggested &&
    (result.status === "corrected" || result.status === "incomplete" || result.status === "unconfirmed") &&
    !!(result.suggested.line1 || result.suggested.postcode);

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={loading}
        onClick={run}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
        Check Address
      </Button>

      {result && result.status === "unavailable" && (
        <p className="text-xs text-muted-foreground">{result.message}</p>
      )}

      {(warn || good) && result && (
        <div
          role="status"
          className={
            warn
              ? "rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
              : "rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
          }
        >
          <p className="flex items-start gap-1.5">
            {warn && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-px" />}
            <span>{result.message}</span>
          </p>
          {canApply && result.suggested && (
            <div className="mt-1.5 space-y-1">
              <p className="text-muted-foreground">
                Suggested: {[result.suggested.line1, result.suggested.line2, result.suggested.city, result.suggested.postcode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={useSuggested}>
                Use suggested
              </Button>
            </div>
          )}
          {warn && <p className="mt-1 text-muted-foreground">You can still save the job as entered.</p>}
        </div>
      )}
    </div>
  );
}
