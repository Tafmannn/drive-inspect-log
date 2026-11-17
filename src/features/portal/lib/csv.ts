/** Minimal RFC 4180 CSV writer for the portal's exports. */

function cell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralise spreadsheet formula injection: a client's own data (e.g. a
  // contact name starting with "=") must never execute when opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(fileName: string, csv: string): void {
  // BOM so Excel opens UTF-8 (e.g. "£", "→") correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
