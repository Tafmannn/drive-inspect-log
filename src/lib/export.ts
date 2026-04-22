import { supabase } from '@/integrations/supabase/client';
import type { Job, Inspection } from './types';

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(values: (string | null | undefined)[]): string {
  return values.map(escapeCsv).join(',');
}

function downloadCsv(content: string, filename: string) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportJobsCsv(): Promise<void> {
  const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const jobs = (data ?? []) as Job[];

  const headers = [
    'Job Number', 'Registration', 'Make', 'Model', 'Colour', 'Year', 'Status',
    'Pickup Contact', 'Pickup Phone', 'Pickup Company', 'Pickup Address', 'Pickup City', 'Pickup Postcode',
    'Delivery Contact', 'Delivery Phone', 'Delivery Company', 'Delivery Address', 'Delivery City', 'Delivery Postcode',
    'Has Pickup Inspection', 'Has Delivery Inspection', 'Completed At', 'Created At',
  ];

  const rows = jobs.map((j) => toCsvRow([
    j.external_job_number, j.vehicle_reg, j.vehicle_make, j.vehicle_model, j.vehicle_colour, j.vehicle_year, j.status,
    j.pickup_contact_name, j.pickup_contact_phone, j.pickup_company, j.pickup_address_line1, j.pickup_city, j.pickup_postcode,
    j.delivery_contact_name, j.delivery_contact_phone, j.delivery_company, j.delivery_address_line1, j.delivery_city, j.delivery_postcode,
    String(j.has_pickup_inspection), String(j.has_delivery_inspection), j.completed_at, j.created_at,
  ]));

  downloadCsv([headers.join(','), ...rows].join('\n'), 'axentra-jobs.csv');
}

export async function exportInspectionsCsv(): Promise<void> {
  const { data: jobs, error: jErr } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
  if (jErr) throw jErr;
  // Active inspections only — archived rows belong to prior runs of reopened jobs.
  const { data: inspections, error: iErr } = await (supabase.from('inspections').select('*') as any).is('archived_at', null);
  if (iErr) throw iErr;

  const headers = [
    'Job Number', 'Registration', 'Inspection Type', 'Odometer', 'Fuel %',
    'Condition', 'Driver Name', 'Customer Name', 'Has Damage', 'Inspected At',
  ];

  const rows: string[] = [];
  for (const insp of (inspections ?? []) as Inspection[]) {
    const job = (jobs ?? []).find((j: any) => j.id === insp.job_id);
    rows.push(toCsvRow([
      job?.external_job_number ?? '', job?.vehicle_reg ?? '', insp.type,
      insp.odometer != null ? String(insp.odometer) : '',
      insp.fuel_level_percent != null ? String(insp.fuel_level_percent) : '',
      insp.vehicle_condition, insp.inspected_by_name, insp.customer_name,
      String(insp.has_damage), insp.inspected_at,
    ]));
  }

  downloadCsv([headers.join(','), ...rows].join('\n'), 'axentra-inspections.csv');
}

// NOTE: These CSVs can be directly imported into Google Sheets via File → Import.
// For future Sheets API integration, the same data structure can be used with
// the Google Sheets API v4 spreadsheets.values.append method.
