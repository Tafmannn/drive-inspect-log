import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as expApi from '@/lib/expenseApi';
import { invalidateForEvent } from '@/lib/mutationEvents';

export function useExpenses(filters?: {
  jobId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => expApi.listExpenses(filters),
  });
}

export function useJobExpenses(jobId: string) {
  return useQuery({
    queryKey: ['expenses', 'job', jobId],
    queryFn: () => expApi.getExpensesForJob(jobId),
    enabled: !!jobId,
  });
}

export function useExpenseTotals() {
  return useQuery({
    queryKey: ['expense-totals'],
    queryFn: () => expApi.getExpenseTotals(),
    staleTime: 60_000,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: expApi.createExpense,
    onSuccess: () => invalidateForEvent(qc, 'expense_changed'),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string } & Partial<expApi.Expense>) => {
      const { id, ...fields } = params;
      return expApi.updateExpense({ id, ...fields });
    },
    onSuccess: () => invalidateForEvent(qc, 'expense_changed'),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: expApi.deleteExpense,
    onSuccess: () => invalidateForEvent(qc, 'expense_changed'),
  });
}

export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) =>
      expApi.uploadReceipt(expenseId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useDeleteReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: expApi.deleteReceipt,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
