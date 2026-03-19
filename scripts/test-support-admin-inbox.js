const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;
const UNASSIGNED_TICKET_ID = process.env.SUPPORT_UNASSIGNED_TICKET_ID;
const OTHER_ASSIGNEE_TICKET_ID = process.env.SUPPORT_OTHER_ASSIGNEE_TICKET_ID;

function fail(message) {
  console.error(`× ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function request(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
  if (!NON_ADMIN_COOKIE) {
    fail('Missing NON_ADMIN_SESSION_COOKIE (or USER_SESSION_COOKIE). Example: NON_ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }

  console.log(`Running support inbox checks against ${BASE_URL}`);

  const adminList = await request("/api/admin/support?page=1&pageSize=10&status=open&assignee=all", {
    cookie: ADMIN_COOKIE,
  });
  if (adminList.status !== 200) {
    fail(`OPS_ADMIN list failed (${adminList.status}): ${adminList.text}`);
  }
  pass("OPS_ADMIN can read support ticket list with filters");

  const nonAdminList = await request("/api/admin/support?page=1&pageSize=10", {
    cookie: NON_ADMIN_COOKIE,
  });
  if (nonAdminList.status !== 403) {
    fail(`Non-admin should be blocked from support list (expected 403, got ${nonAdminList.status})`);
  }
  pass("Non-admin is blocked from support list");

  const listItems = Array.isArray(adminList.json?.items) ? adminList.json.items : [];
  if (!listItems.length) {
    fail("No support tickets found to run detail tests");
  }

  const detailId = listItems[0].id;
  const detail = await request(`/api/admin/support/tickets/${encodeURIComponent(detailId)}`, {
    cookie: ADMIN_COOKIE,
  });
  if (detail.status !== 200) {
    fail(`Ticket detail failed (${detail.status}): ${detail.text}`);
  }
  pass("Ticket detail route returns selected ticket");

  const badReply = await request(`/api/admin/support/tickets/${encodeURIComponent(detailId)}/reply`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      message: "   ",
      version: detail.json?.version,
    },
  });
  if (badReply.status !== 422) {
    fail(`Reply validation should return 422, got ${badReply.status}`);
  }
  pass("Reply endpoint rejects empty message");

  const staleAssign = await request(`/api/admin/support/tickets/${encodeURIComponent(detailId)}/assign`, {
    method: "PATCH",
    cookie: ADMIN_COOKIE,
    body: {
      assigneeId: null,
      version: "2020-01-01T00:00:00.000Z",
    },
  });
  if (staleAssign.status !== 409) {
    fail(`Assign with stale version should return 409, got ${staleAssign.status}`);
  }
  pass("Assign endpoint enforces optimistic concurrency");

  const nonAdminReply = await request(`/api/admin/support/tickets/${encodeURIComponent(detailId)}/reply`, {
    method: "POST",
    cookie: NON_ADMIN_COOKIE,
    body: {
      message: "Unauthorized check",
      version: detail.json?.version,
    },
  });
  if (nonAdminReply.status !== 403) {
    fail(`Non-admin reply should return 403, got ${nonAdminReply.status}`);
  }
  pass("Non-admin is blocked from replying");

  if (UNASSIGNED_TICKET_ID) {
    const unassignedDetail = await request(`/api/admin/support/tickets/${encodeURIComponent(UNASSIGNED_TICKET_ID)}`, {
      cookie: ADMIN_COOKIE,
    });
    if (unassignedDetail.status !== 200) {
      fail(`Unassigned ticket detail failed (${unassignedDetail.status}): ${unassignedDetail.text}`);
    }
    const autoAssignReply = await request(`/api/admin/support/tickets/${encodeURIComponent(UNASSIGNED_TICKET_ID)}/reply`, {
      method: "POST",
      cookie: ADMIN_COOKIE,
      body: {
        message: `Auto-assign test ${Date.now()}`,
        version: unassignedDetail.json?.version,
      },
    });
    if (autoAssignReply.status !== 200) {
      fail(`Auto-assign reply failed (${autoAssignReply.status}): ${autoAssignReply.text}`);
    }
    pass("Reply to unassigned ticket auto-assigns and sends");
  } else {
    console.log("• Skipped auto-assign integration test (set SUPPORT_UNASSIGNED_TICKET_ID to enable)");
  }

  if (OTHER_ASSIGNEE_TICKET_ID) {
    const assignedDetail = await request(`/api/admin/support/tickets/${encodeURIComponent(OTHER_ASSIGNEE_TICKET_ID)}`, {
      cookie: ADMIN_COOKIE,
    });
    if (assignedDetail.status !== 200) {
      fail(`Assigned ticket detail failed (${assignedDetail.status}): ${assignedDetail.text}`);
    }
    const takeoverPrompt = await request(`/api/admin/support/tickets/${encodeURIComponent(OTHER_ASSIGNEE_TICKET_ID)}/reply`, {
      method: "POST",
      cookie: ADMIN_COOKIE,
      body: {
        message: `Takeover check ${Date.now()}`,
        version: assignedDetail.json?.version,
      },
    });
    if (takeoverPrompt.status !== 409 || takeoverPrompt.json?.code !== "TAKEOVER_REQUIRED") {
      fail(`Expected TAKEOVER_REQUIRED 409, got ${takeoverPrompt.status}: ${takeoverPrompt.text}`);
    }
    pass("Reply to another admin ticket requires takeover confirmation");
  } else {
    console.log("• Skipped takeover integration test (set SUPPORT_OTHER_ASSIGNEE_TICKET_ID to enable)");
  }

  console.log("Support inbox checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
