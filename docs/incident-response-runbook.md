# Incident Response Runbook

## Severity
- `SEV-1`: confirmed unauthorized access, active credential exposure, or material cross-tenant data exposure
- `SEV-2`: contained security issue or high-risk provider/integration failure with possible customer impact
- `SEV-3`: isolated issue with low blast radius and no confirmed data exposure

## First 60 minutes
1. Assign incident commander and capture the start time.
2. Identify the affected tenant, users, providers, and time window.
3. Revoke exposed credentials first.
4. Disable affected mailbox, e-invoicing, webhook, or automation paths.
5. Preserve logs, audit records, and provider identifiers before cleanup.
6. Record every containment action with timestamp and actor.

## Containment actions
- Disable impacted user access or organization access where required.
- Rotate mailbox, e-invoicing, webhook, and payment-provider credentials.
- Pause affected automations and retry jobs only after scope is understood.
- Preserve invoice, payment, and support evidence tied to the incident.

## Breach assessment
- Confirm whether personal data was accessed, altered, or disclosed.
- Identify categories of data and the affected user/customer count.
- Determine whether notification obligations are triggered.
- Preserve the basis for the decision in the incident record.

## Notification workflow
1. Legal/compliance owner decides whether notification is required.
2. Prepare a fact-based customer notice with affected scope, timing, and mitigation steps.
3. Send regulator and customer notifications within the required legal deadline for the relevant jurisdiction.
4. Record send time, message version, and approval owner.

## Closeout
- Document root cause and timeline.
- Record corrective actions, owners, and due dates.
- Update tests, runbooks, and controls that would have prevented recurrence.
