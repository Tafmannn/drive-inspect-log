import { describe, it, expect } from "vitest";
import {
  hasBankDetails,
  normaliseAccountNumber,
  normaliseSortCode,
  validateBankDetails,
} from "@/features/invoicing/lib/bankDetails";

const ok = { bankName: " Test Bank ", accountName: " Test Ltd ", sortCode: "12 34 56", accountNumber: "1234 5678" };

describe("normaliseSortCode", () => {
  it("accepts six digits however they are spaced", () => {
    expect(normaliseSortCode("123456")).toBe("12-34-56");
    expect(normaliseSortCode("12 34 56")).toBe("12-34-56");
    expect(normaliseSortCode(" 12-34-56 ")).toBe("12-34-56");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "12345", "1234567", "12-34-5a", "ab-cd-ef", "12.34.56"]) expect(normaliseSortCode(bad)).toBeNull();
  });
});

describe("normaliseAccountNumber", () => {
  it("accepts 6 to 8 digits, ignoring spaces and dashes", () => {
    expect(normaliseAccountNumber("12345678")).toBe("12345678");
    expect(normaliseAccountNumber("1234 5678")).toBe("12345678");
    expect(normaliseAccountNumber("123456")).toBe("123456");
  });
  it("rejects the wrong length or non-digits", () => {
    for (const bad of ["", "12345", "123456789", "1234567a"]) expect(normaliseAccountNumber(bad)).toBeNull();
  });
});

describe("validateBankDetails", () => {
  it("normalises and trims a good entry", () => {
    expect(validateBankDetails(ok)).toEqual({
      ok: true,
      value: { bank_name: "Test Bank", bank_account_name: "Test Ltd", bank_sort_code: "12-34-56", bank_account_number: "12345678" },
    });
  });

  it("treats a blank bank name as not given", () => {
    const r = validateBankDetails({ ...ok, bankName: "  " });
    expect(r).toMatchObject({ ok: true, value: { bank_name: null } });
  });

  it("clears everything when all four fields are blank", () => {
    expect(validateBankDetails({ bankName: "", accountName: " ", sortCode: "", accountNumber: "" })).toEqual({
      ok: true,
      value: { bank_name: null, bank_account_name: null, bank_sort_code: null, bank_account_number: null },
    });
  });

  it("will not save half a bank account", () => {
    const r = validateBankDetails({ bankName: "Test Bank", accountName: "", sortCode: "", accountNumber: "" });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors).toEqual({
        sortCode: "Enter the sort code.",
        accountNumber: "Enter the account number.",
        accountName: "Enter the name the account is in.",
      });
    }
  });

  it("says what is wrong with each malformed field", () => {
    const r = validateBankDetails({ ...ok, sortCode: "12-34", accountNumber: "12AB" });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors.sortCode).toMatch(/six digits/);
      expect(r.errors.accountNumber).toMatch(/6 to 8 digits/);
      expect(r.errors.accountName).toBeUndefined();
    }
  });
});

describe("hasBankDetails", () => {
  it("needs both a sort code and an account number", () => {
    expect(hasBankDetails({ bank_sort_code: "12-34-56", bank_account_number: "12345678" })).toBe(true);
    expect(hasBankDetails({ bank_sort_code: "12-34-56", bank_account_number: null })).toBe(false);
    expect(hasBankDetails({})).toBe(false);
    expect(hasBankDetails(null)).toBe(false);
  });
});
