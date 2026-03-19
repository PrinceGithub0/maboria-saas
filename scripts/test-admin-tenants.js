const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;
const TARGET_TENANT_ID = process.env.TARGET_TENANT_ID;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function request(path, { cookie, method = "GET", body } = {}) {
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

function requireEnv() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
  if (!SUPER_ADMIN_COOKIE) {
    fail(
      'Missing SUPER_ADMIN_SESSION_COOKIE. Example: SUPER_ADMIN_SESSION_COOKIE="next-auth.session-token=..."'
    );
  }
  if (!NON_ADMIN_COOKIE) {
    fail(
      'Missing NON_ADMIN_SESSION_COOKIE (or USER_SESSION_COOKIE). Example: NON_ADMIN_SESSION_COOKIE="next-auth.session-token=..."'
    );
  }
}

async function run() {
  requireEnv();
  console.log(`Running admin tenant RBAC checks against ${BASE_URL}`);

  const adminList = await request("/api/admin/tenants?page=1&pageSize=10", {
    cookie: ADMIN_COOKIE,
  });
  if (adminList.status !== 200) {
    fail(`OPS_ADMIN tenant list failed (${adminList.status}): ${adminList.text}`);
  }
  pass("OPS_ADMIN can read tenant list");

  const superList = await request("/api/admin/tenants?page=1&pageSize=10", {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (superList.status !== 200) {
    fail(`SUPER_ADMIN tenant list failed (${superList.status}): ${superList.text}`);
  }
  pass("SUPER_ADMIN can read tenant list");

  const nonAdminList = await request("/api/admin/tenants?page=1&pageSize=10", {
    cookie: NON_ADMIN_COOKIE,
  });
  if (nonAdminList.status !== 403) {
    fail(`Non-platform user tenant list should be 403, got ${nonAdminList.status}`);
  }
  pass("Non-platform user is blocked from tenant list");

  const listItems = Array.isArray(superList.json?.items) ? superList.json.items : [];
  const tenantId = TARGET_TENANT_ID || listItems[0]?.id;
  if (!tenantId) {
    fail("No tenant found in tenant list and TARGET_TENANT_ID not provided");
  }

  const adminDetail = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    cookie: ADMIN_COOKIE,
  });
  if (adminDetail.status !== 200) {
    fail(`OPS_ADMIN tenant detail failed (${adminDetail.status}): ${adminDetail.text}`);
  }
  pass("OPS_ADMIN can read tenant detail");

  const superDetail = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (superDetail.status !== 200) {
    fail(`SUPER_ADMIN tenant detail failed (${superDetail.status}): ${superDetail.text}`);
  }
  pass("SUPER_ADMIN can read tenant detail");

  const adminSuspend = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { reason: "rbac test - admin must fail" },
  });
  if (adminSuspend.status !== 403) {
    fail(`OPS_ADMIN suspend should be 403, got ${adminSuspend.status}: ${adminSuspend.text}`);
  }
  pass("OPS_ADMIN cannot suspend tenant");

  const adminReactivate = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/reactivate`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
  });
  if (adminReactivate.status !== 403) {
    fail(`OPS_ADMIN reactivate should be 403, got ${adminReactivate.status}: ${adminReactivate.text}`);
  }
  pass("OPS_ADMIN cannot reactivate tenant");

  const nonAdminSuspend = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
    method: "POST",
    cookie: NON_ADMIN_COOKIE,
    body: { reason: "rbac test - non-admin must fail" },
  });
  if (nonAdminSuspend.status !== 403) {
    fail(`Non-platform suspend should be 403, got ${nonAdminSuspend.status}: ${nonAdminSuspend.text}`);
  }
  pass("Non-platform user cannot suspend tenant");

  const suspend = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/suspend`, {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: { reason: "admin tenant rbac test" },
  });
  if (suspend.status !== 200) {
    fail(`SUPER_ADMIN suspend failed (${suspend.status}): ${suspend.text}`);
  }
  pass("SUPER_ADMIN can suspend tenant");

  const suspendedDetail = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (suspendedDetail.status !== 200 || suspendedDetail.json?.tenant?.status !== "SUSPENDED") {
    fail("Tenant status did not become SUSPENDED after SUPER_ADMIN suspend");
  }
  pass("Tenant detail reflects suspended status");

  const reactivate = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/reactivate`, {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (reactivate.status !== 200) {
    fail(`SUPER_ADMIN reactivate failed (${reactivate.status}): ${reactivate.text}`);
  }
  pass("SUPER_ADMIN can reactivate tenant");

  const reactivatedDetail = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (reactivatedDetail.status !== 200 || reactivatedDetail.json?.tenant?.status !== "ACTIVE") {
    fail("Tenant status did not return to ACTIVE after SUPER_ADMIN reactivation");
  }
  pass("Tenant detail reflects active status");

  console.log("Admin tenant RBAC test passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
