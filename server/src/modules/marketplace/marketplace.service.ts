import crypto from "crypto";
import { MarketplaceLeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { UnauthorizedError, ValidationError } from "@/common/errors/AppError";
import { razorpay } from "@/common/razorpay";
import { env } from "@/common/env";
import { leadsToCsv } from "@/modules/leads/leadsImport.service";
import { priceForQuantity } from "./marketplace.pricing";
import { CheckoutInput, MarketplaceFilter, MarketplaceSearchQuery } from "./marketplace.schemas";

const ABANDONED_CHECKOUT_MINUTES = 30;
const EXCLUSIVITY_DAYS = 60;

function filterWhere(filter: MarketplaceFilter): Prisma.MarketplaceLeadWhereInput {
  return {
    ...(filter.service ? { service: filter.service } : {}),
    ...(filter.industry ? { industry: filter.industry } : {}),
    ...(filter.city ? { city: filter.city } : {}),
    ...(filter.state ? { state: filter.state } : {}),
    ...(filter.lostReason ? { lostReason: filter.lostReason } : {}),
    ...(filter.dealValueMin != null || filter.dealValueMax != null
      ? {
          expectedDealValue: {
            ...(filter.dealValueMin != null ? { gte: filter.dealValueMin } : {}),
            ...(filter.dealValueMax != null ? { lte: filter.dealValueMax } : {}),
          },
        }
      : {}),
    ...(filter.dateListedFrom || filter.dateListedTo
      ? {
          listedAt: {
            ...(filter.dateListedFrom ? { gte: filter.dateListedFrom } : {}),
            ...(filter.dateListedTo ? { lte: new Date(filter.dateListedTo.getTime() + 86_400_000 - 1) } : {}),
          },
        }
      : {}),
    ...(filter.keyword ? { companyName: { contains: filter.keyword, mode: "insensitive" } } : {}),
  };
}

export class MarketplaceService {
  /** Reverts checkouts nobody completed payment on — otherwise those leads would stay
   *  PENDING (invisible to every other buyer) forever. Piggybacked on the search endpoint
   *  since there's no cron infra on the free tier, same "sweep on a frequently-hit route"
   *  pattern the alerts poll already uses for abandoned staff sessions. */
  async releaseAbandonedCheckouts() {
    const cutoff = new Date(Date.now() - ABANDONED_CHECKOUT_MINUTES * 60 * 1000);
    const result = await prisma.marketplaceLead.updateMany({
      where: { resaleStatus: MarketplaceLeadStatus.PENDING, checkoutStartedAt: { lt: cutoff } },
      data: {
        resaleStatus: MarketplaceLeadStatus.LISTED,
        buyerId: null,
        pricePaid: null,
        checkoutStartedAt: null,
        gatewayOrderId: null,
      },
    });
    return { releasedCount: result.count };
  }

  async search(query: MarketplaceSearchQuery) {
    await this.releaseAbandonedCheckouts();

    const where: Prisma.MarketplaceLeadWhereInput = {
      resaleStatus: MarketplaceLeadStatus.LISTED,
      ...filterWhere(query),
    };

    const availableCount = await prisma.marketplaceLead.count({ where });
    const deliverable = Math.min(query.quantity, availableCount);
    const pricePerLead = deliverable > 0 ? priceForQuantity(deliverable) : 0;

    return {
      availableCount,
      requestedQuantity: query.quantity,
      deliverableQuantity: deliverable,
      pricePerLead,
      estimatedTotal: pricePerLead * deliverable,
    };
  }

  async createCheckout(buyerId: string, input: CheckoutInput) {
    await this.releaseAbandonedCheckouts();

    const where: Prisma.MarketplaceLeadWhereInput = {
      resaleStatus: MarketplaceLeadStatus.LISTED,
      ...filterWhere(input),
    };

    const claimed = await prisma.$transaction(async (tx) => {
      const candidates = await tx.marketplaceLead.findMany({
        where,
        orderBy: { listedAt: "asc" },
        take: input.quantity,
        select: { id: true },
      });
      if (candidates.length === 0) return [];

      const candidateIds = candidates.map((c) => c.id);
      // The WHERE resaleStatus: LISTED re-check here is what makes this race-safe: if a
      // concurrent checkout already flipped one of these rows to PENDING, Postgres's
      // row-level locking means this UPDATE simply won't affect that row, rather than
      // both checkouts claiming the same lead.
      await tx.marketplaceLead.updateMany({
        where: { id: { in: candidateIds }, resaleStatus: MarketplaceLeadStatus.LISTED },
        data: { resaleStatus: MarketplaceLeadStatus.PENDING, buyerId, checkoutStartedAt: new Date() },
      });

      return tx.marketplaceLead.findMany({
        where: { id: { in: candidateIds }, resaleStatus: MarketplaceLeadStatus.PENDING, buyerId },
      });
    });

    if (claimed.length === 0) {
      throw new ValidationError("No leads currently available matching your filters");
    }

    const pricePerLead = priceForQuantity(claimed.length);
    const pricedLeads = claimed.map((lead) => ({
      id: lead.id,
      pricePaid: lead.overridePrice ? Number(lead.overridePrice) : pricePerLead,
    }));
    const totalAmount = pricedLeads.reduce((sum, l) => sum + l.pricePaid, 0);

    await Promise.all(
      pricedLeads.map((lead) =>
        prisma.marketplaceLead.update({ where: { id: lead.id }, data: { pricePaid: lead.pricePaid } })
      )
    );

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Razorpay expects paise
      currency: "INR",
      receipt: `mkt_${buyerId}_${Date.now()}`,
    });

    await prisma.marketplaceLead.updateMany({
      where: { id: { in: pricedLeads.map((l) => l.id) } },
      data: { gatewayOrderId: order.id },
    });

    return {
      razorpayOrderId: order.id,
      razorpayKeyId: env.razorpayKeyId,
      amount: typeof order.amount === "string" ? parseInt(order.amount, 10) : order.amount,
      currency: "INR",
      leadCount: pricedLeads.length,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
    if (!signature || expected !== signature) {
      throw new UnauthorizedError("Invalid webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf-8"));
    if (payload.event !== "payment.captured") {
      return { processed: false };
    }

    const orderId: string = payload.payload.payment.entity.order_id;
    const paymentId: string = payload.payload.payment.entity.id;

    const alreadyProcessed = await prisma.marketplaceLead.findFirst({
      where: { gatewayOrderId: orderId, resaleStatus: MarketplaceLeadStatus.SOLD },
    });
    if (alreadyProcessed) {
      return { processed: true, alreadyProcessed: true };
    }

    const now = new Date();
    const exclusiveUntil = new Date(now.getTime() + EXCLUSIVITY_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.marketplaceLead.updateMany({
      where: { gatewayOrderId: orderId, resaleStatus: MarketplaceLeadStatus.PENDING },
      data: {
        resaleStatus: MarketplaceLeadStatus.SOLD,
        purchasedAt: now,
        exclusiveUntil,
        gatewayPaymentId: paymentId,
        checkoutStartedAt: null,
      },
    });

    return { processed: true, confirmedCount: result.count };
  }

  async myPurchases(buyerId: string) {
    return prisma.marketplaceLead.findMany({
      where: { buyerId, resaleStatus: MarketplaceLeadStatus.SOLD },
      orderBy: { purchasedAt: "desc" },
    });
  }

  async exportCsv(buyerId: string) {
    const leads = await this.myPurchases(buyerId);

    // Buyers aren't Users, so this can't carry an actorId the way staff actions do —
    // entityType/entityId (Buyer's own id) is enough to answer "who exported, when" on
    // the same AuditLog table rather than adding a parallel buyer-specific log.
    await prisma.auditLog.create({
      data: { actorId: null, action: "EXPORT", entityType: "MarketplaceExport", entityId: buyerId },
    });

    return leadsToCsv(
      leads.map((l) => ({
        companyName: l.companyName,
        contactPerson: l.contactPerson,
        phone: l.phone,
        email: l.email,
        industry: l.industry,
        city: l.city,
        state: l.state,
        service: l.service,
        pricePaid: l.pricePaid?.toString(),
        purchasedAt: l.purchasedAt,
        exclusiveUntil: l.exclusiveUntil,
      }))
    );
  }
}

export const marketplaceService = new MarketplaceService();
