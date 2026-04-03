import assert from "node:assert/strict";
import {
  buildAutomationRelationsFromSteps,
  buildDashboardStepsFromRelations,
  isSupportedDashboardActionId,
  isSupportedDashboardStartId,
} from "../lib/automation/dashboard-definition";

assert.equal(isSupportedDashboardStartId("invoice_paid"), true);
assert.equal(isSupportedDashboardStartId("customer_created"), false);
assert.equal(isSupportedDashboardActionId("send_payment_reminder"), true);
assert.equal(isSupportedDashboardActionId("update_status"), false);

const serialized = buildAutomationRelationsFromSteps([
  {
    type: "generateInvoice",
    config: { startId: "payment_failed", delayValue: 6, delayUnit: "hours" },
  },
  {
    type: "sendWhatsApp",
    config: { actionId: "send_failed_payment_message", note: "Retry your payment" },
  },
]);

assert.deepEqual(serialized.triggers, [
  {
    type: "invoice_status",
    config: { statuses: ["FAILED"], delayValue: 6, delayUnit: "hours" },
  },
]);
assert.equal(serialized.actions.length, 1);
assert.equal(serialized.actions[0]?.type, "sendWhatsApp");
assert.equal(serialized.actions[0]?.order, 1);

const normalizedAiSteps = buildDashboardStepsFromRelations(
  {
    steps: [
      {
        type: "generateInvoice",
        config: { startId: "invoice_paid", delayValue: 2, delayUnit: "hours" },
      },
    ],
    triggers: [{ type: "invoice_status", config: { statuses: ["PAID"] } }],
    actions: [{ type: "send_payment_reminder", config: { note: "Follow up" }, order: 1 }],
  },
  { strict: true }
);

assert.deepEqual(normalizedAiSteps, [
  {
    type: "generateInvoice",
    config: { startId: "invoice_paid", delayValue: 2, delayUnit: "hours" },
  },
  {
    type: "sendWhatsApp",
    config: { note: "Follow up", actionId: "send_payment_reminder" },
  },
]);

assert.throws(
  () =>
    buildAutomationRelationsFromSteps([
      {
        type: "generateInvoice",
        config: { startId: "customer_created" },
      },
    ]),
  /not wired into live automation events/i
);

assert.throws(
  () =>
    buildDashboardStepsFromRelations(
      {
        triggers: [{ type: "customer_created", config: {} }],
        actions: [{ type: "sendEmail", config: {}, order: 1 }],
      },
      { strict: true }
    ),
  /not supported by the live dashboard automation builder/i
);

console.log("ok automation dashboard definition rules passed");
