# Maboria Unified Inbox

This document describes the first-party unified inbox module built in the Maboria codebase.

## Scope implemented in this iteration

- Milestone 1 baseline:
  - Multi-tenant inbox core schema (`inboxes`, `conversations`, `messages`, `notes`, `tags`, `conversation_tags`, `audit_events`, `usage_counters`).
  - Conversation + thread CRUD APIs under `/api/inbox/unified/*`.
  - Assignment, status, tags, internal notes.
  - Usage counter atomic increments for outbound messages.
  - Encrypted credential persistence path for inbox settings updates.
- New `/dashboard/inbox` shell UI using the unified APIs.
- Realtime baseline via polling + update endpoint (`/api/inbox/unified/updates`).
- Milestone 4 cutover:
  - Legacy `/api/whatsapp/*` routes and `/api/webhooks/whatsapp` now return `410 LEGACY_INBOX_DISABLED`.
  - Inbox UI calls unified endpoints for analytics and saved replies.
  - Legacy WhatsApp migration script added (`scripts/migrate-legacy-whatsapp-inbox.mjs`).
- Support threading cutover:
  - Admin support center is served from `/admin/support`.
  - Legacy support inbound route has been retired.
  - Support email replies are ingested through `POST /api/inbox/unified/webhooks/email` using `INBOX_INBOUND_TOKEN`.

## API surface

- `GET /api/inbox/unified/conversations`
- `POST /api/inbox/unified/conversations`
- `GET /api/inbox/unified/conversations/:id`
- `PATCH /api/inbox/unified/conversations/:id`
- `GET /api/inbox/unified/conversations/:id/messages`
- `POST /api/inbox/unified/conversations/:id/messages`
- `GET /api/inbox/unified/conversations/:id/notes`
- `POST /api/inbox/unified/conversations/:id/notes`
- `GET /api/inbox/unified/inboxes`
- `PUT /api/inbox/unified/inboxes`
- `POST /api/inbox/unified/inboxes/test`
- `GET /api/inbox/unified/agents`
- `GET /api/inbox/unified/updates?since=<iso-timestamp>`
- `GET /api/inbox/unified/analytics`
- `GET|POST /api/inbox/unified/canned-replies`
- `DELETE /api/inbox/unified/canned-replies/:id`
- `POST /api/inbox/unified/webhooks/email`
- `GET|POST /api/inbox/unified/webhooks/whatsapp`

## Per-tenant channel setup flow

1. Fetch inboxes for tenant:
   - `GET /api/inbox/unified/inboxes`
2. Update tenant email inbox credentials:
   - `PUT /api/inbox/unified/inboxes`
   - payload:
     - `id`
     - `credentials.email.host`
     - `credentials.email.port`
     - `credentials.email.secure`
     - `credentials.email.username`
     - `credentials.email.password`
     - `credentials.email.from`
3. Update tenant WhatsApp inbox credentials:
   - `PUT /api/inbox/unified/inboxes`
   - payload:
     - `id`
     - `credentials.whatsapp.accessToken`
     - `credentials.whatsapp.phoneNumberId`
     - `credentials.whatsapp.apiVersion`
     - `credentials.whatsapp.appSecret`
     - `credentials.whatsapp.verifyToken` (optional)
4. Run channel health checks:
   - `POST /api/inbox/unified/inboxes/test`

## Security model

- All routes require authenticated session.
- Tenant resolution uses centralized org permission checks in `lib/org-auth.ts`.
- All read/write operations are scoped to `tenantId`.
- Channel credentials are encrypted at rest using `encryptSecret` before storage.
- Channel credentials are encrypted at rest using `INBOX_ENCRYPTION_KEY` and stored in `inboxes.credentialsEncrypted`.
- Audit trail records status/assignment/tag/note/message events.

## Rollout plan

1. Apply migration:
   - `npx prisma migrate deploy`
   - `npx prisma generate`
2. Enable unified inbox route for internal users.
3. Run smoke tests for tenant isolation and assignment flows.
4. Implement channel adapters (Milestone 2 and 3).
5. Migrate legacy WhatsApp data and disable old routes (Milestone 4).

## Environment variables

Required (existing in app):
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `INBOX_ENCRYPTION_KEY`
- `INBOX_INBOUND_TOKEN`
- `WEBHOOK_RATE_LIMIT` (optional, defaults to `180` email / `240` WhatsApp per minute)

Platform email defaults (optional, for Maboria transactional emails only):
- `PLATFORM_EMAIL_HOST`
- `PLATFORM_EMAIL_PORT`
- `PLATFORM_EMAIL_SECURE`
- `PLATFORM_EMAIL_USER`
- `PLATFORM_EMAIL_PASSWORD`
- `PLATFORM_EMAIL_FROM`

Tenant channel credentials (SMTP + WhatsApp) are configured per inbox and encrypted in database.
Global SMTP/WhatsApp provider credentials are no longer used by Unified Inbox send paths.

Inbound webhook security:
- `INBOX_INBOUND_TOKEN` is required for inbound webhook auth.

## Milestone 2 (email / SES)

- Add outbound adapter with provider message ID persistence.
- Add SES inbound parser pipeline (SES -> S3/SNS -> webhook).
- Implement threading via `Message-ID`, `In-Reply-To`, `References`.
- Persist attachments metadata and link to unified messages.
- Current webhook target for Lambda: `POST /api/inbox/unified/webhooks/email`.
- Required header from Lambda: `x-inbox-inbound-token: <INBOX_INBOUND_TOKEN>`.

## Milestone 3 (WhatsApp Cloud API)

- Per-tenant credential onboarding + signature validation.
- Tenant routing using `phone_number_id`.
- Delivery/read webhook updates mapped to `deliveryStatus`.
- Quota checks before outbound send.
- Webhook endpoint:
  - Verification: `GET /api/inbox/unified/webhooks/whatsapp`
  - Events: `POST /api/inbox/unified/webhooks/whatsapp`

## Milestone 4 (legacy removal)

- Archive/migrate legacy WhatsApp `Conversation` and `Message`.
- Disable old WhatsApp inbox endpoints.
- Remove old inbox UI components and references.
- Keep historical audit trail accessible.

### Migration command

1. Dry run:
   - `npm run inbox:migrate-legacy`
2. Execute migration:
   - `npm run inbox:migrate-legacy -- --execute`
3. Optional custom batch size:
   - `npm run inbox:migrate-legacy -- --execute --batch=200`

### Credential migration plan (legacy encrypted channel configs)

1. Set `INBOX_ENCRYPTION_KEY` in all environments.
2. Existing `credentialsEncrypted` values using older app crypto remain readable (fallback decrypt path).
3. Re-key existing credentials in bulk (recommended):
   - Dry run: `npm run inbox:rekey-credentials`
   - Execute: `npm run inbox:rekey-credentials -- --execute`
4. Alternatively, re-save each inbox config once from Settings/API to re-encrypt with `enc:inbox:v1:`.
5. After all inboxes are re-keyed, you may rotate `NEXTAUTH_SECRET` independently from inbox credentials.

### Suggested migration script strategy

1. Copy legacy `Conversation` rows into `conversations` with mapped inbox/contact.
2. Copy legacy `Message` rows into `messages` with `channel=WHATSAPP`.
3. Preserve legacy IDs in `attachments` or `metadata` field to keep traceability.
4. Verify counts per tenant before cutover.
5. Disable:
   - `/api/whatsapp/*`
   - `/api/webhooks/whatsapp`

## Security checklist

- [ ] Webhook signature validation for every inbound provider call.
- [ ] Idempotency keys enforced for provider `externalId` writes.
- [ ] Rate limiting on webhook endpoints.
- [ ] Dead-letter logging for unrecoverable channel failures.
- [ ] Alerting for repeated webhook failures.
