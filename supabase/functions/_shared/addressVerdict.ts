// Pure interpretation of a Google Address Validation API response.
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/address-verdict.test.ts) and reused by address-validate.
//
// The check is advisory: UK collections and deliveries often happen at yards,
// units or farms with no street number, so "incomplete" is a warning for the
// admin, never a reason to block saving a job.

export type AddressCheckStatus =
  | "ok"          // Google confirms the address as entered
  | "corrected"   // confirmed, but Google would write it differently
  | "incomplete"  // a key part (e.g. house number) is missing
  | "unconfirmed" // some parts could not be matched to a real place
  | "unavailable"; // Google refused or returned nothing usable

export interface AddressInput {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
}

export interface AddressCheckResult {
  status: AddressCheckStatus;
  message: string;
  missing: string[];
  suggested?: AddressInput;
}

const MISSING_LABELS: Record<string, string> = {
  street_number: "house or building number",
  subpremise: "flat or unit number",
  premise: "building name or number",
  route: "street name",
  postal_code: "postcode",
  locality: "town or city",
  postal_town: "town or city",
};

// Missing components that make an address genuinely unusable for a driver.
const BLOCKING_MISSING = new Set([
  "street_number", "premise", "subpremise", "route", "postal_code", "locality", "postal_town",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function labelList(types: string[]): string[] {
  const out: string[] = [];
  for (const t of types) {
    const label = MISSING_LABELS[t];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function joinHuman(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function assessAddressValidation(json: unknown, input: AddressInput): AddressCheckResult {
  const result = (json as { result?: Record<string, any> } | null)?.result;
  const verdict = result?.verdict;
  const address = result?.address;
  if (!result || !verdict || !address) {
    return { status: "unavailable", message: "Address check unavailable right now.", missing: [] };
  }

  const missingTypes: string[] = Array.isArray(address.missingComponentTypes) ? address.missingComponentTypes : [];
  const unconfirmedTypes: string[] = Array.isArray(address.unconfirmedComponentTypes) ? address.unconfirmedComponentTypes : [];
  const missing = labelList(missingTypes.filter(t => BLOCKING_MISSING.has(t)));

  const pa = address.postalAddress ?? {};
  const lines: string[] = Array.isArray(pa.addressLines) ? pa.addressLines.filter((l: unknown) => typeof l === "string" && l.trim()) : [];
  const suggested: AddressInput | undefined = lines.length || pa.postalCode || pa.locality
    ? {
        line1: lines[0] ?? "",
        line2: lines.slice(1).join(", "),
        city: typeof pa.locality === "string" ? pa.locality : "",
        postcode: typeof pa.postalCode === "string" ? pa.postalCode : "",
      }
    : undefined;

  // Booleans are omitted from the JSON when false, so only `true` means complete.
  if (verdict.addressComplete !== true || missing.length > 0) {
    return {
      status: "incomplete",
      message: missing.length
        ? `Missing ${joinHuman(missing)}. The driver may struggle to find it.`
        : "Google could not confirm this is a complete address.",
      missing,
      suggested,
    };
  }

  if (verdict.hasUnconfirmedComponents === true || unconfirmedTypes.length > 0) {
    const parts = labelList(unconfirmedTypes);
    return {
      status: "unconfirmed",
      message: parts.length
        ? `Could not confirm the ${joinHuman(parts)}. Please double-check it.`
        : "Some parts of this address could not be confirmed. Please double-check it.",
      missing: [],
      suggested,
    };
  }

  const changed = suggested && (
    norm(suggested.line1) !== norm(input.line1) ||
    norm(suggested.city) !== norm(input.city) ||
    norm(suggested.postcode) !== norm(input.postcode) ||
    (norm(suggested.line2) !== norm(input.line2) && norm(input.line2) !== "")
  );
  if (changed) {
    return { status: "corrected", message: "Address confirmed. Google would write it slightly differently.", missing: [], suggested };
  }

  return { status: "ok", message: "Address confirmed.", missing: [], suggested };
}
