const assert = require("node:assert/strict");
const {
  evaluateWorkspaceGate,
  isPlatformRole,
  shouldRunWorkspaceChecks,
} = require("../lib/global-role");

function run() {
  assert.equal(isPlatformRole("SUPER_ADMIN"), true, "SUPER_ADMIN should be platform role");
  assert.equal(isPlatformRole("OPS_ADMIN"), true, "OPS_ADMIN should be platform role");
  assert.equal(isPlatformRole("ADMIN"), false, "legacy ADMIN should not be treated as platform role");
  assert.equal(isPlatformRole("USER"), false, "USER should not be platform role");

  assert.equal(shouldRunWorkspaceChecks("SUPER_ADMIN"), false, "SUPER_ADMIN should bypass workspace checks");
  assert.equal(shouldRunWorkspaceChecks("OPS_ADMIN"), false, "OPS_ADMIN should bypass workspace checks");
  assert.equal(shouldRunWorkspaceChecks("ADMIN"), true, "legacy ADMIN should run workspace checks");
  assert.equal(shouldRunWorkspaceChecks("USER"), true, "USER should run workspace checks");

  assert.equal(
    evaluateWorkspaceGate({
      globalRole: "SUPER_ADMIN",
      hasTenantContext: false,
      orgAccessStatus: "SUSPENDED",
      subscriptionStatus: "PAST_DUE",
    }),
    "bypass",
    "SUPER_ADMIN must bypass tenant/subscription gate",
  );

  assert.equal(
    evaluateWorkspaceGate({
      globalRole: "OPS_ADMIN",
      hasTenantContext: false,
      orgAccessStatus: "SUSPENDED",
      subscriptionStatus: "PAST_DUE",
    }),
    "bypass",
    "OPS_ADMIN must bypass tenant/subscription gate",
  );

  assert.equal(
    evaluateWorkspaceGate({
      globalRole: "USER",
      hasTenantContext: false,
      orgAccessStatus: null,
      subscriptionStatus: null,
    }),
    "onboarding",
    "USER without tenant should go to onboarding",
  );

  assert.equal(
    evaluateWorkspaceGate({
      globalRole: "USER",
      hasTenantContext: true,
      orgAccessStatus: "ACTIVE",
      subscriptionStatus: "PAST_DUE",
    }),
    "locked",
    "USER with inactive subscription should be locked",
  );

  assert.equal(
    evaluateWorkspaceGate({
      globalRole: "USER",
      hasTenantContext: true,
      orgAccessStatus: "ACTIVE",
      subscriptionStatus: "ACTIVE",
    }),
    "allow",
    "USER with active subscription should be allowed",
  );

  console.log("Global role gating order checks passed.");
}

run();
