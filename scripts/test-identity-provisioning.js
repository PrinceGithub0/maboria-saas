const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE;
const USER_COOKIE = process.env.USER_SESSION_COOKIE || "";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

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

function randomEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@maboria.local`;
}

async function getRoleOptions(cookie) {
  const response = await request("/api/admin/users/create", { cookie });
  if (response.status !== 200) {
    fail(`Unable to fetch create metadata (${response.status}): ${response.text}`);
  }
  return Array.isArray(response.json?.roleOptions) ? response.json.roleOptions : [];
}

async function getCreateMetadata(cookie) {
  const response = await request("/api/admin/users/create", { cookie });
  if (response.status !== 200) {
    fail(`Unable to fetch create metadata (${response.status}): ${response.text}`);
  }
  return response.json || {};
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail("Missing ADMIN_SESSION_COOKIE.");
  }
  if (!SUPER_ADMIN_COOKIE) {
    fail("Missing SUPER_ADMIN_SESSION_COOKIE.");
  }
  if (!SUPER_ADMIN_PASSWORD) {
    fail("Missing SUPER_ADMIN_PASSWORD.");
  }

  console.log(`Running identity provisioning checks against ${BASE_URL}`);

  const adminRoleOptions = await getRoleOptions(ADMIN_COOKIE);
  const superRoleOptions = await getRoleOptions(SUPER_ADMIN_COOKIE);
  const createMetadata = await getCreateMetadata(SUPER_ADMIN_COOKIE);
  const tenant = Array.isArray(createMetadata.tenants)
    ? createMetadata.tenants.find((item) => String(item?.accessStatus || "").toUpperCase() === "ACTIVE")
    : null;
  if (!tenant?.id) {
    fail("No active tenant found for tenant-attachment validation tests.");
  }

  if (adminRoleOptions.includes("SUPER_ADMIN")) {
    fail("ADMIN_SESSION_COOKIE appears to belong to a SUPER_ADMIN. Use a non-super admin account.");
  }
  if (!superRoleOptions.includes("SUPER_ADMIN")) {
    fail("SUPER_ADMIN_SESSION_COOKIE does not have SUPER_ADMIN privileges.");
  }

  const adminAttemptEmail = randomEmail("admin-super-attempt");
  const adminCreateSuper = await request("/api/admin/users", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      fullName: "Admin Forbidden Escalation",
      email: adminAttemptEmail,
      role: "SUPER_ADMIN",
      status: "PENDING",
      sendSetupEmail: true,
      confirmSuperAdminGrant: true,
    },
  });
  if (adminCreateSuper.status !== 403 || adminCreateSuper.json?.code !== "FORBIDDEN_ROLE_ESCALATION") {
    fail(`OPS_ADMIN role-escalation check failed (${adminCreateSuper.status}): ${adminCreateSuper.text}`);
  }
  pass("OPS_ADMIN cannot create SUPER_ADMIN");

  const adminCreateAdminEmail = randomEmail("admin-admin-attempt");
  const adminCreateAdmin = await request("/api/admin/users", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      fullName: "Admin Forbidden Admin Creation",
      email: adminCreateAdminEmail,
      role: "OPS_ADMIN",
      status: "PENDING",
      sendSetupEmail: true,
    },
  });
  if (adminCreateAdmin.status !== 403 || adminCreateAdmin.json?.code !== "FORBIDDEN_ROLE_ESCALATION") {
    fail(`OPS_ADMIN creating OPS_ADMIN must fail (${adminCreateAdmin.status}): ${adminCreateAdmin.text}`);
  }
  pass("OPS_ADMIN cannot create OPS_ADMIN");

  const adminCreateUserEmail = randomEmail("admin-user-allowed");
  const adminCreateUser = await request("/api/admin/users", {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: {
      fullName: "Admin Created User",
      email: adminCreateUserEmail,
      role: "USER",
      status: "PENDING",
      sendSetupEmail: true,
    },
  });
  if (adminCreateUser.status !== 201 || !adminCreateUser.json?.userId) {
    fail(`OPS_ADMIN should be able to create USER (${adminCreateUser.status}): ${adminCreateUser.text}`);
  }
  pass("OPS_ADMIN can create USER");

  const invalidRoleEmail = randomEmail("invalid-role");
  const invalidRoleAttempt = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Invalid Role Attempt",
      email: invalidRoleEmail,
      role: "NOT_A_ROLE",
      status: "PENDING",
      sendSetupEmail: true,
    },
  });
  if (invalidRoleAttempt.status !== 422) {
    fail(`Invalid role enum should fail validation (${invalidRoleAttempt.status}): ${invalidRoleAttempt.text}`);
  }
  pass("Invalid role enum is rejected");

  const userCreateBlocked = await request("/api/admin/users", {
    method: "POST",
    cookie: USER_COOKIE || undefined,
    body: {
      fullName: "User Forbidden",
      email: randomEmail("user-forbidden"),
      role: "USER",
      status: "PENDING",
      sendSetupEmail: true,
    },
  });
  if (userCreateBlocked.status !== 403) {
    fail(`Non-platform user should be blocked from create endpoint (${userCreateBlocked.status}): ${userCreateBlocked.text}`);
  }
  pass("USER/non-platform request is blocked from create endpoint");

  const adminWithTenantEmail = randomEmail("admin-with-tenant");
  const adminWithTenant = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Admin Tenant Link Blocked",
      email: adminWithTenantEmail,
      role: "OPS_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
      tenantId: tenant.id,
      tenantRole: "MEMBER",
    },
  });
  if (adminWithTenant.status !== 400) {
    fail(`OPS_ADMIN with tenant should fail (got ${adminWithTenant.status}): ${adminWithTenant.text}`);
  }
  pass("Creating OPS_ADMIN with tenantId is blocked");

  const noStepUpEmail = randomEmail("super-no-stepup");
  const noStepUpCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Super Missing StepUp",
      email: noStepUpEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
      confirmSuperAdminGrant: true,
    },
  });
  if (noStepUpCreate.status !== 403 || noStepUpCreate.json?.code !== "STEP_UP_REQUIRED") {
    fail(`SUPER_ADMIN without step-up should fail (${noStepUpCreate.status}): ${noStepUpCreate.text}`);
  }
  pass("SUPER_ADMIN creation requires step-up");

  const superWithTenantEmail = randomEmail("super-with-tenant");
  const superWithTenant = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Super Admin Tenant Link Blocked",
      email: superWithTenantEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
      confirmSuperAdminGrant: true,
      tenantId: tenant.id,
      tenantRole: "MEMBER",
    },
  });
  if (superWithTenant.status !== 400) {
    fail(`SUPER_ADMIN with tenant should fail (got ${superWithTenant.status}): ${superWithTenant.text}`);
  }
  pass("Creating SUPER_ADMIN with tenantId is blocked");

  const stepUpStart = await request("/api/admin/step-up/start", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: { password: SUPER_ADMIN_PASSWORD },
  });
  if (stepUpStart.status !== 200 || !stepUpStart.json?.stepUpToken) {
    fail(`Step-up start failed (${stepUpStart.status}): ${stepUpStart.text}`);
  }
  pass("Step-up token issued");

  const superCreateEmail = randomEmail("super-created");
  const superCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Provisioned Super Admin",
      email: superCreateEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
      confirmSuperAdminGrant: true,
      stepUpToken: stepUpStart.json.stepUpToken,
    },
  });
  if (superCreate.status !== 201 || !superCreate.json?.userId) {
    fail(`SUPER_ADMIN create with step-up failed (${superCreate.status}): ${superCreate.text}`);
  }
  if (!superCreate.json?.tempPassword) {
    fail("Expected one-time temporary password when sendSetupEmail=false.");
  }
  const createdSuperUserId = superCreate.json.userId;
  pass("SUPER_ADMIN created with valid step-up");

  const stepUpReplayEmail = randomEmail("super-stepup-replay");
  const stepUpReplay = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "StepUp Replay Attempt",
      email: stepUpReplayEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
      confirmSuperAdminGrant: true,
      stepUpToken: stepUpStart.json.stepUpToken,
    },
  });
  if (stepUpReplay.status !== 403 || stepUpReplay.json?.code !== "STEP_UP_INVALID_OR_EXPIRED") {
    fail(`Step-up single-use check failed (${stepUpReplay.status}): ${stepUpReplay.text}`);
  }
  pass("Step-up token is single-use");

  const duplicateEmailAttempt = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Duplicate Email Attempt",
      email: superCreateEmail,
      role: "USER",
      status: "PENDING",
      sendSetupEmail: true,
    },
  });
  if (duplicateEmailAttempt.status !== 409 || duplicateEmailAttempt.json?.code !== "EMAIL_ALREADY_EXISTS") {
    fail(`Duplicate email check failed (${duplicateEmailAttempt.status}): ${duplicateEmailAttempt.text}`);
  }
  pass("Duplicate email returns EMAIL_ALREADY_EXISTS");

  const disabledEmail = randomEmail("disabled-normalization");
  const disabledCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Disabled User",
      email: disabledEmail,
      role: "USER",
      status: "DISABLED",
      sendSetupEmail: true,
    },
  });
  if (disabledCreate.status !== 201 || !disabledCreate.json?.userId) {
    fail(`Disabled-user creation failed (${disabledCreate.status}): ${disabledCreate.text}`);
  }
  const disabledUser = await prisma.user.findUnique({
    where: { id: disabledCreate.json.userId },
    select: { status: true },
  });
  if (!disabledUser || disabledUser.status !== "DISABLED") {
    fail("Disabled user status was not enforced.");
  }
  const disabledTokens = await prisma.passwordResetToken.count({
    where: { userId: disabledCreate.json.userId, used: false },
  });
  if (disabledTokens !== 0) {
    fail("DISABLED user unexpectedly received active setup token.");
  }
  pass("DISABLED + sendSetupEmail=true is safely normalized server-side");

  const userWithTenantEmail = randomEmail("user-with-tenant");
  const userWithTenant = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "User Attached To Tenant",
      email: userWithTenantEmail,
      role: "USER",
      status: "ACTIVE",
      sendSetupEmail: false,
      tenantId: tenant.id,
      tenantRole: "MEMBER",
    },
  });
  if (userWithTenant.status !== 201 || !userWithTenant.json?.userId) {
    fail(`USER with tenant should succeed (${userWithTenant.status}): ${userWithTenant.text}`);
  }
  const userMembership = await prisma.businessMember.findFirst({
    where: { userId: userWithTenant.json.userId, businessId: tenant.id },
    select: { id: true, role: true },
  });
  if (!userMembership) {
    fail("USER with tenant did not create tenant membership.");
  }
  pass("Creating USER with tenantId + tenantRole succeeds");

  const userWithoutTenantEmail = randomEmail("user-without-tenant");
  const userWithoutTenant = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "User Without Tenant",
      email: userWithoutTenantEmail,
      role: "USER",
      status: "ACTIVE",
      sendSetupEmail: false,
    },
  });
  if (userWithoutTenant.status !== 201 || !userWithoutTenant.json?.userId) {
    fail(`USER without tenant should succeed (${userWithoutTenant.status}): ${userWithoutTenant.text}`);
  }
  pass("Creating USER without tenant succeeds");

  const inviteEmail = randomEmail("invited-user");
  const invitedCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Invited Pending User",
      email: inviteEmail,
      role: "USER",
      status: "ACTIVE",
      sendSetupEmail: true,
    },
  });
  if (invitedCreate.status !== 201 || !invitedCreate.json?.userId) {
    fail(`Invite flow failed (${invitedCreate.status}): ${invitedCreate.text}`);
  }
  const invitedUserId = invitedCreate.json.userId;

  const tokenBeforeResend = await prisma.passwordResetToken.findFirst({
    where: { userId: invitedUserId },
    orderBy: { createdAt: "desc" },
    select: { token: true, expiresAt: true, used: true },
  });
  if (!tokenBeforeResend) {
    fail("Invite token was not created.");
  }
  if (!/^[a-f0-9]{64}$/i.test(tokenBeforeResend.token)) {
    fail("Invite token is not hashed as expected.");
  }
  if (tokenBeforeResend.used) {
    fail("Fresh invite token should not be marked used.");
  }
  if (tokenBeforeResend.expiresAt <= new Date()) {
    fail("Invite token expiry is invalid.");
  }
  pass("Invite token is hashed and has valid expiry");

  const resend = await request(`/api/admin/users/${encodeURIComponent(invitedUserId)}/resend-setup`, {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (resend.status !== 200) {
    fail(`Resend setup failed (${resend.status}): ${resend.text}`);
  }

  const tokensAfterResend = await prisma.passwordResetToken.findMany({
    where: { userId: invitedUserId },
    orderBy: { createdAt: "desc" },
    select: { token: true, used: true },
  });
  const unusedAfterResend = tokensAfterResend.filter((t) => !t.used);
  if (unusedAfterResend.length !== 1) {
    fail("Resend should leave exactly one active setup token.");
  }
  if (tokenBeforeResend.token === unusedAfterResend[0].token) {
    fail("Resend did not rotate setup token.");
  }
  pass("Resend rotates token and invalidates old one");

  const superAuditActions = await prisma.auditLog.findMany({
    where: {
      targetUserId: createdSuperUserId,
      actionType: {
        in: ["USER_CREATED", "GLOBAL_ROLE_CHANGED", "ACCOUNT_STATUS_CHANGED", "SUPER_ADMIN_GRANTED", "TEMP_PASSWORD_GENERATED"],
      },
    },
    select: { actionType: true },
  });
  const requiredSuperActions = new Set([
    "USER_CREATED",
    "GLOBAL_ROLE_CHANGED",
    "ACCOUNT_STATUS_CHANGED",
    "SUPER_ADMIN_GRANTED",
    "TEMP_PASSWORD_GENERATED",
  ]);
  for (const action of superAuditActions) {
    requiredSuperActions.delete(action.actionType || "");
  }
  if (requiredSuperActions.size > 0) {
    fail(`Missing super-admin audit actions: ${Array.from(requiredSuperActions).join(", ")}`);
  }
  pass("Super-admin provisioning audit events recorded");

  const inviteAuditActions = await prisma.auditLog.findMany({
    where: {
      targetUserId: invitedUserId,
      actionType: { in: ["USER_CREATED", "USER_INVITED", "PASSWORD_SETUP_SENT"] },
    },
    select: { actionType: true },
  });
  const requiredInviteActions = new Set(["USER_CREATED", "USER_INVITED", "PASSWORD_SETUP_SENT"]);
  for (const action of inviteAuditActions) {
    requiredInviteActions.delete(action.actionType || "");
  }
  if (requiredInviteActions.size > 0) {
    fail(`Missing invite audit actions: ${Array.from(requiredInviteActions).join(", ")}`);
  }
  pass("Invite audit events recorded");

  const plainAdminEmail = randomEmail("admin-no-tenant");
  const plainAdmin = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Admin Without Tenant",
      email: plainAdminEmail,
      role: "OPS_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
    },
  });
  if (plainAdmin.status !== 201 || !plainAdmin.json?.userId) {
    fail(`OPS_ADMIN without tenant should succeed (${plainAdmin.status}): ${plainAdmin.text}`);
  }
  const adminMembershipCount = await prisma.businessMember.count({
    where: { userId: plainAdmin.json.userId },
  });
  if (adminMembershipCount !== 0) {
    fail("Platform admin should not have tenant membership rows.");
  }
  pass("No tenant_membership row is created for platform ops admins");

  const roleTargetUserEmail = randomEmail("rbac-role-target-user");
  const roleTargetUserCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Role Target User",
      email: roleTargetUserEmail,
      role: "USER",
      status: "ACTIVE",
      sendSetupEmail: false,
    },
  });
  if (roleTargetUserCreate.status !== 201 || !roleTargetUserCreate.json?.userId) {
    fail(`Could not provision USER for role-change tests (${roleTargetUserCreate.status}): ${roleTargetUserCreate.text}`);
  }
  const roleTargetUserId = roleTargetUserCreate.json.userId;

  const roleTargetAdminEmail = randomEmail("rbac-role-target-admin");
  const roleTargetAdminCreate = await request("/api/admin/users", {
    method: "POST",
    cookie: SUPER_ADMIN_COOKIE,
    body: {
      fullName: "Role Target Admin",
      email: roleTargetAdminEmail,
      role: "OPS_ADMIN",
      status: "ACTIVE",
      sendSetupEmail: false,
    },
  });
  if (roleTargetAdminCreate.status !== 201 || !roleTargetAdminCreate.json?.userId) {
    fail(`Could not provision OPS_ADMIN for role-change tests (${roleTargetAdminCreate.status}): ${roleTargetAdminCreate.text}`);
  }
  const roleTargetAdminId = roleTargetAdminCreate.json.userId;

  const adminPromoteUserToAdmin = await request(`/api/admin/users/${encodeURIComponent(roleTargetUserId)}/role`, {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { role: "OPS_ADMIN" },
  });
  if (adminPromoteUserToAdmin.status !== 403) {
    fail(`OPS_ADMIN promoting USER to OPS_ADMIN must fail (${adminPromoteUserToAdmin.status}): ${adminPromoteUserToAdmin.text}`);
  }
  pass("OPS_ADMIN cannot promote USER to OPS_ADMIN");

  const adminPromoteUserToSuper = await request(`/api/admin/users/${encodeURIComponent(roleTargetUserId)}/role`, {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { role: "SUPER_ADMIN" },
  });
  if (adminPromoteUserToSuper.status !== 403) {
    fail(`OPS_ADMIN promoting USER to SUPER_ADMIN must fail (${adminPromoteUserToSuper.status}): ${adminPromoteUserToSuper.text}`);
  }
  pass("OPS_ADMIN cannot promote USER to SUPER_ADMIN");

  const adminModifyAdmin = await request(`/api/admin/users/${encodeURIComponent(roleTargetAdminId)}/role`, {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { role: "USER" },
  });
  if (adminModifyAdmin.status !== 403) {
    fail(`OPS_ADMIN modifying existing OPS_ADMIN must fail (${adminModifyAdmin.status}): ${adminModifyAdmin.text}`);
  }
  pass("OPS_ADMIN cannot modify an existing OPS_ADMIN");

  const superAdminsList = await request("/api/admin/users?filter=super_admins&page=1&pageSize=1", {
    cookie: SUPER_ADMIN_COOKIE,
  });
  if (superAdminsList.status !== 200 || !Array.isArray(superAdminsList.json?.items) || !superAdminsList.json.items[0]?.id) {
    fail(`Could not fetch SUPER_ADMIN target (${superAdminsList.status}): ${superAdminsList.text}`);
  }
  const superAdminTargetId = superAdminsList.json.items[0].id;

  const adminModifySuperAdmin = await request(`/api/admin/users/${encodeURIComponent(superAdminTargetId)}/role`, {
    method: "PUT",
    cookie: ADMIN_COOKIE,
    body: { role: "USER" },
  });
  if (adminModifySuperAdmin.status !== 403) {
    fail(`OPS_ADMIN modifying SUPER_ADMIN must fail (${adminModifySuperAdmin.status}): ${adminModifySuperAdmin.text}`);
  }
  pass("OPS_ADMIN cannot modify an existing SUPER_ADMIN");

  const superPromoteUser = await request(`/api/admin/users/${encodeURIComponent(roleTargetUserId)}/role`, {
    method: "PUT",
    cookie: SUPER_ADMIN_COOKIE,
    body: { role: "OPS_ADMIN" },
  });
  if (superPromoteUser.status !== 200 || !superPromoteUser.json?.success) {
    fail(`SUPER_ADMIN should promote USER to OPS_ADMIN (${superPromoteUser.status}): ${superPromoteUser.text}`);
  }
  pass("SUPER_ADMIN can change USER to OPS_ADMIN");

  const superDemoteAdmin = await request(`/api/admin/users/${encodeURIComponent(roleTargetAdminId)}/role`, {
    method: "PUT",
    cookie: SUPER_ADMIN_COOKIE,
    body: { role: "USER" },
  });
  if (superDemoteAdmin.status !== 200 || !superDemoteAdmin.json?.success) {
    fail(`SUPER_ADMIN should demote OPS_ADMIN to USER (${superDemoteAdmin.status}): ${superDemoteAdmin.text}`);
  }
  pass("SUPER_ADMIN can change OPS_ADMIN to USER");

  const superSession = await request("/api/auth/session", { cookie: SUPER_ADMIN_COOKIE });
  const superActorId = superSession.json?.user?.id || null;
  if (!superActorId) {
    fail("Unable to resolve SUPER_ADMIN actor id for self-change test.");
  }

  const superSelfRoleChange = await request(`/api/admin/users/${encodeURIComponent(superActorId)}/role`, {
    method: "PUT",
    cookie: SUPER_ADMIN_COOKIE,
    body: { role: "USER" },
  });
  if (superSelfRoleChange.status !== 403) {
    fail(`SUPER_ADMIN self role change must fail (${superSelfRoleChange.status}): ${superSelfRoleChange.text}`);
  }
  pass("SUPER_ADMIN cannot modify own platform role");

  const userRoleChangeBlocked = await request(`/api/admin/users/${encodeURIComponent(roleTargetUserId)}/role`, {
    method: "PUT",
    cookie: USER_COOKIE || undefined,
    body: { role: "OPS_ADMIN" },
  });
  if (userRoleChangeBlocked.status !== 403) {
    fail(`Non-platform user should be blocked from role endpoint (${userRoleChangeBlocked.status}): ${userRoleChangeBlocked.text}`);
  }
  pass("USER/non-platform request is blocked from role endpoint");

  console.log("Identity provisioning security test passed.");
}

run()
  .catch((error) => {
    fail(error instanceof Error ? error.message : "Unexpected error");
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
