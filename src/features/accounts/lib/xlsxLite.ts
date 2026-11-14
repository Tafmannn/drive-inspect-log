/**
 * xlsxLite — a minimal .xlsx writer on top of JSZip (already a dependency),
 * so the accountant's summary can be a real multi-tab Excel workbook
 * without pulling in a spreadsheet library.
 *
 * Supports exactly what the accounts pack needs: several sheets, a bold
 * frozen header row, text / number / money cells, column widths. Strings
 * are written inline (no shared-strings table) and always as text cells,
 * so nothing typed by a user can be interpreted as a formula.
 */
import JSZip from "jszip";

export type XlsxCell = string | number | null | undefined | { money: number } | { bold: string };

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: XlsxCell[][];
  /** Column widths in characters; defaults to a width fitted to the content. */
  widths?: number[];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export function xmlEscape(value: string): string {
  return value
    // Characters XML 1.0 forbids outright would make Excel reject the file.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Excel limits sheet names to 31 chars and forbids : \ / ? * [ ] */
export function sheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || "Sheet";
}

// Style ids, matching the cellXfs order in styles.xml below.
const STYLE_BOLD = 1;
const STYLE_MONEY = 2;

function textCell(ref: string, text: string, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function cellXml(ref: string, cell: XlsxCell): string {
  if (cell == null || cell === "") return "";
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? `<c r="${ref}"><v>${cell}</v></c>` : "";
  }
  if (typeof cell === "string") return textCell(ref, cell);
  if ("money" in cell) {
    return Number.isFinite(cell.money) ? `<c r="${ref}" s="${STYLE_MONEY}"><v>${cell.money}</v></c>` : "";
  }
  return textCell(ref, cell.bold, STYLE_BOLD);
}

function cellText(cell: XlsxCell): string {
  if (cell == null) return "";
  if (typeof cell === "object") return "money" in cell ? cell.money.toFixed(2) : cell.bold;
  return String(cell);
}

function sheetXml(sheet: XlsxSheet): string {
  const colCount = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const widths = Array.from({ length: colCount }, (_, c) => {
    if (sheet.widths?.[c]) return sheet.widths[c];
    const longest = Math.max(
      (sheet.headers[c] ?? "").length,
      ...sheet.rows.map((r) => cellText(r[c]).length),
    );
    return Math.min(60, Math.max(8, longest + 2));
  });

  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const header = `<row r="1">${sheet.headers
    .map((h, c) => textCell(`${columnLetter(c)}1`, h, STYLE_BOLD))
    .join("")}</row>`;
  const body = sheet.rows
    .map((row, r) => `<row r="${r + 2}">${row.map((cell, c) => cellXml(`${columnLetter(c)}${r + 2}`, cell)).join("")}</row>`)
    .join("");

  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    "</worksheet>"
  );
}

const STYLES_XML =
  XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/** Build a workbook. Sheet names are de-duplicated and made Excel-safe. */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Blob> {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet");
  const used = new Set<string>();
  const names = sheets.map((s) => {
    const base = sheetName(s.name);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
  );
  zip.file(
    "xl/workbook.xml",
    XML_HEADER +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets>" +
      names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets></workbook>",
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>",
  );
  zip.file("xl/styles.xml", STYLES_XML);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
