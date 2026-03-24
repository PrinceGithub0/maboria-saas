import assert from "node:assert/strict";
import {
  buildScheduledAutomationRunOutput,
  parseScheduledAutomationRunAt,
} from "../lib/automation/scheduled-run";

const parsed = parseScheduledAutomationRunAt("2026-03-25T08:30:00.000Z");
assert.ok(parsed instanceof Date, "valid schedule timestamps should parse");
assert.equal(parsed?.toISOString(), "2026-03-25T08:30:00.000Z");

assert.equal(
  parseScheduledAutomationRunAt("not-a-date"),
  null,
  "invalid schedule timestamps should be rejected"
);

const output = buildScheduledAutomationRunOutput(new Date("2026-03-25T08:30:00.000Z"), {
  invoiceId: "inv_123",
});

assert.equal(output.trigger, "Schedule");
assert.equal(output.source, "Scheduler");
assert.equal(output.input.invoiceId, "inv_123");
assert.equal(output.input.scheduledFor, "2026-03-25T08:30:00.000Z");
assert.equal(output.resumeState.lastCompletedStepIndex, -1);
assert.equal(output.resumeState.nextStepIndex, 0);
assert.equal(output.resumeState.nextRunAt, "2026-03-25T08:30:00.000Z");

console.log("ok automation scheduled run rules passed");
