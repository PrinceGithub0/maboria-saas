import assert from "node:assert/strict";
import {
  ACTIVE_UNIFIED_CONVERSATION_STATUSES,
  buildInboundConversationUpdate,
  buildManualConversationUpdate,
  buildOutboundConversationUpdate,
  getEffectiveUnifiedConversationStatus,
  isUnifiedConversationStatus,
} from "../lib/inbox/conversation-state";

(() => {
  assert.equal(isUnifiedConversationStatus("OPEN"), true, "open should be valid");
  assert.equal(isUnifiedConversationStatus("WAITING_ON_CUSTOMER"), true, "waiting should be valid");
  assert.equal(isUnifiedConversationStatus("SNOOZED"), true, "snoozed should be valid");
  assert.equal(isUnifiedConversationStatus("RESOLVED"), true, "resolved should be valid");
  assert.equal(isUnifiedConversationStatus("PENDING"), false, "legacy pending should not be valid anymore");
  assert.equal(isUnifiedConversationStatus("CLOSED"), false, "legacy closed should not be valid anymore");

  assert.deepEqual(
    ACTIVE_UNIFIED_CONVERSATION_STATUSES,
    ["OPEN", "WAITING_ON_CUSTOMER", "SNOOZED"],
    "active inbox views should keep resolved out of open-work counts"
  );

  const at = new Date("2026-03-24T10:00:00.000Z");
  const inbound = buildInboundConversationUpdate(at);
  assert.equal(inbound.status, "OPEN", "inbound should move conversation back to open");
  assert.equal(inbound.waitingSince, null, "inbound should clear waiting");
  assert.equal(inbound.snoozedUntil, null, "inbound should clear snooze");
  assert.equal(inbound.resolvedAt, null, "inbound should reopen resolved conversations");
  assert.equal((inbound.lastInboundAt as Date).toISOString(), at.toISOString(), "inbound timestamp should be tracked");

  const outbound = buildOutboundConversationUpdate(at);
  assert.equal(outbound.status, "WAITING_ON_CUSTOMER", "outbound should move conversation to waiting");
  assert.equal((outbound.waitingSince as Date).toISOString(), at.toISOString(), "waiting since should anchor to outbound reply");
  assert.equal((outbound.lastOutboundAt as Date).toISOString(), at.toISOString(), "outbound timestamp should be tracked");

  const snoozedUntil = new Date("2026-03-25T10:00:00.000Z");
  const snoozed = buildManualConversationUpdate({
    nextStatus: "SNOOZED",
    at,
    snoozedUntil,
  });
  assert.equal(snoozed.status, "SNOOZED", "manual snooze should set snoozed state");
  assert.equal((snoozed.snoozedUntil as Date).toISOString(), snoozedUntil.toISOString(), "manual snooze should keep requested time");

  const resolved = buildManualConversationUpdate({
    nextStatus: "RESOLVED",
    at,
  });
  assert.equal(resolved.status, "RESOLVED", "manual resolve should set resolved state");
  assert.equal((resolved.resolvedAt as Date).toISOString(), at.toISOString(), "manual resolve should stamp resolution time");

  assert.equal(
    getEffectiveUnifiedConversationStatus({
      status: "SNOOZED",
      snoozedUntil: "2026-03-24T09:00:00.000Z",
      now: at,
    }),
    "OPEN",
    "expired snooze should behave like open work"
  );
  assert.equal(
    getEffectiveUnifiedConversationStatus({
      status: "SNOOZED",
      snoozedUntil: "2026-03-24T12:00:00.000Z",
      now: at,
    }),
    "SNOOZED",
    "future snooze should remain snoozed"
  );
})();

console.log("Inbox conversation state checks passed.");
