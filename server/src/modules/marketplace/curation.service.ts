import { ActivityAction, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/common/errors/AppError";
import { logActivity } from "@/modules/activities/activities.service";
import { AuthUser } from "@/common/middleware/auth";

export async function releaseLead(user: AuthUser, leadId: string, overridePrice?: number) {
  if (user.role !== Role.FOUNDER && user.role !== Role.MANAGER) {
    throw new ForbiddenError("Only Founder or Manager can release a lead to the marketplace");
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { service: true } });
  if (!lead) throw new NotFoundError("Lead");
  if (lead.status !== "LOST") {
    throw new ValidationError("Only Lost leads can be released to the marketplace");
  }
  if (lead.releasedToMarketplaceAt) {
    throw new ValidationError("This lead has already been released to the marketplace");
  }

  const [marketplaceLead] = await prisma.$transaction([
    prisma.marketplaceLead.create({
      data: {
        originalLeadId: lead.id,
        companyName: lead.companyName,
        contactPerson: lead.contactPerson,
        phone: lead.phone,
        email: lead.email,
        industry: lead.industry,
        city: lead.city,
        state: lead.state,
        service: lead.service?.name ?? null,
        lostReason: lead.lostReason,
        expectedDealValue: lead.expectedDealValue,
        approvedById: user.id,
        overridePrice: overridePrice ?? null,
      },
    }),
    prisma.lead.update({ where: { id: lead.id }, data: { releasedToMarketplaceAt: new Date() } }),
  ]);

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    action: ActivityAction.RELEASED_TO_MARKETPLACE,
    notes: overridePrice ? `Listed at override price ₹${overridePrice}/lead` : undefined,
  });

  return marketplaceLead;
}
