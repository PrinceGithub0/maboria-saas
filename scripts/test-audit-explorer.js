const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE || "";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE || "";
const USER_COOKIE = process.env.USER_SESSION_COOKIE || process.env.NON_ADMIN_SESSION_COOKIE || "";

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function note(message) {
  console.log(`• ${message}`);
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
  if (!SUPER_ADMIN_COOKIE) {
    fail('Missing SUPER_ADMIN_SESSION_COOKIE. Example: SUPER_ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }

  if (USER_COOKIE) {
    const userBlocked = await request("/api/admin/audit-explorer", { cookie: USER_COOKIE });
    if (userBlocked.status !== 403) {
      fail(`Expected non-admin user blocked with 403, got ${userBlocked.status}`);
    }
    pass("Non-admin blocked from audit explorer");
  } else {
    note("Skipped non-admin check (USER_SESSION_COOKIE not provided)");
  }

  if (ADMIN_COOKIE) {
    const adminBlocked = await request("/api/admin/audit-explorer", { cookie: ADMIN_COOKIE });
    if (adminBlocked.status !== 403) {
      fail(`Expected OPS_ADMIN blocked with 403, got ${adminBlocked.status}`);
    }
    pass("OPS_ADMIN blocked (SUPER_ADMIN-only route)");
  } else {
    note("Skipped OPS_ADMIN block check (ADMIN_SESSION_COOKIE not provided)");
  }

  const list = await request("/api/admin/audit-explorer?page=1&pageSize=30", { cookie: SUPER_ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`SUPER_ADMIN list failed (${list.status}): ${list.text}`);
  }
  if (!Array.isArray(list.json?.items)) {
    fail("Response missing items[]");
  }
  if (typeof list.json?.total !== "number") {
    fail("Response missing total");
  }
  pass("SUPER_ADMIN can list audit explorer events");

  const invalid = await request("/api/admin/audit-explorer?page=0", { cookie: SUPER_ADMIN_COOKIE });
  if (invalid.status !== 422) {
    fail(`Expected 422 for invalid query params, got ${invalid.status}`);
  }
  pass("Validation rejects invalid query params");

  console.log("Audit explorer checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
