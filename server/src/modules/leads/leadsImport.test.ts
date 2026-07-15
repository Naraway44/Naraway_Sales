import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/common/prisma";
import { TestWorld } from "@/test/fixtures";
import { parseCsv, previewImport, confirmImport } from "./leadsImport.service";

describe("leadsImport", () => {
  describe("parseCsv (pure parsing, no DB)", () => {
    it("parses a simple comma-delimited file with a header row", () => {
      const csv = "Company,Phone\nAcme Inc,+1000001\nBeta LLC,+1000002";
      const [sheet] = parseCsv(csv);

      expect(sheet.headers).toEqual(["Company", "Phone"]);
      expect(sheet.rows).toHaveLength(2);
      expect(sheet.rows[0]).toEqual({ Company: "Acme Inc", Phone: "+1000001" });
    });

    it("strips a leading UTF-8 BOM", () => {
      const csv = "﻿Company,Phone\nAcme Inc,+1000001";
      const [sheet] = parseCsv(csv);
      expect(sheet.headers[0]).toBe("Company");
    });

    it("skips empty rows", () => {
      const csv = "Company,Phone\nAcme Inc,+1000001\n\n\nBeta LLC,+1000002";
      const [sheet] = parseCsv(csv);
      expect(sheet.rows).toHaveLength(2);
    });

    it("finds the real header row even with banner text above it", () => {
      const csv = [
        "Company Registration Report - Q1 2026",
        "",
        "Company,Phone,Email",
        "Acme Inc,+1000001,acme@test.local",
      ].join("\n");
      const [sheet] = parseCsv(csv);

      expect(sheet.headers).toEqual(["Company", "Phone", "Email"]);
      expect(sheet.rows).toHaveLength(1);
      expect(sheet.rows[0].Company).toBe("Acme Inc");
    });
  });

  describe("previewImport / confirmImport (DB-backed)", () => {
    const world = new TestWorld();
    afterAll(() => world.cleanup());

    it("flags a row missing the required companyName as an error", async () => {
      const rows = [{ Company: "", Phone: "+1999999" }];
      const preview = await previewImport(rows, { Company: "companyName", Phone: "phone" });

      expect(preview[0].errors.length).toBeGreaterThan(0);
      expect(preview[0].isDuplicate).toBe(false);
    });

    it("passes a valid row through with no errors and not flagged as a duplicate", async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const rows = [{ Company: `Preview Co ${suffix}`, Phone: `+19${suffix}` }];
      const preview = await previewImport(rows, { Company: "companyName", Phone: "phone" });

      expect(preview[0].errors).toEqual([]);
      expect(preview[0].isDuplicate).toBe(false);
    });

    it("flags a row as a duplicate when its phone already exists in the database", async () => {
      const existing = await world.lead({ phone: "+15550001111" });

      const rows = [{ Company: "Some New Name Same Phone", Phone: existing.phone! }];
      const preview = await previewImport(rows, { Company: "companyName", Phone: "phone" });

      expect(preview[0].isDuplicate).toBe(true);
    });

    it("creates a lead, logs an IMPORTED activity, and auto-assigns it", async () => {
      const team = await world.team();
      const service = await world.service();
      await world.rule(service.id, team.id);
      const rep = await world.user({ teamId: team.id, leadCapacity: 10 });
      const actor = await world.user();

      const suffix = Math.random().toString(36).slice(2, 8);
      const rows = [{ companyName: `Confirm Co ${suffix}`, phone: `+16${suffix}`, serviceId: service.id }];

      const result = await confirmImport(rows, actor.id);
      expect(result.createdCount).toBe(1);
      world.trackLead(result.createdIds[0]);

      const created = await prisma.lead.findUniqueOrThrow({ where: { id: result.createdIds[0] } });
      expect(created.ownerId).toBe(rep.id); // auto-assigned via the service routing rule

      const activity = await prisma.leadActivity.findFirst({
        where: { leadId: created.id, action: "IMPORTED" },
      });
      expect(activity).not.toBeNull();
    });

    it("skips a row whose phone already exists in the database", async () => {
      const existing = await world.lead({ phone: "+15550002222" });
      const actor = await world.user();

      const rows = [{ companyName: "Duplicate Attempt", phone: existing.phone! }];
      const result = await confirmImport(rows, actor.id);

      expect(result.createdCount).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toMatch(/duplicate/i);
    });

    it("skips the second of two rows in the same batch that share a phone", async () => {
      const actor = await world.user();
      const suffix = Math.random().toString(36).slice(2, 8);
      const sharedPhone = `+17${suffix}`;

      const rows = [
        { companyName: "Batch Dup A", phone: sharedPhone },
        { companyName: "Batch Dup B", phone: sharedPhone },
      ];
      const result = await confirmImport(rows, actor.id);

      expect(result.createdCount).toBe(1);
      result.createdIds.forEach((id) => world.trackLead(id));
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].rowNumber).toBe(2);
    });

    it("skips a row that fails schema validation instead of throwing", async () => {
      const actor = await world.user();
      const rows = [{ companyName: "", phone: "+18000000000" }];

      const result = await confirmImport(rows, actor.id);
      expect(result.createdCount).toBe(0);
      expect(result.skipped).toHaveLength(1);
    });

    it("is safe to retry: re-running the same batch skips already-created rows instead of duplicating them", async () => {
      const actor = await world.user();
      const suffix = Math.random().toString(36).slice(2, 8);
      const rows = [{ companyName: `Retry Co ${suffix}`, phone: `+19${suffix}` }];

      const first = await confirmImport(rows, actor.id);
      expect(first.createdCount).toBe(1);
      world.trackLead(first.createdIds[0]);

      const second = await confirmImport(rows, actor.id);
      expect(second.createdCount).toBe(0);
      expect(second.skipped).toHaveLength(1);

      const matching = await prisma.lead.findMany({ where: { phone: `+19${suffix}` } });
      expect(matching).toHaveLength(1);
    });
  });
});
