/**
 * SQL-first export queries.
 * Org-scoped via RLS (no manual org filter needed — RLS enforces it).
 * Super admins automatically see all orgs.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildCsv, downloadCsv, isoRange } from "./csvWriter";

export interface ExportFilters {
  /** YYYY-MM-DD inclusive */
  dateFrom?: string;
  /** YYYY-MM-DD inclusive */
  dateTo?: string;
  /** Optional status whitelist */
  statuses?: string[];
}

/* ── Jobs ───────────────────────────────────────────────────────── */

const JOB_HEADERS = [
  "Job Number", "Status", "Job Date", "Created At", "Completed At",
  "Vehicle Reg", "Make", "Model", "Colour", "Year",
  "Client Name", "Client Company",
  "Pickup Contact", "Pickup Phone", "Pickup Company", "Pickup Address", "Pickup City", "Pickup Postcode",
  "Delivery Contact", "Delivery Phone", "Delivery Company", "Delivery Address", "Delivery City", "Delivery Postcode",
  "Driver Name", "Distance (mi)", "Rate /mi", "Total Price",
  "Has Pickup Inspection", "Has Delivery Inspection",
];

export async function fetchJobsForExport(filters: ExportFilters) {
  let q = supabase.from("jobs").select("*").eq("is_hidden", false);
  const { from, to } = isoRange(filters.dateFrom, filters.dateTo);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  if (filters.statuses?.length) q = q.in("status", filters.statuses);
  q = q.order("created_at", { ascending: false }).limit(10000);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function exportJobsCsvSql(filters: ExportFilters): Promise<number> {
  const jobs = await fetchJobsForExport(filters);
  const rows = jobs.map((j: any) => [
    j.external_job_number, j.status, j.job_date, j.created_at, j.completed_at,
    j.vehicle_reg, j.vehicle_make, j.vehicle_model, j.vehicle_colour, j.vehicle_year,
    j.client_name, j.client_company,
    j.pickup_contact_name, j.pickup_contact_phone, j.pickup_company, j.pickup_address_line1, j.pickup_city, j.pickup_postcode,
    j.delivery_contact_name, j.delivery_contact_phone, j.delivery_company, j.delivery_address_line1, j.delivery_city, j.delivery_postcode,
    j.driver_name, j.distance_miles, j.rate_per_mile, j.total_price,
    j.has_pickup_inspection, j.has_delivery_inspection,
  ]);
  downloadCsv(buildCsv(JOB_HEADERS, rows), `axentra-jobs-${new Date().toISOString().slice(0, 10)}.csv`);
  return jobs.length;
}

/* ── Inspections ────────────────────────────────────────────────── */

const INSPECTION_HEADERS = [
  "Inspection ID", "Job ID", "Type", "Inspected At", "Inspected By",
  "Customer Name", "Odometer", "Fuel %", "Vehicle Condition", "Has Damage", "Notes",
];

export async function exportInspectionsCsvSql(filters: ExportFilters): Promise<number> {
  let q = supabase.from("inspections").select("*");
  const { from, to } = isoRange(filters.dateFrom, filters.dateTo);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  q = q.order("created_at", { ascending: false }).limit(10000);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((i: any) => [
    i.id, i.job_id, i.type, i.inspected_at, i.inspected_by_name,
    i.customer_name, i.odometer, i.fuel_level_percent, i.vehicle_condition, i.has_damage, i.notes,
  ]);
  downloadCsv(buildCsv(INSPECTION_HEADERS, rows), `axentra-inspections-${new Date().toISOString().slice(0, 10)}.csv`);
  return rows.length;
}

/* ── Expenses ───────────────────────────────────────────────────── */

const EXPENSE_HEADERS = [
  "Expense ID", "Job ID", "Date", "Time", "Category", "Label",
  "Amount", "Currency", "Notes", "Driver ID", "Billable on POD",
];

export async function exportExpensesCsvSql(filters: ExportFilters): Promise<number> {
  let q = supabase.from("expenses").select("*").eq("is_hidden", false);
  const { from, to } = isoRange(filters.dateFrom, filters.dateTo);
  if (from) q = q.gte("date", filters.dateFrom!);
  if (to) q = q.lte("date", filters.dateTo!);
  q = q.order("date", { ascending: false }).limit(10000);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((e: any) => [
    e.id, e.job_id, e.date, e.time, e.category, e.label,
    e.amount, e.currency, e.notes, e.driver_id, e.billable_on_pod,
  ]);
  downloadCsv(buildCsv(EXPENSE_HEADERS, rows), `axentra-expenses-${new Date().toISOString().slice(0, 10)}.csv`);
  return rows.length;
}
