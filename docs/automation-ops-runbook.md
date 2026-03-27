# Automation Ops Runbook

## Scheduled jobs
- `/api/automation/process-due` every 2 minutes
- `/api/admin/automation/health` every 5 minutes
- `/api/whatsapp/auto-close` every 15 minutes
- `/api/subscription/process-renewals` at minute 9, 24, 39, and 54 every hour
- `/api/automation/retention` daily at 02:17
- `/api/automation/audit-verify` daily at 02:47
- `/api/subscription/apply-pending-downgrades` daily at 03:07

These routes accept cron authorization through:
- `Authorization: Bearer <CRON_SECRET>`
- `x-cron-secret: <CRON_SECRET>`

## Pre-release stress drill
Run:

```bash
npm run test:automation:drill
```

Optional env:
- `BASE_URL` (default `http://localhost:3000`)
- `CRON_SECRET`
- `AUTOMATION_BURST_COUNT` (default `40`)
- `AUTOMATION_BURST_CONCURRENCY` (default `8`)
- `AUTOMATION_WEBHOOK_PATH` (default `/stress/automation`)

## Manual diagnostics
- Due-run processing summary:
  - `POST /api/automation/process-due`
- Due subscription renewals:
  - `POST /api/subscription/process-renewals`
- Health snapshot:
  - `GET /api/admin/automation/health`
- Emit health alerts:
  - `POST /api/admin/automation/health`
- Operational queue overview:
  - `GET /api/admin/automation/operations`
- Verify audit-chain integrity:
  - `GET /api/automation/audit-verify?limit=5000`
- Run retention dry-run:
  - `POST /api/automation/retention` with `{ "dryRun": true }`

## Incident checklist
1. Check `/api/admin/automation/health` for failure rate and backlog.
2. Check `/api/admin/automation/operations` for stale RUNNING and due PENDING.
3. Run `/api/automation/process-due` with elevated `limit` during backlog.
4. Inspect provider failures (`AUTOMATION_PROVIDER_RETRY_EXHAUSTED`).
5. Verify audit chain on affected flows via `/api/admin/automation/audit`.
6. Archive old logs only after incident closes (`/api/admin/automation/retention`).
7. If billing lockouts appear after cycle end, run `/api/subscription/process-renewals` and inspect pending Flutterwave renewals.
