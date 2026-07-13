import { useState } from "react";
import { confirmImport, parseCsvFile, previewImport, ImportPreviewRow } from "@/api/leads";
import { Button } from "@/components/Button";
import { Select } from "@/components/Input";
import { Card } from "@/components/Card";

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

export function ImportLeadsDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [result, setResult] = useState<{ createdCount: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setLoading(true);
    try {
      const parsed = await parseCsvFile(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setStep("map");
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    setLoading(true);
    try {
      const mappedRows = rows.map((row) => {
        const mapped: Record<string, string> = {};
        for (const [csvCol, field] of Object.entries(mapping)) {
          if (field) mapped[field] = row[csvCol];
        }
        return mapped;
      });
      const result = await previewImport(rows, mapping);
      setPreview(result);
      setRows(mappedRows);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const validRows = rows.filter((_, idx) => {
        const p = preview[idx];
        return p && p.errors.length === 0 && !p.isDuplicate;
      });
      const result = await confirmImport(validRows);
      setResult({ createdCount: result.createdCount, skipped: rows.length - result.createdCount });
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  const validCount = preview.filter((p) => p.errors.length === 0 && !p.isDuplicate).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import Leads from CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        {step === "upload" && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Upload any CSV export. You'll map its columns to lead fields next.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              disabled={loading}
            />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Map each CSV column to a lead field ({rows.length} rows detected).
            </p>
            <div className="grid grid-cols-2 gap-3">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="w-32 truncate text-sm font-medium">{h}</span>
                  <Select
                    value={mapping[h] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                  >
                    <option value="">Ignore</option>
                    {LEAD_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
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
            <p className="text-sm text-muted-foreground">
              {validCount} of {preview.length} rows are valid and will be imported.
            </p>
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
                          <span className="text-amber-600">Duplicate — skipped</span>
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
              {loading ? "Importing..." : `Import ${validCount} leads`}
            </Button>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <p className="text-sm">
              Imported <strong>{result.createdCount}</strong> leads.{" "}
              {result.skipped > 0 && `${result.skipped} rows were skipped.`}
            </p>
            <Button onClick={onImported}>Done</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
