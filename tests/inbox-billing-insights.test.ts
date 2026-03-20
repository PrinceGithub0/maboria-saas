import assert from "node:assert/strict";
const { canViewUnifiedInboxBillingInsights } = require("../lib/inbox/unified");

(() => {
  assert.equal(
    canViewUnifiedInboxBillingInsights({
      billingAccessOk: true,
      billingBusinessId: "org_123",
      orgId: "org_123",
    }),
    true,
    "matching billing and inbox org should allow billing insights"
  );

  assert.equal(
    canViewUnifiedInboxBillingInsights({
      billingAccessOk: false,
      billingBusinessId: "org_123",
      orgId: "org_123",
    }),
    false,
    "failed billing access should hide billing insights"
  );

  assert.equal(
    canViewUnifiedInboxBillingInsights({
      billingAccessOk: true,
      billingBusinessId: "org_owner_a",
      orgId: "org_owner_b",
    }),
    false,
    "mismatched workspace scope should hide billing insights"
  );
})();

console.log("Inbox billing insight gate checks passed.");
