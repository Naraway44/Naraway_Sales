/**
 * Naraway Grants Discovery Engine — background loop inside the Sales OS server.
 *
 * Continuously finds Indian gov grants, loans, subsidies & schemes for startups
 * (Central + all states). State lives in Postgres (see grants.repo) so deploys do not
 * reset notify status and re-email clients.
 *
 * Routes live in grants.controller.ts. Loop entrypoint: startGrantsEngine().
 */
import Papa from "papaparse";
import ExcelJS from "exceljs";
import * as cheerio from "cheerio";
import type {
  ClientPlan,
  Instrument,
  MatchRow,
  NotifyLog,
  Scheme,
  SourceDef,
  StageFit,
  StartupClient,
  Store,
} from "./grants.types";
import {
  appendNotifications,
  deleteStartup,
  readMatches,
  readNotifications,
  readStartups,
  readStore,
  saveMatches,
  saveStartups,
  saveStore as persistStore,
  tryAcquireEngineLock,
} from "./grants.repo";

const INTERVAL_MS = Math.max(60_000, parseInt(process.env.GRANTS_CRAWL_INTERVAL_MS ?? String(30 * 60_000), 10));
const SHEET_ID = process.env.SCHEME_SHEET_ID?.trim() || "14qJbsYr9OVx72WfSrlUXnn8LWHqf0PRpmLDeffzgUzY";
const SHEET_NAME = process.env.SCHEME_SHEET_NAME?.trim() || "Sheet1";
const UA = process.env.SCHEME_HTTP_USER_AGENT?.trim() || "NarawayGrantsEngine/1.0 (+https://naraway.com; support@naraway.com)";
const REQUEST_GAP_MS = 1200;
/** Cycles a crawled link may go unseen on its portal before it is auto-retired. */
const STALE_CYCLES = Math.max(2, parseInt(process.env.GRANTS_STALE_CYCLES ?? "3", 10));
/** Auto email inbox for application-package work (team only applies). */
const TEAM_NOTIFY_EMAIL = (process.env.GRANTS_TEAM_EMAIL || "team@naraway.com").trim();
/** Public base URL used in client-facing email links. */
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
/**
 * Real email delivery is OFF unless explicitly enabled. Without this, the first deploy
 * that sets a webhook would send the entire pending backlog to real client inboxes.
 */
const NOTIFY_ENABLED = process.env.GRANTS_NOTIFY_ENABLED === "true";
/** Hard cap on sends per run — a runaway match set cannot mass-mail. */
const NOTIFY_MAX_PER_RUN = Math.max(1, parseInt(process.env.GRANTS_NOTIFY_MAX_PER_RUN ?? "25", 10));
/** Sample clients are for local dev only; never seed fake startups into production. */
const ALLOW_SAMPLE_DATA = process.env.NODE_ENV !== "production" && process.env.GRANTS_ALLOW_SAMPLE_DATA !== "false";
/** Per-request crawl timeout: without it one hung portal stalls the cycle forever. */
const FETCH_TIMEOUT_MS = Math.max(5_000, parseInt(process.env.GRANTS_FETCH_TIMEOUT_MS ?? "20000", 10));

/** Controlled industry tags for screening / matching. */
const INDUSTRIES = [
  "Biotech",
  "Healthcare",
  "Agri",
  "ICT/AI",
  "Deeptech",
  "Defence",
  "Aerospace",
  "Fintech",
  "Cleantech",
  "Manufacturing",
  "Edtech",
  "Hardware",
  "Social impact",
  "General/Any",
] as const;

/** Seed crawl targets — gov portals + known scheme hubs (engine expands via page links). */
const SOURCES: SourceDef[] = [
  { id: "myscheme-home", name: "myScheme", url: "https://www.myscheme.gov.in/", level: "Central", category: "Discovery" },
  { id: "myscheme-business", name: "myScheme Business", url: "https://www.myscheme.gov.in/search/category/Business%20%26%20Entrepreneurship", level: "Central", category: "Business & Entrepreneurship" },
  { id: "myscheme-search-startup", name: "myScheme startup search", url: "https://www.myscheme.gov.in/search?q=startup", level: "Central", category: "Startup" },
  { id: "myscheme-search-grant", name: "myScheme grant search", url: "https://www.myscheme.gov.in/search?q=grant", level: "Central", category: "Grant" },
  { id: "myscheme-search-loan", name: "myScheme loan search", url: "https://www.myscheme.gov.in/search?q=loan+startup", level: "Central", category: "Loan" },
  { id: "startup-india", name: "Startup India", url: "https://www.startupindia.gov.in/", level: "Central", category: "Startup" },
  {
    id: "startup-india-home",
    name: "Startup India – Home",
    url: "https://www.startupindia.gov.in/content/sih/en/home-page.html",
    level: "Central",
    category: "Startup",
  },
  {
    id: "startup-india-gov-schemes",
    name: "Startup India – Government Schemes",
    url: "https://www.startupindia.gov.in/content/sih/en/government-schemes.html",
    level: "Central",
    category: "Gov schemes hub",
  },
  {
    id: "isti-startup-funding",
    name: "India Science & Technology – Startup funding",
    url: "https://www.indiascienceandtechnology.gov.in/funding-opportunities/startups",
    level: "Central",
    category: "Research / Startup funding",
  },
  { id: "sisfs", name: "SISFS", url: "https://seedfund.startupindia.gov.in/", level: "Central", category: "Seed fund" },
  {
    id: "sisfs-myscheme",
    name: "SISFS – myScheme",
    url: "https://www.myscheme.gov.in/schemes/sisfs",
    level: "Central",
    category: "Seed fund",
  },
  {
    id: "sisfs-fitt-iitd",
    name: "SISFS – FITT IIT Delhi",
    url: "https://fitt-iitd.in/web/sisfs",
    level: "Central",
    state: "Delhi",
    category: "Seed fund / Incubator",
  },
  { id: "standup-india", name: "Stand-Up India", url: "https://www.standupmitra.in/", level: "Central", category: "Loan" },
  { id: "birac", name: "BIRAC", url: "https://www.birac.nic.in/", level: "Central", category: "Biotech / Grant" },
  { id: "birac-big", name: "BIRAC BIG", url: "https://www.birac.nic.in/big.php", level: "Central", category: "Biotechnology Ignition Grant" },
  { id: "nidhi-prayas", name: "NIDHI-PRAYAS", url: "https://nidhi-prayas.org/", level: "Central", category: "Prototype grant" },
  { id: "nidhi-prayas-dst", name: "NIDHI-PRAYAS DST portal", url: "https://nidhi.dst.gov.in/schemes-programmes/nidhiprayas/", level: "Central", category: "Prototype grant" },
  { id: "nidhi-dst", name: "NIDHI DST", url: "https://nidhi.dst.gov.in/", level: "Central", category: "Innovation / Seed" },
  { id: "nidhi-eir", name: "NIDHI-EIR", url: "https://www.nidhi-eir.in/", level: "Central", category: "EIR fellowship" },
  { id: "isti-start-schemes", name: "ISTI – DST startup schemes", url: "https://www.indiascienceandtechnology.gov.in/start-schemes-dst", level: "Central", category: "Research / Startup" },
  { id: "tide", name: "TIDE 2.0 / MeitY Startup Hub", url: "https://msh.meity.gov.in/schemes/tide", level: "Central", category: "ICT / Deeptech" },
  { id: "meity-startup-hub", name: "MeitY Startup Hub", url: "https://msh.meity.gov.in/", level: "Central", category: "ICT / Startup" },
  { id: "aim", name: "Atal Innovation Mission", url: "https://aim.gov.in/", level: "Central", category: "Incubation / Deeptech" },
  { id: "idex", name: "iDEX-DIO", url: "https://idex.gov.in/", level: "Central", category: "Defence / Aerospace" },
  { id: "rkvy-raftaar", name: "RKVY-RAFTAAR", url: "https://rkvy.nic.in/", level: "Central", category: "Agribusiness" },
  { id: "mudra", name: "PMMY MUDRA", url: "https://www.mudra.org.in/", level: "Central", category: "Loan / MSME" },
  { id: "cgtsme", name: "CGTMSE", url: "https://www.cgtmse.in/", level: "Central", category: "Credit guarantee" },
  // Private aggregators (not gov) — discovery only; verify official links
  { id: "startupgrantsindia", name: "Startup Grants India (private directory)", url: "https://www.startupgrantsindia.com/", level: "Central", category: "Aggregator" },
  { id: "startupgrantsindia-grants", name: "Startup Grants India – Grants", url: "https://www.startupgrantsindia.com/type/grant", level: "Central", category: "Grant" },
  { id: "startupgrantsindia-schemes", name: "Startup Grants India – Schemes", url: "https://www.startupgrantsindia.com/schemes", level: "Central", category: "Gov schemes" },
  { id: "msme", name: "MSME", url: "https://www.msme.gov.in/", level: "Central", category: "MSME" },
  { id: "udyam", name: "Udyam", url: "https://udyamregistration.gov.in/", level: "Central", category: "MSME" },
  // State startup missions
  { id: "st-karnataka", name: "Karnataka Startups / Mission", url: "https://www.missionstartupkarnataka.org/", level: "State", state: "Karnataka", category: "State policy" },
  { id: "st-karnataka-eitbt", name: "Karnataka EITBT Startup", url: "https://eitbt.karnataka.gov.in/startup/public/policy/en", level: "State", state: "Karnataka", category: "State policy" },
  { id: "st-karnataka-elevate", name: "Karnataka Elevate (EITBT)", url: "https://eitbt.karnataka.gov.in/startup/public/135/elevate-2025/en", level: "State", state: "Karnataka", category: "State grant" },
  { id: "st-karnataka-elevate-portal", name: "Karnataka Elevate portal", url: "https://elevate.startupkarnataka.in/", level: "State", state: "Karnataka", category: "State grant" },
  { id: "st-karnataka-funding", name: "Karnataka Mission funding", url: "https://www.missionstartupkarnataka.org/funding", level: "State", state: "Karnataka", category: "State funding" },
  { id: "st-tn", name: "Tamil Nadu StartupTN", url: "https://startuptn.in/", level: "State", state: "Tamil Nadu", category: "State policy" },
  { id: "st-tn-tanseed", name: "TN TANSEED", url: "https://startuptn.in/", level: "State", state: "Tamil Nadu", category: "State seed" },
  { id: "st-gujarat", name: "Gujarat Startups", url: "https://startup.gujarat.gov.in/", level: "State", state: "Gujarat", category: "State policy" },
  { id: "st-up", name: "UP StartinUP", url: "https://startinup.up.gov.in/", level: "State", state: "Uttar Pradesh", category: "State policy" },
  {
    id: "st-up-funding",
    name: "UP StartinUP – Funding",
    url: "https://startinup.up.gov.in/funding/",
    level: "State",
    state: "Uttar Pradesh",
    category: "State funding",
  },
  { id: "st-telangana", name: "T-Hub / Telangana", url: "https://startup.telangana.gov.in/", level: "State", state: "Telangana", category: "State policy" },
  { id: "st-maharashtra", name: "Maharashtra MSInS", url: "https://www.msins.in/", level: "State", state: "Maharashtra", category: "State policy" },
  { id: "st-rajasthan", name: "iStart Rajasthan", url: "https://istart.rajasthan.gov.in/", level: "State", state: "Rajasthan", category: "State policy" },
  { id: "st-kerala", name: "Kerala Startup Mission", url: "https://startupmission.kerala.gov.in/", level: "State", state: "Kerala", category: "State policy" },
  {
    id: "st-kerala-early",
    name: "Kerala – Early Stage Funding",
    url: "https://startupmission.kerala.gov.in/schemes/early-stage-funding",
    level: "State",
    state: "Kerala",
    category: "State grant",
  },
  { id: "st-odisha", name: "Startup Odisha", url: "https://startupodisha.gov.in/", level: "State", state: "Odisha", category: "State policy" },
  { id: "st-wb", name: "Startup Bengal", url: "https://startupbengal.in/", level: "State", state: "West Bengal", category: "State policy" },
  { id: "st-mp", name: "MP Startups", url: "https://startup.mp.gov.in/", level: "State", state: "Madhya Pradesh", category: "State policy" },
  { id: "st-haryana", name: "Haryana Startup", url: "https://startupharyana.gov.in/", level: "State", state: "Haryana", category: "State policy" },
  { id: "st-punjab", name: "Punjab Startup", url: "https://pbindustries.gov.in/startup/home", level: "State", state: "Punjab", category: "State policy" },
  { id: "st-bihar", name: "Bihar Startup", url: "https://startup.bihar.gov.in/", level: "State", state: "Bihar", category: "State policy" },
  { id: "st-hp", name: "Himachal Startup (Emerging HP)", url: "https://emerginghimachal.hp.gov.in/startup", level: "State", state: "Himachal Pradesh", category: "State policy" },
  {
    id: "st-hp-incentives",
    name: "HP Startup incentives",
    url: "https://emerginghimachal.hp.gov.in/startup/about/incentive-procedure/",
    level: "State",
    state: "Himachal Pradesh",
    category: "State grant",
  },
  { id: "st-goa", name: "Goa Startup", url: "https://www.startup.goa.gov.in/", level: "State", state: "Goa", category: "State policy" },
  { id: "st-assam", name: "Assam Startup", url: "https://startup.assam.gov.in/", level: "State", state: "Assam", category: "State policy" },
  { id: "st-ap", name: "Andhra Pradesh Innovation Society", url: "https://apis.ap.gov.in/", level: "State", state: "Andhra Pradesh", category: "State policy" },
  { id: "st-cg", name: "Chhattisgarh Startup", url: "https://invest.cg.gov.in/startup", level: "State", state: "Chhattisgarh", category: "State policy" },
  { id: "dst", name: "DST", url: "https://dst.gov.in/", level: "Central", category: "Research" },
  { id: "meity", name: "MeitY", url: "https://www.meity.gov.in/", level: "Central", category: "IT / Digital" },
];

/** Curated flagship schemes (always seeded with official links + window type). Filters filled by ensureFilters / FLAGSHIP_FILTERS. */
const FLAGSHIP_RAW = [
  {
    externalKey: "flagship::sisfs",
    title: "Startup India Seed Fund Scheme (SISFS)",
    category: "Seed fund / Grant + Debt",
    whoItsFor: "DPIIT-recognised startups (via incubators)",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "DPIIT",
    summary: "Financial assistance for PoC, prototype, trials, market entry, commercialisation.",
    eligibility: "DPIIT recognition; typically ≤2 years at application; other SISFS rules.",
    benefits: "Up to ₹20L grant + up to ₹50L investment limb (per guidelines).",
    statusNote: "Cyclical calls — verify live window on seedfund.startupindia.gov.in",
    startDate: "",
    endDate: "",
    applyUrl: "https://seedfund.startupindia.gov.in/",
    sourceUrl: "https://www.myscheme.gov.in/schemes/sisfs",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::birac-big",
    title: "BIRAC Biotechnology Ignition Grant (BIG)",
    category: "Biotech grant",
    whoItsFor: "Biotech / healthcare / life-sciences innovators",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "BIRAC / DBT",
    summary: "Equity-free ignition grant for early biotech ideas.",
    eligibility: "Per BIRAC BIG call guidelines.",
    benefits: "Up to ~₹50 Lakh (confirm current call).",
    statusNote: "Call-based — check birac.nic.in for open rounds",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.birac.nic.in/",
    sourceUrl: "https://www.birac.nic.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::nidhi-prayas",
    title: "NIDHI-PRAYAS 2.0 (DST)",
    category: "Prototype grant",
    whoItsFor: "Innovators / early startups converting tech ideas into working prototypes",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "DST / NIDHI (PMU: SINE IIT Bombay)",
    summary: "Prototype grants via PRAYAS Centres (PC) and Advance PRAYAS Centres (APC).",
    eligibility: "Per NIDHI-PRAYAS 2.0 guidelines; apply through designated centres.",
    benefits: "Up to ~₹20 Lakh via PC; up to ~₹40 Lakh via APC (confirm current guidelines).",
    statusNote: "Centre/call based — check nidhi-prayas.org for open windows",
    startDate: "",
    endDate: "",
    applyUrl: "https://nidhi-prayas.org/innovators",
    sourceUrl: "https://nidhi.dst.gov.in/schemes-programmes/nidhiprayas/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::tide",
    title: "TIDE 2.0 (MeitY)",
    category: "ICT / Deeptech incubation",
    whoItsFor: "Tech startups in IoT, AI, blockchain, robotics, ICT via TIDE centres",
    serviceTrack: "BOTH",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "MeitY",
    summary: "Financial & technical support through ~51 TIDE 2.0 incubators (EiR / grant / investment limbs).",
    eligibility: "Per TIDE centre / MeitY Startup Hub norms (typically TRL~3+ ideas).",
    benefits: "EiR up to ~₹4L; grants up to ~₹7L; investment limb up to ~₹40L (centre-specific).",
    statusNote: "Apply via TIDE centres / msh.meity.gov.in — windows vary by centre",
    startDate: "",
    endDate: "",
    applyUrl: "https://msh.meity.gov.in/schemes/tide",
    sourceUrl: "https://msh.meity.gov.in/schemes/tide",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::aim",
    title: "Atal Innovation Mission (AIM) / AICs",
    category: "Incubation / Deeptech",
    whoItsFor: "Deep-tech and social impact innovators via Atal Incubation Centres",
    serviceTrack: "BOTH",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "NITI Aayog / AIM",
    summary: "Incubation and support through AIM / AIC network.",
    eligibility: "Per AIC / AIM programme.",
    benefits: "Incubation, mentoring, possible funding pathways.",
    statusNote: "Ongoing ecosystem — individual AIC calls may be windowed",
    startDate: "",
    endDate: "",
    applyUrl: "https://aim.gov.in/",
    sourceUrl: "https://aim.gov.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::idex",
    title: "iDEX-DIO",
    category: "Defence / Aerospace",
    whoItsFor: "Startups / innovators building defence & aerospace solutions",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "MoD / DIO",
    summary: "Challenges and grants for defence innovation.",
    eligibility: "Per iDEX challenge / DISC guidelines.",
    benefits: "Grant / procurement pathways under challenges.",
    statusNote: "Challenge-based open/close windows — check idex.gov.in",
    startDate: "",
    endDate: "",
    applyUrl: "https://idex.gov.in/",
    sourceUrl: "https://idex.gov.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::rkvy-raftaar",
    title: "RKVY-RAFTAAR",
    category: "Agribusiness",
    whoItsFor: "Agribusiness / rural-focused ventures",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "Ministry of Agriculture",
    summary: "Supports agri-entrepreneurship / incubation under RKVY-RAFTAAR.",
    eligibility: "Per RKVY-RAFTAAR / incubator guidelines.",
    benefits: "Seed / incubation support for agri ventures.",
    statusNote: "Often via designated agri incubators — verify open calls",
    startDate: "",
    endDate: "",
    applyUrl: "https://rkvy.nic.in/",
    sourceUrl: "https://rkvy.nic.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::standup",
    title: "Stand-Up India",
    category: "Loan",
    whoItsFor: "SC/ST and women entrepreneurs (greenfield)",
    serviceTrack: "BOTH",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "Ministry of Finance / SIDBI banks",
    summary: "Bank loans for greenfield enterprises in manufacturing, services, trading, agri-allied.",
    eligibility: "SC/ST or woman entrepreneur; greenfield; other bank norms.",
    benefits: "Composite loan typically ₹10 Lakh to ₹1 Cr (confirm bank).",
    statusNote: "Ongoing via banks / standupmitra.in",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.standupmitra.in/",
    sourceUrl: "https://www.standupmitra.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::mudra",
    title: "Pradhan Mantri MUDRA Yojana (PMMY)",
    category: "Loan / MSME",
    whoItsFor: "Micro / small non-corporate enterprises; startups/MSMEs via banks/NBFCs",
    serviceTrack: "NOTIFICATION",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "DFS / MUDRA",
    summary: "Collateral-light micro loans under Shishu/Kishor/Tarun categories.",
    eligibility: "Per MUDRA / lender norms.",
    benefits: "Loans for income-generating activities (limits by category).",
    statusNote: "Ongoing through member lenders",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.mudra.org.in/",
    sourceUrl: "https://www.mudra.org.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::dpiit-recognition",
    title: "DPIIT Startup Recognition",
    category: "Recognition",
    whoItsFor: "Indian startups seeking DPIIT recognition",
    serviceTrack: "FULL_APPLICATION",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "DPIIT",
    summary: "Official recognition — gateway to many schemes.",
    eligibility: "Per latest DPIIT notification.",
    benefits: "Access to Startup India benefit stack.",
    statusNote: "Ongoing applications",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.startupindia.gov.in/content/sih/en/startupgov/startup_recognition_page.html",
    sourceUrl: "https://www.startupindia.gov.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::cgtmse",
    title: "Credit Guarantee Fund Trust for Micro and Small Enterprises (CGTMSE)",
    category: "Credit guarantee",
    whoItsFor: "MSMEs / eligible borrowers via member lenders",
    serviceTrack: "NOTIFICATION",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "MoMSME / SIDBI",
    summary: "Credit guarantee cover so lenders can extend collateral-light credit to MSMEs.",
    eligibility: "Per CGTMSE / lender norms.",
    benefits: "Guarantee cover on eligible credit facilities.",
    statusNote: "Ongoing through member banks / NBFCs",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.cgtmse.in/",
    sourceUrl: "https://www.cgtmse.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::cgss",
    title: "Credit Guarantee Scheme for Startups (CGSS)",
    category: "Credit guarantee / Startup",
    whoItsFor: "DPIIT-recognised startups seeking debt",
    serviceTrack: "BOTH",
    windowType: "ALL_YEAR",
    level: "Central",
    state: "",
    ministry: "DPIIT / SIDBI",
    summary: "Credit guarantee enabling debt to DPIIT-recognised startups.",
    eligibility: "DPIIT recognition + lender norms.",
    benefits: "Guarantee-backed loans via participating lenders.",
    statusNote: "Ongoing — verify Startup India / SIDBI pages",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.startupindia.gov.in/",
    sourceUrl: "https://www.startupindia.gov.in/content/sih/en/government-schemes.html",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::nidhi-eir",
    title: "NIDHI-EIR (Entrepreneur-in-Residence)",
    category: "Fellowship / Pre-incubation",
    whoItsFor: "Aspiring entrepreneurs needing fellowship support before/at startup formation",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "Central",
    state: "",
    ministry: "DST / NIDHI",
    summary: "Fellowship / support to reduce opportunity cost while validating startup ideas.",
    eligibility: "Per NIDHI-EIR guidelines / implementing centres.",
    benefits: "Monthly fellowship support (confirm current amount on portal).",
    statusNote: "Call/centre based — check nidhi-eir.in",
    startDate: "",
    endDate: "",
    applyUrl: "https://www.nidhi-eir.in/",
    sourceUrl: "https://www.nidhi-eir.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::elevate-ka",
    title: "Karnataka ELEVATE (Idea2PoC Grant-in-Aid)",
    category: "State seed grant",
    whoItsFor: "Karnataka-registered innovative early-stage startups",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "State",
    state: "Karnataka",
    ministry: "KITS / Dept of Electronics, IT & BT",
    summary: "One-time equity-free grant-in-aid for PoC / early scale (General, Shakti, Unnati, Aspire tracks).",
    eligibility: "Incorporated in Karnataka; typically ≤10 yrs; turnover caps per current call.",
    benefits: "Up to ₹50 Lakh grant-in-aid (confirm current call; NxT deep-tech may differ).",
    statusNote: "Cyclical calls — verify elevate.startupkarnataka.in / EITBT for open window",
    startDate: "",
    endDate: "",
    applyUrl: "https://elevate.startupkarnataka.in/",
    sourceUrl: "https://elevate.startupkarnataka.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::tanseed",
    title: "TANSEED (Tamil Nadu Startup Seed Fund)",
    category: "State seed",
    whoItsFor: "DPIIT + StartupTN registered startups in Tamil Nadu",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "State",
    state: "Tamil Nadu",
    ministry: "StartupTN / MSME Dept TN",
    summary: "Support equity-linked seed (recent editions: up to ₹15L green/rural/women; up to ₹10L others).",
    eligibility: "TN registered; StartupTN + DPIIT recognition; per edition guidelines.",
    benefits: "Up to ₹10–15 Lakh seed (edition-specific) + accelerator support.",
    statusNote: "Edition-based open/close — check startuptn.in / form.startuptn.in/tanseed",
    startDate: "",
    endDate: "",
    applyUrl: "https://startuptn.in/",
    sourceUrl: "https://startuptn.in/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::kerala-idea-grant",
    title: "Kerala Startup Mission – Idea / Early Stage Grants",
    category: "State micro-grant",
    whoItsFor: "Kerala innovators & early startups (incl. students, women-led)",
    serviceTrack: "FULL_APPLICATION",
    windowType: "OPEN_CLOSE",
    level: "State",
    state: "Kerala",
    ministry: "Kerala Startup Mission",
    summary: "Tiered early-stage support: Idea Grant (~₹3L), Productisation and related schemes.",
    eligibility: "Per KSUM scheme page / current call.",
    benefits: "Micro-grants typically ₹3 Lakh to ₹10 Lakh range (scheme-specific).",
    statusNote: "Scheme/call based — verify startupmission.kerala.gov.in",
    startDate: "",
    endDate: "",
    applyUrl: "https://startupmission.kerala.gov.in/schemes/early-stage-funding",
    sourceUrl: "https://startupmission.kerala.gov.in/schemes/early-stage-funding",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
  {
    externalKey: "flagship::hp-cm-startup",
    title: "Himachal CM Startup / HIMSUP Yojana",
    category: "State startup scheme",
    whoItsFor: "Innovators & startups in Himachal Pradesh",
    serviceTrack: "FULL_APPLICATION",
    windowType: "ALL_YEAR",
    level: "State",
    state: "Himachal Pradesh",
    ministry: "Dept of Industries / Startup Himachal Cell",
    summary: "Sustenance allowance, incubation, and seed support (HIMSUP) under CM Startup scheme.",
    eligibility: "Per Emerging Himachal / CM Startup scheme rules.",
    benefits: "Sustenance ~₹25k/month (1 yr); seed fund up to ~₹50 Lakh under HIMSUP (verify live).",
    statusNote: "Ongoing applications via emerginghimachal.hp.gov.in/startup",
    startDate: "",
    endDate: "",
    applyUrl: "https://emerginghimachal.hp.gov.in/startup",
    sourceUrl: "https://emerginghimachal.hp.gov.in/startup/about/incentive-procedure/",
    discoveredFrom: "flagship",
    updatedAt: "",
  },
] as const;

/** Hand-curated filter tags for flagship keys (high trust for matching). */
const FLAGSHIP_FILTERS: Record<
  string,
  {
    industries: string;
    instrument: string;
    stageFit: string;
    audienceTags: string;
    /** Stated max company age in years. Set only where the guideline is explicit. */
    maxAgeYears?: string;
    recurrence?: "RECURRING" | "ONE_TIME";
  }
> = {
  "flagship::sisfs": {
    industries: "General/Any; Deeptech; ICT/AI",
    instrument: "Grant",
    stageFit: "Idea/PoC",
    audienceTags: "DPIIT-recognised",
    maxAgeYears: "2", // SISFS: incorporated ≤2 years at application
    recurrence: "RECURRING", // cycles reopen — a closed window is not a dead scheme
  },
  "flagship::birac-big": {
    industries: "Biotech; Healthcare",
    instrument: "Grant",
    stageFit: "Idea/PoC",
    audienceTags: "",
  },
  "flagship::nidhi-prayas": {
    industries: "Deeptech; Hardware; ICT/AI; General/Any",
    instrument: "Grant",
    stageFit: "Prototype",
    audienceTags: "Hardware; Student",
  },
  "flagship::tide": {
    industries: "ICT/AI; Deeptech; Hardware",
    instrument: "Incubation",
    stageFit: "Idea/PoC",
    audienceTags: "",
  },
  "flagship::aim": {
    industries: "Deeptech; Social impact; General/Any",
    instrument: "Incubation",
    stageFit: "Any",
    audienceTags: "",
  },
  "flagship::idex": {
    industries: "Defence; Aerospace; Deeptech",
    instrument: "Grant",
    stageFit: "Prototype",
    audienceTags: "",
  },
  "flagship::rkvy-raftaar": {
    industries: "Agri",
    instrument: "Grant",
    stageFit: "Early revenue",
    audienceTags: "Rural",
  },
  "flagship::standup": {
    industries: "General/Any; Manufacturing",
    instrument: "Loan",
    stageFit: "Any",
    audienceTags: "Women; SC/ST",
  },
  "flagship::mudra": {
    industries: "General/Any",
    instrument: "Loan",
    stageFit: "Any",
    audienceTags: "",
  },
  "flagship::dpiit-recognition": {
    industries: "General/Any",
    instrument: "Recognition",
    stageFit: "Any",
    audienceTags: "DPIIT-recognised",
  },
  "flagship::cgtmse": {
    industries: "General/Any",
    instrument: "Guarantee",
    stageFit: "Early revenue",
    audienceTags: "",
  },
  "flagship::cgss": {
    industries: "General/Any",
    instrument: "Guarantee",
    stageFit: "Early revenue",
    audienceTags: "DPIIT-recognised",
  },
  "flagship::nidhi-eir": {
    industries: "Deeptech; General/Any",
    instrument: "Fellowship",
    stageFit: "Idea/PoC",
    audienceTags: "Student",
  },
  "flagship::elevate-ka": {
    industries: "General/Any; ICT/AI; Deeptech",
    instrument: "Grant",
    stageFit: "Idea/PoC",
    audienceTags: "Women; SC/ST",
    maxAgeYears: "10", // ELEVATE: typically ≤10 years — confirm against the live call
    recurrence: "RECURRING", // cyclical calls
  },
  "flagship::tanseed": {
    industries: "Cleantech; General/Any; Social impact",
    instrument: "Equity/Seed",
    stageFit: "Prototype",
    audienceTags: "Women; Rural; DPIIT-recognised",
  },
  "flagship::kerala-idea-grant": {
    industries: "General/Any; ICT/AI",
    instrument: "Grant",
    stageFit: "Idea/PoC",
    audienceTags: "Student; Women",
  },
  "flagship::hp-cm-startup": {
    industries: "General/Any",
    instrument: "Grant",
    stageFit: "Any",
    audienceTags: "",
  },
};

const LINK_HINT =
  /scheme|grant|loan|subsid|incentive|yojana|seed.?fund|standup|credit.?guarantee|fellowship|research.?grant|funding|sisfs|cgss|elevate|tanseed|prayas|tide|idex|birac|mudra|himsup|nidhi|raftaar/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function absUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(raw: string): Date | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t.slice(0, 10) + "T00:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Company age in whole+fractional years, or null when the date is unknown/unparseable. */
function ageInYears(dateStr: string, today = startOfToday()): number | null {
  const d = parseDate(dateStr || "");
  if (!d || d > today) return null;
  return (today.getTime() - d.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
}

/** Scheme's stated max company age, or null when there is no limit. */
function schemeMaxAge(s: Scheme): number | null {
  const n = parseFloat((s.maxAgeYears || "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A RECURRING scheme whose cycle deadline has passed is between calls, not dead.
 * Callers use this to keep it Active while showing "awaiting next cycle".
 */
function isBetweenCycles(s: Scheme, today = startOfToday()): boolean {
  if (s.recurrence !== "RECURRING") return false;
  const end = parseDate(s.endDate);
  return !!(end && end < today);
}

function isActiveScheme(s: Scheme, today = startOfToday()): boolean {
  const note = `${s.statusNote} ${s.title}`.toLowerCase();
  // "Discontinued/lapsed" kills a scheme outright, recurring or not. A merely
  // "closed" cycle does not — that is handled by the recurrence check below.
  if (/\b(worn[\s-]?out|inactive|lapsed|discontinued)\b|auto-retired/.test(note)) return false;
  if (/\b(closed|expired|ended)\b/.test(note) && s.recurrence !== "RECURRING") return false;

  const end = parseDate(s.endDate);
  if (end && end < today) {
    // ONE_TIME (Genesis EIR, a single challenge) is genuinely over.
    // RECURRING (SISFS, MUDRA) just finished a cycle and will reopen.
    return s.recurrence === "RECURRING";
  }
  return true;
}

function normalizeTrack(raw: string): string {
  const t = raw.toLowerCase();
  if (!t) return "BOTH";
  if (t.includes("both") || t.includes("either")) return "BOTH";
  if (t.includes("full") || t.includes("draft") || t.includes("monitor") || t.includes("application")) return "FULL_APPLICATION";
  if (t.includes("notification") || t.includes("alert") || t.includes("notify")) return "NOTIFICATION";
  return "BOTH";
}

function guessTrack(category: string, title: string): string {
  const t = `${category} ${title}`.toLowerCase();
  if (/loan|credit|guarantee|standup|mudra/.test(t)) return "BOTH";
  if (/recognition|tax|discovery|portal|aggregator/.test(t)) return "NOTIFICATION";
  if (/seed|grant|fund|yojana|scheme|birac|prayas|idex|tide/.test(t)) return "FULL_APPLICATION";
  return "BOTH";
}

/** ALL_YEAR = rolling/ongoing; OPEN_CLOSE = call/window based. */
function guessWindowType(s: Partial<Scheme>): "ALL_YEAR" | "OPEN_CLOSE" {
  if (s.endDate && parseDate(s.endDate)) return "OPEN_CLOSE";
  if (s.startDate && s.endDate) return "OPEN_CLOSE";
  const t = `${s.statusNote || ""} ${s.category || ""} ${s.title || ""}`.toLowerCase();
  if (/call|window|deadline|last date|closing|round|cohort|elevate|tanseed|big\b|prayas|sisfs|challenge|disc\b/.test(t)) {
    return "OPEN_CLOSE";
  }
  if (/ongoing|rolling|year-?round|all year|portal|recognition|mudra|standup|cgtmse|always open/.test(t)) {
    return "ALL_YEAR";
  }
  // Default: treat discovery portals as all-year; grants as open/close until verified
  if (/portal|discovery|aggregator|recognition/.test(t)) return "ALL_YEAR";
  return "OPEN_CLOSE";
}

function joinTags(tags: string[]): string {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join("; ");
}

function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Infer industry / instrument / stage / audience / age limit / recurrence from scheme text. */
function guessFilters(s: Partial<Scheme>): {
  industries: string;
  instrument: string;
  stageFit: string;
  audienceTags: string;
  maxAgeYears: string;
  recurrence: "RECURRING" | "ONE_TIME";
} {
  const blob = `${s.title || ""} ${s.category || ""} ${s.ministry || ""} ${s.whoItsFor || ""} ${s.summary || ""} ${s.eligibility || ""} ${s.statusNote || ""} ${s.applyUrl || ""} ${s.sourceUrl || ""}`.toLowerCase();
  const industries: string[] = [];
  const audience: string[] = [];

  if (/birac|biotech|bio[\s-]?tech|life[\s-]?science/.test(blob)) industries.push("Biotech");
  if (/health|pharma|medtech|medical/.test(blob)) industries.push("Healthcare");
  if (/agri|farm|raftaar|rkvy|food/.test(blob)) industries.push("Agri");
  if (/ai\b|iot|ict|software|meity|tide|digital|fintech|saas/.test(blob)) industries.push("ICT/AI");
  if (/fintech|payment|banking/.test(blob)) industries.push("Fintech");
  if (/deep[\s-]?tech|quantum|robot|hardware|prayas|nidhi/.test(blob)) industries.push("Deeptech");
  if (/defence|defense|idex|dio\b/.test(blob)) industries.push("Defence");
  if (/aerospace|space|drone/.test(blob)) industries.push("Aerospace");
  if (/clean|green|climate|renewable|solar|energy/.test(blob)) industries.push("Cleantech");
  if (/manufactur|msme|udyam/.test(blob)) industries.push("Manufacturing");
  if (/edtech|education/.test(blob)) industries.push("Edtech");
  if (/hardware|prototype|fab|maker/.test(blob)) industries.push("Hardware");
  if (/social|impact|aim\b|atal/.test(blob)) industries.push("Social impact");
  if (!industries.length) industries.push("General/Any");

  let instrument: Instrument = "Other";
  if (/recognit/.test(blob)) instrument = "Recognition";
  else if (/guarantee|cgtmse|cgss/.test(blob)) instrument = "Guarantee";
  else if (/mudra|standup|loan|credit/.test(blob)) instrument = "Loan";
  else if (/fellowship|eir\b/.test(blob)) instrument = "Fellowship";
  else if (/incubat|tide|aic\b|aim\b/.test(blob)) instrument = "Incubation";
  else if (/equity|tanseed|seed fund|investment/.test(blob)) instrument = "Equity/Seed";
  else if (/subsid/.test(blob)) instrument = "Subsidy";
  else if (/grant|elevate|prayas|big\b|sisfs|funding/.test(blob)) instrument = "Grant";

  let stageFit: StageFit = "Any";
  if (/idea|poc|proof of concept|ignition|eir\b/.test(blob)) stageFit = "Idea/PoC";
  else if (/prototype|prayas|productis/.test(blob)) stageFit = "Prototype";
  else if (/market entry|commercial|scale|growth/.test(blob)) stageFit = "Early revenue";

  if (/women|shakti|woman/.test(blob)) audience.push("Women");
  if (/sc\/?st|unnati|scheduled/.test(blob)) audience.push("SC/ST");
  if (/student|innovator/.test(blob)) audience.push("Student");
  if (/dpiit|recognised|recognized/.test(blob)) audience.push("DPIIT-recognised");
  if (/hardware/.test(blob)) audience.push("Hardware");
  if (/rural|gramam|village/.test(blob)) audience.push("Rural");

  // "≤2 years", "up to 10 yrs", "within 5 years", "less than 7 year" → "2" / "10" / "5" / "7"
  const ageMatch = blob.match(/(?:≤|<=|up to|less than|within|not more than|maximum(?: of)?)\s*(\d{1,2})\s*(?:year|yr)/);
  const maxAgeYears = ageMatch ? ageMatch[1] : "";

  return {
    industries: joinTags(industries),
    instrument,
    stageFit,
    audienceTags: joinTags(audience),
    maxAgeYears,
    recurrence: guessRecurrence(blob),
  };
}

/**
 * ONE_TIME only when the text signals a single, non-repeating call.
 * Everything else defaults to RECURRING — the safe default, since wrongly
 * retiring a live scheme (SISFS) costs the desk more than carrying a dead one.
 */
function guessRecurrence(blob: string): "RECURRING" | "ONE_TIME" {
  if (/one[\s-]?time|one[\s-]?off|final call|last call|pilot (?:call|round)|closed permanently|genesis/.test(blob)) {
    return "ONE_TIME";
  }
  return "RECURRING";
}

function ensureFilters(s: Scheme): Scheme {
  const curated = FLAGSHIP_FILTERS[s.externalKey];
  const guessed = guessFilters(s);
  return {
    ...s,
    industries: s.industries || curated?.industries || guessed.industries,
    instrument: s.instrument || curated?.instrument || guessed.instrument,
    stageFit: s.stageFit || curated?.stageFit || guessed.stageFit,
    audienceTags: s.audienceTags || curated?.audienceTags || guessed.audienceTags,
    windowType: s.windowType || guessWindowType(s),
    serviceTrack: s.serviceTrack || guessTrack(s.category, s.title),
    maxAgeYears: s.maxAgeYears || curated?.maxAgeYears || guessed.maxAgeYears,
    recurrence: s.recurrence || curated?.recurrence || guessed.recurrence,
    lastSeenCycle: s.lastSeenCycle ?? 0,
  };
}

const FLAGSHIP: Scheme[] = FLAGSHIP_RAW.map((s) =>
  ensureFilters({
    ...(s as unknown as Scheme),
    industries: "",
    instrument: "",
    stageFit: "",
    audienceTags: "",
  })
);

async function fetchText(url: string): Promise<string> {
  const browserUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": process.env.SCHEME_HTTP_USER_AGENT?.trim() || browserUa,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractSchemesFromHtml(html: string, source: SourceDef): Scheme[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const found = new Map<string, Scheme>();

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || text.length < 8 || text.length > 180) return;
    if (!LINK_HINT.test(href) && !LINK_HINT.test(text)) return;
    const url = absUrl(source.url, href);
    if (!url || !/^https?:/i.test(url)) return;
    if (/facebook|twitter|linkedin|youtube|instagram|mailto:|javascript:/i.test(url)) return;

    const key = url.split("#")[0].toLowerCase();
    if (found.has(key)) return;

    const draft: Scheme = ensureFilters({
      externalKey: key.slice(0, 200),
      title: text,
      category: source.category || "Gov scheme",
      whoItsFor: "Startups / MSMEs / eligible applicants (verify on page)",
      serviceTrack: guessTrack(source.category || "", text),
      windowType: "OPEN_CLOSE",
      industries: "",
      instrument: "",
      stageFit: "",
      audienceTags: "",
      level: source.level || "",
      state: source.state || "",
      ministry: source.name,
      summary: `Discovered from ${source.name}. Open source URL to verify eligibility, benefits, and open window.`,
      eligibility: "See official page",
      benefits: "See official page",
      statusNote: "Discovered — verify active window before pitching",
      startDate: "",
      endDate: "",
      maxAgeYears: "",
      recurrence: "RECURRING",
      applyUrl: url,
      sourceUrl: url,
      discoveredFrom: source.id,
      lastSeenCycle: 0, // stamped by crawlCycle
      updatedAt: now,
    });
    draft.windowType = guessWindowType(draft);
    found.set(key, draft);
  });

  // Always keep the portal itself as a discovery row
  const portalKey = source.url.replace(/\/$/, "").toLowerCase();
  if (!found.has(portalKey)) {
    const portal = ensureFilters({
      externalKey: portalKey.slice(0, 200),
      title: `${source.name} (portal)`,
      category: source.category || "Portal",
      whoItsFor: "Use as discovery hub",
      serviceTrack: "NOTIFICATION",
      windowType: "ALL_YEAR",
      industries: "General/Any",
      instrument: "Other",
      stageFit: "Any",
      audienceTags: "",
      level: source.level || "",
      state: source.state || "",
      ministry: source.name,
      summary: `Official / hub site for schemes related to ${source.name}.`,
      eligibility: "",
      benefits: "",
      statusNote: "Ongoing portal",
      startDate: "",
      endDate: "",
      maxAgeYears: "",
      recurrence: "RECURRING",
      applyUrl: source.url,
      sourceUrl: source.url,
      discoveredFrom: source.id,
      lastSeenCycle: 0, // stamped by crawlCycle
      updatedAt: now,
    });
    found.set(portalKey, portal);
  }

  return [...found.values()];
}

const SHEET_HEADER_MAP: Record<string, keyof Scheme> = {
  title: "title",
  category: "category",
  "who it's for": "whoItsFor",
  "naraway service track": "serviceTrack",
  "service track": "serviceTrack",
  level: "level",
  state: "state",
  "ministry / dept": "ministry",
  ministry: "ministry",
  summary: "summary",
  eligibility: "eligibility",
  benefits: "benefits",
  "apply url": "applyUrl",
  "source url": "sourceUrl",
  "start date": "startDate",
  "end date": "endDate",
  "scheme end date": "endDate",
  "active / window note": "statusNote",
  "status note": "statusNote",
  "external key": "externalKey",
  "window type": "windowType",
  window: "windowType",
  industries: "industries",
  industry: "industries",
  instrument: "instrument",
  "stage fit": "stageFit",
  stage: "stageFit",
  "audience tags": "audienceTags",
  audience: "audienceTags",
  "max age": "maxAgeYears",
  "max age (years)": "maxAgeYears",
  "scheme allowed age": "maxAgeYears",
  "allowed age": "maxAgeYears",
  recurrence: "recurrence",
  "recurring / one-time": "recurrence",
};

async function fetchGoogleSheetSchemes(): Promise<Scheme[]> {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`,
  ];
  for (const url of urls) {
    try {
      const text = await fetchText(url);
      if (text.slice(0, 100).toLowerCase().includes("<!doctype") || text.length < 10) continue;
      const rows = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
      if (rows.length < 2) continue;
      const [header, ...body] = rows;
      const keys = header.map((h) => SHEET_HEADER_MAP[h.trim().toLowerCase()] ?? null);
      const now = new Date().toISOString();
      return body
        .map((cells) => {
          const row: Partial<Scheme> = {};
          keys.forEach((k, i) => {
            if (k) (row as Record<string, string>)[k] = (cells[i] ?? "").trim();
          });
          if (!row.title) return null;
          const sourceUrl = row.sourceUrl || row.applyUrl || "";
          if (!sourceUrl) return null;
          const s = ensureFilters({
            externalKey: (row.externalKey || `${row.title}::${sourceUrl}`).slice(0, 200),
            title: row.title!,
            category: row.category || "",
            whoItsFor: row.whoItsFor || "",
            serviceTrack: normalizeTrack(row.serviceTrack || ""),
            windowType: "OPEN_CLOSE",
            industries: row.industries || "",
            instrument: row.instrument || "",
            stageFit: row.stageFit || "",
            audienceTags: row.audienceTags || "",
            level: row.level || "",
            state: row.state || "",
            ministry: row.ministry || "",
            summary: row.summary || "",
            eligibility: row.eligibility || "",
            benefits: row.benefits || "",
            statusNote: row.statusNote || "",
            startDate: row.startDate || "",
            endDate: row.endDate || "",
            maxAgeYears: row.maxAgeYears || "",
            recurrence: "RECURRING",
            applyUrl: row.applyUrl || sourceUrl,
            sourceUrl,
            discoveredFrom: "google-sheet",
            lastSeenCycle: 0, // stamped by crawlCycle
            updatedAt: now,
          });
          const wt = (row.windowType || "").toUpperCase();
          s.windowType = wt === "ALL_YEAR" || wt === "OPEN_CLOSE" ? wt : guessWindowType(s);
          const rec = (row.recurrence || "").toUpperCase();
          if (rec === "ONE_TIME" || rec === "RECURRING") s.recurrence = rec;
          return s;
        })
        .filter((s): s is Scheme => !!s);
    } catch {
      /* try next */
    }
  }
  return [];
}

function mergeSchemes(existing: Scheme[], incoming: Scheme[]): Scheme[] {
  const map = new Map<string, Scheme>();
  for (const s of existing) map.set(s.externalKey.toLowerCase(), s);
  for (const s of incoming) {
    const k = s.externalKey.toLowerCase();
    const prev = map.get(k);
    if (!prev) {
      map.set(k, s);
      continue;
    }
    // Prefer longer summary / explicit end dates from newer crawl
    map.set(
      k,
      ensureFilters({
        ...prev,
        ...s,
        summary: s.summary.length >= prev.summary.length ? s.summary : prev.summary,
        endDate: s.endDate || prev.endDate,
        startDate: s.startDate || prev.startDate,
        applyUrl: s.applyUrl || prev.applyUrl,
        sourceUrl: s.sourceUrl || prev.sourceUrl,
        industries: s.industries || prev.industries || "",
        instrument: s.instrument || prev.instrument || "",
        stageFit: s.stageFit || prev.stageFit || "",
        audienceTags: s.audienceTags || prev.audienceTags || "",
        updatedAt: s.updatedAt,
      })
    );
  }
  return [...map.values()].map(ensureFilters);
}

function splitActive(schemes: Scheme[]) {
  const active: Scheme[] = [];
  const removed: Scheme[] = [];
  for (const s of schemes) (isActiveScheme(s) ? active : removed).push(s);
  return { active, removed };
}

function schemeCols(): Partial<ExcelJS.Column>[] {
  return [
    { header: "Title", key: "title", width: 40 },
    { header: "Industries", key: "industries", width: 28 },
    { header: "Instrument", key: "instrument", width: 14 },
    { header: "Stage fit", key: "stageFit", width: 14 },
    { header: "Audience tags", key: "audienceTags", width: 22 },
    { header: "Category", key: "category", width: 20 },
    { header: "Who it's for", key: "whoItsFor", width: 28 },
    { header: "Naraway service track", key: "serviceTrack", width: 18 },
    { header: "Window type", key: "windowType", width: 14 },
    { header: "Level", key: "level", width: 10 },
    { header: "State", key: "state", width: 14 },
    { header: "Ministry / source", key: "ministry", width: 22 },
    { header: "Summary", key: "summary", width: 36 },
    { header: "Eligibility", key: "eligibility", width: 24 },
    { header: "Benefits", key: "benefits", width: 24 },
    { header: "Start date", key: "startDate", width: 12 },
    { header: "End date", key: "endDate", width: 12 },
    { header: "Recurrence", key: "recurrence", width: 12 },
    { header: "Max age (yrs)", key: "maxAgeYears", width: 12 },
    { header: "Status note", key: "statusNote", width: 26 },
    { header: "Apply / website URL", key: "applyUrl", width: 40 },
    { header: "Source URL", key: "sourceUrl", width: 40 },
    { header: "Discovered from", key: "discoveredFrom", width: 14 },
    { header: "Updated at", key: "updatedAt", width: 20 },
  ];
}

function fillSheet(ws: ExcelJS.Worksheet, cols: Partial<ExcelJS.Column>[], rows: object[], autoFilter = true) {
  ws.columns = cols;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  if (autoFilter && rows.length) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: cols.length },
    };
  }
}

export async function buildWorkbookBuffer(
  active: Scheme[],
  removed: Scheme[],
  startups: StartupClient[] = [],
  matches: MatchRow[] = [],
  notifications: NotifyLog[] = []
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Naraway Grants Desk";
  const cols = schemeCols();

  // ONLY active schemes on main lists (year-round + still-open one-time windows)
  const sorted = [...active].map(ensureFilters).sort((a, b) => a.title.localeCompare(b.title));
  const allYear = sorted.filter((s) => s.windowType === "ALL_YEAR");
  const openClose = sorted.filter((s) => s.windowType !== "ALL_YEAR");

  fillSheet(wb.addWorksheet("Active Schemes"), cols, sorted);
  fillSheet(wb.addWorksheet("Active — year round"), cols, allYear);
  fillSheet(wb.addWorksheet("Active — open window"), cols, openClose);
  fillSheet(wb.addWorksheet("Removed (expired)"), cols, removed.map(ensureFilters), false);

  fillSheet(
    wb.addWorksheet("Our Startups"),
    [
      { header: "ID", key: "id", width: 14 },
      { header: "Name", key: "name", width: 28 },
      { header: "Package start", key: "packageStartDate", width: 14 },
      { header: "Package end", key: "packageEndDate", width: 14 },
      { header: "Category / plan", key: "plan", width: 18 },
      { header: "Industries", key: "industriesJoined", width: 28 },
      { header: "States", key: "statesJoined", width: 20 },
      { header: "Stage", key: "stage", width: 14 },
      { header: "DPIIT", key: "dpiitRecognised", width: 10 },
      { header: "Audience", key: "audienceJoined", width: 20 },
      { header: "Notify emails", key: "emailsJoined", width: 36 },
      { header: "Active", key: "active", width: 10 },
      { header: "Notes", key: "notes", width: 28 },
    ],
    startups.map((s) => ({
      ...s,
      packageStartDate: s.packageStartDate || "",
      packageEndDate: s.packageEndDate || "",
      industriesJoined: (s.industries || []).join("; "),
      statesJoined: (s.states || []).join("; "),
      audienceJoined: (s.audienceTags || []).join("; "),
      emailsJoined: (s.notifyEmails || []).join("; "),
    }))
  );

  fillSheet(
    wb.addWorksheet("Matches"),
    [
      { header: "Startup", key: "startupName", width: 24 },
      { header: "Scheme", key: "schemeTitle", width: 36 },
      { header: "Standard?", key: "isStandard", width: 10 },
      { header: "New?", key: "isNew", width: 8 },
      { header: "Plan", key: "plan", width: 16 },
      { header: "Details", key: "details", width: 40 },
      { header: "Apply URL", key: "applyUrl", width: 40 },
      { header: "Official URL", key: "officialUrl", width: 40 },
      { header: "Window", key: "windowType", width: 12 },
      { header: "Instrument", key: "instrument", width: 12 },
      { header: "Notify status", key: "notifyStatus", width: 12 },
      { header: "Filing status", key: "filingStatus", width: 12 },
      { header: "Score", key: "score", width: 8 },
      { header: "Matched at", key: "matchedAt", width: 20 },
    ],
    matches
  );

  const filing = matches.filter((m) => m.filingStatus === "queued" || m.filingStatus === "in_progress");
  fillSheet(
    wb.addWorksheet("Filing queue"),
    [
      { header: "Startup", key: "startupName", width: 24 },
      { header: "Scheme", key: "schemeTitle", width: 36 },
      { header: "Standard?", key: "isStandard", width: 10 },
      { header: "New?", key: "isNew", width: 8 },
      { header: "Details", key: "details", width: 40 },
      { header: "Apply URL", key: "applyUrl", width: 40 },
      { header: "Official URL", key: "officialUrl", width: 40 },
      { header: "Filing status", key: "filingStatus", width: 14 },
      { header: "Plan", key: "plan", width: 16 },
    ],
    filing
  );

  fillSheet(
    wb.addWorksheet("Notifications sent"),
    [
      { header: "At", key: "at", width: 22 },
      { header: "Startup", key: "startupName", width: 24 },
      { header: "Scheme", key: "schemeTitle", width: 36 },
      { header: "Apply URL", key: "applyUrl", width: 40 },
      { header: "Official URL", key: "officialUrl", width: 40 },
      { header: "Emails", key: "emailsJoined", width: 36 },
      { header: "Plan", key: "plan", width: 16 },
      { header: "Status", key: "status", width: 12 },
      { header: "Detail", key: "detail", width: 40 },
    ],
    notifications.map((n) => ({ ...n, emailsJoined: (n.emails || []).join("; ") }))
  );

  const how = wb.addWorksheet("How to use");
  how.getColumn(1).width = 110;
  [
    "Naraway Grants Desk — NOT Sales OS. Dashboard: http://localhost:4010/",
    "ACTIVE ONLY: Active Schemes / Active — year round / Active — open window = non-expired only.",
    "Year round = ALL_YEAR ongoing. Open window = OPEN_CLOSE still valid (end date not passed / not closed).",
    "Expired / closed → Removed tab. Re-check open windows before pitching.",
    "Filter columns: Industries, Instrument, Stage fit, Audience, State, Window — use Excel AutoFilter.",
    "Our Startups = clients on this desk (JSON, ~100 OK). Plan = NOTIFICATION | FULL_APPLICATION | BOTH.",
    "Matches = auto match. NOTIFICATION/BOTH → notify client. FULL_APPLICATION/BOTH → Filing queue for team.",
    "Team handles filing from Filing queue without needing a client call first.",
  ].forEach((line) => how.addRow([line]));

  // ExcelJS returns its own Buffer type; hand back the raw value and let callers wrap it.
  return wb.xlsx.writeBuffer();
}

/** Persists store to Postgres. Excel is built on demand by the export route. */
async function saveStore(store: Store) {
  store.active = store.active.map(ensureFilters);
  store.removed = store.removed.map(ensureFilters);
  await persistStore(store);
}

function stageCompatible(startupStage: string, schemeStage: string): boolean {
  if (!schemeStage || schemeStage === "Any") return true;
  if (!startupStage || startupStage === "Any") return true;
  const order = ["Idea/PoC", "Prototype", "Early revenue", "Growth"];
  const a = order.indexOf(startupStage);
  const b = order.indexOf(schemeStage);
  if (a < 0 || b < 0) return true;
  return Math.abs(a - b) <= 1;
}

function matchScore(startup: StartupClient, scheme: Scheme): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const sInd = splitTags(scheme.industries).map((t) => t.toLowerCase());
  const cInd = startup.industries.map((t) => t.toLowerCase());
  const indHit =
    sInd.includes("general/any") ||
    cInd.includes("general/any") ||
    cInd.some((i) => sInd.some((si) => si.includes(i) || i.includes(si)));
  if (!indHit) return { score: 0, reasons: ["no industry overlap"] };
  score += sInd.includes("general/any") && !cInd.some((i) => sInd.includes(i)) ? 20 : 40;
  reasons.push("industry");

  const central = !scheme.state || scheme.level === "Central";
  const stateHit = central || startup.states.some((st) => scheme.state.toLowerCase().includes(st.toLowerCase()));
  if (!stateHit) return { score: 0, reasons: ["state mismatch"] };
  score += central ? 15 : 25;
  reasons.push(central ? "central" : `state:${scheme.state}`);

  if (stageCompatible(startup.stage, scheme.stageFit)) {
    score += 15;
    reasons.push(`stage:${scheme.stageFit || "Any"}`);
  } else {
    return { score: 0, reasons: ["stage mismatch"] };
  }

  // Company-age gate — the most common hard disqualifier after DPIIT recognition
  // (SISFS ≤2 yrs, ELEVATE ≤10 yrs). Only excludes when BOTH sides are known:
  // an unknown incorporation date or an unstated limit must never silently drop a match.
  const maxAge = schemeMaxAge(scheme);
  const age = ageInYears(startup.incorporationDate);
  if (maxAge !== null && age !== null) {
    if (age > maxAge) {
      return { score: 0, reasons: [`age ${age.toFixed(1)}y > allowed ${maxAge}y`] };
    }
    score += 10;
    reasons.push(`age:${age.toFixed(1)}y≤${maxAge}y`);
  }

  const schemeAud = splitTags(scheme.audienceTags).map((t) => t.toLowerCase());
  const exclusive = schemeAud.filter((a) => a === "women" || a === "sc/st");
  if (exclusive.length) {
    const clientAud = startup.audienceTags.map((t) => t.toLowerCase());
    const ok = exclusive.every((a) => clientAud.some((c) => c.includes(a) || a.includes(c)));
    if (!ok) return { score: 0, reasons: ["audience exclusive mismatch"] };
    score += 10;
    reasons.push("audience");
  } else if (schemeAud.includes("dpiit-recognised") && startup.dpiitRecognised) {
    score += 10;
    reasons.push("dpiit");
  }

  if (scheme.windowType === "OPEN_CLOSE") {
    score += 5;
    reasons.push("timed-window");
  }
  return { score, reasons };
}

/** Package ended (end date before today) → no more notifies; mark inactive. */
function isPackageExpired(s: StartupClient, today = startOfToday()): boolean {
  const end = parseDate(s.packageEndDate || "");
  return !!(end && end < today);
}

function isStartupEligibleForNotify(s: StartupClient | undefined): boolean {
  if (!s) return false;
  if (!s.active) return false;
  if (isPackageExpired(s)) return false;
  return true;
}

/** Persist inactive when package end date has passed. */
async function deactivateExpiredPackages(): Promise<StartupClient[]> {
  const list = await readStartups();
  let changed = 0;
  const next = list.map((s) => {
    if (isPackageExpired(s) && s.active) {
      changed++;
      return {
        ...s,
        active: false,
        notes: s.notes?.includes("[auto-inactive: package ended]")
          ? s.notes
          : `${s.notes || ""} [auto-inactive: package ended]`.trim(),
      };
    }
    return s;
  });
  if (changed) {
    await saveStartups(next);
    console.log(`[startups] auto-inactive ${changed} (package end date passed)`);
  }
  return next;
}

async function ensureSampleStartups(): Promise<StartupClient[]> {
  let list = await deactivateExpiredPackages();
  if (list.length) return list;
  if (!ALLOW_SAMPLE_DATA) return list; // production starts empty until real clients are added
  list = [
    {
      id: "su-biotech-ka",
      name: "Sample BioLabs KA",
      industries: ["Biotech", "Healthcare"],
      states: ["Karnataka"],
      stage: "Idea/PoC",
      incorporationDate: "2025-06-01", // ~1y old — passes SISFS ≤2y
      dpiitRecognised: true,
      audienceTags: [],
      notifyEmails: ["founder@example.com"],
      plan: "BOTH",
      packageStartDate: "2026-04-01",
      packageEndDate: "2027-03-31",
      active: true,
      notes: "Demo — Notification + Application",
    },
    {
      id: "su-ai-tn",
      name: "Sample AI Works TN",
      industries: ["ICT/AI", "Deeptech"],
      states: ["Tamil Nadu"],
      stage: "Prototype",
      incorporationDate: "2021-03-15", // ~5y old — too old for SISFS, fine for ELEVATE ≤10y
      dpiitRecognised: true,
      audienceTags: ["Women"],
      notifyEmails: ["ops@example.com"],
      plan: "NOTIFICATION",
      packageStartDate: "2026-01-01",
      packageEndDate: "2026-12-31",
      active: true,
      notes: "Demo — Notification only (sorts to bottom)",
    },
    {
      id: "su-agri-hp",
      name: "Sample Agri HP",
      industries: ["Agri"],
      states: ["Himachal Pradesh"],
      stage: "Early revenue",
      incorporationDate: "", // unknown — age gate must not exclude this client
      dpiitRecognised: false,
      audienceTags: ["Rural"],
      notifyEmails: ["agri@example.com"],
      plan: "FULL_APPLICATION",
      packageStartDate: "2026-06-01",
      packageEndDate: "2027-05-31",
      active: true,
      notes: "Demo — Application package",
    },
  ];
  await saveStartups(list);
  console.log(`[startups] seeded ${list.length} sample clients`);
  return list;
}

/** Team only sees actionable matches — standard flagship + strong new schemes (not portals). */
function isTeamActionableScheme(scheme: Scheme): { ok: boolean; isStandard: boolean } {
  const isStandard = scheme.discoveredFrom === "flagship" || scheme.externalKey.startsWith("flagship::");
  if (isStandard) return { ok: true, isStandard: true };
  if (/portal|aggregator|discovery|hub site/i.test(`${scheme.category} ${scheme.title} ${scheme.summary}`)) {
    return { ok: false, isStandard: false };
  }
  const instrumentOk = /^(Grant|Loan|Guarantee|Equity\/Seed|Incubation|Fellowship|Recognition|Subsidy)$/i.test(
    scheme.instrument || ""
  );
  if (!instrumentOk) return { ok: false, isStandard: false };
  if ((scheme.title || "").length < 12) return { ok: false, isStandard: false };
  return { ok: true, isStandard: false };
}

async function recomputeMatches(activeSchemes: Scheme[]): Promise<MatchRow[]> {
  const startups = (await ensureSampleStartups()).filter((s) => s.active && !isPackageExpired(s));
  const prev = await readMatches();
  const prevMap = new Map(prev.map((m) => [`${m.startupId}::${m.schemeKey}`.toLowerCase(), m]));
  const now = new Date().toISOString();
  const next: MatchRow[] = [];

  for (const startup of startups) {
    const perStartup: MatchRow[] = [];
    for (const scheme of activeSchemes) {
      const gate = isTeamActionableScheme(scheme);
      if (!gate.ok) continue;
      const { score, reasons } = matchScore(startup, scheme);
      // Standard schemes: lower bar. New/other: higher bar so team is not flooded.
      const minScore = gate.isStandard ? 35 : 55;
      if (score < minScore) continue;
      const key = `${startup.id}::${scheme.externalKey}`.toLowerCase();
      const old = prevMap.get(key);
      const wantsFiling = startup.plan === "FULL_APPLICATION" || startup.plan === "BOTH";
      const wantsNotify =
        startup.plan === "NOTIFICATION" || startup.plan === "BOTH" || startup.plan === "FULL_APPLICATION";
      const details = [scheme.benefits, scheme.summary, scheme.eligibility].filter(Boolean).join(" — ").slice(0, 320);
      const applyUrl = scheme.applyUrl || scheme.sourceUrl;
      const officialUrl = scheme.sourceUrl || scheme.applyUrl;
      perStartup.push({
        id: old?.id || `m_${startup.id}_${Buffer.from(scheme.externalKey).toString("base64url").slice(0, 12)}`,
        startupId: startup.id,
        startupName: startup.name,
        plan: startup.plan,
        schemeKey: scheme.externalKey,
        schemeTitle: scheme.title,
        industries: scheme.industries,
        instrument: scheme.instrument,
        windowType: scheme.windowType,
        state: scheme.state || scheme.level,
        score,
        reasons: reasons.join(", "),
        details: details || "Open official link for full guidelines.",
        applyUrl,
        officialUrl,
        sourceUrl: scheme.sourceUrl,
        isStandard: gate.isStandard,
        isNew: !old,
        notifyStatus: old?.notifyStatus || (wantsNotify ? "pending" : "skipped"),
        filingStatus: old?.filingStatus || (wantsFiling ? "queued" : "none"),
        matchedAt: old?.matchedAt || now,
        notifiedAt: old?.notifiedAt || "",
      });
    }
    // Cap noise: keep top standard + new matches per startup
    perStartup.sort((a, b) => {
      if (a.isStandard !== b.isStandard) return a.isStandard ? -1 : 1;
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return b.score - a.score;
    });
    next.push(...perStartup.slice(0, 20));
  }

  next.sort(
    (a, b) =>
      Number(b.isNew) - Number(a.isNew) ||
      Number(b.isStandard) - Number(a.isStandard) ||
      b.score - a.score ||
      a.startupName.localeCompare(b.startupName)
  );
  await saveMatches(next);
  console.log(
    `[match] ${next.length} team-actionable matches (${next.filter((m) => m.isStandard).length} standard, ${next.filter((m) => m.isNew).length} new) for ${startups.length} startups`
  );
  return next;
}

function isAppPackage(plan: ClientPlan): boolean {
  return plan === "FULL_APPLICATION" || plan === "BOTH";
}

function isNotifyPackage(plan: ClientPlan): boolean {
  return plan === "NOTIFICATION" || plan === "BOTH";
}

/** Build To: list — team@naraway.com for application package; client emails for notify package. */
function recipientsForMatch(m: MatchRow, su: StartupClient | undefined): string[] {
  const emails: string[] = [];
  if (isAppPackage(m.plan) && TEAM_NOTIFY_EMAIL) emails.push(TEAM_NOTIFY_EMAIL);
  if (isNotifyPackage(m.plan) && su?.notifyEmails?.length) emails.push(...su.notifyEmails);
  return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

async function sendNotifyEmail(opts: {
  to: string[];
  subject: string;
  text: string;
}): Promise<{ ok: boolean; mode: "sent" | "simulated" | "failed"; detail: string }> {
  // Master switch. Off => always simulate, whatever transport is configured.
  if (!NOTIFY_ENABLED) {
    return {
      ok: true,
      mode: "simulated",
      detail: `SIMULATED (GRANTS_NOTIFY_ENABLED not true) → ${opts.to.join(", ")}`,
    };
  }
  const webhook = process.env.GRANTS_NOTIFY_WEBHOOK?.trim();
  const host = process.env.GRANTS_SMTP_HOST?.trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: opts.to, subject: opts.subject, text: opts.text, from: process.env.GRANTS_SMTP_FROM || "grants@naraway.com" }),
      });
      if (!res.ok) return { ok: false, mode: "failed", detail: `webhook HTTP ${res.status}` };
      return { ok: true, mode: "sent", detail: `webhook → ${opts.to.join(", ")}` };
    } catch (e) {
      return { ok: false, mode: "failed", detail: e instanceof Error ? e.message : String(e) };
    }
  }
  if (host) {
    // Lightweight SMTP send via Node net — prefer webhook/Resend in production.
    // For now mark as failed with hint unless GRANTS_SMTP_USER is also set and we use a simple API.
    // Use GRANTS_NOTIFY_WEBHOOK (Resend/SendGrid) for real delivery; host alone = simulated with note.
    return {
      ok: true,
      mode: "simulated",
      detail: `SMTP host set (${host}) but use GRANTS_NOTIFY_WEBHOOK for reliable send. Would email: ${opts.to.join(", ")}`,
    };
  }
  return {
    ok: true,
    mode: "simulated",
    detail: `SIMULATED email → ${opts.to.join(", ")} (set GRANTS_NOTIFY_WEBHOOK or SMTP to send for real)`,
  };
}

async function runNotifications(matches: MatchRow[]): Promise<{ sent: number; simulated: number }> {
  const startups = await deactivateExpiredPackages();
  const byId = new Map(startups.map((s) => [s.id, s]));
  const newLogs: NotifyLog[] = [];
  let sent = 0;
  let simulated = 0;
  let attempted = 0;
  const updated = [...matches];

  for (const m of updated) {
    if (m.notifyStatus !== "pending") continue;
    // Cap per run so a large match set cannot mass-mail in one cycle; the rest
    // stay pending and go out next cycle.
    if (attempted >= NOTIFY_MAX_PER_RUN) break;
    // Filed apps are done — never (re)notify in list
    if (m.filingStatus === "filed") {
      m.notifyStatus = "skipped";
      continue;
    }
    const su = byId.get(m.startupId);
    // Inactive or package end date passed → stop all notification emails
    if (!isStartupEligibleForNotify(su)) {
      m.notifyStatus = "skipped";
      continue;
    }
    const to = recipientsForMatch(m, su);
    if (!to.length) {
      m.notifyStatus = "skipped";
      continue;
    }

    const kind = m.isStandard ? "Standard scheme" : "New scheme match";
    const teamAction = isAppPackage(m.plan);
    const subject = teamAction
      ? `[Grants apply] ${m.startupName} — ${m.schemeTitle}`
      : `[Grant alert] ${m.startupName} — ${m.schemeTitle}`;
    const text = [
      kind,
      `Startup: ${m.startupName}`,
      `Plan: ${m.plan}`,
      `Scheme: ${m.schemeTitle}`,
      `Window: ${m.windowType} · ${m.instrument || ""}`,
      "",
      m.details,
      "",
      `Apply link: ${m.applyUrl}`,
      `Official details: ${m.officialUrl}`,
      "",
      teamAction
        ? "Action for team@naraway.com: open Apply link and file for this startup. Mark filed on the Grants Desk when done."
        : "Action: client notification only (no team filing package).",
      `Desk: ${APP_BASE_URL}/grants#startup/${encodeURIComponent(m.startupId)}`,
    ].join("\n");

    attempted++;
    const result = await sendNotifyEmail({ to, subject, text });
    const at = new Date().toISOString();
    m.notifiedAt = at;
    m.notifyStatus = result.mode === "sent" ? "sent" : result.mode === "failed" ? "pending" : "simulated";
    if (result.mode === "sent") sent++;
    else if (result.mode === "simulated") simulated++;

    newLogs.push({
      id: `n_${Date.now()}_${m.id}`,
      matchId: m.id,
      startupId: m.startupId,
      startupName: m.startupName,
      schemeTitle: m.schemeTitle,
      emails: to,
      plan: m.plan,
      at,
      applyUrl: m.applyUrl,
      officialUrl: m.officialUrl,
      status: result.mode === "failed" ? "failed" : result.mode,
      detail: `${result.detail}\n\n${text}`,
    });
  }

  await saveMatches(updated);
  await appendNotifications(newLogs);
  console.log(`[notify] sent=${sent} simulated=${simulated} team=${TEAM_NOTIFY_EMAIL}`);
  return { sent, simulated };
}

async function persistWorkbook(store: Store) {
  await saveStore(store);
}

async function crawlCycle(prev: Store): Promise<Store> {
  const errors: string[] = [];
  const now = new Date().toISOString();
  const cycle = (prev.cycle || 0) + 1;
  /** Sources that actually responded this cycle — only their rows are eligible for staleness retirement. */
  const reachedSources = new Set<string>();
  let discovered: Scheme[] = [...prev.active, ...prev.removed];

  // Flagship + sheet rows are curated, so they are "seen" every cycle by definition.
  discovered = mergeSchemes(
    discovered,
    FLAGSHIP.map((s) => ({ ...s, updatedAt: now, lastSeenCycle: cycle }))
  );
  console.log(`[flagship] seeded ${FLAGSHIP.length} known schemes`);

  try {
    const sheetRows = await fetchGoogleSheetSchemes();
    if (sheetRows.length) {
      discovered = mergeSchemes(discovered, sheetRows.map((s) => ({ ...s, lastSeenCycle: cycle })));
      console.log(`[sheet] +${sheetRows.length} rows`);
    } else {
      console.log("[sheet] no rows (private/empty) — continuing crawl");
    }
  } catch (e) {
    errors.push(`sheet: ${e instanceof Error ? e.message : e}`);
  }

  for (const source of SOURCES) {
    try {
      await sleep(REQUEST_GAP_MS);
      const html = await fetchText(source.url);
      const rows = extractSchemesFromHtml(html, source);
      discovered = mergeSchemes(discovered, rows.map((s) => ({ ...s, lastSeenCycle: cycle })));
      console.log(`[crawl] ${source.id}: +${rows.length} link-schemes`);
      reachedSources.add(source.id);
    } catch (e) {
      const msg = `${source.id}: ${e instanceof Error ? e.message : e}`;
      errors.push(msg);
      console.warn(`[crawl] fail ${msg}`);
    }
  }

  // Retire crawled links that have vanished from their portal. Only judge rows whose
  // source actually responded this cycle — a portal being down must not retire its rows.
  const stale = discovered.filter(
    (s) =>
      reachedSources.has(s.discoveredFrom) &&
      cycle - (s.lastSeenCycle || 0) >= STALE_CYCLES &&
      !s.externalKey.startsWith("flagship::")
  );
  if (stale.length) {
    const staleKeys = new Set(stale.map((s) => s.externalKey));
    discovered = discovered.map((s) =>
      staleKeys.has(s.externalKey)
        ? { ...s, statusNote: `${s.statusNote} [gone from source — auto-retired]`.trim(), recurrence: "ONE_TIME" as const }
        : s
    );
    console.log(`[retire] ${stale.length} rows no longer listed on their portal`);
  }

  // Only ACTIVE schemes stay on Active / year-round / open-window lists
  const { active, removed } = splitActive(discovered.map(ensureFilters));
  const store: Store = {
    syncedAt: new Date().toISOString(),
    cycle,
    active,
    removed,
    lastErrors: errors.slice(-30),
  };

  const matches = await recomputeMatches(active);
  await runNotifications(matches);
  await persistWorkbook(store);

  const ay = active.filter((s) => s.windowType === "ALL_YEAR").length;
  const oc = active.filter((s) => s.windowType !== "ALL_YEAR").length;
  console.log(
    `[cycle ${store.cycle}] active=${active.length} (year-round=${ay}, open-window=${oc}) removed=${removed.length} matches=${matches.length} errors=${errors.length}`
  );
  return store;
}

async function runDemo(): Promise<Store> {
  const now = new Date().toISOString();
  const demo: Scheme[] = [
    ensureFilters({
      externalKey: "demo-sisfs",
      title: "Startup India Seed Fund Scheme (SISFS)",
      category: "Seed fund",
      whoItsFor: "DPIIT startups via incubators",
      serviceTrack: "FULL_APPLICATION",
      windowType: "OPEN_CLOSE",
      industries: "",
      instrument: "",
      stageFit: "",
      audienceTags: "",
      level: "Central",
      state: "",
      ministry: "DPIIT",
      summary: "Seed support for PoC / commercialisation.",
      eligibility: "DPIIT + SISFS rules",
      benefits: "Grant + investment limbs",
      statusNote: "Verify live cycle",
      startDate: "2021-04-19",
      endDate: "",
      maxAgeYears: "2",
      recurrence: "RECURRING",
      applyUrl: "https://seedfund.startupindia.gov.in/",
      sourceUrl: "https://seedfund.startupindia.gov.in/",
      discoveredFrom: "demo",
      lastSeenCycle: 0,
      updatedAt: now,
    }),
    // RECURRING past its cycle deadline — must STAY active (awaiting next call), not retire.
    ensureFilters({
      externalKey: "demo-recurring-between-cycles",
      title: "DEMO Recurring scheme (cycle closed, reopens)",
      category: "Seed fund",
      whoItsFor: "Demo",
      serviceTrack: "FULL_APPLICATION",
      windowType: "OPEN_CLOSE",
      industries: "",
      instrument: "",
      stageFit: "",
      audienceTags: "",
      level: "Central",
      state: "",
      ministry: "Demo",
      summary: "Stays on Active — last cycle closed but the scheme reopens.",
      eligibility: "",
      benefits: "",
      statusNote: "Cycle closed",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      maxAgeYears: "",
      recurrence: "RECURRING",
      applyUrl: "https://seedfund.startupindia.gov.in/",
      sourceUrl: "https://seedfund.startupindia.gov.in/",
      discoveredFrom: "demo",
      lastSeenCycle: 0,
      updatedAt: now,
    }),
    ensureFilters({
      // ONE_TIME past its deadline — genuinely dead, must drop off Active.
      externalKey: "demo-expired",
      title: "DEMO Expired one-time scheme 2023",
      category: "Grant",
      whoItsFor: "Demo",
      serviceTrack: "NOTIFICATION",
      windowType: "OPEN_CLOSE",
      industries: "",
      instrument: "",
      stageFit: "",
      audienceTags: "",
      level: "State",
      state: "Demo",
      ministry: "Demo",
      summary: "Should be removed from Active",
      eligibility: "",
      benefits: "",
      statusNote: "CLOSED",
      startDate: "2023-01-01",
      endDate: "2023-12-31",
      maxAgeYears: "",
      recurrence: "ONE_TIME",
      applyUrl: "https://www.myscheme.gov.in/",
      sourceUrl: "https://www.myscheme.gov.in/",
      discoveredFrom: "demo",
      lastSeenCycle: 0,
      updatedAt: now,
    }),
  ];
  const { active, removed } = splitActive(demo);
  await ensureSampleStartups();
  const matches = await recomputeMatches(active);
  await runNotifications(matches);
  const store: Store = { syncedAt: now, cycle: 0, active, removed, lastErrors: [] };
  await persistWorkbook(store);
  console.log(
    JSON.stringify(
      {
        active: active.length,
        removed: removed.length,
        matches: matches.length,
        removedTitles: removed.map((r) => r.title),
      },
      null,
      2
    )
  );
  return store;
}

// ---------------------------------------------------------------------------
// Background loop
// ---------------------------------------------------------------------------

let engineTimer: NodeJS.Timeout | null = null;
let cycleInFlight = false;

/**
 * One cycle, guarded. Returns silently if a cycle is already running.
 *
 * Uses recursive scheduling (not setInterval): a cycle slower than the interval
 * would otherwise overlap with the next and interleave writes to shared state.
 */
async function runOneCycle(): Promise<void> {
  if (cycleInFlight) {
    console.warn("[grants] previous cycle still running — skipping this tick");
    return;
  }
  cycleInFlight = true;
  try {
    const prev = await readStore();
    await crawlCycle(prev);
  } catch (e) {
    console.error("[grants] cycle failed:", e instanceof Error ? e.message : e);
  } finally {
    cycleInFlight = false;
  }
}

function scheduleNext(intervalMs: number) {
  engineTimer = setTimeout(async () => {
    await runOneCycle();
    scheduleNext(intervalMs); // only after completion — never overlaps
  }, intervalMs);
  engineTimer.unref?.();
}

/**
 * Starts the crawl loop inside the API process.
 *
 * Takes a Postgres advisory lock first: if the service runs more than one instance,
 * only the lock holder crawls, so clients never get duplicate emails. The lock is
 * held for the process lifetime and released by Postgres when the connection drops.
 */
export async function startGrantsEngine(): Promise<void> {
  if (process.env.GRANTS_ENGINE_ENABLED !== "true") {
    console.log("[grants] engine disabled (set GRANTS_ENGINE_ENABLED=true to run)");
    return;
  }

  let gotLock = false;
  try {
    gotLock = await tryAcquireEngineLock();
  } catch (e) {
    console.error("[grants] could not check engine lock:", e instanceof Error ? e.message : e);
    return;
  }
  if (!gotLock) {
    console.log("[grants] another instance holds the engine lock — not crawling here");
    return;
  }

  console.log(
    `[grants] engine started — interval ${Math.round(INTERVAL_MS / 60000)}min, ` +
      `notify=${NOTIFY_ENABLED ? "LIVE" : "simulated"}, sampleData=${ALLOW_SAMPLE_DATA}`
  );

  // Delay the first crawl so boot/health checks are not competing with 60 fetches.
  engineTimer = setTimeout(async () => {
    await runOneCycle();
    scheduleNext(INTERVAL_MS);
  }, 15_000);
  engineTimer.unref?.();
}

export function stopGrantsEngine(): void {
  if (engineTimer) clearTimeout(engineTimer);
  engineTimer = null;
}

// Re-exported for the controller.
export {
  crawlCycle,
  recomputeMatches,
  runNotifications,
  ensureSampleStartups,
  deactivateExpiredPackages,
  isPackageExpired,
  ensureFilters,
  runDemo,
};
export { readStore, readStartups, saveStartups, readMatches, saveMatches, readNotifications, deleteStartup };
