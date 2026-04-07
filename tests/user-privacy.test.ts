import assert from "node:assert/strict";

import {
  buildErasedUserEmail,
  buildUserPrivacyExportFilename,
  buildUserPrivacyExportPayload,
} from "../lib/user-privacy";

const filename = buildUserPrivacyExportFilename({
  userId: "usr_123",
  email: "Owner@Example.com",
});
assert.equal(filename, "owner-example-com-usr_123-privacy-export.json");

assert.equal(
  buildErasedUserEmail("User_ABC"),
  "deleted+user_abc@maboria.invalid"
);

const payload = buildUserPrivacyExportPayload({
  exportedAt: "2026-04-07T10:00:00.000Z",
  user: { id: "usr_123", email: "owner@example.com" },
  memberships: [],
  businessProfile: null,
  subscriptions: [],
  merchantAccount: null,
  eInvoicingConnections: [
    {
      id: "ein_1",
      provider: "RO_EFACTURA",
      country: "RO",
      status: "ACTIVE",
      sandbox: false,
      credentialsEncrypted: "ciphertext",
      metadata: { environment: "prod" },
      lastValidatedAt: null,
      lastError: null,
      createdAt: new Date("2026-04-07T10:00:00.000Z"),
      updatedAt: new Date("2026-04-07T10:00:00.000Z"),
    },
  ],
  connectedMailboxes: [
    {
      id: "mbx_1",
      provider: "GOOGLE",
      status: "ACTIVE",
      emailAddress: "owner@example.com",
      displayName: "Owner",
      providerAccountId: "acct_1",
      metadata: { mode: "oauth" },
      createdAt: new Date("2026-04-07T10:00:00.000Z"),
      updatedAt: new Date("2026-04-07T10:00:00.000Z"),
    },
  ],
  workspaceSummary: { invoiceCount: 4 },
  activityLogs: [],
  auditLogs: [],
  userActivityLogs: [],
  supportTickets: [],
});

assert.equal(payload.eInvoicingConnections[0]?.hasCredentials, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(payload.eInvoicingConnections[0] || {}, "credentialsEncrypted"),
  false
);
assert.equal(payload.connectedMailboxes[0]?.emailAddress, "owner@example.com");

console.log("user privacy helpers passed");
