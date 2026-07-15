import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/common/prisma";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { TestWorld } from "@/test/fixtures";
import { assignmentService } from "./assignment.service";

describe("AssignmentService", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  describe("assignManual", () => {
    it("assigns an unowned lead and logs ASSIGNED", async () => {
      const team = await world.team();
      const owner = await world.user({ teamId: team.id });
      const actor = await world.user({ teamId: team.id });
      const lead = await world.lead();

      const updated = await assignmentService.assignManual(lead.id, owner.id, actor.id);
      expect(updated.ownerId).toBe(owner.id);

      const activity = await prisma.leadActivity.findFirst({
        where: { leadId: lead.id },
        orderBy: { timestamp: "desc" },
      });
      expect(activity?.action).toBe("ASSIGNED");
    });

    it("logs REASSIGNED when the lead already had an owner", async () => {
      const team = await world.team();
      const firstOwner = await world.user({ teamId: team.id });
      const secondOwner = await world.user({ teamId: team.id });
      const actor = await world.user({ teamId: team.id });
      const lead = await world.lead({ ownerId: firstOwner.id });

      await assignmentService.assignManual(lead.id, secondOwner.id, actor.id);

      const activity = await prisma.leadActivity.findFirst({
        where: { leadId: lead.id },
        orderBy: { timestamp: "desc" },
      });
      expect(activity?.action).toBe("REASSIGNED");
    });

    it("throws NotFoundError for a nonexistent lead", async () => {
      const owner = await world.user();
      await expect(assignmentService.assignManual("does-not-exist", owner.id, owner.id)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it("throws ValidationError when the target owner is inactive", async () => {
      const owner = await world.user({ isActive: false });
      const lead = await world.lead();
      await expect(assignmentService.assignManual(lead.id, owner.id, owner.id)).rejects.toBeInstanceOf(
        ValidationError
      );
    });
  });

  describe("autoAssign", () => {
    it("leaves the lead unassigned when no routing rule exists for its service", async () => {
      const service = await world.service();
      const lead = await world.lead({ serviceId: service.id });

      const result = await assignmentService.autoAssign(lead.id);
      expect(result.ownerId).toBeNull();
    });

    it("round-robins between two under-capacity reps on the routed team", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const repA = await world.user({ teamId: team.id, leadCapacity: 10 });
      const repB = await world.user({ teamId: team.id, leadCapacity: 10 });

      const leadOne = await world.lead({ serviceId: service.id });
      const leadTwo = await world.lead({ serviceId: service.id });

      const resultOne = await assignmentService.autoAssign(leadOne.id);
      const resultTwo = await assignmentService.autoAssign(leadTwo.id);

      const owners = new Set([resultOne.ownerId, resultTwo.ownerId]);
      expect(owners.has(repA.id) || owners.has(repB.id)).toBe(true);
      // Two leads through a fresh 2-person round robin should land on both reps, not stack on one.
      expect(owners.size).toBe(2);
    });

    it("skips a rep already at capacity", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const fullRep = await world.user({ teamId: team.id, leadCapacity: 1 });
      const openRep = await world.user({ teamId: team.id, leadCapacity: 10 });
      // Fill fullRep to capacity first.
      await world.lead({ ownerId: fullRep.id, serviceId: service.id, status: "NEW" });

      const newLead = await world.lead({ serviceId: service.id });
      const result = await assignmentService.autoAssign(newLead.id);

      expect(result.ownerId).toBe(openRep.id);
    });

    it("falls back to the least-loaded rep when the whole team is over capacity", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const busyRep = await world.user({ teamId: team.id, leadCapacity: 1 });
      const lessBusyRep = await world.user({ teamId: team.id, leadCapacity: 1 });
      // Both over capacity, but busyRep has strictly more open leads.
      await world.lead({ ownerId: busyRep.id, serviceId: service.id, status: "NEW" });
      await world.lead({ ownerId: busyRep.id, serviceId: service.id, status: "NEW" });
      await world.lead({ ownerId: lessBusyRep.id, serviceId: service.id, status: "NEW" });

      const newLead = await world.lead({ serviceId: service.id });
      const result = await assignmentService.autoAssign(newLead.id);

      expect(result.ownerId).toBe(lessBusyRep.id);
    });
  });

  describe("backfillIfCapacityFreed", () => {
    it("assigns exactly one unassigned lead when capacity is available", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 10 });
      const poolLeadA = await world.lead({ serviceId: service.id });
      const poolLeadB = await world.lead({ serviceId: service.id });

      await assignmentService.backfillIfCapacityFreed(rep.id);

      const assignedCount = await prisma.lead.count({
        where: { id: { in: [poolLeadA.id, poolLeadB.id] }, ownerId: rep.id },
      });
      expect(assignedCount).toBe(1);
    });

    it("does nothing when the rep is already at capacity", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 1 });
      await world.lead({ ownerId: rep.id, serviceId: service.id, status: "NEW" });
      const poolLead = await world.lead({ serviceId: service.id });

      await assignmentService.backfillIfCapacityFreed(rep.id);

      const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: poolLead.id } });
      expect(unchanged.ownerId).toBeNull();
    });
  });

  describe("topUpToCapacity", () => {
    // NOTE: topUpToCapacity's fallback branch deliberately pulls from the *entire*
    // unassigned pool with no service/team scoping (so a routing gap never leaves a rep
    // idle) — that pool is shared with real data and other tests in this live dev DB.
    // Every case below is built so slotsFree is exactly satisfied by leads scoped to a
    // fresh, unique test service, so the fallback branch (remaining > 0) never actually
    // triggers and can't reach into the ambient pool. An earlier version of these tests
    // didn't do this and ended up assigning real, untracked leads to test users — do not
    // remove this constraint without re-verifying that risk is still covered.

    it("assigns a lead whose service routes to the rep's team", async () => {
      const team = await world.team();
      const routedService = await world.service();
      await world.rule(routedService.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 1 });
      const routedLead = await world.lead({ serviceId: routedService.id });

      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(1);

      const after = await prisma.lead.findUniqueOrThrow({ where: { id: routedLead.id } });
      expect(after.ownerId).toBe(rep.id);
    });

    it("never assigns the same lead twice when slotsFree exactly matches the routed pool", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 2 });
      const leadA = await world.lead({ serviceId: service.id });
      const leadB = await world.lead({ serviceId: service.id });

      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(2);

      const [afterA, afterB] = await Promise.all([
        prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } }),
        prisma.lead.findUniqueOrThrow({ where: { id: leadB.id } }),
      ]);
      expect(afterA.ownerId).toBe(rep.id);
      expect(afterB.ownerId).toBe(rep.id);
    });

    it("respects the capacity cap even when the routed pool has more leads than slots free", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 1 });
      await world.lead({ serviceId: service.id });
      await world.lead({ serviceId: service.id });

      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(1);

      const openCount = await prisma.lead.count({ where: { ownerId: rep.id } });
      expect(openCount).toBe(1);
    });

    it("counts existing open leads against capacity before topping up", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 2 });
      await world.lead({ ownerId: rep.id, serviceId: service.id, status: "NEW" }); // 1 of 2 slots already used
      const poolLead = await world.lead({ serviceId: service.id });

      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(1);

      const after = await prisma.lead.findUniqueOrThrow({ where: { id: poolLead.id } });
      expect(after.ownerId).toBe(rep.id);
    });

    it("returns zero for an inactive owner", async () => {
      const rep = await world.user({ isActive: false });
      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(0);
    });

    it("returns zero for an owner with no team", async () => {
      const rep = await world.user({ teamId: null });
      const result = await assignmentService.topUpToCapacity(rep.id);
      expect(result.assignedCount).toBe(0);
    });
  });

  describe("reassignStaleLeads", () => {
    it("moves a lead untouched for 5+ days to another active rep on the same team", async () => {
      const team = await world.team();
      const staleOwner = await world.user({ teamId: team.id, leadCapacity: 10 });
      const otherRep = await world.user({ teamId: team.id, leadCapacity: 10 });
      const lead = await world.lead({ ownerId: staleOwner.id, status: "NEW" });
      await world.backdateActivity(lead.id, new Date(Date.now() - 7 * 86_400_000));

      await assignmentService.reassignStaleLeads();

      const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(after.ownerId).toBe(otherRep.id);
    });

    it("does not reassign a lead the owner has pinned", async () => {
      const team = await world.team();
      const staleOwner = await world.user({ teamId: team.id, leadCapacity: 10 });
      await world.user({ teamId: team.id, leadCapacity: 10 }); // another rep, so reassignment would be possible if not pinned
      const lead = await world.lead({ ownerId: staleOwner.id, status: "NEW", ownerPinnedAt: new Date() });
      await world.backdateActivity(lead.id, new Date(Date.now() - 7 * 86_400_000));

      await assignmentService.reassignStaleLeads();

      const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(after.ownerId).toBe(staleOwner.id);
    });

    it("does not reassign a lead touched recently", async () => {
      const team = await world.team();
      const owner = await world.user({ teamId: team.id, leadCapacity: 10 });
      await world.user({ teamId: team.id, leadCapacity: 10 });
      const lead = await world.lead({ ownerId: owner.id, status: "NEW" });
      await world.backdateActivity(lead.id, new Date(Date.now() - 2 * 86_400_000));

      await assignmentService.reassignStaleLeads();

      const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(after.ownerId).toBe(owner.id);
    });
  });
});
