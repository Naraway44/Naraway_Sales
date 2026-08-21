# Grants desk — resources

Standalone engine (`server/grants-desk.ts`). Not Sales OS / marketplace.

---

## Run locally

| Command | What |
|---------|------|
| `cd server && npm run grants-desk` | Dashboard + continuous crawl on `:4010` |
| `npx tsx grants-desk.ts --once` | One crawl cycle, then exit |
| `npx tsx grants-desk.ts --match` | Rematch + notify only (no crawl) |
| `npx tsx grants-desk.ts --demo` | Demo active vs expired filter |

**Team dashboard:** http://localhost:4010/  
Add startups · search list · open profile · notifications · applications (filing) · apply links for team

**Outputs**
- `active-gov-schemes.xlsx` — Active (year-round + open window) · Removed · Our Startups · Matches · Filing queue · Notifications  
- `schemes.json` · `startups.json` · `matches.json` · `notifications.json`

**HTTP**
- `GET /` dashboard · `GET /api/desk` · `POST /api/startups` · `GET /api/startups/:id`  
- `POST /api/match` · `POST /api/notify` · `POST /api/matches/:id/filing` · `POST /api/sync` · `GET /export.xlsx`

**Env (optional)**  
`GRANTS_DESK_PORT`, `GRANTS_CRAWL_INTERVAL_MS`, `SCHEME_SHEET_ID`, `SCHEME_SHEET_NAME`, `SCHEME_HTTP_USER_AGENT`

**Team Google Sheet (manual master, optional sync)**  
https://docs.google.com/spreadsheets/d/14qJbsYr9OVx72WfSrlUXnn8LWHqf0PRpmLDeffzgUzY/edit  
Must be *Anyone with the link → Viewer* for CSV pull.

---

## Two categorizations

### 1) Naraway service track
| Track | Meaning |
|-------|---------|
| **NOTIFICATION** | Alert client when a scheme matches / opens |
| **FULL_APPLICATION** | Draft, file, monitor application |
| **BOTH** | Either, per engagement |

### 2) Window type (Excel tabs)
| Type | Meaning | Examples |
|------|---------|----------|
| **ALL_YEAR** | Ongoing / rolling — apply anytime (or continuous bank/portal flow) | DPIIT recognition, MUDRA, Stand-Up India, CGTMSE, CGSS, AIM ecosystem, HP CM Startup |
| **OPEN_CLOSE** | Specific call / cohort / challenge window — always verify dates | SISFS, BIRAC BIG, NIDHI-PRAYAS, TIDE centre calls, iDEX, Elevate KA, TANSEED, RKVY-RAFTAAR, Kerala Idea Grant |

---

## Central / national portals (crawled)

| Resource | URL | Notes |
|----------|-----|--------|
| **myScheme** | https://www.myscheme.gov.in/ | 4000+ Central + State schemes |
| myScheme – Business | https://www.myscheme.gov.in/search/category/Business%20%26%20Entrepreneurship | |
| myScheme `startup` / `grant` search | https://www.myscheme.gov.in/search?q=startup | |
| **Startup India** | https://www.startupindia.gov.in/ | Recognition, benefits |
| **Startup India – Government Schemes** | https://www.startupindia.gov.in/content/sih/en/government-schemes.html | Official schemes hub |
| **ISTI – Startup funding** | https://www.indiascienceandtechnology.gov.in/funding-opportunities/startups | Science/tech funding |
| **ISTI – DST start schemes** | https://www.indiascienceandtechnology.gov.in/start-schemes-dst | NIDHI family |
| **SISFS** | https://seedfund.startupindia.gov.in/ | Seed grant + investment via incubators |
| SISFS – myScheme | https://www.myscheme.gov.in/schemes/sisfs | |
| SISFS – FITT IIT Delhi | https://fitt-iitd.in/web/sisfs | Incubator channel |
| **Stand-Up India** | https://www.standupmitra.in/ | SC/ST / women greenfield loans |
| **MUDRA (PMMY)** | https://www.mudra.org.in/ | Micro loans (ALL_YEAR) |
| **CGTMSE** | https://www.cgtmse.in/ | MSME credit guarantee |
| **BIRAC** / BIG | https://www.birac.nic.in/ · https://www.birac.nic.in/big.php | Biotech ignition grant |
| **NIDHI-PRAYAS** | https://nidhi-prayas.org/ · https://nidhi.dst.gov.in/schemes-programmes/nidhiprayas/ | Prototype grants (PC/APC) |
| **NIDHI hub** | https://nidhi.dst.gov.in/ | Umbrella NIDHI programmes |
| **NIDHI-EIR** | https://www.nidhi-eir.in/ | Entrepreneur-in-Residence |
| **TIDE 2.0** | https://msh.meity.gov.in/schemes/tide | MeitY ICT / deeptech incubators |
| **MeitY Startup Hub** | https://msh.meity.gov.in/ | |
| **AIM** | https://aim.gov.in/ | Atal Innovation Mission / AICs |
| **iDEX-DIO** | https://idex.gov.in/ | Defence / aerospace challenges |
| **RKVY-RAFTAAR** | https://rkvy.nic.in/ | Agribusiness |
| **DST** | https://dst.gov.in/ | Research / science |
| **MeitY** | https://www.meity.gov.in/ | IT / digital |
| **MSME** | https://www.msme.gov.in/ | May block bots |
| **Udyam** | https://udyamregistration.gov.in/ | MSME registration |

### Private directories (not government)
| Resource | URL | Notes |
|----------|-----|--------|
| **Startup Grants India** | https://www.startupgrantsindia.com/ | Independent directory. JS-heavy; always verify official gov link |
| Grants / Schemes filters | https://www.startupgrantsindia.com/type/grant · `/schemes` | |

---

## Flagship curated schemes (always seeded)

| Scheme | Window | Rough benefit | Official |
|--------|--------|---------------|----------|
| SISFS | OPEN_CLOSE | Up to ₹20L grant (+ investment limb) | seedfund.startupindia.gov.in |
| BIRAC BIG | OPEN_CLOSE | Up to ~₹50L | birac.nic.in |
| NIDHI-PRAYAS 2.0 | OPEN_CLOSE | ~₹20L PC / ~₹40L APC | nidhi-prayas.org |
| TIDE 2.0 | OPEN_CLOSE | EiR/grant/investment via centres | msh.meity.gov.in/schemes/tide |
| AIM / AICs | ALL_YEAR | Incubation ecosystem | aim.gov.in |
| iDEX-DIO | OPEN_CLOSE | Challenge grants | idex.gov.in |
| RKVY-RAFTAAR | OPEN_CLOSE | Agri incubation/seed | rkvy.nic.in |
| Stand-Up India | ALL_YEAR | ₹10L–₹1Cr bank loan | standupmitra.in |
| MUDRA | ALL_YEAR | Shishu/Kishor/Tarun loans | mudra.org.in |
| DPIIT Recognition | ALL_YEAR | Gateway benefits | startupindia.gov.in |
| CGTMSE | ALL_YEAR | Credit guarantee | cgtmse.in |
| CGSS | ALL_YEAR | Startup credit guarantee | Startup India |
| NIDHI-EIR | OPEN_CLOSE | Fellowship | nidhi-eir.in |
| **Karnataka ELEVATE** | OPEN_CLOSE | Up to ₹50L | elevate.startupkarnataka.in |
| **TANSEED (TN)** | OPEN_CLOSE | Up to ₹10–15L | startuptn.in / form.startuptn.in/tanseed |
| **Kerala Idea / Early Stage** | OPEN_CLOSE | ~₹3L–₹10L tiers | startupmission.kerala.gov.in |
| **HP CM Startup / HIMSUP** | ALL_YEAR | Sustenance + seed ~₹50L | emerginghimachal.hp.gov.in/startup |

---

## State startup / industry portals (in engine seed list)

| State | URL |
|-------|-----|
| Karnataka (Mission) | https://www.missionstartupkarnataka.org/ |
| Karnataka ELEVATE | https://elevate.startupkarnataka.in/ |
| Karnataka EITBT policy | https://eitbt.karnataka.gov.in/startup/public/policy/en |
| Tamil Nadu (StartupTN) | https://startuptn.in/ |
| TANSEED apply | https://form.startuptn.in/tanseed |
| Gujarat | https://startup.gujarat.gov.in/ |
| Uttar Pradesh (StartinUP) | https://startinup.up.gov.in/ · /funding/ |
| Telangana | https://startup.telangana.gov.in/ |
| Maharashtra (MSInS) | https://www.msins.in/ |
| Rajasthan (iStart) | https://istart.rajasthan.gov.in/ |
| Kerala (KSUM) | https://startupmission.kerala.gov.in/ · early-stage-funding |
| Odisha | https://startupodisha.gov.in/ |
| West Bengal | https://startupbengal.in/ |
| Madhya Pradesh | https://startup.mp.gov.in/ |
| Haryana | https://startupharyana.gov.in/ |
| Punjab | https://pbindustries.gov.in/startup/home |
| Bihar | https://startup.bihar.gov.in/ |
| **Himachal Pradesh** | https://emerginghimachal.hp.gov.in/startup |
| Goa | https://www.startup.goa.gov.in/ |
| Assam | https://startup.assam.gov.in/ |
| Andhra Pradesh | https://apis.ap.gov.in/ |
| Chhattisgarh | https://invest.cg.gov.in/startup |

Add more state URLs inside `SOURCES` in `grants-desk.ts`.

---

## Excel columns

Title · Category · Who it's for · Naraway service track · **Window type** · Level · State · Ministry/source · Summary · Eligibility · Benefits · Start date · End date · Status note · Apply / website URL · Source URL · Discovered from · Updated at

**Active** = not expired. Split also into **All year** vs **Open-Close**. Expired → **Removed**.

---

## Roadmap

1. Local continuous Excel ← current  
2. DB persistence  
3. Email for NOTIFICATION clients  
4. Dashboard for FULL_APPLICATION (validity, filings, status)  

---

## Dev notes

- Engine is **polite crawl** (gap between requests); some sites return 403 — logged, skipped.  
- Not a full mirror of all 4000+ myScheme PDFs — grows each cycle via portal links + curated flagship.  
- Always re-check official URL + dates before client outreach.
