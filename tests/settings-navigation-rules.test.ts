import assert from "node:assert/strict";

import {
  getAccessibleSettingsTab,
  isSettingsTab,
  resolveRequestedSettingsTab,
} from "../lib/dashboard/settings-tabs";

function run() {
  assert.equal(isSettingsTab("profile"), true, "profile should be a valid settings tab");
  assert.equal(isSettingsTab("payout"), true, "payout should be a valid settings tab");
  assert.equal(isSettingsTab("unknown"), false, "unknown values should be rejected");
  assert.equal(isSettingsTab(null), false, "null should be rejected");

  assert.equal(
    getAccessibleSettingsTab("business", {
      canReadBusinessSettings: false,
      canReadPayoutSettings: false,
    }),
    "profile",
    "business tab should fall back to profile when business settings are unavailable"
  );

  assert.equal(
    getAccessibleSettingsTab("payout", {
      canReadBusinessSettings: true,
      canReadPayoutSettings: false,
    }),
    "profile",
    "payout tab should fall back to profile when payout settings are unavailable"
  );

  assert.equal(
    resolveRequestedSettingsTab("payout", {
      canReadBusinessSettings: true,
      canReadPayoutSettings: true,
    }),
    "payout",
    "valid accessible payout tab should be preserved"
  );

  assert.equal(
    resolveRequestedSettingsTab("payout", {
      canReadBusinessSettings: true,
      canReadPayoutSettings: false,
    }),
    "profile",
    "inaccessible payout tab should resolve to profile"
  );

  assert.equal(
    resolveRequestedSettingsTab("security", {
      canReadBusinessSettings: false,
      canReadPayoutSettings: false,
    }),
    "security",
    "security tab should remain accessible regardless of business permissions"
  );

  assert.equal(
    resolveRequestedSettingsTab("not-a-tab", {
      canReadBusinessSettings: true,
      canReadPayoutSettings: true,
    }),
    "profile",
    "invalid tab values should resolve to profile"
  );

  console.log("settings navigation rule checks passed");
}

run();
