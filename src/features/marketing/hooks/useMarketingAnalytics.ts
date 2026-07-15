import { useCallback } from "react";

/**
 * Provider-agnostic, privacy-safe marketing analytics.
 *
 * This is a typed NO-OP abstraction by default: it only forwards events to a
 * globally-registered sink (`window.__axentraAnalytics`) if the deployment has
 * installed one. Nothing is sent otherwise. It NEVER captures PII — event
 * payloads are restricted to a small set of non-identifying string/number
 * properties, so vehicle registrations, names, emails, phone numbers, addresses
 * and free text must never be passed in.
 */
export type MarketingEvent =
  | "marketing_cta_clicked"
  | "movement_form_started"
  | "movement_form_validation_failed"
  | "movement_form_submitted"
  | "movement_form_submission_failed"
  | "driver_application_started"
  | "driver_application_submitted"
  | "driver_application_submission_failed"
  | "login_clicked_from_marketing"
  | "service_viewed"
  | "phone_contact_clicked"
  | "email_contact_clicked";

/** Only non-identifying primitives are allowed. */
export type MarketingEventProps = Record<string, string | number | boolean>;

type AnalyticsSink = (event: MarketingEvent, props?: MarketingEventProps) => void;

declare global {
  interface Window {
    __axentraAnalytics?: AnalyticsSink;
  }
}

export function useMarketingAnalytics() {
  const track = useCallback((event: MarketingEvent, props?: MarketingEventProps) => {
    if (typeof window === "undefined") return;
    const sink = window.__axentraAnalytics;
    if (typeof sink === "function") {
      try {
        sink(event, props);
      } catch {
        /* analytics must never break the UI */
      }
    }
  }, []);

  return { track };
}
