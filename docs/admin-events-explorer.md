# Admin Events Explorer

The Events Explorer provides a structured operational event stream for platform staff at `/admin/events`.

## Access

- `SUPER_ADMIN` can inspect events across all tenants.
- `OPS_ADMIN` can inspect events under the current platform-wide operations policy.
- Tenant-scoped roles (`OWNER`, `BILLING_ADMIN`, `ADMIN`, `MEMBER`) cannot access `/admin/events` or `/api/admin/events`.
- Impersonation sessions are blocked from the API and page.

## Emitting events

Use `emitSystemEvent` from `lib/system-events.ts`.

```ts
await emitSystemEvent({
  tenantId,
  userId,
  actorId,
  eventType: "payment_failed",
  severity: "WARNING",
  source: "BILLING",
  entityType: "invoice",
  entityId: invoiceId,
  requestId,
  message: "Invoice payment failed.",
  metadata: {
    invoiceId,
    retryable: true,
  },
});
```

## Redaction

`emitSystemEvent` sanitizes metadata before persistence. The helper redacts sensitive keys such as:

- `token`
- `access_token`
- `refresh_token`
- `password`
- `secret`
- `api_key`
- `authorization`
- `cookie`
- `private_key`

High-entropy strings are also redacted. Do not pass raw webhook payloads or secrets into `metadata`.

## Query constraints

- Cursor pagination is required.
- Default range is the last 30 days.
- Maximum query window is 90 days.
- API limit defaults to `50` and is capped at `100`.
- The endpoint is rate-limited per admin user.

## Captured events

Current integrations emit structured events for:

- auth login success / failure
- subscription create / renew / failure
- payment attempt / success / failure / refund
- automation run start / success / failure
- inbox message sent / received
- support ticket created / replied
- webhook retry / failure
