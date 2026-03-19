const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;
const IMPERSONATING_ADMIN_COOKIE = process.env.IMPERSONATING_ADMIN_COOKIE || null;

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`ok ${message}`);
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
  return { status: response.status, text, json };
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
  if (!NON_ADMIN_COOKIE) {
    fail('Missing NON_ADMIN_SESSION_COOKIE (or USER_SESSION_COOKIE).');
  }

  const forbiddenList = await request("/api/admin/automation/errors", { cookie: NON_ADMIN_COOKIE });
  if (forbiddenList.status !== 403) {
    fail(`Expected non-admin list access to fail with 403, got ${forbiddenList.status}`);
  }
  pass("non-admin blocked from automation errors list");

  const list = await request("/api/admin/automation/errors?pageSize=25&range=24h", { cookie: ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`Automation errors list failed (${list.status}): ${list.text}`);
  }
  if (!Array.isArray(list.json?.items)) fail("List response missing items[]");
  if (typeof list.json?.summary?.failedRuns24h !== "number") fail("List response missing summary");
  if (typeof list.json?.hasMore !== "boolean") fail("List response missing hasMore");
  pass("automation errors list payload is valid");

  const invalidSize = await request("/api/admin/automation/errors?pageSize=500", { cookie: ADMIN_COOKIE });
  if (invalidSize.status !== 422) {
    fail(`Expected 422 for oversized pageSize, got ${invalidSize.status}`);
  }
  pass("automation errors pageSize validation enforced");

  const forbiddenReplay = await request("/api/admin/automation/errors/nonexistent/replay", {
    method: "POST",
    cookie: NON_ADMIN_COOKIE,
  });
  if (forbiddenReplay.status !== 403) {
    fail(`Expected non-admin replay to fail with 403, got ${forbiddenReplay.status}`);
  }
  pass("non-admin blocked from replay endpoint");

  const missingReplay = await request("/api/admin/automation/errors/nonexistent/replay", {
    method: "POST",
    cookie: ADMIN_COOKIE,
  });
  if (missingReplay.status !== 404) {
    fail(`Expected replay of missing run to return 404, got ${missingReplay.status}`);
  }
  pass("replay endpoint handles missing runs safely");

  if (IMPERSONATING_ADMIN_COOKIE) {
    const blockedList = await request("/api/admin/automation/errors?pageSize=1", {
      cookie: IMPERSONATING_ADMIN_COOKIE,
    });
    if (blockedList.status !== 403) {
      fail(`Expected impersonating list access to fail with 403, got ${blockedList.status}`);
    }
    const blockedReplay = await request("/api/admin/automation/errors/nonexistent/replay", {
      method: "POST",
      cookie: IMPERSONATING_ADMIN_COOKIE,
    });
    if (blockedReplay.status !== 403) {
      fail(`Expected impersonating replay access to fail with 403, got ${blockedReplay.status}`);
    }
    pass("impersonation mode blocked from automation errors APIs");
  } else {
    pass("impersonation cookie not provided; impersonation blocking check skipped");
  }

  if (Array.isArray(list.json?.items) && list.json.items.length > 0) {
    const runId = list.json.items[0].id;
    const detail = await request(`/api/admin/automation/errors/${runId}`, { cookie: ADMIN_COOKIE });
    if (detail.status !== 200) {
      fail(`Run detail failed (${detail.status}): ${detail.text}`);
    }
    if (!detail.json?.runMetadata?.runId) fail("Run detail missing runMetadata");
    if (!detail.json?.executionContext) fail("Run detail missing executionContext");
    pass("automation run detail payload is valid");
  } else {
    pass("no failed runs available; detail smoke test skipped");
  }

  console.log("Automation errors checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
