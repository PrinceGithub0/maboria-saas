import assert from "node:assert/strict";

import {
  resolveSubscriptionDisplayRenewalDate,
  resolveSubscriptionDisplayStatus,
  resolveSubscriptionManagementProvider,
} from "../lib/subscription-display";

function run() {
  const paidThroughAt = new Date("2026-04-23T10:00:00.000Z");
  const currentCycleEndAt = new Date("2026-03-23T10:00:00.000Z");

  assert.equal(
    resolveSubscriptionDisplayRenewalDate({
      paidThroughAt,
      currentCycleEndAt,
    })?.toISOString(),
    paidThroughAt.toISOString()
  );

  assert.equal(
    resolveSubscriptionDisplayStatus("ACTIVE", new Date("2026-03-23T10:00:00.000Z"), new Date("2026-03-24T10:00:00.000Z")),
    "PAST_DUE"
  );

  assert.equal(
    resolveSubscriptionDisplayStatus("TRIALING", new Date("2026-03-24T12:00:00.000Z"), new Date("2026-03-24T10:00:00.000Z")),
    "TRIALING"
  );

  assert.equal(
    resolveSubscriptionManagementProvider({
      provider: null,
      lastPaymentProvider: "flutterwave",
      orgProvider: null,
    }),
    "FLUTTERWAVE"
  );

  console.log("subscription display checks passed");
}

run();
