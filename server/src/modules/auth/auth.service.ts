import bcrypt from "bcryptjs";
import { prisma } from "@/common/prisma";
import { signToken } from "@/common/middleware/auth";
import { NotFoundError, UnauthorizedError } from "@/common/errors/AppError";
import { LoginInput, ChangePasswordInput } from "./auth.schemas";

// A heartbeat only fires (client-side) when there's been real activity in the last
// interval, so a gap this small or smaller is treated as continuous active time.
// Generous relative to the client's ~60s interval to tolerate network jitter/backoff.
const HEARTBEAT_ACTIVE_GAP_SECONDS = 150;

// Anything longer than this since the last heartbeat, while the session is still open,
// is a discrete "away from screen" incident worth flagging for review — not just a
// silent gap in the active-time total.
const IDLE_FLAG_THRESHOLD_MINUTES = 30;

// A session with no heartbeat and no explicit logout for this long is treated as
// abandoned (laptop died, browser crashed) and closed out proactively — otherwise it
// would just sit "open" forever until the person happens to log in again, and the
// trailing idle time between their last heartbeat and now would never get recorded.
const ABANDONED_SESSION_HOURS = 8;

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export class AuthService {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const [session] = await prisma.$transaction([
      prisma.userSession.create({ data: { userId: user.id } }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    const token = signToken({
      id: user.id,
      role: user.role,
      teamId: user.teamId,
      mustChangePassword: user.mustChangePassword,
      sessionId: session.id,
    });

    return {
      token,
      user: this.toSafeUser(user),
    };
  }

  /** Closes out the session's check-out time. Safe to call even if already closed. */
  async logout(sessionId: string) {
    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.logoutAt) return;

    const now = new Date();
    if (session.lastHeartbeatAt) {
      const idleMinutes = (now.getTime() - session.lastHeartbeatAt.getTime()) / 60_000;
      if (idleMinutes >= IDLE_FLAG_THRESHOLD_MINUTES) {
        await prisma.idleFlag.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            flagDate: dateOnly(session.lastHeartbeatAt),
            startedAt: session.lastHeartbeatAt,
            endedAt: now,
            durationMinutes: Math.round(idleMinutes),
          },
        });
      }
    }

    await prisma.userSession.update({ where: { id: sessionId }, data: { logoutAt: now } });
  }

  /**
   * Sweeps sessions nobody ever explicitly logged out of and no heartbeat has touched in
   * ABANDONED_SESSION_HOURS+ — a laptop that died or a browser that crashed mid-session.
   * Left alone, that session would stay "open" forever (skewing anyone reading activeSeconds
   * or "currently logged in" status) and the trailing gap between the last heartbeat and now
   * would never become a reviewable IdleFlag, since only a future heartbeat or explicit
   * logout ever runs that check. Piggybacked on the alerts poll like the stale-lead sweep,
   * since there's no cron infrastructure on the free tier.
   */
  async closeAbandonedSessions(): Promise<{ closedCount: number }> {
    const cutoff = new Date(Date.now() - ABANDONED_SESSION_HOURS * 60 * 60 * 1000);
    const abandoned = await prisma.userSession.findMany({
      where: {
        logoutAt: null,
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          { lastHeartbeatAt: null, loginAt: { lt: cutoff } },
        ],
      },
    });

    const now = new Date();
    for (const session of abandoned) {
      const lastSeen = session.lastHeartbeatAt ?? session.loginAt;
      const idleMinutes = (now.getTime() - lastSeen.getTime()) / 60_000;

      if (idleMinutes >= IDLE_FLAG_THRESHOLD_MINUTES) {
        await prisma.idleFlag.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            flagDate: dateOnly(lastSeen),
            startedAt: lastSeen,
            endedAt: now,
            durationMinutes: Math.round(idleMinutes),
          },
        });
      }

      await prisma.userSession.update({ where: { id: session.id }, data: { logoutAt: lastSeen } });
    }

    return { closedCount: abandoned.length };
  }

  /**
   * Called periodically by the client, only when there's been real mouse/keyboard/scroll
   * activity since the last call. Accumulates genuine active seconds on the session, and
   * — if the gap since the last heartbeat is 30+ minutes — records it as a discrete
   * IdleFlag instead of silently absorbing it, so "away from screen" shows up as
   * something reviewable, not just a smaller number.
   */
  async heartbeat(userId: string, sessionId: string) {
    const session = await prisma.userSession.findFirst({
      where: { id: sessionId, userId, logoutAt: null },
    });
    if (!session) throw new NotFoundError("Active session");

    const now = new Date();
    let activeSeconds = session.activeSeconds;

    if (session.lastHeartbeatAt) {
      const gapSeconds = (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000;

      if (gapSeconds <= HEARTBEAT_ACTIVE_GAP_SECONDS) {
        activeSeconds += Math.round(gapSeconds);
      } else if (gapSeconds >= IDLE_FLAG_THRESHOLD_MINUTES * 60) {
        await prisma.idleFlag.create({
          data: {
            userId,
            sessionId: session.id,
            flagDate: dateOnly(session.lastHeartbeatAt),
            startedAt: session.lastHeartbeatAt,
            endedAt: now,
            durationMinutes: Math.round(gapSeconds / 60),
          },
        });
      }
    }

    await prisma.userSession.update({
      where: { id: sessionId },
      data: { lastHeartbeatAt: now, activeSeconds },
    });

    return { activeSeconds };
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    const token = signToken({
      id: updated.id,
      role: updated.role,
      teamId: updated.teamId,
      mustChangePassword: updated.mustChangePassword,
      sessionId,
    });

    return { token, user: this.toSafeUser(updated) };
  }

  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { team: true },
    });
    return this.toSafeUser(user);
  }

  private toSafeUser<T extends { passwordHash: string }>(user: T) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}

export const authService = new AuthService();
