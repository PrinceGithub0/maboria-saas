# Privacy Rights Runbook

## Scope
- Self-service account export: `GET /api/user/privacy/export`
- Self-service account erasure: `POST /api/user/privacy/delete`
- Customer export: `GET /api/customers/:id/export`
- Customer controls: `PATCH /api/customers/:id` with opt-out, processing restriction, and erase actions

## What self-service account export includes
- User profile and account settings
- Organization memberships and current organization context
- Business profile attached to the user
- Subscription and payout configuration
- E-invoicing connection summaries
- Connected mailbox summaries
- Activity, audit, and user activity history
- Workspace summary counts

## What self-service account erasure does
- Redacts active user identity fields
- Disables sign-in
- Revokes connected mailbox credentials
- Revokes e-invoicing credentials
- Clears active auth/session artifacts
- Marks business memberships inactive for the erased user

## What self-service account erasure does not remove
- Invoice, payment, tax, security, and audit records that must be retained
- Historical records needed for dispute handling, fraud review, or legal compliance
- Organization data owned by other users or businesses

## Operator checklist
1. Confirm whether the request is account-level or customer-level.
2. Use the in-product self-service flow first when available.
3. If manual intervention is required, capture request time, actor, and affected record ids.
4. Verify export delivery completed or account erasure completed.
5. Confirm retained records are limited to required invoice, payment, tax, security, and audit data.
6. Log any exception path in audit records and support notes.
