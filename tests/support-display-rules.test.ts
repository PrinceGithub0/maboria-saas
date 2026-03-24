import assert from "node:assert/strict";

import {
  getSubscriberSupportLastActivityAt,
  sortSubscriberSupportTicketsByRecentActivity,
} from "../lib/support/subscriber-display";

function run() {
  const olderTicketWithFreshReply = {
    id: "ticket_old",
    createdAt: "2026-03-01T10:00:00.000Z",
    metadata: {
      lastActivityAt: "2026-03-10T09:00:00.000Z",
    },
  };
  const newerButInactiveTicket = {
    id: "ticket_new",
    createdAt: "2026-03-09T12:00:00.000Z",
    metadata: {
      lastActivityAt: "2026-03-09T12:00:00.000Z",
    },
  };
  const createdOnlyTicket = {
    id: "ticket_created_only",
    createdAt: "2026-03-08T08:00:00.000Z",
    metadata: null,
  };

  assert.equal(
    getSubscriberSupportLastActivityAt(olderTicketWithFreshReply),
    "2026-03-10T09:00:00.000Z",
    "last activity should take precedence over created time when present"
  );
  assert.equal(
    getSubscriberSupportLastActivityAt(createdOnlyTicket),
    "2026-03-08T08:00:00.000Z",
    "created time should be used as a fallback when last activity is missing"
  );

  const sorted = sortSubscriberSupportTicketsByRecentActivity([
    newerButInactiveTicket,
    createdOnlyTicket,
    olderTicketWithFreshReply,
  ]);

  assert.deepEqual(
    sorted.map((ticket) => ticket.id),
    ["ticket_old", "ticket_new", "ticket_created_only"],
    "tickets should be sorted by last activity, not raw creation time"
  );

  console.log("support display rule checks passed");
}

run();
