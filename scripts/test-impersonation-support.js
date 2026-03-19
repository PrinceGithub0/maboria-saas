const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE;
const TARGET_TENANT_ID = process.env.TARGET_TENANT_ID || "";

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`ok ${message}`);
}

function mergeCookies(...values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("; ");
}

function extractCookie(setCookieHeader, name) {
  const header = String(setCookieHeader || "");
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  if (!match) return null;
  return `${name}=${match[1]}`;
}

async function request(path, { method = "GET", cookie, body, redirect = "follow" } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    json,
    text,
    setCookie: response.headers.get("set-cookie"),
    location: response.headers.get("location"),
  };
}

function requireEnv() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
  if (!SUPER_ADMIN_COOKIE) {
    fail('Missing SUPER_ADMIN_SESSION_COOKIE. Example: SUPER_ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
}

async function resolveUsers(cookie) {
  const users = await request("/api/admin/users?page=1&pageSize=100", { cookie });
  if (users.status !== 200 || !users.json) {
    fail(`Unable to load admin users (${users.status}): ${users.text}`);
  }
  return users.json;
}

async function resolveTenantContext() {
  const list = await request("/api/admin/tenants?page=1&pageSize=30", { cookie: SUPER_ADMIN_COOKIE });
  if (list.status !== 200 || !Array.isArray(list.json?.items)) {
    fail(`Unable to load tenants (${list.status}): ${list.text}`);
  }

  const tenantId = TARGET_TENANT_ID || list.json.items[0]?.id;
  if (!tenantId) fail("No tenant found. Set TARGET_TENANT_ID.");

  const detail = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (detail.status !== 200 || !Array.isArray(detail.json?.users)) {
    fail(`Unable to load tenant detail (${detail.status}): ${detail.text}`);
  }

  const targetMembership = detail.json.users.find(
    (member) =>
      String(member?.status || "").toLowerCase() === "active" &&
      String(member?.user?.role || "").toUpperCase() === "USER"
  );
  if (!targetMembership?.user?.id) {
    fail("No active tenant user with global role USER found in selected tenant.");
  }

  return {
    tenantId,
    targetUserId: targetMembership.user.id,
  };
}

async function run() {
  requireEnv();

  const adminUsersPayload = await resolveUsers(ADMIN_COOKIE);
  const superUsersPayload = await resolveUsers(SUPER_ADMIN_COOKIE);

  const adminActorId = adminUsersPayload?.actor?.id;
  const superActorId = superUsersPayload?.actor?.id;
  if (!adminActorId || !superActorId) {
    fail("Unable to resolve actor IDs from /api/admin/users.");
  }

  const adminTarget = (superUsersPayload.items || []).find(
    (item) => item.role === "OPS_ADMIN" && item.id !== adminActorId
  );
  if (!adminTarget?.id) {
    fail("No separate OPS_ADMIN account found for impersonation denial test.");
  }

  const superTarget = (superUsersPayload.items || []).find((item) => item.role === "SUPER_ADMIN");
  if (!superTarget?.id) {
    fail("No SUPER_ADMIN account found for impersonation denial test.");
  }

  const { tenantId, targetUserId } = await resolveTenantContext();

  const adminStart = await request("/api/admin/impersonation/start", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      targetUserId,
      tenantId,
      reason: "Support reproduction for onboarding issue",
      confirmation: "IMPERSONATE",
    },
  });
  if (adminStart.status !== 200 || !adminStart.json?.sessionId) {
    fail(`OPS_ADMIN -> USER impersonation should succeed (${adminStart.status}): ${adminStart.text}`);
  }
  if (adminStart.json?.redirectTo !== "/dashboard") {
    fail(`Impersonation start must return redirectTo=/dashboard, got ${adminStart.json?.redirectTo || "missing"}`);
  }
  pass("OPS_ADMIN can start impersonation for tenant USER");

  const adminImpersonationCookie = extractCookie(adminStart.setCookie, "maboria_impersonation_session");
  if (!adminImpersonationCookie) {
    fail("Impersonation cookie missing from start response.");
  }

  const adminUsersBlockedPage = await request("/admin/users", {
    cookie: mergeCookies(ADMIN_COOKIE, adminImpersonationCookie),
    redirect: "manual",
  });
  if (adminUsersBlockedPage.status !== 307 || adminUsersBlockedPage.location !== "/dashboard") {
    fail(
      `Admin page should redirect to /dashboard while impersonating (got status=${adminUsersBlockedPage.status}, location=${adminUsersBlockedPage.location})`
    );
  }
  pass("Admin pages are blocked while impersonating");

  const adminUsersBlockedApi = await request("/api/admin/users?page=1&pageSize=5", {
    cookie: mergeCookies(ADMIN_COOKIE, adminImpersonationCookie),
  });
  if (adminUsersBlockedApi.status !== 403 || adminUsersBlockedApi.json?.code !== "FORBIDDEN_IMPERSONATION_MODE") {
    fail(
      `Admin API should be blocked while impersonating (expected 403/FORBIDDEN_IMPERSONATION_MODE, got ${adminUsersBlockedApi.status})`
    );
  }
  pass("Admin APIs are blocked while impersonating");

  const tenantDashboard = await request("/dashboard", {
    cookie: mergeCookies(ADMIN_COOKIE, adminImpersonationCookie),
  });
  if (tenantDashboard.status !== 200) {
    fail(`Tenant plane should load while impersonating (got ${tenantDashboard.status})`);
  }
  pass("Tenant plane loads with impersonation context");

  const adminToAdmin = await request("/api/admin/impersonation/start", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      targetUserId: adminTarget.id,
      tenantId,
      reason: "This must be denied",
      confirmation: "IMPERSONATE",
    },
  });
  if (adminToAdmin.status !== 403) {
    fail(`OPS_ADMIN -> OPS_ADMIN impersonation must be 403, got ${adminToAdmin.status}`);
  }
  pass("OPS_ADMIN cannot impersonate OPS_ADMIN");

  const adminToSuper = await request("/api/admin/impersonation/start", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      targetUserId: superTarget.id,
      tenantId,
      reason: "This must be denied",
      confirmation: "IMPERSONATE",
    },
  });
  if (adminToSuper.status !== 403) {
    fail(`OPS_ADMIN -> SUPER_ADMIN impersonation must be 403, got ${adminToSuper.status}`);
  }
  pass("OPS_ADMIN cannot impersonate SUPER_ADMIN");

  const mismatchCurrent = await request("/api/admin/impersonation/current", {
    cookie: mergeCookies(SUPER_ADMIN_COOKIE, adminImpersonationCookie),
  });
  if (mismatchCurrent.status !== 403) {
    fail(`Actor mismatch must be 403, got ${mismatchCurrent.status}`);
  }
  pass("Actor mismatch blocks reuse of impersonation cookie");

  const adminStop = await request("/api/admin/impersonation/stop", {
    method: "POST",
    cookie: mergeCookies(ADMIN_COOKIE, adminImpersonationCookie),
  });
  if (adminStop.status !== 200 || !adminStop.json?.stopped) {
    fail(`OPS_ADMIN stop impersonation failed (${adminStop.status}): ${adminStop.text}`);
  }
  pass("OPS_ADMIN can stop impersonation");

  const adminRestoredApi = await request("/api/admin/users?page=1&pageSize=5", {
    cookie: ADMIN_COOKIE,
  });
  if (adminRestoredApi.status !== 200) {
    fail(`Admin API access should be restored after stop (got ${adminRestoredApi.status})`);
  }
  pass("Admin control-plane access is restored after exit");

  const superStart = await request("/api/admin/impersonation/start", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      targetUserId,
      tenantId,
      reason: "Support check for tenant bug reproduction",
      confirmation: "IMPERSONATE",
    },
  });
  if (superStart.status !== 200 || !superStart.json?.sessionId) {
    fail(`SUPER_ADMIN -> USER impersonation should succeed (${superStart.status}): ${superStart.text}`);
  }
  pass("SUPER_ADMIN can start impersonation for tenant USER");

  const superImpersonationCookie = extractCookie(superStart.setCookie, "maboria_impersonation_session");
  if (!superImpersonationCookie) {
    fail("Impersonation cookie missing for SUPER_ADMIN start response.");
  }

  const suspendedDuringImpersonation = await request(
    `/api/admin/tenants/${encodeURIComponent(tenantId)}/suspend`,
    {
      method: "POST",
      cookie: mergeCookies(SUPER_ADMIN_COOKIE, superImpersonationCookie),
      body: { reason: "must be blocked in impersonation mode" },
    }
  );
  if (
    suspendedDuringImpersonation.status !== 403 ||
    suspendedDuringImpersonation.json?.code !== "FORBIDDEN_IMPERSONATION_MODE"
  ) {
    fail(
      `Tenant suspend should be blocked in impersonation mode (expected 403/FORBIDDEN_IMPERSONATION_MODE, got ${suspendedDuringImpersonation.status})`
    );
  }
  pass("Sensitive tenant control mutation is blocked while impersonating");

  const superStop = await request("/api/admin/impersonation/stop", {
    method: "POST",
    cookie: mergeCookies(SUPER_ADMIN_COOKIE, superImpersonationCookie),
  });
  if (superStop.status !== 200 || !superStop.json?.stopped) {
    fail(`SUPER_ADMIN stop impersonation failed (${superStop.status}): ${superStop.text}`);
  }
  pass("SUPER_ADMIN can stop impersonation");

  const expiringStart = await request("/api/admin/impersonation/start", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      targetUserId,
      tenantId,
      reason: "Expiry test run",
      confirmation: "IMPERSONATE",
    },
  });
  if (expiringStart.status !== 200 || !expiringStart.json?.sessionId) {
    fail(`Unable to start impersonation for expiry test (${expiringStart.status}): ${expiringStart.text}`);
  }

  await prisma.impersonationSession.update({
    where: { id: expiringStart.json.sessionId },
    data: { expiresAt: new Date(Date.now() - 5_000) },
  });

  const expiredCurrent = await request("/api/admin/impersonation/current", {
    cookie: mergeCookies(
      SUPER_ADMIN_COOKIE,
      extractCookie(expiringStart.setCookie, "maboria_impersonation_session")
    ),
  });
  if (expiredCurrent.status !== 200 || expiredCurrent.json?.active !== false) {
    fail(`Expired impersonation should resolve inactive (got ${expiredCurrent.status}): ${expiredCurrent.text}`);
  }
  pass("Expired impersonation session is denied by auth context");

  const auditCount = await prisma.auditLog.count({
    where: {
      userId: adminActorId,
      targetUserId,
      orgId: tenantId,
      actionType: { in: ["IMPERSONATION_STARTED", "IMPERSONATION_STOPPED"] },
    },
  });
  if (auditCount < 2) {
    fail("Audit logs for IMPERSONATION_STARTED/STOPPED were not fully recorded.");
  }
  pass("Audit logs recorded for start/stop");

  console.log("Support impersonation checks passed.");
}

run()
  .catch((error) => {
    fail(error instanceof Error ? error.message : "Unexpected test failure");
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
