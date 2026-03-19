const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const RAW_OWNER_COOKIE = process.env.TEAM_OWNER_SESSION_COOKIE;
const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";

function normalizeCookie(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.includes("=")) {
    return trimmed.split(";")[0].trim();
  }
  return `next-auth.session-token=${trimmed}`;
}

const OWNER_COOKIE = normalizeCookie(RAW_OWNER_COOKIE);

function fail(message) {
  console.error(`✗ ${message}`);
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

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@maboria.local`;
}

async function ensurePlatformUser(email, role) {
  const storedRole = role === "SUPER_ADMIN" ? "OPS_ADMIN" : role;
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: storedRole },
    create: {
      name: email.split("@")[0],
      email,
      passwordHash: "test-password-hash",
      role: storedRole,
      status: "ACTIVE",
      isPlatformUser: storedRole !== "USER",
    },
    select: { id: true, email: true, role: true },
  });
  if (role === "SUPER_ADMIN") {
    await prisma.setting.upsert({
      where: { key: ROOT_SUPER_ADMIN_SETTING },
      update: { value: user.id },
      create: { key: ROOT_SUPER_ADMIN_SETTING, value: user.id },
    });
  }
  return user;
}

async function run() {
  if (!OWNER_COOKIE) {
    fail('Missing TEAM_OWNER_SESSION_COOKIE. Use either "next-auth.session-token=..." or the raw token value.');
  }

  console.log(`Running team invite platform-role guard checks against ${BASE_URL}`);

  const ownerSession = await request("/api/auth/session", {
    cookie: OWNER_COOKIE,
  });
  if (ownerSession.status !== 200) {
    fail(`Owner session check failed (status ${ownerSession.status}): ${ownerSession.text}`);
  }
  if (!ownerSession.json?.user?.email) {
    fail(
      `TEAM_OWNER_SESSION_COOKIE is not a valid signed-in session on ${BASE_URL}. ` +
        `Use the cookie from the browser's Application/Storage tab.`
    );
  }
  console.log(`Using owner session for ${ownerSession.json.user.email}`);

  const createdUserEmail = uniqueEmail("invite-user");
  const createdAdminEmail = uniqueEmail("invite-admin");
  const createdSuperAdminEmail = uniqueEmail("invite-super-admin");
  const missingEmail = uniqueEmail("invite-missing");

  const createdUser = await ensurePlatformUser(createdUserEmail, "USER");
  const createdAdmin = await ensurePlatformUser(createdAdminEmail, "OPS_ADMIN");
  const createdSuperAdmin = await ensurePlatformUser(createdSuperAdminEmail, "SUPER_ADMIN");

  const inviteUser = await request("/api/team", {
    method: "POST",
    cookie: OWNER_COOKIE,
    body: { email: createdUser.email, role: "member" },
  });
  if (inviteUser.status !== 201 || !inviteUser.json?.member) {
    fail(`Invite USER should succeed (status ${inviteUser.status}): ${inviteUser.text}`);
  }
  pass("Invite USER -> success");

  const inviteAdmin = await request("/api/team", {
    method: "POST",
    cookie: OWNER_COOKIE,
    body: { email: createdAdmin.email, role: "member" },
  });
  if (inviteAdmin.status !== 403) {
    fail(`Invite OPS_ADMIN should return 403 (status ${inviteAdmin.status}): ${inviteAdmin.text}`);
  }
  pass("Invite OPS_ADMIN -> 403");

  const inviteSuper = await request("/api/team", {
    method: "POST",
    cookie: OWNER_COOKIE,
    body: { email: createdSuperAdmin.email, role: "member" },
  });
  if (inviteSuper.status !== 403) {
    fail(`Invite SUPER_ADMIN should return 403 (status ${inviteSuper.status}): ${inviteSuper.text}`);
  }
  pass("Invite SUPER_ADMIN -> 403");

  const inviteMissing = await request("/api/team", {
    method: "POST",
    cookie: OWNER_COOKIE,
    body: { email: missingEmail, role: "member" },
  });
  if (inviteMissing.status !== 202 || !inviteMissing.json?.invited) {
    fail(`Invite non-existing email should succeed (status ${inviteMissing.status}): ${inviteMissing.text}`);
  }
  pass("Invite non-existing email -> success (invite issued)");

  await prisma.businessMember.deleteMany({ where: { userId: createdUser.id } });
  await prisma.businessInvite.deleteMany({ where: { email: missingEmail } });
  await prisma.user.deleteMany({ where: { id: { in: [createdUser.id, createdAdmin.id, createdSuperAdmin.id] } } });

  console.log("Team invite platform-role guard checks passed.");
}

run()
  .catch((error) => {
    fail(error instanceof Error ? error.message : "Unexpected error");
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
