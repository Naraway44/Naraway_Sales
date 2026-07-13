import { useState } from "react";
import { confirmImport, parseCsvFile, previewImport, ImportPreviewRow, ParsedSheet } from "@/api/leads";
import { Button } from "@/components/Button";
import { Select } from "@/components/Input";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/errors";

const LEAD_FIELDS = [
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
];

/**
 * Common header spellings seen across CRM exports (Zoho, HubSpot, raw MCA/scraper dumps,
 * hand-built spreadsheets) mapped to our lead fields, so a fresh file's columns get
 * pre-mapped automatically instead of the admin re-doing this by hand every import.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  companyName: ["company", "companyname", "company name", "organization", "organisation", "business", "businessname", "firm"],
  contactPerson: ["contact", "contactperson", "contact name", "name", "person", "director", "founder", "pointofcontact"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "cell", "telephone", "contactnumber", "tel"],
  email: ["email", "emailaddress", "mail", "e-mail"],
  website: ["website", "url", "web", "domain", "site"],
  industry: ["industry", "sector", "category", "activity", "businesstype", "niche"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  country: ["country", "nation"],
  notes: ["notes", "note", "remarks", "comment", "comments", "description"],
  priority: ["priority", "importance"],
  status: ["status", "stage", "leadstatus"],
  expectedDealValue: ["dealvalue", "expecteddealvalue", "value", "amount", "revenue", "budget"],
  expectedClosingDate: ["closingdate", "expectedclosingdate", "closedate", "expectedclosedate"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best-effort auto-mapping from raw file headers to our lead fields, by normalized name match. */
function guessMapping(headers: string[]): Record<string, string> {
  const guess: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;

    let bestField = "";
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (usedFields.has(field)) continue;
      if (aliases.some((alias) => normalized === normalizeHeader(alias))) {
        bestField = field;
        break;
      }
    }
    if (!bestField) {
      // Substring fallback only for aliases long enough that a false-positive match is
      // unlikely (e.g. "date" alone would wrongly match "Date Of Registration").
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (usedFields.has(field)) continue;
        if (aliases.some((alias) => alias.length >= 5 && normalized.includes(normalizeHeader(alias)))) {
          bestField = field;
          break;
        }
      }
    }

    if (bestField) {
      guess[header] = bestField;
      usedFields.add(bestField);
    }
  }

  return guess;
}

export function ImportLeadsDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "sheet" | "map" | "preview" | "done">("upload");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [result, setResult] = useState<{ createdCount: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skippedRows, setSkippedRows] = useState<{ rowNumber: number; reason: string }[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const { showToast } = useToast();

  const IMPORT_BATCH_SIZE = 25;

  async function handleFile(file: File) {
    setLoading(true);
    setError("");
    try {
      const parsedSheets = await parseCsvFile(file);
      const usableSheets = parsedSheets.filter((s) => s.headers.length > 0 && s.rows.length > 0);
      if (usableSheets.length === 0) {
        setError("No data found in this file.");
        return;
      }
      setSheets(usableSheets);

      if (usableSheets.length === 1) {
        selectSheet(usableSheets[0]);
      } else {
        // Auto-pick the sheet with the most recognizable lead columns, so the admin
        // only has to choose manually when it's genuinely ambiguous (a real tie).
        const scored = usableSheets
          .map((sheet) => ({ sheet, score: Object.keys(guessMapping(sheet.headers)).length }))
          .sort((a, b) => b.score - a.score);

        const isConfident = scored[0].score > 0 && (scored.length === 1 || scored[0].score > scored[1].score);
        if (isConfident) {
          selectSheet(scored[0].sheet);
          showToast(`Auto-selected sheet "${scored[0].sheet.sheetName}" (best column match).`);
        } else {
          setStep("sheet");
        }
      }
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "Could not read this file."));
    } finally {
      setLoading(false);
    }
  }

  async function selectSheet(sheet: ParsedSheet) {
    const guessedMapping = guessMapping(sheet.headers);
    setHeaders(sheet.headers);
    setRows(sheet.rows);
    setMapping(guessedMapping);

    // If we're confident enough to have found the company name column, skip straight to
    // validation instead of making the admin click through a manual mapping screen —
    // they can still jump back to adjust it if the preview looks wrong.
    if (Object.values(guessedMapping).includes("companyName")) {
      await runPreview(sheet.rows, guessedMapping);
    } else {
      setStep("map");
    }
  }

  function sampleValue(header: string): string {
    const withValue = rows.find((row) => row[header] && row[header].trim());
    return withValue?.[header]?.trim() ?? "";
  }

  async function runPreview(sourceRows: Record<string, string>[], columnMapping: Record<string, string>) {
    setLoading(true);
    setError("");
    try {
      const mappedRows = sourceRows.map((row) => {
        const mapped: Record<string, string> = {};
        for (const [csvCol, field] of Object.entries(columnMapping)) {
          if (field) mapped[field] = row[csvCol];
        }
        return mapped;
      });
      const result = await previewImport(sourceRows, columnMapping);
      setPreview(result);
      setRows(mappedRows);
      setStep("preview");
    } catch (previewError) {
      setError(getErrorMessage(previewError, "Could not validate the file."));
      setStep("map");
    } finally {
      setLoading(false);
    }
  }

  function handlePreview() {
    return runPreview(rows, mapping);
  }

  async function handleConfirm() {
    setLoading(true);
    setError("");
    const validRows = rows.filter((_, idx) => {
      const p = preview[idx];
      return p && p.errors.length === 0 && !p.isDuplicate;
    });
    setImportProgress({ done: 0, total: validRows.length });

    let createdCount = 0;
    const skipped: { rowNumber: number; reason: string }[] = [];

    try {
      for (let i = 0; i < validRows.length; i += IMPORT_BATCH_SIZE) {
        const batch = validRows.slice(i, i + IMPORT_BATCH_SIZE);
        const batchResult = await confirmImport(batch);
        createdCount += batchResult.createdCount;
        skipped.push(
          ...batchResult.skipped.map((s) => ({ ...s, rowNumber: s.rowNumber + i }))
        );
        setImportProgress({ done: Math.min(i + batch.length, validRows.length), total: validRows.length });
      }

      setResult({ createdCount, skipped: validRows.length - createdCount });
      setSkippedRows(skipped);
      setStep("done");
      showToast(`${createdCount} leads imported.`);
    } catch (importError) {
      setError(getErrorMessage(importError, "Could not import leads."));
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  }

  const validCount = preview.filter((p) => p.errors.length === 0 && !p.isDuplicate).length;

  const loadingMessage =
    step === "upload"
      ? "Reading your file..."
      : step === "map"
      ? "Validating rows..."
      : importProgress
      ? `Imported ${importProgress.done} of ${importProgress.total} leads...`
      : "Importing leads...";

  function downloadSkippedReport() {
    const text = ["rowNumber,reason", ...skippedRows.map((row) => `${row.rowNumber},"${row.reason.replaceAll('"', '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "skipped-leads-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <Card className="max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="import-title" className="text-lg font-semibold">Import Leads from CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>
        {error && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-destructive">
            <span>{error}</span>
            {step === "preview" && !loading && (
              <button
                onClick={handleConfirm}
                className="shrink-0 rounded-md border border-destructive px-2 py-1 text-xs font-medium hover:bg-destructive hover:text-destructive-foreground"
              >
                Retry import
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="mb-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <svg className="h-4 w-4 shrink-0 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {loadingMessage}
            </div>
            {importProgress && importProgress.total > 0 && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {step === "upload" && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Upload a CSV or Excel (.xlsx) export. You'll map its columns to lead fields next.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              disabled={loading}
            />
          </div>
        )}

        {step === "sheet" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This file has multiple sheets. Which one has your leads?
            </p>
            <div className="space-y-2">
              {sheets.map((sheet) => (
                <button
                  key={sheet.sheetName}
                  onClick={() => selectSheet(sheet)}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{sheet.sheetName}</span>
                  <span className="text-xs text-muted-foreground">{sheet.rows.length} rows</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We've auto-matched columns we recognize ({rows.length} rows detected) — review and adjust before continuing.
            </p>
            <div className="space-y-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{h}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {sampleValue(h) || "(no sample value)"}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Select
                    value={mapping[h] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                  >
                    <option value="">Ignore this column</option>
                    {LEAD_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                        {mapping[h] === f ? " (auto-matched)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <Button onClick={handlePreview} disabled={loading}>
              {loading ? "Validating..." : "Preview"}
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {validCount} of {preview.length} rows are valid and will be imported.
              </p>
              <button
                onClick={() => setStep("map")}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Edit column mapping
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Company</th>
                    <th className="px-2 py-1">Phone</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.rowNumber} className="border-t border-border">
                      <td className="px-2 py-1">{p.rowNumber}</td>
                      <td className="px-2 py-1">{p.data.companyName}</td>
                      <td className="px-2 py-1">{p.data.phone}</td>
                      <td className="px-2 py-1">
                        {p.isDuplicate ? (
                          <span className="text-amber-600">Duplicate - skipped</span>
                        ) : p.errors.length ? (
                          <span className="text-destructive">{p.errors.join("; ")}</span>
                        ) : (
                          <span className="text-green-600">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={handleConfirm} disabled={loading || validCount === 0}>
              {loading && importProgress
                ? `Importing... (${importProgress.done}/${importProgress.total})`
                : `Import ${validCount} leads`}
            </Button>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <p className="text-sm">
              Imported <strong>{result.createdCount}</strong> leads.{" "}
              {result.skipped > 0 && `${result.skipped} rows were skipped.`}
            </p>
            {skippedRows.length > 0 && <Button variant="secondary" onClick={downloadSkippedReport}>Download skipped-row report</Button>}
            <Button onClick={onImported}>Done</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
