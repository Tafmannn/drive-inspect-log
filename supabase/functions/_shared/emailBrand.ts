// Shared light transactional email identity, matching the approved invoice.
export const EMAIL_BRAND = {
  ink: "#172F52",
  muted: "#576B85",
  page: "#F4F7FA",
  border: "#D4E2F0",
  accent: "#2B7DC9",
  pale: "#EEF4FA",
  logoPath: "/axentra-logo.png",
} as const;

export function isAxentraBrand(name: string): boolean {
  return /^axentra(?: vehicles?| vehicle logistics)?$/i.test(name.trim());
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailBrandColour(name: string, configured?: string | null): string {
  if (isAxentraBrand(name)) return EMAIL_BRAND.accent;
  return configured && /^#[0-9a-f]{6}$/i.test(configured.trim()) ? configured.trim() : EMAIL_BRAND.ink;
}

export function renderEmailBrandHeader(name: string, logoUrl?: string | null): string {
  const axentra = isAxentraBrand(name);
  let logo: string | null = null;
  if (logoUrl) {
    try {
      const url = new URL(logoUrl);
      if (url.protocol === "https:") logo = url.toString();
    } catch { /* readable wordmark fallback */ }
  }
  const label = axentra ? "AXENTRA" : name;
  const subtitle = axentra ? '<br><span style="color:#576B85;font-size:11px;letter-spacing:1px;">VEHICLE LOGISTICS</span>' : "";
  const logoCell = logo ? `<td style="padding-right:12px;vertical-align:middle;"><img src="${escape(logo)}" width="${axentra ? 48 : 80}" alt="${escape(axentra ? "Axentra logo" : name)}" style="display:block;width:${axentra ? 48 : 80}px;height:auto;border:0;"></td>` : "";
  return `<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:24px 32px 16px;border-bottom:1px solid #D4E2F0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logoCell}<td style="vertical-align:middle;"><span style="color:#172F52;font-size:24px;font-weight:bold;letter-spacing:${axentra ? 3 : 0}px;">${escape(label)}</span>${subtitle}</td></tr></table></td></tr>`;
}
