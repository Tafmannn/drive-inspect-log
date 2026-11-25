import type { VehicleLookupResult } from "./vehicleLookupApi";

export const normalizeRegistration = (value: string) => value.replace(/\s+/g, "").toUpperCase();
export const ukDate = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).filter(p => ["year","month","day"].includes(p.type)).reduce<Record<string,string>>((a,p) => ({ ...a, [p.type]: p.value }), {});
export function todayInUk(now = new Date()) {
  const p = ukDate(now);
  return `${p.year}-${p.month}-${p.day}`;
}
function dateOnly(value?: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value ? value : null;
}
export type ComplianceSeverity = "stop" | "review" | "info";
export type ComplianceNotice = { severity: ComplianceSeverity; message: string };

export function complianceNotices(result: VehicleLookupResult | null, registration: string, earliestDelivery?: string | null, now = new Date()): ComplianceNotice[] {
  if (!result?.success || !result.registration || normalizeRegistration(result.registration) !== normalizeRegistration(registration)) {
    return [{ severity: "review", message: "DVLA status unverified. Confirm MOT or exemption and taxation/trade plate eligibility before driving." }];
  }
  const notices: ComplianceNotice[] = [];
  const today = todayInUk(now);
  const expiry = dateOnly(result.motExpiryDate);
  const earliest = dateOnly(earliestDelivery);
  const mot = result.motStatus?.trim().toLowerCase();
  const tax = result.taxStatus?.trim().toLowerCase();
  if (result.markedAsScrapped === true) notices.push({ severity: "stop", message: "Scrapped marker reported. Do not drive; contact admin." });
  if (result.markedForExport === true) notices.push({ severity: "review", message: "Export marker reported. Confirm UK road-use eligibility with admin." });
  notices.push(...motNotices(mot, expiry, earliest, today), ...taxNotices(tax, result.taxDueDate, today));
  if (!result.checkedAt || !Number.isFinite(Date.parse(result.checkedAt)) || Date.parse(result.checkedAt) > now.getTime() + 60000 || now.getTime() - Date.parse(result.checkedAt) > 86400000) notices.push({ severity: "review", message: "Check timestamp missing or stale. Refresh before relying on these details." });
  if (!notices.length) notices.push({ severity: "info", message: "No MOT or tax warning identified from this response. This is not roadworthiness, insurance or legal clearance." });
  return notices;
}

function motNotices(mot: string | undefined, expiry: string | null, earliest: string | null, today: string): ComplianceNotice[] {
  const notices: ComplianceNotice[] = [];
  if (mot === "not valid" || (expiry && expiry < today)) {
    notices.push({ severity: "stop", message: "MOT not valid or expired. Do not begin normal road movement; contact admin to verify any lawful exemption." });
  } else if (mot !== "valid" || !expiry) {
    notices.push({ severity: "review", message: "MOT or expiry unverified. Confirm a valid MOT or lawful exemption before driving." });
  } else if (earliest && expiry < earliest) {
    notices.push({ severity: "stop", message: "MOT expires before the earliest permitted delivery date. Resolve before dispatch." });
  } else if ((Date.parse(expiry) - Date.parse(today)) / 86400000 <= 7) {
    notices.push({ severity: "review", message: "MOT expires within seven days. Verify it covers the full journey." });
  }
  return notices;
}
function taxNotices(tax: string | undefined, taxDueDate: string | null | undefined, today: string): ComplianceNotice[] {
  const notices: ComplianceNotice[] = [];
  if (tax === "untaxed" || tax === "not taxed for on road use") notices.push({ severity: "review", message: "Untaxed: verify authorised trade plate use before driving." });
  else if (tax === "sorn") notices.push({ severity: "review", message: "SORN: confirm lawful road use and trade plate eligibility with admin." });
  else if (tax !== "taxed") notices.push({ severity: "review", message: "Tax status unverified. Confirm lawful taxation or trade plate use." });
  else if (dateOnly(taxDueDate) && dateOnly(taxDueDate)! <= today) notices.push({ severity: "review", message: "Tax due date reached. Recheck current status before driving." });
  return notices;
}
