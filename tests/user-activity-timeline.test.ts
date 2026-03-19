import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { logUserActivity } from "../lib/user-activity";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE || "";
const USER_COOKIE = process.env.USER_SESSION_COOKIE || "";

type Fixture = {
  adminActorId: string;
  ownerAId: string;
  ownerBId: string;
  userAId: string;
  userBId: string;
  businessAId: string;
  businessBId: string;
};

function fail(message: string): never {
  throw new Error(message);
}

async function request(path: string, cookie: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedFixture(adminActorId: string): Promise<Fixture> {
  const suffix = uniqueSuffix();
  const ownerA = await prisma.user.create({
    data: {
      name: `Timeline Owner A ${suffix}`,
      email: `timeline-owner-a-${suffix}@example.test`,
      passwordHash: "test",
      role: "USER",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const ownerB = await prisma.user.create({
    data: {
      name: `Timeline Owner B ${suffix}`,
      email: `timeline-owner-b-${suffix}@example.test`,
      passwordHash: "test",
      role: "USER",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const userA = await prisma.user.create({
    data: {
      name: `Timeline User A ${suffix}`,
      email: `timeline-user-a-${suffix}@example.test`,
      passwordHash: "test",
      role: "USER",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const userB = await prisma.user.create({
    data: {
      name: `Timeline User B ${suffix}`,
      email: `timeline-user-b-${suffix}@example.test`,
      passwordHash: "test",
      role: "USER",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const businessA = await prisma.business.create({
    data: {
      name: `Timeline Tenant A ${suffix}`,
      ownerId: ownerA.id,
    },
    select: { id: true },
  });
  const businessB = await prisma.business.create({
    data: {
      name: `Timeline Tenant B ${suffix}`,
      ownerId: ownerB.id,
    },
    select: { id: true },
  });

  await prisma.businessMember.createMany({
    data: [
      { businessId: businessA.id, userId: ownerA.id, role: "owner", status: "active" },
      { businessId: businessA.id, userId: adminActorId, role: "admin", status: "active" },
      { businessId: businessA.id, userId: userA.id, role: "member", status: "active" },
      { businessId: businessB.id, userId: ownerB.id, role: "owner", status: "active" },
      { businessId: businessB.id, userId: userB.id, role: "member", status: "active" },
    ],
  });

  await logUserActivity({
    tenantId: businessA.id,
    userId: userA.id,
    actorId: adminActorId,
    eventType: "login",
    metadata: { source: "test-login" },
  });
  await logUserActivity({
    tenantId: businessA.id,
    userId: userA.id,
    actorId: adminActorId,
    eventType: "invoice_created",
    metadata: { invoice_id: "inv_test_001" },
  });

  return {
    adminActorId,
    ownerAId: ownerA.id,
    ownerBId: ownerB.id,
    userAId: userA.id,
    userBId: userB.id,
    businessAId: businessA.id,
    businessBId: businessB.id,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await prisma.userActivityLog.deleteMany({
    where: {
      userId: { in: [fixture.userAId, fixture.userBId] },
    },
  });

  await prisma.businessMember.deleteMany({
    where: {
      businessId: { in: [fixture.businessAId, fixture.businessBId] },
    },
  });

  await prisma.business.deleteMany({
    where: { id: { in: [fixture.businessAId, fixture.businessBId] } },
  });

  await prisma.user.deleteMany({
    where: {
      id: { in: [fixture.ownerAId, fixture.ownerBId, fixture.userAId, fixture.userBId] },
    },
  });
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }

  const me = await request("/api/user/me", ADMIN_COOKIE);
  if (me.status !== 200 || !me.json?.id) {
    fail(`Could not resolve admin actor from /api/user/me (${me.status}): ${me.text}`);
  }

  const fixture = await seedFixture(String(me.json.id));
  try {
    const pageOne = await request(
      `/api/admin/users/${encodeURIComponent(fixture.userAId)}/activity?page=1&pageSize=1`,
      ADMIN_COOKIE
    );
    assert.equal(pageOne.status, 200, `admin timeline page 1 failed: ${pageOne.text}`);
    assert.equal(pageOne.json?.items?.length, 1, "page one should return one event");
    assert.equal(pageOne.json?.pagination?.totalItems, 2, "total should include seeded events");
    assert.equal(pageOne.json?.pagination?.hasMore, true, "page one should have more pages");

    const pageTwo = await request(
      `/api/admin/users/${encodeURIComponent(fixture.userAId)}/activity?page=2&pageSize=1`,
      ADMIN_COOKIE
    );
    assert.equal(pageTwo.status, 200, `admin timeline page 2 failed: ${pageTwo.text}`);
    assert.equal(pageTwo.json?.items?.length, 1, "page two should return one event");
    assert.notEqual(pageOne.json?.items?.[0]?.id, pageTwo.json?.items?.[0]?.id, "pagination should move cursor");

    const cursorPageOne = await request(
      `/api/admin/users/${encodeURIComponent(fixture.userAId)}/activity?cursorMode=1&pageSize=1`,
      ADMIN_COOKIE
    );
    assert.equal(cursorPageOne.status, 200, `admin cursor page 1 failed: ${cursorPageOne.text}`);
    assert.equal(cursorPageOne.json?.items?.length, 1, "cursor page one should return one event");
    assert.equal(cursorPageOne.json?.pagination?.mode, "cursor", "cursor mode must be returned");
    assert.ok(cursorPageOne.json?.pagination?.nextCursor, "cursor page one should provide next cursor");

    const cursorPageTwo = await request(
      `/api/admin/users/${encodeURIComponent(fixture.userAId)}/activity?cursorMode=1&pageSize=1&cursor=${encodeURIComponent(String(cursorPageOne.json?.pagination?.nextCursor || ""))}`,
      ADMIN_COOKIE
    );
    assert.equal(cursorPageTwo.status, 200, `admin cursor page 2 failed: ${cursorPageTwo.text}`);
    assert.equal(cursorPageTwo.json?.items?.length, 1, "cursor page two should return one event");
    assert.notEqual(
      cursorPageOne.json?.items?.[0]?.id,
      cursorPageTwo.json?.items?.[0]?.id,
      "cursor pagination should move to next row"
    );

    const adminCrossTenantRead = await request(
      `/api/admin/users/${encodeURIComponent(fixture.userBId)}/activity?page=1&pageSize=10`,
      ADMIN_COOKIE
    );
    assert.equal(adminCrossTenantRead.status, 200, `platform admin cross-tenant read failed: ${adminCrossTenantRead.text}`);

    if (SUPER_ADMIN_COOKIE) {
      const superAdminRead = await request(
        `/api/admin/users/${encodeURIComponent(fixture.userBId)}/activity?page=1&pageSize=10`,
        SUPER_ADMIN_COOKIE
      );
      assert.equal(superAdminRead.status, 200, `super admin cross-tenant read failed: ${superAdminRead.text}`);
    }

    if (USER_COOKIE) {
      const userRead = await request(
        `/api/admin/users/${encodeURIComponent(fixture.userAId)}/activity?page=1&pageSize=10`,
        USER_COOKIE
      );
      assert.equal(userRead.status, 403, `subscriber user should be forbidden: ${userRead.text}`);
    }

    console.log("ok user activity timeline integration checks passed");
  } finally {
    await cleanupFixture(fixture).catch((error) => {
      console.error("cleanup failed", error);
    });
  }
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
