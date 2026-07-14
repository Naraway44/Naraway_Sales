import { LeadStatus } from "@prisma/client";
import { prisma } from "@/common/prisma";

export interface StaleLead {
  id: string;
  companyName: string;
  status: LeadStatus;
  ownerId: string | null;
  serviceId: string | null;
  lastMeaningfulAt: Date;
}

/**
 * Finds leads whose most recent MEANINGFUL activity (a call, a status change,
 * assignment, import, creation — anything except a bare field edit) is older than
 * `days`, and which aren't currently pinned by their owner. Using raw `updatedAt` here
 * would let a rep dodge staleness detection by re-saving a lead with no real work done —
 * any edit, even a no-op, bumps `updatedAt`, so that alone can't be trusted as "this was
 * actually worked."
 */
export async function findStaleLeads(params: {
  ownerIds: string[];
  statuses: LeadStatus[];
  days: number;
}): Promise<StaleLead[]> {
  if (params.ownerIds.length === 0) return [];

  const threshold = new Date(Date.now() - params.days * 86_400_000);
  const pinExpiry = new Date(Date.now() - 30 * 86_400_000);

  const rows = await prisma.$queryRaw<
    {
      id: string;
      company_name: string;
      status: LeadStatus;
      owner_id: string | null;
      service_id: string | null;
      last_meaningful_at: Date;
    }[]
  >`
    select l.id, l.company_name, l.status, l.owner_id, l.service_id,
           coalesce(max(a.timestamp), l.created_at) as last_meaningful_at
    from leads l
    left join lead_activities a on a.lead_id = l.id and a.action != 'FIELD_UPDATED'
    where l.owner_id = any(${params.ownerIds})
      and l.status = any(${params.statuses}::"LeadStatus"[])
      and (l.owner_pinned_at is null or l.owner_pinned_at < ${pinExpiry})
    group by l.id
    having coalesce(max(a.timestamp), l.created_at) < ${threshold}
    order by last_meaningful_at asc
  `;

  return rows.map((r) => ({
    id: r.id,
    companyName: r.company_name,
    status: r.status,
    ownerId: r.owner_id,
    serviceId: r.service_id,
    lastMeaningfulAt: r.last_meaningful_at,
  }));
}
