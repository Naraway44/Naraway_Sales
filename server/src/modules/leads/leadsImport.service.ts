import Papa from "papaparse";
import ExcelJS from "exceljs";
import { prisma } from "@/common/prisma";
import { ActivityAction } from "@prisma/client";
import { logActivity } from "@/modules/activities/activities.service";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { createLeadSchema } from "./leads.schemas";

export const LEAD_IMPORT_FIELDS = [
  "companyName",
  "contactPerson",
  "phone",
  "email",
  "website",
  "industry",
  "city",
  "state",
  "country",
  "notes",
  "priority",
  "status",
  "expectedDealValue",
  "expectedClosingDate",
] as const;

/** Fields where a source cell commonly holds multiple values (lists, JSON arrays) — we
 *  keep only the first usable one. Free-text fields (company name, notes, etc.) are left
 *  untouched since splitting on commas there would corrupt real values like "Acme, Inc." */
const MULTI_VALUE_FIELDS = new Set(["phone", "email", "website"]);

/** String values that spreadsheets commonly use to mean "no data" — treated as blank. */
const NULL_LIKE = new Set(["", "n/a", "na", "null", "undefined", "-", "--", "none", "nil"]);

interface PreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isDuplicate: boolean;
}

export interface ParsedSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, string>[];
}

/** Strips a UTF-8 BOM if present — common in exports from Excel/Windows tools. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Given an array of raw text rows (each an array of cell strings), finds the first row
 * that looks like a real header: several non-empty, reasonably short text cells. Real-world
 * exports (MCA reports, CRM dumps, etc.) often have a title banner and blank spacer rows
 * above the actual header, so row 1 can't be assumed to be the header.
 */
function detectHeaderRowIndex(rows: string[][], maxScan = 20): number {
  let bestRow = 0;
  let bestScore = -1;

  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const nonEmpty = row.filter((cell) => cell && cell.trim() !== "" && cell.trim().length < 100).length;
    if (nonEmpty >= 3 && nonEmpty > bestScore) {
      bestScore = nonEmpty;
      bestRow = r;
    }
  }

  return bestRow;
}

/**
 * Parses raw CSV/TSV text into one ParsedSheet, auto-detecting delimiter (comma, semicolon,
 * tab — Papaparse auto-detects when no delimiter is given), the real header row (in case of
 * banner/title rows above it, same as Excel), and stripping a BOM if present.
 */
export function parseCsv(csvText: string): ParsedSheet[] {
  const cleanText = stripBom(csvText);

  const raw = Papa.parse<string[]>(cleanText, { skipEmptyLines: "greedy" });
  const rawRows = raw.data;
  if (rawRows.length === 0) return [{ sheetName: "CSV", headerRowIndex: 0, headers: [], rows: [] }];

  const headerRowIndex = detectHeaderRowIndex(rawRows);
  const headers = rawRows[headerRowIndex].map((h, i) => (h && h.trim() ? h.trim() : `Column ${i + 1}`));

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const cells = rawRows[r];
    const obj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const value = (cells[idx] ?? "").trim();
      if (value) hasValue = true;
      obj[header] = value;
    });
    if (hasValue) rows.push(obj);
  }

  return [{ sheetName: "CSV", headerRowIndex, headers, rows }];
}

/** Parses an .xlsx workbook into one ParsedSheet per worksheet, auto-detecting each header row. */
export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheets: ParsedSheet[] = [];

  workbook.eachSheet((sheet) => {
    const rawRows: string[][] = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cell.value ? String(cell.value).trim() : "";
      });
      rawRows.push(cells);
    }
    const headerRowIndex1Based = detectHeaderRowIndex(rawRows) + 1;

    const headerRow = sheet.getRow(headerRowIndex1Based);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = cell.value ? String(cell.value).trim() : `Column ${colNumber}`;
    });

    const rows: Record<string, string>[] = [];
    for (let r = headerRowIndex1Based + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (row.cellCount === 0) continue;

      const obj: Record<string, string> = {};
      let hasValue = false;
      headers.forEach((header, idx) => {
        if (!header) return;
        const cell = row.getCell(idx + 1);
        const value = cell.value;
        if (value === null || value === undefined) return;
        const text = typeof value === "object" && "text" in (value as any) ? (value as any).text : value;
        const str = cellToPlainString(text);
        if (str) hasValue = true;
        obj[header] = str;
      });
      if (hasValue) rows.push(obj);
    }

    sheets.push({ sheetName: sheet.name, headerRowIndex: headerRowIndex1Based, headers: headers.filter(Boolean), rows });
  });

  return sheets;
}

/**
 * Converts a raw Excel cell value to plain text without ever going through JS's default
 * number formatting, which real-world spreadsheets can force into scientific notation for
 * long digit strings (phone numbers, registration numbers) that were stored as numbers
 * instead of text. Long integers are rendered in full instead of "9.17818e+11".
 */
function cellToPlainString(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  return String(value).trim();
}

/** Matches a lone scientific-notation number like "9.17818E+11" (case-insensitive). */
const SCIENTIFIC_NOTATION = /^-?\d+(\.\d+)?e\+?\d+$/i;

/**
 * A second safety net for scientific notation that survives as literal text (e.g. a CSV
 * that was itself produced by re-exporting from Excel, where the mangled display string
 * got baked into the file) rather than coming from a live numeric cell we control above.
 */
function descientize(value: string): string {
  if (!SCIENTIFIC_NOTATION.test(value.trim())) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(0) : value;
}

function isSpreadsheetFile(filename: string) {
  return /\.xlsx?$/i.test(filename);
}

export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSheet[]> {
  if (isSpreadsheetFile(filename)) return parseXlsx(buffer);
  return parseCsv(stripBom(buffer.toString("utf-8")));
}

/**
 * Unwraps a cell that's actually a JSON-encoded value (arrays/objects show up in exports
 * from enrichment/scraping tools, e.g. a "Phones" column containing `["+91...","+91..."]`
 * or `{"email":"a@x.com"}`). Returns the first usable scalar found, or the original string
 * if it isn't JSON.
 */
function unwrapJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "[" && trimmed[0] !== "{")) return value;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const first = parsed.find((item) => item !== null && item !== undefined && String(item).trim() !== "");
      return first !== undefined ? unwrapJson(String(first)) : "";
    }
    if (parsed && typeof parsed === "object") {
      const preferredKeys = ["value", "email", "phone", "name", "text", "url"];
      for (const key of preferredKeys) {
        if (key in parsed && parsed[key]) return String(parsed[key]);
      }
      const firstValue = Object.values(parsed).find((v) => v !== null && v !== undefined && String(v).trim() !== "");
      return firstValue !== undefined ? String(firstValue) : "";
    }
    return String(parsed);
  } catch {
    return value;
  }
}

/** Takes the first usable value out of a semicolon/comma/newline/pipe-delimited list. */
function firstOfList(value: string): string {
  return (
    value
      .split(/[;,|\n]+/)
      .map((v) => v.trim())
      .find((v) => v.length > 0) ?? ""
  );
}

/**
 * Parses common real-world date spellings into an ISO (YYYY-MM-DD) string. JS's native
 * Date parsing assumes US MM/DD/YYYY and silently mis-parses or rejects the DD-MM-YYYY /
 * DD/MM/YYYY format most non-US exports (and Indian company registries) actually use.
 */
function normalizeDateString(value: string): string {
  const trimmed = value.trim();

  const isoLike = /^\d{4}-\d{2}-\d{2}/;
  if (isoLike.test(trimmed)) return trimmed;

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    // If the "day" slot is > 12 it can only be DD-MM-YYYY; otherwise we still assume
    // DD-MM-YYYY since that's the convention for the business data this field targets.
    if (month <= 12) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (day <= 12) return `${y}-${d.padStart(2, "0")}-${m.padStart(2, "0")}`;
  }

  return trimmed;
}

const DATE_FIELDS = new Set(["expectedClosingDate", "lastContactAt", "nextFollowUp"]);

/**
 * Normalizes one mapped row before validation: trims whitespace, treats common "no data"
 * placeholders as blank, unwraps JSON-encoded cells, fixes scientific-notation numbers,
 * parses common date formats, and — for fields known to sometimes carry multiple values
 * (phone/email/website) — keeps only the first usable entry.
 */
function cleanRow(row: Record<string, string>): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {};

  for (const [key, rawValue] of Object.entries(row)) {
    let value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

    if (typeof value === "string") {
      value = unwrapJson(value);
      value = descientize(value);
      if (MULTI_VALUE_FIELDS.has(key)) value = firstOfList(value);
      if (DATE_FIELDS.has(key)) value = normalizeDateString(value);
      value = value.trim();
    }

    cleaned[key] = NULL_LIKE.has(String(value).toLowerCase()) ? undefined : value;
  }

  return cleaned;
}

function mapRow(row: Record<string, string>, columnMapping: Record<string, string>) {
  const mapped: Record<string, string> = {};
  for (const [column, leadField] of Object.entries(columnMapping)) {
    if (leadField && row[column] !== undefined) {
      mapped[leadField] = row[column];
    }
  }
  return cleanRow(mapped);
}

/**
 * Validates mapped rows and flags duplicates against existing leads (by phone/email),
 * without inserting anything yet. Powers the import preview step.
 */
export async function previewImport(
  rows: Record<string, string>[],
  columnMapping: Record<string, string>
) {
  const preview: PreviewRow[] = [];

  const phonesToCheck = new Set<string>();
  const emailsToCheck = new Set<string>();

  const mappedRows = rows.map((row) => mapRow(row, columnMapping));

  mappedRows.forEach((mapped) => {
    if (mapped.phone) phonesToCheck.add(mapped.phone);
    if (mapped.email) emailsToCheck.add(mapped.email);
  });

  const existing = await prisma.lead.findMany({
    where: {
      OR: [
        phonesToCheck.size ? { phone: { in: Array.from(phonesToCheck) } } : undefined,
        emailsToCheck.size ? { email: { in: Array.from(emailsToCheck) } } : undefined,
      ].filter(Boolean) as any,
    },
    select: { phone: true, email: true },
  });
  const existingPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((e) => e.email).filter(Boolean));

  mappedRows.forEach((mapped, idx) => {
    const parsed = createLeadSchema.safeParse(mapped);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

    const isDuplicate =
      (!!mapped.phone && existingPhones.has(mapped.phone)) ||
      (!!mapped.email && existingEmails.has(mapped.email));

    preview.push({ rowNumber: idx + 1, data: mapped as Record<string, string>, errors, isDuplicate });
  });

  return preview;
}

/**
 * Inserts only the rows the admin confirms (already validated, non-duplicate at preview
 * time). Re-checks duplicates against the database again right here — not just against the
 * snapshot from the preview step — so that if an import is interrupted (network drop,
 * browser refresh) and the admin simply re-runs it, already-inserted rows are silently
 * skipped instead of being created twice. Retrying an import is always safe.
 */
export async function confirmImport(
  rows: Record<string, string>[],
  createdById: string
) {
  const created: string[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  const cleanedRows = rows.map((row) => cleanRow(row));

  const phonesToCheck = new Set<string>();
  const emailsToCheck = new Set<string>();
  cleanedRows.forEach((row) => {
    if (row.phone) phonesToCheck.add(row.phone);
    if (row.email) emailsToCheck.add(row.email);
  });

  const existing = phonesToCheck.size || emailsToCheck.size
    ? await prisma.lead.findMany({
        where: {
          OR: [
            phonesToCheck.size ? { phone: { in: Array.from(phonesToCheck) } } : undefined,
            emailsToCheck.size ? { email: { in: Array.from(emailsToCheck) } } : undefined,
          ].filter(Boolean) as any,
        },
        select: { phone: true, email: true },
      })
    : [];
  const existingPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((e) => e.email).filter(Boolean));

  for (let i = 0; i < cleanedRows.length; i++) {
    const row = cleanedRows[i];

    const isDuplicate =
      (!!row.phone && existingPhones.has(row.phone)) || (!!row.email && existingEmails.has(row.email));
    if (isDuplicate) {
      skipped.push({ rowNumber: i + 1, reason: "Already imported (duplicate phone/email)" });
      continue;
    }

    const parsed = createLeadSchema.safeParse(row);
    if (!parsed.success) {
      skipped.push({ rowNumber: i + 1, reason: parsed.error.issues.map((e) => e.message).join(", ") });
      continue;
    }

    const lead = await prisma.lead.create({
      data: { ...parsed.data, createdById },
    });
    await logActivity({ leadId: lead.id, userId: createdById, action: ActivityAction.IMPORTED });
    await assignmentService.autoAssign(lead.id, createdById);
    created.push(lead.id);

    // Mark as seen immediately so duplicate rows within the *same* file/batch also skip.
    if (row.phone) existingPhones.add(row.phone);
    if (row.email) existingEmails.add(row.email);
  }

  return { createdCount: created.length, createdIds: created, skipped };
}

export function leadsToCsv(leads: Array<Record<string, unknown>>): string {
  return Papa.unparse(leads);
}
