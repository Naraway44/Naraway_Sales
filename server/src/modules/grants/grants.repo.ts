/**
 * Prisma-backed persistence for the grants engine.
 *
 * Replaces the old data/grants/*.json store. That store lived on local disk, which is
 * ephemeral on Render: every deploy wiped it, resetting notifyStatus to "pending" and
 * re-emailing clients about schemes they had already been told about.
 *
 * Signatures mirror the old file helpers so engine code reads the same.
 */
import { prisma } from "@/common/prisma";
import type { GrantPlan, GrantRecurrence, GrantScheme } from "@prisma/client";
import type { MatchRow, NotifyLog, Scheme, StartupClient, Store } from "./grants.types";

const ENGINE_STATE_ID = 1;

function toScheme(r: GrantScheme): Scheme {
  return {
    externalKey: r.externalKey,
    title: r.title,
    category: r.category,
    whoItsFor: r.whoItsFor,
    serviceTrack: r.serviceTrack,
    windowType: r.windowType === "ALL_YEAR" ? "ALL_YEAR" : "OPEN_CLOSE",
    recurrence: r.recurrence,
    industries: r.industries,
    instrument: r.instrument,
    stageFit: r.stageFit,
    audienceTags: r.audienceTags,
    level: r.level,
    state: r.state,
    ministry: r.ministry,
    summary: r.summary,
    eligibility: r.eligibility,
    benefits: r.benefits,
    statusNote: r.statusNote,
    startDate: r.startDate,
    endDate: r.endDate,
    maxAgeYears: r.maxAgeYears,
    applyUrl: r.applyUrl,
    sourceUrl: r.sourceUrl,
    discoveredFrom: r.discoveredFrom,
    lastSeenCycle: r.lastSeenCycle,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function schemeData(s: Scheme, isActive: boolean) {
  return {
    title: s.title,
    category: s.category,
    whoItsFor: s.whoItsFor,
    serviceTrack: s.serviceTrack,
    windowType: s.windowType,
    recurrence: s.recurrence as GrantRecurrence,
    industries: s.industries,
    instrument: s.instrument,
    stageFit: s.stageFit,
    audienceTags: s.audienceTags,
    level: s.level,
    state: s.state,
    ministry: s.ministry,
    summary: s.summary,
    eligibility: s.eligibility,
    benefits: s.benefits,
    statusNote: s.statusNote,
    startDate: s.startDate,
    endDate: s.endDate,
    maxAgeYears: s.maxAgeYears,
    applyUrl: s.applyUrl,
    sourceUrl: s.sourceUrl,
    discoveredFrom: s.discoveredFrom,
    lastSeenCycle: s.lastSeenCycle,
    isActive,
  };
}

export async function readStore(): Promise<Store> {
  const [state, schemes] = await Promise.all([
    prisma.grantEngineState.findUnique({ where: { id: ENGINE_STATE_ID } }),
    prisma.grantScheme.findMany(),
  ]);
  return {
    syncedAt: state?.syncedAt ? state.syncedAt.toISOString() : null,
    cycle: state?.cycle ?? 0,
    active: schemes.filter((r) => r.isActive).map(toScheme),
    removed: schemes.filter((r) => !r.isActive).map(toScheme),
    lastErrors: state?.lastErrors ?? [],
  };
}

/** Upserts every scheme and stamps active/removed. Chunked so a large crawl doesn't exhaust the pool. */
export async function saveStore(store: Store): Promise<void> {
  const rows = [
    ...store.active.map((s) => ({ s, isActive: true })),
    ...store.removed.map((s) => ({ s, isActive: false })),
  ];

  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(
      rows.slice(i, i + CHUNK).map(({ s, isActive }) => {
        const data = schemeData(s, isActive);
        return prisma.grantScheme.upsert({
          where: { externalKey: s.externalKey },
          create: { externalKey: s.externalKey, ...data },
          update: data,
        });
      })
    );
  }

  const stateData = {
    cycle: store.cycle,
    syncedAt: store.syncedAt ? new Date(store.syncedAt) : null,
    lastErrors: store.lastErrors,
  };
  await prisma.grantEngineState.upsert({
    where: { id: ENGINE_STATE_ID },
    create: { id: ENGINE_STATE_ID, ...stateData },
    update: stateData,
  });
}

export async function readStartups(): Promise<StartupClient[]> {
  const rows = await prisma.grantStartup.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industries: r.industries,
    states: r.states,
    stage: r.stage,
    incorporationDate: r.incorporationDate,
    dpiitRecognised: r.dpiitRecognised,
    audienceTags: r.audienceTags,
    notifyEmails: r.notifyEmails,
    plan: r.plan,
    packageStartDate: r.packageStartDate,
    packageEndDate: r.packageEndDate,
    active: r.active,
    notes: r.notes,
  }));
}

export async function saveStartups(list: StartupClient[]): Promise<void> {
  for (const s of list) {
    const data = {
      name: s.name,
      industries: s.industries,
      states: s.states,
      stage: s.stage,
      incorporationDate: s.incorporationDate,
      dpiitRecognised: s.dpiitRecognised,
      audienceTags: s.audienceTags,
      notifyEmails: s.notifyEmails,
      plan: s.plan as GrantPlan,
      packageStartDate: s.packageStartDate,
      packageEndDate: s.packageEndDate,
      active: s.active,
      notes: s.notes,
    };
    await prisma.grantStartup.upsert({
      where: { id: s.id },
      create: { id: s.id, ...data },
      update: data,
    });
  }
}

export async function deleteStartup(id: string): Promise<void> {
  // Matches and notify logs cascade via the schema relations.
  await prisma.grantStartup.deleteMany({ where: { id } });
}

export async function readMatches(): Promise<MatchRow[]> {
  const rows = await prisma.grantMatch.findMany({
    include: { startup: true, scheme: true },
    orderBy: { score: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    startupId: r.startupId,
    startupName: r.startup.name,
    plan: r.plan,
    schemeKey: r.schemeKey,
    schemeTitle: r.scheme.title,
    industries: r.scheme.industries,
    instrument: r.scheme.instrument,
    windowType: r.scheme.windowType,
    state: r.scheme.state || r.scheme.level,
    score: r.score,
    reasons: r.reasons,
    details: r.details,
    applyUrl: r.applyUrl,
    officialUrl: r.officialUrl,
    sourceUrl: r.scheme.sourceUrl,
    isStandard: r.isStandard,
    isNew: false,
    notifyStatus: r.notifyStatus as MatchRow["notifyStatus"],
    filingStatus: r.filingStatus as MatchRow["filingStatus"],
    matchedAt: r.matchedAt.toISOString(),
    notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : "",
  }));
}

/** Replaces the match set. Scheme rows must already be persisted (FK on schemeKey). */
export async function saveMatches(list: MatchRow[]): Promise<void> {
  const keep = new Set(list.map((m) => m.id));
  const existing = await prisma.grantMatch.findMany({ select: { id: true } });
  const drop = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (drop.length) await prisma.grantMatch.deleteMany({ where: { id: { in: drop } } });

  for (const m of list) {
    const data = {
      startupId: m.startupId,
      schemeKey: m.schemeKey,
      plan: m.plan as GrantPlan,
      score: Math.round(m.score),
      reasons: m.reasons,
      details: m.details,
      applyUrl: m.applyUrl,
      officialUrl: m.officialUrl,
      isStandard: m.isStandard,
      notifyStatus: m.notifyStatus,
      filingStatus: m.filingStatus,
      notifiedAt: m.notifiedAt ? new Date(m.notifiedAt) : null,
    };
    await prisma.grantMatch.upsert({
      where: { id: m.id },
      create: { id: m.id, ...data, matchedAt: new Date(m.matchedAt) },
      update: data,
    });
  }
}

export async function readNotifications(): Promise<NotifyLog[]> {
  const rows = await prisma.grantNotifyLog.findMany({ orderBy: { at: "desc" }, take: 500 });
  return rows.map((r) => ({
    id: r.id,
    matchId: r.matchId,
    startupId: r.startupId,
    startupName: r.startupName,
    schemeTitle: r.schemeTitle,
    emails: r.emails,
    plan: r.plan,
    at: r.at.toISOString(),
    applyUrl: "",
    officialUrl: "",
    status: r.status as NotifyLog["status"],
    detail: r.detail,
  }));
}

/** Appends only new logs — the notify log is an audit trail, never rewritten. */
export async function appendNotifications(logs: NotifyLog[]): Promise<void> {
  if (!logs.length) return;
  await prisma.grantNotifyLog.createMany({
    data: logs.map((l) => ({
      id: l.id,
      matchId: l.matchId,
      startupId: l.startupId,
      startupName: l.startupName,
      schemeTitle: l.schemeTitle,
      emails: l.emails,
      plan: l.plan as GrantPlan,
      status: l.status,
      detail: l.detail,
      at: new Date(l.at),
    })),
    skipDuplicates: true,
  });
}

/**
 * Marks every currently-pending match as already-notified WITHOUT sending anything.
 * Run once before enabling real email delivery, so switching the webhook on does not
 * blast the entire historical backlog at real client inboxes.
 * Returns how many matches were suppressed.
 */
export async function backfillNotifiedWithoutSending(): Promise<number> {
  const res = await prisma.grantMatch.updateMany({
    where: { notifyStatus: "pending" },
    data: { notifyStatus: "skipped", notifiedAt: new Date() },
  });
  return res.count;
}

/** Postgres advisory lock — stops two instances crawling and double-emailing. */
export async function tryAcquireEngineLock(key = 8412771): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS locked
  `;
  return rows[0]?.locked === true;
}

export async function releaseEngineLock(key = 8412771): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
}
