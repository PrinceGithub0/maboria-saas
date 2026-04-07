const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  addCalendarMonthUtcKeepingTime,
  computeCurrentUsageCycle,
  computeUsageCycleKey,
} = require("../lib/usage/cycle");
const { isUnlimitedPlan, getReportPlanLimits } = require("../lib/usage/plan-limits");

async function testCycleMonthClamping() {
  const anchor = new Date("2026-01-31T09:45:12.000Z");
  const next = addCalendarMonthUtcKeepingTime(anchor, 1);
  assert.equal(next.toISOString(), "2026-02-28T09:45:12.000Z");
}

async function testMonthlyCycleForYearlyBilling() {
  const activation = new Date("2026-01-15T10:30:00.000Z");
  const now = new Date("2026-03-16T01:00:00.000Z");
  const cycle = computeCurrentUsageCycle({ activationTimestamp: activation, now });
  assert.equal(cycle.startAt.toISOString(), "2026-03-15T10:30:00.000Z");
  assert.equal(cycle.endAt.toISOString(), "2026-04-15T10:30:00.000Z");
  assert.equal(cycle.key, computeUsageCycleKey(cycle.startAt, cycle.endAt));
}

async function testEnterpriseUnlimitedFlags() {
  const limits = getReportPlanLimits("ENTERPRISE");
  assert.equal(isUnlimitedPlan("ENTERPRISE"), true);
  assert.equal(limits.ai_requests, null);
  assert.equal(limits.invoices, null);
  assert.equal(limits.automations_runs, null);
  assert.equal(limits.workspace_connections, null);
  assert.equal(limits.team_members_seats, null);
}

async function testIdempotencyKeyDeterminism() {
  const actionId = randomUUID().slice(0, 8);
  const idempotencyA = `invoice:${actionId}`;
  const idempotencyB = `invoice:${actionId}`;
  const idempotencyC = `invoice:${actionId}-retry`;

  assert.equal(idempotencyA, idempotencyB);
  assert.notEqual(idempotencyA, idempotencyC);
}

async function run() {
  await testCycleMonthClamping();
  await testMonthlyCycleForYearlyBilling();
  await testEnterpriseUnlimitedFlags();
  await testIdempotencyKeyDeterminism();
  console.log("Usage report tests passed.");
}

run().catch((error) => {
  console.error("Usage report tests failed.", error);
  process.exit(1);
});
