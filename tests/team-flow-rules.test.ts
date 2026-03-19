import assert from "node:assert/strict";
import Module from "node:module";

type SessionUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
};

type MockSession = {
  user?: SessionUser | null;
} | null;

type MockContext = {
  orgId: string;
  role: "owner" | "admin" | "billing_admin" | "member";
  orgPlan: "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE" | null;
};

type RequireOrgResult =
  | {
      ok: true;
      context: MockContext;
    }
  | {
      ok: false;
      status: number;
      message: string;
      code?: string;
      context?: MockContext;
    };

type BusinessInviteRecord = {
  id: string;
  businessId: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "CANCELED";
  token?: string | null;
  tokenHash?: string | null;
  expiresAt?: Date | null;
  invitedById?: string | null;
  invitedByUserId?: string | null;
  acceptedAt?: Date | null;
  usedAt?: Date | null;
  createdAt?: Date;
};

type BusinessMemberRecord = {
  id: string;
  businessId: string;
  userId: string;
  role: string;
  status: "active" | "removed";
  joinedAt?: Date | null;
  createdAt?: Date;
};

type MockState = {
  session: MockSession;
  requireOrgPermission: RequireOrgResult;
  seatLimit: number | null;
  activeSeatCount: number;
  pendingInvites: Array<{
    id: string;
    email: string;
    role: string;
    createdAt: Date;
    expiresAt?: Date | null;
  }>;
  auditLogs: Array<{
    id: string;
    actionType?: string | null;
    action?: string | null;
    createdAt: Date;
    metadata?: Record<string, unknown> | null;
    targetUserId?: string | null;
    user?: { id?: string | null; name?: string | null; email?: string | null } | null;
  }>;
  businessMembers: BusinessMemberRecord[];
  businessInvite: BusinessInviteRecord | null;
  business: {
    id: string;
    plan: "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE";
    orgSubscription?: { planId: "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE" } | null;
  } | null;
  sentEmails: Array<{ to: string; subject: string }>;
  auditWrites: Array<{ actionType: string; orgId: string; targetUserId?: string | null }>;
  activityWrites: Array<{ action: string; resourceId: string }>;
};

const TEAM_ROUTE_PATH = "../app/api/team/route";
const INVITE_ACCEPT_ROUTE_PATH = "../app/api/team/invite/accept/route";

const defaultState = (): MockState => ({
  session: { user: { id: "user_owner", email: "owner@example.com", name: "Owner" } },
  requireOrgPermission: {
    ok: true,
    context: { orgId: "org_1", role: "owner", orgPlan: "PRO" },
  },
  seatLimit: 3,
  activeSeatCount: 1,
  pendingInvites: [],
  auditLogs: [],
  businessMembers: [],
  businessInvite: null,
  business: {
    id: "org_1",
    plan: "PRO",
    orgSubscription: { planId: "PRO" },
  },
  sentEmails: [],
  auditWrites: [],
  activityWrites: [],
});

const state = defaultState();
const originalLoad = Module._load;

function resetState() {
  const fresh = defaultState();
  state.session = fresh.session;
  state.requireOrgPermission = fresh.requireOrgPermission;
  state.seatLimit = fresh.seatLimit;
  state.activeSeatCount = fresh.activeSeatCount;
  state.pendingInvites = fresh.pendingInvites;
  state.auditLogs = fresh.auditLogs;
  state.businessMembers = fresh.businessMembers;
  state.businessInvite = fresh.businessInvite;
  state.business = fresh.business;
  state.sentEmails = fresh.sentEmails;
  state.auditWrites = fresh.auditWrites;
  state.activityWrites = fresh.activityWrites;
}

function installMocks() {
  const loader = Module._load as typeof Module._load & ((request: string, parent: NodeModule | null, isMain: boolean) => unknown);
  if ((loader as unknown as { __teamFlowMocksInstalled?: boolean }).__teamFlowMocksInstalled) return;

  Module._load = function mockLoad(request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === "next-auth") {
      return {
        getServerSession: async () => state.session,
      };
    }

    if (request === "@/lib/auth") {
      return { authOptions: {} };
    }

    if (request === "@/lib/email") {
      return {
        sendPlatformMail: async (input: { to: string; subject: string }) => {
          state.sentEmails.push({ to: input.to, subject: input.subject });
        },
      };
    }

    if (request === "@/lib/global-role") {
      return {
        isPlatformRole: () => false,
      };
    }

    if (request === "@/lib/team-activity") {
      return {
        TEAM_ACTIVITY_ACTION_TYPES: ["INVITE_CREATED", "INVITE_ACCEPTED", "MEMBER_REMOVED"],
        buildTeamActivityMessage: (input: { actionType?: string | null }) => `activity:${input.actionType || "unknown"}`,
      };
    }

    if (request === "@/emails/templates/team-invite") {
      return {
        buildTeamInviteSubject: () => "Workspace invite",
        renderTeamInviteEmail: () => ({ html: "<p>invite</p>", text: "invite" }),
      };
    }

    if (request === "@/lib/org-auth") {
      return {
        ACTIVE_ORG_COOKIE_NAME: "maboria_active_org",
        buildInviteToken: () => ({ rawToken: "raw_token", tokenHash: "hashed_token" }),
        hashInviteToken: (token: string) => `hash:${token}`,
        safeTokenCompare: (left: string, right: string) => left === right,
        normalizeOrgRole: (role?: string | null) => String(role || "member").toLowerCase(),
        hasOrgPermission: (role: string, permission: string) => {
          const normalizedRole = String(role || "").toLowerCase();
          if (normalizedRole === "owner") return true;
          if (normalizedRole === "admin") {
            return permission !== "subscription:manage";
          }
          if (normalizedRole === "billing_admin") {
            return permission === "team:read" || permission === "subscription:manage";
          }
          return permission === "team:read";
        },
        canManageSubscription: (role: string) => {
          const normalizedRole = String(role || "").toLowerCase();
          return normalizedRole === "owner" || normalizedRole === "billing_admin";
        },
        canAssignBillingAdmin: (role: string) => String(role || "").toLowerCase() === "owner",
        canActorChangeTargetRole: (actorRole: string, currentRole: string, nextRole: string) => {
          const actor = String(actorRole || "").toLowerCase();
          if (actor === "owner") return currentRole !== "owner";
          if (actor === "admin") return currentRole === "member" && (nextRole === "member" || nextRole === "admin");
          return false;
        },
        getSeatLimitForPlan: () => state.seatLimit,
        countActiveOrgSeats: async () => state.activeSeatCount,
        requireOrgPermission: async () => state.requireOrgPermission,
        writeOrgAuditLog: async (input: { actionType: string; orgId: string; targetUserId?: string | null }) => {
          state.auditWrites.push(input);
        },
      };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          businessMember: {
            findMany: async () => state.businessMembers,
            findUnique: async ({
              where,
            }: {
              where: { businessId_userId: { businessId: string; userId: string } };
            }) =>
              state.businessMembers.find(
                (member) =>
                  member.businessId === where.businessId_userId.businessId &&
                  member.userId === where.businessId_userId.userId
              ) || null,
            findFirst: async ({
              where,
            }: {
              where?: { id?: string; businessId?: string; status?: string };
            }) =>
              state.businessMembers.find((member) => {
                if (where?.id && member.id !== where.id) return false;
                if (where?.businessId && member.businessId !== where.businessId) return false;
                if (where?.status && member.status !== where.status) return false;
                return true;
              }) || null,
            count: async ({
              where,
            }: {
              where?: { businessId?: string; status?: string };
            }) =>
              state.businessMembers.filter((member) => {
                if (where?.businessId && member.businessId !== where.businessId) return false;
                if (where?.status && member.status !== where.status) return false;
                return true;
              }).length,
            update: async ({
              where,
              data,
            }: {
              where: { id: string };
              data: Partial<BusinessMemberRecord>;
            }) => {
              const target = state.businessMembers.find((member) => member.id === where.id);
              if (!target) throw new Error("Member not found");
              Object.assign(target, data);
              return target;
            },
            create: async ({ data }: { data: BusinessMemberRecord }) => {
              state.businessMembers.push(data);
              return data;
            },
          },
          businessInvite: {
            findMany: async () => state.pendingInvites,
            findFirst: async ({
              where,
            }: {
              where?: { id?: string; businessId?: string; status?: string };
            }) => {
              const invite = state.businessInvite;
              if (!invite) return null;
              if (where?.id && invite.id !== where.id) return null;
              if (where?.businessId && invite.businessId !== where.businessId) return null;
              if (where?.status && invite.status !== where.status) return null;
              return invite;
            },
            findUnique: async ({ where }: { where: { id: string } }) => {
              if (state.businessInvite?.id === where.id) return state.businessInvite;
              return null;
            },
            upsert: async ({
              update,
              create,
            }: {
              update: Partial<BusinessInviteRecord>;
              create: BusinessInviteRecord;
            }) => {
              state.businessInvite = state.businessInvite ? { ...state.businessInvite, ...update } : { ...create };
              return state.businessInvite;
            },
            update: async ({
              where,
              data,
            }: {
              where: { id: string };
              data: Partial<BusinessInviteRecord>;
            }) => {
              if (!state.businessInvite || state.businessInvite.id !== where.id) throw new Error("Invite not found");
              state.businessInvite = { ...state.businessInvite, ...data };
              return state.businessInvite;
            },
          },
          business: {
            findUnique: async () => state.business,
          },
          auditLog: {
            findMany: async () => state.auditLogs,
            create: async ({
              data,
            }: {
              data: { action: string; actionType: string; orgId: string; targetUserId?: string | null };
            }) => {
              state.auditWrites.push({
                actionType: data.actionType || data.action,
                orgId: data.orgId,
                targetUserId: data.targetUserId || null,
              });
              return { id: `audit_${state.auditWrites.length}` };
            },
          },
          user: {
            findUnique: async () => null,
            findMany: async () => [],
          },
          activityLog: {
            create: async ({ data }: { data: { action: string; resourceId: string } }) => {
              state.activityWrites.push({ action: data.action, resourceId: data.resourceId });
              return { id: `activity_${state.activityWrites.length}` };
            },
          },
          $transaction: async <T>(callback: (tx: Record<string, unknown>) => Promise<T>) =>
            callback({
              businessInvite: {
                findUnique: async ({ where }: { where: { id: string } }) => {
                  if (state.businessInvite?.id === where.id) return state.businessInvite;
                  return null;
                },
                update: async ({
                  where,
                  data,
                }: {
                  where: { id: string };
                  data: Partial<BusinessInviteRecord>;
                }) => {
                  if (!state.businessInvite || state.businessInvite.id !== where.id) throw new Error("Invite not found");
                  state.businessInvite = { ...state.businessInvite, ...data };
                  return state.businessInvite;
                },
              },
              business: {
                findUnique: async () => state.business,
              },
              businessMember: {
                findUnique: async ({
                  where,
                }: {
                  where: { businessId_userId: { businessId: string; userId: string } };
                }) =>
                  state.businessMembers.find(
                    (member) =>
                      member.businessId === where.businessId_userId.businessId &&
                      member.userId === where.businessId_userId.userId
                  ) || null,
                count: async ({
                  where,
                }: {
                  where?: { businessId?: string; status?: string };
                }) =>
                  state.businessMembers.filter((member) => {
                    if (where?.businessId && member.businessId !== where.businessId) return false;
                    if (where?.status && member.status !== where.status) return false;
                    return true;
                  }).length,
                create: async ({ data }: { data: BusinessMemberRecord }) => {
                  state.businessMembers.push(data);
                  return data;
                },
                update: async ({
                  where,
                  data,
                }: {
                  where: { id: string };
                  data: Partial<BusinessMemberRecord>;
                }) => {
                  const target = state.businessMembers.find((member) => member.id === where.id);
                  if (!target) throw new Error("Member not found");
                  Object.assign(target, data);
                  return target;
                },
              },
              activityLog: {
                create: async ({ data }: { data: { action: string; resourceId: string } }) => {
                  state.activityWrites.push({ action: data.action, resourceId: data.resourceId });
                  return { id: `activity_${state.activityWrites.length}` };
                },
              },
              auditLog: {
                create: async ({
                  data,
                }: {
                  data: { action: string; actionType: string; orgId: string; targetUserId?: string | null };
                }) => {
                  state.auditWrites.push({
                    actionType: data.actionType || data.action,
                    orgId: data.orgId,
                    targetUserId: data.targetUserId || null,
                  });
                  return { id: `audit_${state.auditWrites.length}` };
                },
              },
            }),
        },
      };
    }

    return originalLoad.apply(this, [request, parent, isMain]);
  };

  (Module._load as typeof Module._load & { __teamFlowMocksInstalled?: boolean }).__teamFlowMocksInstalled = true;
}

function clearRouteCaches() {
  for (const path of [TEAM_ROUTE_PATH, INVITE_ACCEPT_ROUTE_PATH]) {
    try {
      delete require.cache[require.resolve(path)];
    } catch {
      // ignore cache miss
    }
  }
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function testTeamGetHidesOperationsForMembers() {
  resetState();
  state.requireOrgPermission = {
    ok: true,
    context: { orgId: "org_1", role: "member", orgPlan: "PRO" },
  };
  state.pendingInvites = [
    { id: "invite_1", email: "pending@example.com", role: "member", createdAt: new Date("2026-03-19T09:00:00.000Z") },
  ];
  state.auditLogs = [
    {
      id: "audit_1",
      actionType: "INVITE_CREATED",
      createdAt: new Date("2026-03-19T10:00:00.000Z"),
      user: { id: "user_owner", name: "Owner", email: "owner@example.com" },
    },
  ];

  clearRouteCaches();
  const { GET } = require(TEAM_ROUTE_PATH) as { GET: () => Promise<Response> };
  const response = await GET();
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(json.pendingInvites, [], "plain members should not receive pending invites");
  assert.deepEqual(json.recentActivity, [], "plain members should not receive team activity");
  assert.equal((json.permissions as Record<string, unknown>).canViewTeamOperations, false);
}

async function testTeamGetExposesOperationsForOwners() {
  resetState();
  state.requireOrgPermission = {
    ok: true,
    context: { orgId: "org_1", role: "owner", orgPlan: "PRO" },
  };
  state.pendingInvites = [
    { id: "invite_1", email: "pending@example.com", role: "member", createdAt: new Date("2026-03-19T09:00:00.000Z") },
  ];
  state.auditLogs = [
    {
      id: "audit_1",
      actionType: "INVITE_CREATED",
      createdAt: new Date("2026-03-19T10:00:00.000Z"),
      user: { id: "user_owner", name: "Owner", email: "owner@example.com" },
    },
  ];

  clearRouteCaches();
  const { GET } = require(TEAM_ROUTE_PATH) as { GET: () => Promise<Response> };
  const response = await GET();
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal((json.pendingInvites as Array<unknown>).length, 1, "owners should receive pending invites");
  assert.equal((json.recentActivity as Array<unknown>).length, 1, "owners should receive recent activity");
  assert.equal((json.permissions as Record<string, unknown>).canViewTeamOperations, true);
}

async function testInvitePostBlocksOnSeatLimit() {
  resetState();
  state.requireOrgPermission = {
    ok: true,
    context: { orgId: "org_1", role: "owner", orgPlan: "STARTER" },
  };
  state.seatLimit = 1;
  state.activeSeatCount = 1;

  clearRouteCaches();
  const { POST } = require(TEAM_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team", {
      method: "POST",
      body: JSON.stringify({ email: "new.member@example.com", role: "member" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(json.code, "SEAT_LIMIT_REACHED");
  assert.equal(state.sentEmails.length, 0, "seat-limit failures must not send email");
}

async function testInvitePostRestrictsBillingAdminToOwners() {
  resetState();
  state.requireOrgPermission = {
    ok: true,
    context: { orgId: "org_1", role: "admin", orgPlan: "PRO" },
  };

  clearRouteCaches();
  const { POST } = require(TEAM_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team", {
      method: "POST",
      body: JSON.stringify({ email: "billing.admin@example.com", role: "billing_admin" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 403);
  assert.match(String(json.error || ""), /Only owners can assign Billing Admin/i);
}

async function testInviteAcceptRejectsWrongEmail() {
  resetState();
  state.session = { user: { id: "user_member", email: "wrong@example.com", name: "Wrong User" } };
  state.businessInvite = {
    id: "invite_1",
    businessId: "org_1",
    email: "invited@example.com",
    role: "member",
    status: "PENDING",
    tokenHash: "hash:raw_token",
    token: "hash:raw_token",
    expiresAt: new Date("2026-03-26T09:00:00.000Z"),
    createdAt: new Date("2026-03-19T09:00:00.000Z"),
  };

  clearRouteCaches();
  const { POST } = require(INVITE_ACCEPT_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team/invite/accept", {
      method: "POST",
      body: JSON.stringify({ inviteToken: "raw_token" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error || ""), /different email address/i);
}

async function testInviteAcceptIsIdempotentForJoinedMember() {
  resetState();
  state.session = { user: { id: "user_member", email: "joined@example.com", name: "Joined User" } };
  state.businessInvite = {
    id: "invite_1",
    businessId: "org_1",
    email: "joined@example.com",
    role: "member",
    status: "ACCEPTED",
    tokenHash: "hash:raw_token",
    token: "hash:raw_token",
    expiresAt: new Date("2026-03-26T09:00:00.000Z"),
    createdAt: new Date("2026-03-19T09:00:00.000Z"),
  };
  state.businessMembers = [
    {
      id: "member_1",
      businessId: "org_1",
      userId: "user_member",
      role: "member",
      status: "active",
      joinedAt: new Date("2026-03-19T10:00:00.000Z"),
      createdAt: new Date("2026-03-19T10:00:00.000Z"),
    },
  ];

  clearRouteCaches();
  const { POST } = require(INVITE_ACCEPT_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team/invite/accept", {
      method: "POST",
      body: JSON.stringify({ inviteToken: "raw_token" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.alreadyJoined, true);
  assert.equal(json.redirectTo, "/dashboard");
  assert.match(String(response.headers.get("set-cookie") || ""), /maboria_active_org=org_1/i);
}

async function testInviteAcceptBlocksAtSeatLimit() {
  resetState();
  state.session = { user: { id: "user_member", email: "invited@example.com", name: "Invited User" } };
  state.businessInvite = {
    id: "invite_1",
    businessId: "org_1",
    email: "invited@example.com",
    role: "member",
    status: "PENDING",
    tokenHash: "hash:raw_token",
    token: "hash:raw_token",
    expiresAt: new Date("2026-03-26T09:00:00.000Z"),
    createdAt: new Date("2026-03-19T09:00:00.000Z"),
  };
  state.business = {
    id: "org_1",
    plan: "STARTER",
    orgSubscription: { planId: "STARTER" },
  };
  state.seatLimit = 1;
  state.businessMembers = [
    {
      id: "member_owner",
      businessId: "org_1",
      userId: "user_owner",
      role: "owner",
      status: "active",
      joinedAt: new Date("2026-03-18T09:00:00.000Z"),
      createdAt: new Date("2026-03-18T09:00:00.000Z"),
    },
  ];

  clearRouteCaches();
  const { POST } = require(INVITE_ACCEPT_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team/invite/accept", {
      method: "POST",
      body: JSON.stringify({ inviteToken: "raw_token" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(json.code, "TEAM_SEAT_LIMIT_REACHED");
}

async function testInviteAcceptCreatesMemberAndCookie() {
  resetState();
  state.session = { user: { id: "user_member", email: "invited@example.com", name: "Invited User" } };
  state.businessInvite = {
    id: "invite_1",
    businessId: "org_1",
    email: "invited@example.com",
    role: "member",
    status: "PENDING",
    tokenHash: "hash:raw_token",
    token: "hash:raw_token",
    expiresAt: new Date("2026-03-26T09:00:00.000Z"),
    invitedById: "user_owner",
    invitedByUserId: "user_owner",
    createdAt: new Date("2026-03-19T09:00:00.000Z"),
  };
  state.business = {
    id: "org_1",
    plan: "PRO",
    orgSubscription: { planId: "PRO" },
  };
  state.seatLimit = 3;
  state.businessMembers = [
    {
      id: "member_owner",
      businessId: "org_1",
      userId: "user_owner",
      role: "owner",
      status: "active",
      joinedAt: new Date("2026-03-18T09:00:00.000Z"),
      createdAt: new Date("2026-03-18T09:00:00.000Z"),
    },
  ];

  clearRouteCaches();
  const { POST } = require(INVITE_ACCEPT_ROUTE_PATH) as { POST: (req: Request) => Promise<Response> };
  const response = await POST(
    new Request("http://localhost/api/team/invite/accept", {
      method: "POST",
      body: JSON.stringify({ inviteToken: "raw_token" }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.accepted, true);
  assert.equal(json.redirectTo, "/dashboard");
  assert.equal(state.businessMembers.length, 2, "invite acceptance should create an active member");
  assert.equal(state.businessInvite?.status, "ACCEPTED", "invite should be marked accepted");
  assert.equal(state.activityWrites[0]?.action, "TEAM_INVITE_ACCEPTED");
  assert.match(String(response.headers.get("set-cookie") || ""), /maboria_active_org=org_1/i);
}

async function run() {
  installMocks();

  await testTeamGetHidesOperationsForMembers();
  await testTeamGetExposesOperationsForOwners();
  await testInvitePostBlocksOnSeatLimit();
  await testInvitePostRestrictsBillingAdminToOwners();
  await testInviteAcceptRejectsWrongEmail();
  await testInviteAcceptIsIdempotentForJoinedMember();
  await testInviteAcceptBlocksAtSeatLimit();
  await testInviteAcceptCreatesMemberAndCookie();

  console.log("team flow rule checks passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    Module._load = originalLoad;
  });
