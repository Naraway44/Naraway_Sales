/** Shared types for the grants engine. Kept separate so repo/controller/engine agree. */

export type Instrument =
  | "Grant"
  | "Loan"
  | "Guarantee"
  | "Equity/Seed"
  | "Incubation"
  | "Recognition"
  | "Subsidy"
  | "Fellowship"
  | "Other";

export type StageFit = "Idea/PoC" | "Prototype" | "Early revenue" | "Growth" | "Any";

export type ClientPlan = "NOTIFICATION" | "FULL_APPLICATION" | "BOTH";

export type Scheme = {
  externalKey: string;
  title: string;
  category: string;
  whoItsFor: string;
  serviceTrack: string;
  /** ALL_YEAR = ongoing / rolling | OPEN_CLOSE = specific application window */
  windowType: "ALL_YEAR" | "OPEN_CLOSE";
  /**
   * Does the scheme come back?
   * RECURRING — never dies; cycles reopen (SISFS, MUDRA, DPIIT recognition).
   *   A passed endDate closes the *cycle*, not the scheme: it stays Active, awaiting the next call.
   * ONE_TIME  — a single call (Genesis EIR, a one-off challenge). Past endDate = dead, retire it.
   */
  recurrence: "RECURRING" | "ONE_TIME";
  /** Semicolon-joined industry tags for Excel AutoFilter */
  industries: string;
  instrument: string;
  stageFit: string;
  /** Semicolon-joined audience tags e.g. Women; SC/ST; DPIIT-recognised */
  audienceTags: string;
  level: string;
  state: string;
  ministry: string;
  summary: string;
  eligibility: string;
  benefits: string;
  statusNote: string;
  startDate: string;
  endDate: string;
  /** Max company age the scheme allows, in years. "" = no stated limit. e.g. SISFS "2". */
  maxAgeYears: string;
  applyUrl: string;
  sourceUrl: string; // always required
  discoveredFrom: string;
  /** Crawl cycle this row was last seen in — drives retirement of vanished links. */
  lastSeenCycle: number;
  updatedAt: string;
};

export type Store = {
  syncedAt: string | null;
  cycle: number;
  active: Scheme[];
  removed: Scheme[];
  lastErrors: string[];
};

export type SourceDef = {
  id: string;
  name: string;
  url: string;
  level?: string;
  state?: string;
  category?: string;
};

export type StartupClient = {
  id: string;
  name: string;
  industries: string[];
  states: string[];
  stage: string;
  /** Date of incorporation (YYYY-MM-DD). Age is derived at match time so it never goes stale. */
  incorporationDate: string;
  dpiitRecognised: boolean;
  audienceTags: string[];
  notifyEmails: string[];
  plan: ClientPlan;
  /** Package / engagement window for this client */
  packageStartDate: string;
  packageEndDate: string;
  active: boolean;
  notes: string;
};

export type MatchRow = {
  id: string;
  startupId: string;
  startupName: string;
  plan: ClientPlan;
  schemeKey: string;
  schemeTitle: string;
  industries: string;
  instrument: string;
  windowType: string;
  state: string;
  score: number;
  reasons: string;
  details: string;
  applyUrl: string;
  /** Official scheme / notification page */
  officialUrl: string;
  sourceUrl: string;
  isStandard: boolean;
  isNew: boolean;
  notifyStatus: "pending" | "sent" | "simulated" | "skipped";
  filingStatus: "none" | "queued" | "in_progress" | "filed" | "skipped";
  matchedAt: string;
  notifiedAt: string;
};

export type NotifyLog = {
  id: string;
  matchId: string;
  startupId: string;
  startupName: string;
  schemeTitle: string;
  emails: string[];
  plan: ClientPlan;
  at: string;
  applyUrl: string;
  officialUrl: string;
  status: "sent" | "simulated" | "failed";
  detail: string;
};
