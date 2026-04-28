/**
 * Onboarding completion scoring.
 *
 * Mirrors the required-field gates inside the wizards so that lists
 * and detail pages can show "X% complete" badges without reloading
 * the wizard. Pure functions — safe to call from React Query selectors.
 */

export type CompletionResult = {
  pct: number;          // 0..100
  missing: string[];    // human-friendly labels of missing fields
  status: "complete" | "in_progress" | "draft";
};

const score = (parts: Array<[boolean, string]>): CompletionResult => {
  const total = parts.length || 1;
  const filled = parts.filter(([ok]) => ok).length;
  const pct = Math.round((filled / total) * 100);
  const missing = parts.filter(([ok]) => !ok).map(([, label]) => label);
  const status: CompletionResult["status"] =
    pct >= 100 ? "complete" : pct >= 40 ? "in_progress" : "draft";
  return { pct, missing, status };
};

/* ─── Driver ───────────────────────────────────────────────────── */

export type DriverCompletionInput = {
  full_name?: string | null;
  phone?: string | null;
  licence_number?: string | null;
  licence_expiry?: string | null;
  right_to_work?: string | null;
  home_postcode?: string | null;
  payout_terms?: string | null;
  bank_captured?: boolean | null;
  trade_plate_number?: string | null;
};

export function scoreDriver(d: DriverCompletionInput | null | undefined): CompletionResult {
  if (!d) return { pct: 0, missing: ["Profile not started"], status: "draft" };
  return score([
    [!!d.full_name?.trim(), "Full name"],
    [!!d.phone?.trim(), "Mobile"],
    [!!d.licence_number?.trim(), "Licence number"],
    [!!d.licence_expiry, "Licence expiry"],
    [!!d.right_to_work?.trim(), "Right to work"],
    [!!d.trade_plate_number?.trim(), "Trade plate"],
    [!!d.home_postcode?.trim(), "Home postcode"],
    [!!d.payout_terms?.trim(), "Payout terms"],
    [!!d.bank_captured, "Bank details captured"],
  ]);
}

/* ─── Client ───────────────────────────────────────────────────── */

export type ClientCompletionInput = {
  name?: string | null;
  company?: string | null;
  client_type?: string | null;
  billing_email?: string | null;
  billing_address?: string | null;
  payment_terms?: string | null;
  rate_type?: string | null;
  rate_value?: number | null;
  contact_name?: string | null;
};

export function scoreClient(c: ClientCompletionInput | null | undefined): CompletionResult {
  if (!c) return { pct: 0, missing: ["Profile not started"], status: "draft" };
  return score([
    [!!(c.company?.trim() || c.name?.trim()), "Company name"],
    [!!c.client_type?.trim(), "Client type"],
    [!!c.billing_email?.trim(), "Billing email"],
    [!!c.billing_address?.trim(), "Billing address"],
    [!!c.payment_terms?.trim(), "Payment terms"],
    [!!c.rate_type?.trim(), "Rate type"],
    [c.rate_value != null, "Rate value"],
    [!!c.contact_name?.trim(), "Primary contact"],
  ]);
}

/* ─── Organisation ─────────────────────────────────────────────── */

export type OrgCompletionInput = {
  name?: string | null;
  legal_name?: string | null;
  company_number?: string | null;
  vat_number?: string | null;
  registered_address?: string | null;
  main_contact_name?: string | null;
  main_contact_email?: string | null;
  main_contact_phone?: string | null;
  logo_url?: string | null;
  primary_colour?: string | null;
  billing_plan?: string | null;
};

export function scoreOrg(o: OrgCompletionInput | null | undefined): CompletionResult {
  if (!o) return { pct: 0, missing: ["Profile not started"], status: "draft" };
  return score([
    [!!o.name?.trim(), "Organisation name"],
    [!!o.legal_name?.trim(), "Legal name"],
    [!!o.company_number?.trim(), "Company number"],
    [!!o.registered_address?.trim(), "Registered address"],
    [!!o.main_contact_name?.trim(), "Main contact name"],
    [!!o.main_contact_email?.trim(), "Main contact email"],
    [!!o.main_contact_phone?.trim(), "Main contact phone"],
    [!!o.logo_url?.trim(), "Logo"],
    [!!o.primary_colour?.trim(), "Brand colour"],
    [!!o.billing_plan?.trim(), "Billing plan"],
  ]);
}

/* ─── Shared display helpers ───────────────────────────────────── */

export function completionToneClasses(status: CompletionResult["status"]): string {
  switch (status) {
    case "complete": return "border-success/30 bg-success/10 text-success";
    case "in_progress": return "border-warning/30 bg-warning/10 text-warning";
    case "draft":
    default: return "border-destructive/30 bg-destructive/10 text-destructive";
  }
}
