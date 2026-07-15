import { supabase } from "@/integrations/supabase/client";
import type { DriverApplicationValues } from "./marketingSchema";
import type { SubmitResult } from "./submitMovementRequest";

/**
 * Client abstraction for submitting a driver application. Calls the
 * `submit-driver-application` Supabase Edge Function. Interest only — the public
 * form never collects high-risk identity documents.
 */
export async function submitDriverApplication(
  values: DriverApplicationValues,
  idempotencyKey: string,
): Promise<SubmitResult> {
  try {
    const { data, error } = await supabase.functions.invoke("submit-driver-application", {
      body: { ...values, idempotencyKey },
    });

    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 429) return { ok: false, reason: "rate_limited" };
      if (status === 400 || status === 422) return { ok: false, reason: "validation" };
      return { ok: false, reason: "server" };
    }

    const reference = (data as { reference?: string } | null)?.reference;
    if (typeof reference === "string" && reference.length > 0) {
      return { ok: true, reference };
    }
    return { ok: false, reason: "server" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
