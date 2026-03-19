const { getReplyAssignmentDecision } = require("../lib/support/reply-assignment");

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`FAIL: ${message} (expected ${expected}, got ${actual})`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function run() {
  assertEqual(
    getReplyAssignmentDecision({ assignedAdminId: null, currentAdminId: "admin-1" }),
    "assign_and_send",
    "reply to unassigned ticket auto-assigns"
  );

  assertEqual(
    getReplyAssignmentDecision({ assignedAdminId: "admin-2", currentAdminId: "admin-1" }),
    "confirm_takeover",
    "reply to another admin ticket requires takeover confirmation"
  );

  assertEqual(
    getReplyAssignmentDecision({ assignedAdminId: "admin-1", currentAdminId: "admin-1" }),
    "send_direct",
    "reply to own assigned ticket sends directly"
  );

  assertEqual(
    getReplyAssignmentDecision({ assignedAdminId: "admin-2", currentAdminId: "" }),
    "invalid",
    "missing actor context is rejected"
  );

  console.log("All support auto-assign decision checks passed.");
}

run();

