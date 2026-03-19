const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`ok ${message}`);
}

async function request(path, { method = "GET", cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { method, headers });
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

  const forbidden = await request("/api/admin/logs", { cookie: NON_ADMIN_COOKIE });
  if (forbidden.status !== 403) {
    fail(`Expected non-admin to be blocked with 403, got ${forbidden.status}`);
  }
  pass("non-admin is blocked from system logs");

  const list = await request("/api/admin/logs?page=1&pageSize=50&tab=all", { cookie: ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`Admin logs list failed (${list.status}): ${list.text}`);
  }
  if (!Array.isArray(list.json?.items)) {
    fail("Logs response missing items[]");
  }
  if (typeof list.json?.total !== "number") {
    fail("Logs response missing total");
  }
  if (list.json.items.length > 50) {
    fail(`Page size exceeded: got ${list.json.items.length}`);
  }
  pass("logs list returns paginated payload");

  const invalidPageSize = await request("/api/admin/logs?page=1&pageSize=500", { cookie: ADMIN_COOKIE });
  if (invalidPageSize.status !== 422) {
    fail(`Expected 422 for oversized pageSize, got ${invalidPageSize.status}`);
  }
  pass("logs endpoint enforces max pageSize");

  const filtered = await request("/api/admin/logs?tab=errors&severity=ERROR,CRITICAL", { cookie: ADMIN_COOKIE });
  if (filtered.status !== 200) {
    fail(`Filtered logs request failed (${filtered.status}): ${filtered.text}`);
  }
  pass("logs endpoint accepts severity filters");

  const exportCsv = await request("/api/admin/logs/export?format=csv&tab=all", { cookie: ADMIN_COOKIE });
  if (exportCsv.status !== 200) {
    fail(`CSV export failed (${exportCsv.status}): ${exportCsv.text}`);
  }
  if (!String(exportCsv.text).startsWith("timestamp,severity,service,message")) {
    fail("CSV export missing header row");
  }
  pass("CSV export works");

  const exportJson = await request("/api/admin/logs/export?format=json&tab=all", { cookie: ADMIN_COOKIE });
  if (exportJson.status !== 200) {
    fail(`JSON export failed (${exportJson.status}): ${exportJson.text}`);
  }
  if (!Array.isArray(exportJson.json)) {
    fail("JSON export did not return array payload");
  }
  pass("JSON export works");

  console.log("Admin logs checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});

