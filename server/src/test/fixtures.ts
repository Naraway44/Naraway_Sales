import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Role, LeadStatus, Priority } from "@prisma/client";
import { prisma } from "@/common/prisma";

/**
 * Every fixture created in a test run gets tracked here so cleanup() can tear it all down
 * in one call, in FK-safe order (leads before users, users before teams/services) — tests
 * run against the real dev Supabase DB (no separate test DB exists), so leaving fixtures
 * behind would pollute it for manual use and for the next test run.
 */
export class TestWorld {
  leadIds: string[] = [];
  userIds: string[] = [];
  teamIds: string[] = [];
  serviceIds: string[] = [];
  ruleIds: string[] = [];
  leadRequestIds: string[] = [];
  buyerIds: string[] = [];
  marketplaceLeadIds: string[] = [];

  private tag = randomUUID().slice(0, 8);

  async team(namePrefix = "TestTeam") {
    const team = await prisma.team.create({ data: { name: `${namePrefix}-${this.tag}-${randomUUID().slice(0, 6)}` } });
    this.teamIds.push(team.id);
    return team;
  }

  async service(namePrefix = "TestService") {
    const service = await prisma.service.create({
      data: { name: `${namePrefix}-${this.tag}-${randomUUID().slice(0, 6)}` },
    });
    this.serviceIds.push(service.id);
    return service;
  }

  async rule(serviceId: string, teamId: string) {
    const rule = await prisma.assignmentRule.create({ data: { serviceId, teamId } });
    this.ruleIds.push(rule.id);
    return rule;
  }

  async user(opts: {
    role?: Role;
    teamId?: string | null;
    leadCapacity?: number;
    isActive?: boolean;
    workStartTime?: string;
    workDays?: number[];
  } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const passwordHash = await bcrypt.hash("TestPass123!", 4);
    const user = await prisma.user.create({
      data: {
        employeeId: `TST-${suffix}`,
        name: `Test User ${suffix}`,
        email: `${this.tag}-${suffix}@test.local`,
        passwordHash,
        role: opts.role ?? Role.EXECUTIVE,
        teamId: opts.teamId ?? null,
        leadCapacity: opts.leadCapacity ?? 60,
        isActive: opts.isActive ?? true,
        ...(opts.workStartTime ? { workStartTime: opts.workStartTime } : {}),
        ...(opts.workDays ? { workDays: opts.workDays } : {}),
      },
    });
    this.userIds.push(user.id);
    return user;
  }

  async lead(opts: {
    ownerId?: string | null;
    serviceId?: string | null;
    status?: LeadStatus;
    priority?: Priority;
    createdAt?: Date;
    ownerPinnedAt?: Date | null;
    phone?: string;
    email?: string;
  } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const lead = await prisma.lead.create({
      data: {
        companyName: `Test Co ${suffix}`,
        contactPerson: "Test Contact",
        phone: opts.phone ?? `+1000${suffix}`,
        email: opts.email,
        ownerId: opts.ownerId ?? null,
        serviceId: opts.serviceId ?? null,
        status: opts.status ?? LeadStatus.NEW,
        priority: opts.priority ?? Priority.MEDIUM,
        ownerPinnedAt: opts.ownerPinnedAt ?? null,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
    this.leadIds.push(lead.id);
    return lead;
  }

  trackLead(id: string) {
    this.leadIds.push(id);
  }

  trackLeadRequest(id: string) {
    this.leadRequestIds.push(id);
  }

  trackBuyer(id: string) {
    this.buyerIds.push(id);
  }

  trackMarketplaceLead(id: string) {
    this.marketplaceLeadIds.push(id);
  }

  async buyer(opts: { createdById: string; isActive?: boolean } = { createdById: "" }) {
    const suffix = randomUUID().slice(0, 8);
    const passwordHash = await bcrypt.hash("TestPass123!", 4);
    const buyer = await prisma.buyer.create({
      data: {
        name: `Test Buyer ${suffix}`,
        email: `${this.tag}-buyer-${suffix}@test.local`,
        passwordHash,
        isActive: opts.isActive ?? true,
        createdById: opts.createdById,
      },
    });
    this.buyerIds.push(buyer.id);
    return buyer;
  }

  async marketplaceLead(opts: {
    approvedById: string;
    resaleStatus?: "LISTED" | "PENDING" | "SOLD";
    buyerId?: string | null;
    overridePrice?: number | null;
    listedAt?: Date;
  }) {
    const suffix = randomUUID().slice(0, 8);
    const marketplaceLead = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: `test-original-${suffix}`,
        companyName: `Test Marketplace Co ${suffix}`,
        approvedById: opts.approvedById,
        resaleStatus: opts.resaleStatus ?? "LISTED",
        buyerId: opts.buyerId ?? null,
        overridePrice: opts.overridePrice ?? null,
        ...(opts.listedAt ? { listedAt: opts.listedAt } : {}),
      },
    });
    this.marketplaceLeadIds.push(marketplaceLead.id);
    return marketplaceLead;
  }

  /** Backdates a lead's most recent meaningful activity by inserting a CREATED row with an
   *  explicit timestamp — findStaleLeads reads from lead_activities, not just createdAt. */
  async backdateActivity(leadId: string, timestamp: Date) {
    await prisma.leadActivity.create({
      data: { leadId, userId: null, action: "CREATED", timestamp },
    });
  }

  async cleanup() {
    if (this.marketplaceLeadIds.length) {
      await prisma.marketplaceLead.deleteMany({ where: { id: { in: this.marketplaceLeadIds } } });
    }
    if (this.buyerIds.length) {
      await prisma.buyer.deleteMany({ where: { id: { in: this.buyerIds } } });
    }
    if (this.leadRequestIds.length) {
      await prisma.leadRequest.deleteMany({ where: { id: { in: this.leadRequestIds } } });
    }
    if (this.leadIds.length) {
      await prisma.lead.deleteMany({ where: { id: { in: this.leadIds } } });
    }
    if (this.userIds.length) {
      // Safety net: assignment logic (topUpToCapacity's fallback, autoAssign's least-loaded
      // fallback) pulls from the *global* unassigned/over-capacity pool with no test
      // scoping — a test can end up assigning a real, untracked lead to a test user. Null
      // those out before deleting the user instead of leaving a live lead pointed at a
      // deleted account (or crashing this delete with an FK violation and leaving the
      // fixture — and the real lead's bad ownerId — stranded).
      await prisma.lead.updateMany({ where: { ownerId: { in: this.userIds } }, data: { ownerId: null } });
      await prisma.lead.updateMany({ where: { createdById: { in: this.userIds } }, data: { createdById: null } });
      await prisma.leadActivity.updateMany({ where: { userId: { in: this.userIds } }, data: { userId: null } });
      await prisma.user.deleteMany({ where: { id: { in: this.userIds } } });
    }
    if (this.ruleIds.length) {
      await prisma.assignmentRule.deleteMany({ where: { id: { in: this.ruleIds } } });
    }
    if (this.serviceIds.length) {
      await prisma.service.deleteMany({ where: { id: { in: this.serviceIds } } });
    }
    if (this.teamIds.length) {
      await prisma.team.deleteMany({ where: { id: { in: this.teamIds } } });
    }
  }
}
