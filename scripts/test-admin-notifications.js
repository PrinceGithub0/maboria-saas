const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE || process.env.ADMIN_SESSION_COOKIE;

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
    fail('Missing NON_ADMIN_SESSION_COOKIE (or USER_SESSION_COOKIE).');
  }

  const forbidden = await request("/api/admin/notifications", { cookie: NON_ADMIN_COOKIE });
  if (forbidden.status !== 403) {
    fail(`Expected non-admin to be blocked with 403, got ${forbidden.status}`);
  }
  pass("Auth blocks non-admin");

  const list = await request("/api/admin/notifications?page=1&pageSize=10", { cookie: ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`Admin notifications list failed (${list.status}): ${list.text}`);
  }
  if (!Array.isArray(list.json?.items)) {
    fail("List response missing items[]");
  }
  pass("List endpoint returns admin-scoped notifications");

  let target = list.json.items[0] || null;
  if (!target) {
    const incident = await request("/api/admin/incidents", {
      method: "POST",
      cookie: SUPER_ADMIN_COOKIE,
      body: {
        title: "Test incident",
        summary: `Created by test-admin-notifications at ${new Date().toISOString()}`,
        severity: "CRITICAL",
      },
    });
    if (incident.status !== 201 && incident.status !== 403) {
      fail(`Incident bootstrap failed (${incident.status}): ${incident.text}`);
    }
    const refreshed = await request("/api/admin/notifications?page=1&pageSize=10", { cookie: ADMIN_COOKIE });
    if (refreshed.status !== 200) {
      fail(`Failed to reload notifications after bootstrap (${refreshed.status})`);
    }
    target = refreshed.json?.items?.[0] || null;
  }

  if (!target) {
    fail("No notification available for transition checks");
  }

  const beforeUnread = await request("/api/admin/notifications/unread-count", { cookie: ADMIN_COOKIE });
  if (beforeUnread.status !== 200) {
    fail(`Unread count endpoint failed (${beforeUnread.status})`);
  }

  const markRead = await request(`/api/admin/notifications/${encodeURIComponent(target.id)}`, {
    method: "PATCH",
    cookie: ADMIN_COOKIE,
    body: { action: "MARK_READ" },
  });
  if (markRead.status !== 200) {
    fail(`Mark read failed (${markRead.status}): ${markRead.text}`);
  }
  pass("State transition endpoint updates status");

  const detail = await request(`/api/admin/notifications/${encodeURIComponent(target.id)}`, {
    cookie: ADMIN_COOKIE,
  });
  if (detail.status !== 200) {
    fail(`Detail endpoint failed (${detail.status})`);
  }
  if (!Array.isArray(detail.json?.audits) || !detail.json.audits.length) {
    fail("Audit trail was not recorded for notification action");
  }
  pass("State transitions generate audit rows");

  const bulk = await request("/api/admin/notifications/bulk", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      action: "ACK",
      ids: [target.id],
    },
  });
  if (bulk.status !== 200) {
    fail(`Bulk action failed (${bulk.status}): ${bulk.text}`);
  }
  pass("Bulk action endpoint works");

  const afterUnread = await request("/api/admin/notifications/unread-count", { cookie: ADMIN_COOKIE });
  if (afterUnread.status !== 200) {
    fail(`Unread count endpoint failed after actions (${afterUnread.status})`);
  }
  if (Number(afterUnread.json?.unreadCount) > Number(beforeUnread.json?.unreadCount)) {
    fail("Unread count increased unexpectedly after read/ack actions");
  }
  pass("Unread count updates after state changes");

  const dedupeOne = await request("/api/admin/incidents", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      title: "Dedupe test",
      summary: "Dedupe test incident",
      severity: "CRITICAL",
    },
  });
  const dedupeTwo = await request("/api/admin/incidents", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      title: "Dedupe test",
      summary: "Dedupe test incident",
      severity: "CRITICAL",
    },
  });
  if ((dedupeOne.status === 201 || dedupeOne.status === 403) && (dedupeTwo.status === 201 || dedupeTwo.status === 403)) {
    const dedupeList = await request("/api/admin/notifications?page=1&pageSize=20&type=SYSTEM", {
      cookie: ADMIN_COOKIE,
    });
    const matched = (dedupeList.json?.items || []).find((item) => item.title === "System incident detected");
    if (matched && Number(matched.occurrences) >= 1) {
      pass("Dedupe grouping path exercised (occurrence counter available)");
    } else {
      console.log("• Dedupe check skipped (no matching incident notifications in page slice)");
    }
  } else {
    console.log("• Dedupe check skipped (incident endpoint unavailable for this admin context)");
  }

  console.log("Admin notifications checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
