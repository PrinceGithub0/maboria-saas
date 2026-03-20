import assert from "node:assert/strict";
const {
  buildSubscriberSupportTicketWhereInput,
  getSubscriberSupportOpenMode,
} = require("../lib/support/subscriber-rules");

(() => {
  const cursorDate = new Date("2026-03-09T09:30:00.000Z");
  const where = buildSubscriberSupportTicketWhereInput({
    subscriberId: "sub_123",
    workspaceId: "org_456",
    cursor: { lastActivityAt: cursorDate, id: "ticket_123" },
    newestFirst: true,
    status: "closed",
    search: "invoice",
  });

  assert.equal(where.subscriberId, "sub_123", "subscriber filter should always be preserved");
  assert.equal(where.workspaceId, "org_456", "workspace filter should be preserved to stop cross-workspace access");
  assert.ok(Array.isArray(where.AND), "cursor/search filters should be combined under AND");
  assert.equal(where.AND.length, 3, "cursor, status, and search should all coexist");
  assert.ok(!(where as Record<string, unknown>).OR, "top-level OR should not wipe out cursor pagination");

  const [cursorFilter, statusFilter, searchFilter] = where.AND as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(cursorFilter.OR), "cursor boundary should remain an OR condition");
  assert.equal((statusFilter as { status?: string }).status, "CLOSED", "status should be normalized");
  assert.ok(Array.isArray(searchFilter.OR), "search should stay in its own OR group");

  assert.equal(getSubscriberSupportOpenMode("CLOSED"), "RESTART", "closed tickets should restart SLA tracking");
  assert.equal(getSubscriberSupportOpenMode("PENDING"), "RESUME", "pending tickets should resume paused SLA tracking");
  assert.equal(getSubscriberSupportOpenMode("OPEN"), "OPEN", "open tickets should keep normal reply handling");
})();

console.log("Subscriber support rules checks passed.");
