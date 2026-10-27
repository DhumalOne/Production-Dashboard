# Dhumal Management Dashboard

A mobile-first management dashboard for Dhumal Industries. It reads SAP Business One **read-only** and replaces the "Dhumal Management Dashboard V9" Excel workbook. The requirements are in [Dhumal Management Dashboard — PRD.md](Dhumal%20Management%20Dashboard%20—%20PRD.md).

```
agent/       Python sync agent (office PC): SAP Service Layer → cloud ingest, every 15 min, read-only by code
supabase/    Database: migrations (raw → core → rpt reporting views), auth config, email template
apps/web/    Next.js 16 PWA: Home, Sales, Money, Stock, Purchase, Quotations, Production, Settings
docs/        KPI definitions (Accounts sign-off), roadmap (V9 sheet → screen), open questions
```

## How data flows
1. The **agent** reads SAP through the Service Layer. Only GET requests can leave the machine (`agent/dhumal_sync/sl.py`). It posts gzipped batches to `apps/web/app/api/ingest`.
2. **`raw.ingest()`** stores each record as JSON. Triggers keep the typed `core.*` tables in step.
3. The **`rpt.*` views** and `rpt.kpi_daily` are the only things the web app (role `dash_web`) and, later, the AI box can read.

## Local development
Full setup steps are in `agent/README.md`; the short version:
```powershell
npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor   # ports 554xx
cd apps/web; powershell -File scripts/setup-local.ps1 -AllowedEmail you@example.com; npm run dev -- -p 3100
cd agent; .venv\Scripts\python -m dhumal_sync --once --db postgresql://postgres:postgres@127.0.0.1:55422/postgres
```
Sign-in codes arrive in the local mail catcher at http://127.0.0.1:55424.

## Checks
| Command | Covers |
|---|---|
| `cd agent; .venv\Scripts\python -m pytest tests -q` | Read-only guard, sync planning, payment totals, cross-join lines |
| `cd agent; .venv\Scripts\python -m discovery.check_registry` | Every synced field is valid against live SAP |
| `cd apps/web; npm test; npm run typecheck; npx eslint .` | Formatting, Indian FY periods, types, lint |
| `cd apps/web; node --env-file=.env.local scripts/dev-smoke.mjs` | End to end: OTP sign-in, every page renders data, sign-out everywhere |
