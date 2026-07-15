import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/common/prisma";
import { UnauthorizedError, NotFoundError } from "@/common/errors/AppError";
import { TestWorld } from "@/test/fixtures";
import { authService } from "./auth.service";

const PASSWORD = "TestPass123!";

describe("AuthService", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  describe("login", () => {
    it("succeeds with correct credentials and opens a session", async () => {
      const user = await world.user();
      const result = await authService.login({ email: user.email, password: PASSWORD });

      expect(result.token).toBeTruthy();
      expect(result.user.id).toBe(user.id);
      expect((result.user as any).passwordHash).toBeUndefined();

      const session = await prisma.userSession.findFirst({ where: { userId: user.id } });
      expect(session).not.toBeNull();
      expect(session!.logoutAt).toBeNull();
    });

    it("rejects a wrong password", async () => {
      const user = await world.user();
      await expect(authService.login({ email: user.email, password: "wrong-password" })).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });

    it("rejects an unknown email", async () => {
      await expect(
        authService.login({ email: "does-not-exist@test.local", password: PASSWORD })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rejects a deactivated account even with the correct password", async () => {
      const user = await world.user({ isActive: false });
      await expect(authService.login({ email: user.email, password: PASSWORD })).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });
  });

  describe("logout", () => {
    it("closes the session and is a no-op the second time", async () => {
      const user = await world.user();
      const { token: _t } = await authService.login({ email: user.email, password: PASSWORD });
      const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });

      await authService.logout(session.id);
      const closed = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(closed.logoutAt).not.toBeNull();

      // Calling again must not throw or move logoutAt.
      await authService.logout(session.id);
      const stillClosed = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(stillClosed.logoutAt!.getTime()).toBe(closed.logoutAt!.getTime());
    });

    it("records an IdleFlag for a trailing gap of 30+ minutes since the last heartbeat", async () => {
      const user = await world.user();
      const oldHeartbeat = new Date(Date.now() - 45 * 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: oldHeartbeat },
      });

      await authService.logout(session.id);

      const flag = await prisma.idleFlag.findFirst({ where: { sessionId: session.id } });
      expect(flag).not.toBeNull();
      expect(flag!.durationMinutes).toBeGreaterThanOrEqual(45);
    });

    it("does not record an IdleFlag when the last heartbeat was recent", async () => {
      const user = await world.user();
      const recentHeartbeat = new Date(Date.now() - 5 * 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: recentHeartbeat },
      });

      await authService.logout(session.id);

      const flag = await prisma.idleFlag.findFirst({ where: { sessionId: session.id } });
      expect(flag).toBeNull();
    });
  });

  describe("heartbeat", () => {
    it("accumulates active seconds for a short gap", async () => {
      const user = await world.user();
      const priorHeartbeat = new Date(Date.now() - 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: priorHeartbeat, activeSeconds: 100 },
      });

      const result = await authService.heartbeat(user.id, session.id);
      expect(result.activeSeconds).toBeGreaterThanOrEqual(155);
      expect(result.activeSeconds).toBeLessThan(170);
    });

    it("flags an IdleFlag instead of counting active time for a 30+ minute gap", async () => {
      const user = await world.user();
      const oldHeartbeat = new Date(Date.now() - 40 * 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: oldHeartbeat, activeSeconds: 100 },
      });

      const result = await authService.heartbeat(user.id, session.id);
      expect(result.activeSeconds).toBe(100); // unchanged — the gap wasn't active time

      const flag = await prisma.idleFlag.findFirst({ where: { sessionId: session.id } });
      expect(flag).not.toBeNull();
      expect(flag!.durationMinutes).toBeGreaterThanOrEqual(40);
    });

    it("neither counts nor flags a gap in the dead zone between active and idle thresholds", async () => {
      const user = await world.user();
      const midGapHeartbeat = new Date(Date.now() - 10 * 60 * 1000); // 10 min: > 150s, < 30min
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: midGapHeartbeat, activeSeconds: 100 },
      });

      const result = await authService.heartbeat(user.id, session.id);
      expect(result.activeSeconds).toBe(100);

      const flag = await prisma.idleFlag.findFirst({ where: { sessionId: session.id } });
      expect(flag).toBeNull();
    });

    it("throws for a session that's already closed", async () => {
      const user = await world.user();
      const session = await prisma.userSession.create({
        data: { userId: user.id, logoutAt: new Date() },
      });

      await expect(authService.heartbeat(user.id, session.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("closeAbandonedSessions", () => {
    it("closes a session with no heartbeat in 8+ hours and flags the trailing gap", async () => {
      const user = await world.user();
      const oldHeartbeat = new Date(Date.now() - 9 * 60 * 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: oldHeartbeat },
      });

      const { closedCount } = await authService.closeAbandonedSessions();
      expect(closedCount).toBeGreaterThanOrEqual(1);

      const closed = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(closed.logoutAt?.getTime()).toBe(oldHeartbeat.getTime());

      const flag = await prisma.idleFlag.findFirst({ where: { sessionId: session.id } });
      expect(flag).not.toBeNull();
      expect(flag!.durationMinutes).toBeGreaterThanOrEqual(9 * 60);
    });

    it("falls back to loginAt when there was never a heartbeat", async () => {
      const user = await world.user();
      const oldLogin = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const session = await prisma.userSession.create({
        data: { userId: user.id, loginAt: oldLogin },
      });

      await authService.closeAbandonedSessions();

      const closed = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(closed.logoutAt?.getTime()).toBe(oldLogin.getTime());
    });

    it("leaves a recently active session untouched", async () => {
      const user = await world.user();
      const session = await prisma.userSession.create({
        data: { userId: user.id, lastHeartbeatAt: new Date(Date.now() - 5 * 60 * 1000) },
      });

      await authService.closeAbandonedSessions();

      const stillOpen = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(stillOpen.logoutAt).toBeNull();
    });
  });

  describe("changePassword", () => {
    it("updates the hash and clears mustChangePassword on success", async () => {
      const user = await world.user();
      const { token: _t } = await authService.login({ email: user.email, password: PASSWORD });
      const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });

      const result = await authService.changePassword(user.id, session.id, {
        currentPassword: PASSWORD,
        newPassword: "NewPass456!",
      });
      expect(result.user.mustChangePassword).toBe(false);

      // Old password no longer works, new one does.
      await expect(authService.login({ email: user.email, password: PASSWORD })).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      const relogin = await authService.login({ email: user.email, password: "NewPass456!" });
      expect(relogin.user.id).toBe(user.id);
    });

    it("rejects an incorrect current password", async () => {
      const user = await world.user();
      const session = await prisma.userSession.create({ data: { userId: user.id } });

      await expect(
        authService.changePassword(user.id, session.id, { currentPassword: "wrong", newPassword: "NewPass456!" })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });
});
