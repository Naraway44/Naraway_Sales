import { Prisma } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { IngestBatch, IngestLead } from "./marketplace.schemas";

/** Rows carrying neither a phone nor an email can't be sold — a buyer has no way to reach
 *  the company, and that's the entire thing they're paying for. Rejected rather than
 *  silently listed, so a broken scraper run shows up as errors instead of dead inventory. */
function isContactable(row: IngestLead) {
  return Boolean(row.phone?.trim() || row.email?.trim());
}

function normalize(value: string | undefined | null) {
  return value?.trim().toLowerCase() || null;
}

export interface IngestResult {
  created: number;
  /** Already in the catalog (same phone or email) — re-scraping the same company is normal,
   *  so these are counted rather than treated as failures. */
  duplicates: number;
  rejected: { row: number; reason: string }[];
}

/**
 * Bulk-lists externally sourced leads (a scraper, an enrichment run, a purchased list)
 * straight onto the marketplace, bypassing the Lost-lead curation path in
 * curation.service.ts. That path exists for leads the sales team worked and lost — it's
 * one-at-a-time and gated on lead.status === LOST, which no external source can satisfy.
 *
 * Deduplication is on phone/email against the whole catalog, not just this batch: the same
 * company resurfacing in a later scrape must not become a second sellable row, or the
 * exclusivity promise breaks the first time two buyers purchase "different" leads that are
 * the same contact.
 */
export async function ingestMarketplaceLeads(userId: string, batch: IngestBatch): Promise<IngestResult> {
  const rejected: { row: number; reason: string }[] = [];
  const candidates: { row: number; lead: IngestLead }[] = [];

  batch.leads.forEach((lead, index) => {
    if (!isContactable(lead)) {
      rejected.push({ row: index + 1, reason: "No phone or email — nothing a buyer could act on" });
      return;
    }
    candidates.push({ row: index + 1, lead });
  });

  if (candidates.length === 0) {
    return { created: 0, duplicates: 0, rejected };
  }

  // One query for the whole batch rather than a lookup per row — an ingest run is thousands
  // of rows and per-row round trips would dominate the request.
  const phones = candidates.map((c) => c.lead.phone?.trim()).filter(Boolean) as string[];
  const emails = candidates.map((c) => c.lead.email?.trim()).filter(Boolean) as string[];

  const existing = await prisma.marketplaceLead.findMany({
    where: {
      OR: [
        ...(phones.length ? [{ phone: { in: phones } }] : []),
        ...(emails.length ? [{ email: { in: emails, mode: Prisma.QueryMode.insensitive } }] : []),
      ],
    },
    select: { phone: true, email: true },
  });

  const seenPhones = new Set(existing.map((e) => normalize(e.phone)).filter(Boolean));
  const seenEmails = new Set(existing.map((e) => normalize(e.email)).filter(Boolean));

  const toCreate: Prisma.MarketplaceLeadCreateManyInput[] = [];
  let duplicates = 0;

  for (const { lead } of candidates) {
    const phone = normalize(lead.phone);
    const email = normalize(lead.email);

    // Checked against seen* rather than only the DB result so duplicates *within* one batch
    // are caught too — scrapers routinely emit the same company twice in a run.
    if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) {
      duplicates += 1;
      continue;
    }
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);

    toCreate.push({
      // No Lead row backs an externally sourced lead, and originalLeadId has no foreign key —
      // so it carries provenance instead: which source produced this row, for tracing a bad
      // batch back to the scraper that made it.
      originalLeadId: `${batch.source}:${lead.externalId ?? "unkeyed"}`,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson ?? null,
      phone: lead.phone?.trim() ?? null,
      email: lead.email?.trim() ?? null,
      industry: lead.industry ?? null,
      companySize: lead.companySize ?? null,
      city: lead.city ?? null,
      state: lead.state ?? null,
      service: lead.service ?? null,
      lostReason: lead.notes ?? null,
      intentSignal: lead.intentSignal ?? null,
      signalAt: lead.signalAt ?? null,
      expectedDealValue: lead.expectedDealValue ?? null,
      approvedById: userId,
      overridePrice: lead.overridePrice ?? null,
    });
  }

  if (toCreate.length === 0) {
    return { created: 0, duplicates, rejected };
  }

  const result = await prisma.marketplaceLead.createMany({ data: toCreate });

  return { created: result.count, duplicates, rejected };
}
