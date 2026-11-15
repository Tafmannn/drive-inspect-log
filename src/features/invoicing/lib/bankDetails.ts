/**
 * Validation for the bank details printed on invoices. Pure, so the rules
 * the organisation profile enforces are unit-tested directly.
 */

export interface BankDetailsInput {
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export interface BankDetailsRecord {
  bank_name: string | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
}

export type BankDetailsResult =
  | { ok: true; value: BankDetailsRecord }
  | { ok: false; errors: Partial<Record<keyof BankDetailsInput, string>> };

/** "123456", "12 34 56" or "12-34-56" -> "12-34-56"; null when it is not six digits. */
export function normaliseSortCode(raw: string): string | null {
  const t = raw.trim();
  if (!/^[\d\s-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length === 6 ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}` : null;
}

/** Spaces and dashes removed; null unless it is 6-8 digits. */
export function normaliseAccountNumber(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{6,8}$/.test(digits) ? digits : null;
}

const emptyToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/**
 * All four fields blank clears the saved details. Otherwise the sort code and
 * account number are both required (an invoice with half a bank account is
 * worse than none) and must be well-formed.
 */
export function validateBankDetails(input: BankDetailsInput): BankDetailsResult {
  const anything = [input.bankName, input.accountName, input.sortCode, input.accountNumber].some((v) => v.trim() !== "");
  if (!anything) {
    return { ok: true, value: { bank_name: null, bank_account_name: null, bank_sort_code: null, bank_account_number: null } };
  }

  const errors: Partial<Record<keyof BankDetailsInput, string>> = {};
  const sortCode = normaliseSortCode(input.sortCode);
  const accountNumber = normaliseAccountNumber(input.accountNumber);
  if (!input.sortCode.trim()) errors.sortCode = "Enter the sort code.";
  else if (!sortCode) errors.sortCode = "A sort code is six digits, e.g. 12-34-56.";
  if (!input.accountNumber.trim()) errors.accountNumber = "Enter the account number.";
  else if (!accountNumber) errors.accountNumber = "An account number is 6 to 8 digits.";
  if (!input.accountName.trim()) errors.accountName = "Enter the name the account is in.";
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      bank_name: emptyToNull(input.bankName),
      bank_account_name: emptyToNull(input.accountName),
      bank_sort_code: sortCode,
      bank_account_number: accountNumber,
    },
  };
}

export function hasBankDetails(r: Partial<BankDetailsRecord> | null | undefined): boolean {
  return !!r && !!r.bank_sort_code && !!r.bank_account_number;
}
