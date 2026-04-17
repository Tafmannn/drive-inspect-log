/**
 * Shared CSV / file-download helpers for the SQL-first exports module.
 */

export function escapeCsv(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const bodyLines = rows.map((r) => r.map(escapeCsv).join(","));
  return [headerLine, ...bodyLines].join("\n");
}

export function downloadBlob(content: string, filename: string, mime: string) {
  const BOM = mime.startsWith("text/") ? "\uFEFF" : "";
  const blob = new Blob([BOM + content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(content: string, filename: string) {
  downloadBlob(content, filename, "text/csv");
}

export function downloadJson(payload: unknown, filename: string) {
  downloadBlob(JSON.stringify(payload, null, 2), filename, "application/json");
}

/** Build an ISO range filter [from, to] suitable for `gte` / `lte`. */
export function isoRange(from?: string, to?: string) {
  return {
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  };
}
