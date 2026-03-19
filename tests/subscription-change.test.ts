import assert from "node:assert/strict";

import {
  buildSubscriptionCheckoutQuote,
  isDowngradeChange,
} from "../lib/payments/subscription-change";

function run() {
  const now = new Date("2026-03-09T12:00:00.000Z");
  const currentPeriodStart = new Date("2026-03-01T12:00:00.000Z");
  const currentPeriodEnd = new Date("2026-03-31T12:00:00.000Z");

  const monthlyUpgrade = buildSubscriptionCheckoutQuote({
    currency: "USD",
    currentPlan: "STARTER",
    currentInterval: "monthly",
    currentPeriodStart,
    currentPeriodEnd,
    targetPlan: "PRO",
    targetInterval: "monthly",
    now,
  });

  assert.ok(monthlyUpgrade, "monthly upgrade quote should resolve");
  assert.equal(monthlyUpgrade?.action, "upgrade");
  assert.equal(monthlyUpgrade?.fullAmount, 59);
  assert.ok((monthlyUpgrade?.creditAmount || 0) > 0, "unused credit should be applied");
  assert.ok((monthlyUpgrade?.amountDue || 0) < 59, "upgrade should be prorated below full price");

  const yearlyUpgrade = buildSubscriptionCheckoutQuote({
    currency: "USD",
    currentPlan: "PRO",
    currentInterval: "monthly",
    currentPeriodStart,
    currentPeriodEnd,
    targetPlan: "PRO",
    targetInterval: "yearly",
    now,
  });

  assert.ok(yearlyUpgrade, "yearly upgrade quote should resolve");
  assert.equal(yearlyUpgrade?.action, "upgrade");
  assert.ok((yearlyUpgrade?.creditAmount || 0) > 0, "monthly-to-yearly change should apply credit");
  assert.ok((yearlyUpgrade?.amountDue || 0) < (yearlyUpgrade?.fullAmount || 0), "yearly upgrade should reduce charge by credit");

  assert.equal(
    isDowngradeChange({
      currentPlan: "GROWTH",
      targetPlan: "PRO",
      currentInterval: "monthly",
      targetInterval: "monthly",
    }),
    true,
    "lower plans should be treated as downgrades"
  );

  console.log("subscription change quote checks passed");
}

run();
