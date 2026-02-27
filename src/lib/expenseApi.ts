import { supabase } from '@/integrations/supabase/client';

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

/** Categories that appear on the POD as billable client expenses */
export const BILLABLE_CATEGORIES: ExpenseCategory[] = [
  'Fuel',
  'Tolls',
  'Congestion/ULEZ/CAZ',
  'Car Wash / Valet',
];

export function isBillableCategory(category: string): boolean {
  return BILLABLE_CATEGORIES.includes(category as ExpenseCategory);
}

export interface Expense {
  id: string;
  job_id: string;
  driver_id: string | null;
  date: string;
  time: string | null;
  amount: number;
  currency: string;
  category: string;
  label: string | null;
  notes: string | null;
  upload_status: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseReceipt {
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

// ─── List ────────────────────────────────────────────────────────────

export async function listExpenses(filters?: {
  jobId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExpenseWithJob[]> {
  let query = supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.jobId) query = query.eq('job_id', filters.jobId);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.dateFrom) query = query.gte('date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('date', filters.dateTo);

  const { data, error } = await query;
  if (error) throw error;
  const expenses = (data ?? []) as Expense[];

  // Fetch receipts for all expenses
  const expenseIds = expenses.map(e => e.id);
  let receipts: ExpenseReceipt[] = [];
  if (expenseIds.length > 0) {
    const { data: rData } = await supabase
      .from('expense_receipts')
      .select('*')
      .in('expense_id', expenseIds);
    receipts = (rData ?? []) as ExpenseReceipt[];
  }

  // Fetch job info
  const jobIds = [...new Set(expenses.map(e => e.job_id))];
  let jobMap: Record<string, { reg: string; num: string }> = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, vehicle_reg, external_job_number')
      .in('id', jobIds);
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

  const ids = expenses.map(e => e.id);
  let receipts: ExpenseReceipt[] = [];
  if (ids.length > 0) {
    const { data: rData } = await supabase
      .from('expense_receipts')
      .select('*')
      .in('expense_id', ids);
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
      upload_status: 'synced',
      billable_on_pod: isBillableCategory(input.category),
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function updateExpense(id: string, input: Partial<Expense>): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── Receipts ────────────────────────────────────────────────────────

export async function uploadReceipt(expenseId: string, file: File): Promise<ExpenseReceipt> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `expense-receipts/${expenseId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('vehicle-photos')
    .getPublicUrl(path);

  const { data, error } = await supabase
    .from('expense_receipts')
    .insert({
      expense_id: expenseId,
      url: urlData.publicUrl,
      backend: 'internal',
      backend_ref: path,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ExpenseReceipt;
}

export async function deleteReceipt(id: string): Promise<void> {
  const { error } = await supabase.from('expense_receipts').delete().eq('id', id);
  if (error) throw error;
}

// ─── Totals ──────────────────────────────────────────────────────────

export async function getExpenseTotals(): Promise<{
  today: number;
  thisWeek: number;
  thisMonth: number;
}> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('expenses')
    .select('date, amount')
    .gte('date', monthStart)
    .order('date', { ascending: false });
  if (error) throw error;

  const expenses = (data ?? []) as { date: string; amount: number }[];
  let today = 0, thisWeek = 0, thisMonth = 0;
  for (const e of expenses) {
    const amt = Number(e.amount);
    thisMonth += amt;
    if (e.date >= weekStart) thisWeek += amt;
    if (e.date === todayStr) today += amt;
  }
  return { today, thisWeek, thisMonth };
}

// ─── Export ──────────────────────────────────────────────────────────

export async function exportExpensesCsv(): Promise<void> {
  const expenses = await listExpenses();

  const headers = ['Job Number', 'Registration', 'Date', 'Time', 'Category', 'Label', 'Amount', 'Currency', 'Notes', 'Driver', 'Receipts'];

  function esc(v: string | null | undefined) {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const rows = expenses.map(e => [
    esc(e.job_number), esc(e.job_reg), esc(e.date), esc(e.time),
    esc(e.category), esc(e.label), String(e.amount), esc(e.currency),
    esc(e.notes), esc(e.driver_id),
    String(e.receipts.length),
  ].join(','));

  const BOM = '\uFEFF';
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'axentra-expenses.csv';
  a.click();
  URL.revokeObjectURL(url);
}
