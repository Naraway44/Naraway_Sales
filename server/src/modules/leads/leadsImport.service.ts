import Papa from "papaparse";
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

interface PreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isDuplicate: boolean;
}

/** Parses raw CSV text into headers + rows for the column-mapping UI step. */
export function parseCsv(csvText: string) {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return { headers: result.meta.fields ?? [], rows: result.data };
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

  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [csvColumn, leadField] of Object.entries(columnMapping)) {
      if (leadField && row[csvColumn] !== undefined) {
        mapped[leadField] = row[csvColumn];
      }
    }
    if (mapped.phone) phonesToCheck.add(mapped.phone);
    if (mapped.email) emailsToCheck.add(mapped.email);
    return mapped;
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
  const existingPhones = new Set(existing.map((e) => e.phone));
  const existingEmails = new Set(existing.map((e) => e.email).filter(Boolean));

  mappedRows.forEach((mapped, idx) => {
    const parsed = createLeadSchema.safeParse(mapped);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

    const isDuplicate =
      (!!mapped.phone && existingPhones.has(mapped.phone)) ||
      (!!mapped.email && existingEmails.has(mapped.email));

    preview.push({ rowNumber: idx + 1, data: mapped, errors, isDuplicate });
  });

  return preview;
}

/** Inserts only the rows the admin confirms (already validated, non-duplicate). */
export async function confirmImport(
  rows: Record<string, string>[],
  createdById: string
) {
  const created: string[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = createLeadSchema.safeParse(rows[i]);
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
  }

  return { createdCount: created.length, createdIds: created, skipped };
}

export function leadsToCsv(leads: Array<Record<string, unknown>>): string {
  return Papa.unparse(leads);
}
