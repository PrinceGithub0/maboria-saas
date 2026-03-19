const assert = require("node:assert/strict");

const {
  canActorChangeTargetRole,
  canAssignBillingAdmin,
  canManageSubscription,
  hasOrgPermission,
  normalizeOrgRole,
} = require("../lib/org-permissions");

function run() {
  assert.equal(canAssignBillingAdmin("owner"), true, "Owner should be able to assign billing admin");
  assert.equal(canAssignBillingAdmin("admin"), false, "Admin should not be able to assign billing admin");
  assert.equal(canAssignBillingAdmin("billing_admin"), false, "Billing admin should not assign billing admin");
  assert.equal(canAssignBillingAdmin("member"), false, "Member should not assign billing admin");

  assert.equal(canManageSubscription("owner"), true, "Owner should manage subscription");
  assert.equal(canManageSubscription("billing_admin"), true, "Billing admin should manage subscription");
  assert.equal(canManageSubscription("admin"), false, "Admin should not manage subscription");
  assert.equal(canManageSubscription("member"), false, "Member should not manage subscription");

  assert.equal(hasOrgPermission("billing_admin", "subscription:manage"), true);
  assert.equal(hasOrgPermission("billing_admin", "team:invite"), false);
  assert.equal(hasOrgPermission("billing_admin", "team:remove_member"), false);
  assert.equal(hasOrgPermission("billing_admin", "team:promote_member"), false);
  assert.equal(hasOrgPermission("billing_admin", "team:demote_admin"), false);

  assert.equal(canActorChangeTargetRole("owner", "member", "owner"), false, "Owner transfer must stay blocked");
  assert.equal(canActorChangeTargetRole("owner", "admin", "owner"), false, "Owner transfer must stay blocked");

  assert.equal(normalizeOrgRole("BILLING_ADMIN"), "billing_admin");
  assert.equal(normalizeOrgRole("billing_admin"), "billing_admin");

  console.log("Billing admin role gate checks passed.");
}

run();
