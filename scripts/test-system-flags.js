const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE || "";
const USER_COOKIE = process.env.USER_SESSION_COOKIE || process.env.NON_ADMIN_SESSION_COOKIE || "";
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE || "";
const NON_ROOT_ADMIN_COOKIE = process.env.NON_ROOT_ADMIN_SESSION_COOKIE || "";

const REQUIRED_FLAGS = [
  "maintenance_mode",
  "allow_signup",
  "payments_enabled",
  "automation_enabled",
  "automation_replay_enabled",
  "ai_enabled",
  "support_enabled",
  "admin_notifications_enabled",
  "system_logs_enabled",
  "impersonation_enabled",
  "webhooks_ingest_enabled",
  "exports_enabled",
];

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

async function request(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (cookie) reqHeaders.Cookie = cookie;
  if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: reqHeaders,
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

function findFlag(flags, key) {
  return Array.isArray(flags) ? flags.find((item) => item?.key === key) : null;
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }

  if (USER_COOKIE) {
    const denied = await request("/api/admin/system-flags", { cookie: USER_COOKIE });
    if (denied.status !== 403) {
      fail(`Expected non-admin to be blocked (403), got ${denied.status}`);
    }
    pass("Non-admin users are blocked from system flags API");
  } else {
    note("Skipped non-admin access check (USER_SESSION_COOKIE not provided)");
  }

  const list = await request("/api/admin/system-flags", { cookie: ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`System flags list failed (${list.status}): ${list.text}`);
  }
  if (!Array.isArray(list.json?.flags)) {
    fail("System flags response missing flags[]");
  }

  for (const key of REQUIRED_FLAGS) {
    if (!findFlag(list.json.flags, key)) {
      fail(`Missing required flag in API response: ${key}`);
    }
  }
  pass("System flags API returns all required typed flags");

  const invalidKey = await request("/api/admin/system-flags", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { key: "unknown_flag", value: true },
  });
  if (invalidKey.status !== 422) {
    fail(`Unknown key should be rejected with 422, got ${invalidKey.status}`);
  }

  const invalidValue = await request("/api/admin/system-flags", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { key: "support_enabled", value: "true" },
  });
  if (invalidValue.status !== 422) {
    fail(`Non-boolean values should be rejected with 422, got ${invalidValue.status}`);
  }
  pass("Whitelist and boolean validation enforced");

  const invalidRefresh = await request("/api/admin/system-flags", {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { action: "noop" },
  });
  if (invalidRefresh.status !== 422) {
    fail(`Invalid refresh action must return 422, got ${invalidRefresh.status}`);
  }

  const refresh = await request("/api/admin/system-flags", {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { action: "refresh" },
  });
  if (refresh.status !== 200) {
    fail(`Refresh action failed (${refresh.status}): ${refresh.text}`);
  }
  pass("Flags refresh endpoint works");

  const supportFlag = findFlag(list.json.flags, "support_enabled");
  if (!supportFlag) {
    fail("support_enabled flag missing for toggle test");
  }
  const initialSupport = Boolean(supportFlag.value);
  const toggledSupport = !initialSupport;
  const actorRole = String(list.json?.actorRole || "").toUpperCase();
  const superCookie = SUPER_ADMIN_COOKIE || (actorRole === "SUPER_ADMIN" ? ADMIN_COOKIE : "");

  if (superCookie) {
    const setSupport = await request("/api/admin/system-flags", {
      method: "POST",
      cookie: superCookie,
      body: { key: "support_enabled", value: toggledSupport },
    });
    if (setSupport.status !== 200) {
      fail(`Failed toggling support_enabled (${setSupport.status}): ${setSupport.text}`);
    }

    const afterSet = await request("/api/admin/system-flags", { cookie: superCookie });
    const afterSetFlag = findFlag(afterSet.json?.flags, "support_enabled");
    if (!afterSetFlag || Boolean(afterSetFlag.value) !== toggledSupport) {
      fail("support_enabled did not persist to expected value");
    }

    const restoreSupport = await request("/api/admin/system-flags", {
      method: "POST",
      cookie: superCookie,
      body: { key: "support_enabled", value: initialSupport },
    });
    if (restoreSupport.status !== 200) {
      fail(`Failed restoring support_enabled (${restoreSupport.status}): ${restoreSupport.text}`);
    }
    pass("SUPER_ADMIN can toggle and restore flags");
  } else {
    note("Skipped toggle test (set SUPER_ADMIN_SESSION_COOKIE to validate writes)");
  }

  const history = await request("/api/admin/system-flags/history?take=20&flagKey=support_enabled", {
    cookie: ADMIN_COOKIE,
  });
  if (history.status !== 200) {
    fail(`History endpoint failed (${history.status}): ${history.text}`);
  }
  if (!Array.isArray(history.json?.history) || history.json.history.length === 0) {
    fail("History endpoint returned no audit entries for support_enabled");
  }
  pass("System flag history/audit trail endpoint works");

  const dangerousTarget = findFlag(list.json.flags, "maintenance_mode");
  const dangerousValue = dangerousTarget ? Boolean(dangerousTarget.value) : false;

  const restrictedCookie = NON_ROOT_ADMIN_COOKIE || (actorRole === "OPS_ADMIN" ? ADMIN_COOKIE : "");
  if (restrictedCookie) {
    const blockedDangerous = await request("/api/admin/system-flags", {
      method: "POST",
      cookie: restrictedCookie,
      body: { key: "maintenance_mode", value: dangerousValue },
    });
    if (blockedDangerous.status !== 403) {
      fail(`Flag write by OPS_ADMIN should be blocked (403), got ${blockedDangerous.status}`);
    }
    pass("All flag writes are blocked for OPS_ADMIN role");
  } else {
    note("Skipped OPS_ADMIN write block check (set NON_ROOT_ADMIN_SESSION_COOKIE to validate)");
  }
  if (superCookie) {
    const allowedDangerous = await request("/api/admin/system-flags", {
      method: "POST",
      cookie: superCookie,
      body: { key: "maintenance_mode", value: dangerousValue },
    });
    if (allowedDangerous.status !== 200) {
      fail(`SUPER_ADMIN dangerous flag write failed (${allowedDangerous.status}): ${allowedDangerous.text}`);
    }
    pass("SUPER_ADMIN can modify dangerous flags");
  } else {
    note("Skipped SUPER_ADMIN dangerous-flag check (set SUPER_ADMIN_SESSION_COOKIE to validate)");
  }

  const snapshotPublic = await request("/api/system-flags/snapshot");
  if (snapshotPublic.status !== 403) {
    fail(
      `Public snapshot route must be forbidden without internal token. Expected 403, got ${snapshotPublic.status}`
    );
  }
  pass("Snapshot endpoint is protected from public access");

  console.log("System flags checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
