/**
 * Client-portal data layer. Every read goes through a portal_* database
 * function (see supabase/migrations/*_client_portal.sql) — portal users have
 * no direct table access — or the portal-evidence edge function for signed
 * photo/signature URLs.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalContext {
  client: { id: string; name: string };
  operator: {
    name: string;
    logo_url: string | null;
    primary_colour: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  };
}

export interface PortalJobSummary {
  id: string;
  job_ref: string;
  vehicle_reg: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_colour: string | null;
  pickup_city: string | null;
  pickup_postcode: string | null;
  delivery_city: string | null;
  delivery_postcode: string | null;
  job_date: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface PortalDamageItem {
  area: string | null;
  location: string | null;
  item: string | null;
  damage_types: string[] | null;
  notes: string | null;
}

export interface PortalInspection {
  type: "pickup" | "delivery" | string;
  inspected_at: string | null;
  odometer: number | null;
  fuel_level_percent: number | null;
  number_of_keys: string | null;
  customer_name: string | null;
  inspected_by_name: string | null;
  notes: string | null;
  has_damage: boolean | null;
  damage: PortalDamageItem[];
}

export interface PortalJobDetail {
  job: PortalJobSummary & {
    vehicle_year: string | null;
    pickup_address_line1: string | null;
    pickup_address_line2: string | null;
    pickup_contact_name: string | null;
    delivery_address_line1: string | null;
    delivery_address_line2: string | null;
    delivery_contact_name: string | null;
    earliest_delivery_date: string | null;
  };
  timeline: { status: string; at: string }[];
  inspections: PortalInspection[];
}

export interface PortalEvidence {
  photos: { id: string; type: string; label: string | null; inspection_type: string | null; url: string }[];
  signatures: { inspection_type: string; signer: "driver" | "customer"; url: string }[];
  unavailable: number;
}

export interface PortalInvoiceSummary {
  id: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  sent_at: string;
  /** 'sent' | 'paid' | 'cancelled'. Absent until the lifecycle migration is applied. */
  status?: string | null;
  /** 'invoice' | 'credit_note' */
  document_type?: string | null;
  paid_at?: string | null;
}

export interface PortalInvoiceDetail extends PortalInvoiceSummary {
  client_ref?: string | null;
  vat_registered?: boolean | null;
  /** Storage path of the PDF frozen when the invoice was issued. */
  pdf_path?: string | null;
  credits_invoice_number?: string | null;
  payment_terms: string | null;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_address: string | null;
  notes: string | null;
  vat_rate: number | null;
  job_ref: string | null;
  vehicle_reg: string | null;
  items: { description: string; quantity: number; unit_price: number; amount: number }[];
  line_items: unknown;
  operator: {
    name: string;
    legal_name: string | null;
    logo_url: string | null;
    registered_address: string | null;
    vat_number: string | null;
    company_number: string | null;
  };
}

// The portal_* functions aren't in the generated Database types.
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as {
    rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>;
  }).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export function usePortalContext() {
  return useQuery({
    queryKey: ["portal", "context"],
    queryFn: () => rpc<PortalContext>("portal_context"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePortalJobs() {
  return useQuery({
    queryKey: ["portal", "jobs"],
    queryFn: () => rpc<PortalJobSummary[]>("portal_list_jobs"),
    staleTime: 30_000,
  });
}

export function usePortalJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "job", jobId],
    queryFn: () => rpc<PortalJobDetail>("portal_get_job", { p_job_id: jobId }),
    enabled: !!jobId,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePortalEvidence(jobId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["portal", "evidence", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("portal-evidence", { body: { jobId } });
      if (error) throw new Error(error.message);
      return data as PortalEvidence;
    },
    enabled: !!jobId && enabled,
    // Signed URLs live for an hour; refresh well before they expire.
    staleTime: 30 * 60_000,
    retry: 1,
  });
}

export function usePortalInvoices() {
  return useQuery({
    queryKey: ["portal", "invoices"],
    queryFn: () => rpc<PortalInvoiceSummary[]>("portal_list_invoices"),
    staleTime: 60_000,
  });
}

export function usePortalInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "invoice", invoiceId],
    queryFn: () => rpc<PortalInvoiceDetail>("portal_get_invoice", { p_invoice_id: invoiceId }),
    enabled: !!invoiceId,
    staleTime: 60_000,
    retry: false,
  });
}
