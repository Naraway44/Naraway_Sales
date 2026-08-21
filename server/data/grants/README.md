# Grants discovery engine (standalone)

**Not Sales OS.** One file: `server/grants-desk.ts`

## Run continuously
```bash
cd server
npx tsx grants-desk.ts
# optional HTTP: npx tsx grants-desk.ts --serve
```

Crawls myScheme, Startup India, SISFS, Stand-Up India, MSME, DST/BIRAC/MeitY, **state startup portals**, merges Google Sheet if public, **drops expired/worn-out**, rewrites:

- `active-gov-schemes.xlsx` → tab **Active Schemes** (valid only) + **Removed (expired)**
- `schemes.json`

Every row keeps **Apply / Source website URL**.

## One-shot / demo
```bash
npx tsx grants-desk.ts --once
npx tsx grants-desk.ts --demo
```

## Next (after Excel looks good)
DB sync → email for NOTIFICATION clients → dashboard for FULL_APPLICATION tracking.
