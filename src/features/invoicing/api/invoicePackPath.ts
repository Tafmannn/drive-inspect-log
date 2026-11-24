// Pack v1 uses an immutable, invoice-specific directory in the existing private bucket.
// Legacy paths intentionally have no pack association.
export function issuedPackPath(pdfPath: string | null | undefined, invoiceId: string): string | null {
  if (!pdfPath) return null;
  const parts = pdfPath.split("/");
  if (parts.length !== 4 || parts[1] !== `pack-v1-${invoiceId}` ||
      !/^[0-9a-f-]{36}$/i.test(parts[2]) ||
      !/^AXENTRA_(?:INV|CN)_[A-Za-z0-9_-]+\.pdf$/.test(parts[3])) return null;
  return pdfPath.replace(/\.pdf$/, ".zip");
}
