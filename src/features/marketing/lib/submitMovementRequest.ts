import { supabase } from "@/integrations/supabase/client";
import type { MovementRequestValues } from "./marketingSchema";

// Single shape rather than a discriminated union: this repo compiles with
// strictNullChecks:false, under which boolean-discriminant narrowing (`if
// (res.ok)`) is unreliable. Optional fields sidestep that entirely.
export type SubmitFailureReason = "rate_limited" | "validation" | "server" | "network";
export interface SubmitResult {
  ok: boolean;
  reference?: string;
  reason?: SubmitFailureReason;
}

/**
 * Client abstraction for submitting a movement request. Calls the
 * `submit-movement-request` Supabase Edge Function, which validates server-side,
 * persists the enquiry and sends emails. Secrets never touch the browser.
 *
 * `idempotencyKey` lets the server dedupe accidental double-submits.
 */
export async function submitMovementRequest(
  values: MovementRequestValues,
  idempotencyKey: string,
): Promise<SubmitResult> {
  try {
    const { data, error } = await supabase.functions.invoke("submit-movement-request", {
      body: { ...values, idempotencyKey },
    });

    if (error) {
      // Supabase surfaces non-2xx as FunctionsHttpError; map the status if present.
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
