import assert from "node:assert/strict";

import {
  getScheduledDowngradeTargets,
  isScheduledDowngradeTarget,
} from "../lib/subscription-downgrade-rules";

function run() {
  assert.equal(
    isScheduledDowngradeTarget("GROWTH", "PRO"),
    true,
    "lower tier should be considered a scheduled downgrade"
  );

  assert.equal(
    isScheduledDowngradeTarget("BUSINESS", "BUSINESS"),
    false,
    "same tier should not be accepted as a downgrade"
  );

  assert.equal(
    isScheduledDowngradeTarget("PRO", "BUSINESS"),
    false,
    "higher tiers should not be accepted as a downgrade"
  );

  assert.equal(
    isScheduledDowngradeTarget("ENTERPRISE", "BUSINESS"),
    true,
    "enterprise should be able to schedule down to business"
  );

  assert.deepEqual(
    getScheduledDowngradeTargets("GROWTH"),
    ["STARTER", "PRO"],
    "growth should only offer lower-tier scheduled downgrade targets"
  );

  assert.deepEqual(
    getScheduledDowngradeTargets("BUSINESS", "PRO"),
    ["STARTER", "GROWTH"],
    "pending downgrade target should be excluded from change options"
  );

  assert.deepEqual(
    getScheduledDowngradeTargets("PRO", "STARTER"),
    [],
    "no alternative downgrade target should remain when the only lower tier is already pending"
  );

  console.log("subscription downgrade rule checks passed");
}

run();
