import { supabase } from '@/integrations/supabase/client';
import { getOrgId } from './orgHelper';

export const EXPENSE_CATEGORIES = [
  'Fuel',
  'Tolls',
  'Parking',
  'Congestion/ULEZ/CAZ',
  'Car Wash / Valet',
  'Maintenance / Tyres',
  'Accommodation',
  'Food & Drink',
  'Public Transport',
  'Misc / Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const POD_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Fuel',
  'Tolls',
  'Parking',
  'Congestion/ULEZ/CAZ',
  'Car Wash / Valet',
  'Maintenance / Tyres',
  'Accommodation',
  'Food & Drink',
  'Public Transport',
];

export interface Expense {
  id: string;
  job_id: string;
  date: string;
  time: string | null;
  amount: number;
  currency: string;
  category: string;
  label: string | null;
  notes: string | null;
  driver_id: string | null;
  billable_on_pod: boolean;
  created_at: string;
  updated_at: string;
}

interface ExpenseReceipt {
  id: string;
  expense_id: string;
  url: string;
  thumbnail_url: string | null;
  backend: string;
  backend_ref: string | null;
  created_at: string;
}

export interface ExpenseWithReceipts extends Expense {
  receipts: ExpenseReceipt[];
}

export interface ExpenseWithJob extends Expense {
  receipts: ExpenseReceipt[];
  job_reg?: string;
  job_number?: string;
}

// ─── Queries ──────────────────────────────────────────────────────────

export async function listExpenses(filters?: {
  jobId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExpenseWithJob[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('is_hidden', false)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.jobId) query = query.eq('job_id', filters.jobId);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.dateFrom) query = query.gte('date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('date', filters.dateTo);

  const { data, error } = await query;
  if (error) throw error;

  const expenses = (data ?? []) as Expense[];
  const expenseIds = expenses.map(e => e.id);
  let receipts: ExpenseReceipt[] = [];
  if (expenseIds.length > 0) {
    const { data: rData, error: rErr } = await supabase
      .from('expense_receipts')
      .select('*')
      .in('expense_id', expenseIds);
    if (rErr) throw rErr;
    receipts = (rData ?? []) as ExpenseReceipt[];
  }

  const jobIds = [...new Set(expenses.map(e => e.job_id))];
  let jobMap: Record<string, { reg: string; num: string }> = {};
  if (jobIds.length > 0) {
    const { data: jobs, error: jErr } = await supabase
      .from('jobs')
      .select('id, vehicle_reg, external_job_number')
      .in('id', jobIds);
    if (jErr) throw jErr;
    for (const j of jobs ?? []) {
      jobMap[j.id] = { reg: j.vehicle_reg, num: j.external_job_number || '' };
    }
  }

  return expenses.map(e => ({
    ...e,
    receipts: receipts.filter(r => r.expense_id === e.id),
    job_reg: jobMap[e.job_id]?.reg,
    job_number: jobMap[e.job_id]?.num,
  }));
}

export async function getExpensesForJob(jobId: string): Promise<ExpenseWithReceipts[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('job_id', jobId)
    .order('date', { ascending: false });
  if (error) throw error;
  const expenses = (data ?? []) as Expense[];

  const expenseIds = expenses.map(e => e.id);
  let receipts: ExpenseReceipt[] = [];
  if (expenseIds.length > 0) {
    const { data: rData, error: rErr } = await supabase
      .from('expense_receipts')
      .select('*')
      .in('expense_id', expenseIds);
    if (rErr) throw rErr;
    receipts = (rData ?? []) as ExpenseReceipt[];
  }

  return expenses.map(e => ({
    ...e,
    receipts: receipts.filter(r => r.expense_id === e.id),
  }));
}

// ─── Create / Update ─────────────────────────────────────────────────

export async function createExpense(input: {
  job_id: string;
  date: string;
  time?: string | null;
  amount: number;
  currency?: string;
  category: string;
  label?: string | null;
  notes?: string | null;
  driver_id?: string | null;
}): Promise<Expense> {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      job_id: input.job_id,
      date: input.date,
      time: input.time ?? null,
      amount: input.amount,
      currency: input.currency ?? 'GBP',
      category: input.category,
      label: input.label ?? null,
      notes: input.notes ?? null,
      driver_id: input.driver_id ?? null,
      org_id: orgId,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function updateExpense(input: {
  id: string;
  date?: string;
  time?: string | null;
  amount?: number;
  currency?: string;
  category?: string;
  label?: string | null;
  notes?: string | null;
}): Promise<Expense> {
  const { id, ...fields } = input;
  const { data, error } = await supabase
    .from('expenses')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

// ─── Delete ──────────────────────────────────────────────────────────

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteReceipt(id: string): Promise<void> {
  const { error } = await supabase.from('expense_receipts').delete().eq('id', id);
  if (error) throw error;
}

// ─── Receipts ────────────────────────────────────────────────────────

export async function uploadReceipt(expenseId: string, file: File): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${expenseId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('expense-receipts').upload(path, file);
  if (uploadErr) throw new Error(`Receipt upload failed: ${uploadErr.message}`);

  // Bucket is private — build a signed or authenticated URL
  const { data: signedData, error: signErr } = await supabase.storage
    .from('expense-receipts')
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
  const url = signedData?.signedUrl;
  if (signErr || !url) throw new Error('Failed to generate receipt URL');

  const { error: insertErr } = await supabase.from('expense_receipts').insert({
    expense_id: expenseId,
    url,
    backend: 'supabase',
    backend_ref: path,
  });
  if (insertErr) throw new Error(`Receipt record failed: ${insertErr.message}`);
}

// ─── Totals ──────────────────────────────────────────────────────────

export async function getExpenseTotals() {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, date');
  if (error) throw error;

  const rows = data ?? [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  let today = 0, thisWeek = 0, thisMonth = 0, total = 0;
  for (const row of rows) {
    const amt = Number(row.amount) || 0;
    total += amt;
    if (row.date >= todayStr) today += amt;
    if (row.date >= weekStr) thisWeek += amt;
    if (row.date >= monthStart) thisMonth += amt;
  }

  return { total, count: rows.length, today, thisWeek, thisMonth };
}

// ─── CSV Export ──────────────────────────────────────────────────────

export async function exportExpensesCsv(): Promise<void> {
  const expenses = await listExpenses();
  const headers = [
    "Job Number", "Registration", "Date", "Time", "Category",
    "Label", "Amount", "Currency", "Notes", "Driver", "Receipts",
  ];

  function esc(v: string | null | undefined) {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  const rows = expenses.map((e) =>
    [
      esc(e.job_number), esc(e.job_reg), esc(e.date), esc(e.time),
      esc(e.category), esc(e.label), String(e.amount), esc(e.currency),
      esc(e.notes), esc(e.driver_id), String(e.receipts.length),
    ].join(","),
  );

  const BOM = "\uFEFF";
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "axentra-expenses.csv";
  a.click();
  URL.revokeObjectURL(url);
}
