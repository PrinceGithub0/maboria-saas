import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { emitSystemEvent, shouldSeedDevelopmentSystemEvents } from "../lib/system-events";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OPS_ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const SUPER_ADMIN_COOKIE = process.env.SUPER_ADMIN_SESSION_COOKIE;
const USER_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;

type Fixture = {
  tenantAId: string;
  tenantBId: string;
  userAId: string;
  userBId: string;
  createdEventIds: string[];
  invoiceEntityId: string;
  automationEntityId: string;
  ticketEntityId: string;
  requestIds: string[];
};

async function request(path: string, cookie?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function seedFixture(): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        name: `Events Owner A ${suffix}`,
        email: `events-owner-a-${suffix}@example.test`,
        passwordHash: "test",
        role: "USER",
        status: "ACTIVE",
      },
    }),
    prisma.user.create({
      data: {
        name: `Events Owner B ${suffix}`,
        email: `events-owner-b-${suffix}@example.test`,
        passwordHash: "test",
        role: "USER",
        status: "ACTIVE",
      },
    }),
  ]);

  const [tenantA, tenantB] = await Promise.all([
    prisma.business.create({
      data: {
        name: `Events Tenant A ${suffix}`,
        ownerId: ownerA.id,
        plan: "PRO",
      },
    }),
    prisma.business.create({
      data: {
        name: `Events Tenant B ${suffix}`,
        ownerId: ownerB.id,
        plan: "GROWTH",
      },
    }),
  ]);

  const eventIds: string[] = [];
  const invoiceEntityId = `inv-${suffix}-1`;
  const automationEntityId = `run-${suffix}-1`;
  const ticketEntityId = `ticket-${suffix}`;
  const requestIds = [`req-${suffix}-1`, `req-${suffix}-2`, `req-${suffix}-3`];

  await emitSystemEvent({
    tenantId: tenantA.id,
    userId: ownerA.id,
    actorId: ownerA.id,
    eventType: "payment_failed",
    severity: "WARNING",
    source: "BILLING",
    entityType: "invoice",
    entityId: invoiceEntityId,
    requestId: requestIds[0],
    message: "Invoice payment failed for tenant A.",
    metadata: {
      token: "secret-token-value",
      password: "do-not-store",
      invoiceId: invoiceEntityId,
    },
  });

  await emitSystemEvent({
    tenantId: tenantB.id,
    userId: ownerB.id,
    actorId: ownerB.id,
    eventType: "automation_run_failed",
    severity: "CRITICAL",
    source: "AUTOMATION",
    entityType: "automation_run",
    entityId: automationEntityId,
    requestId: requestIds[1],
    message: "Automation run failed for tenant B.",
    metadata: {
      flowId: `flow-${suffix}`,
      access_token: "very-secret-token",
    },
  });

  await emitSystemEvent({
    tenantId: tenantA.id,
    userId: ownerA.id,
    actorId: ownerA.id,
    eventType: "ticket_created",
    severity: "INFO",
    source: "SUPPORT",
    entityType: "support_ticket",
    entityId: ticketEntityId,
    requestId: requestIds[2],
    message: "Support ticket created for tenant A.",
    metadata: {
      ticketId: ticketEntityId,
    },
  });

  const created = await prisma.systemEvent.findMany({
    where: {
      OR: requestIds.map((requestId) => ({ requestId })),
    },
    select: { id: true },
  });
  eventIds.push(...created.map((row) => row.id));

  return {
    tenantAId: tenantA.id,
    tenantBId: tenantB.id,
    userAId: ownerA.id,
    userBId: ownerB.id,
    createdEventIds: eventIds,
    invoiceEntityId,
    automationEntityId,
    ticketEntityId,
    requestIds,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await prisma.systemEvent.deleteMany({ where: { id: { in: fixture.createdEventIds } } });
  await prisma.business.deleteMany({ where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.userAId, fixture.userBId] } } });
}

async function run() {
  assert.equal(shouldSeedDevelopmentSystemEvents("production"), false, "production must not seed dev events");
  assert.equal(shouldSeedDevelopmentSystemEvents("development"), true, "development may seed dev events");

  assert.ok(OPS_ADMIN_COOKIE, "Missing ADMIN_SESSION_COOKIE");
  assert.ok(SUPER_ADMIN_COOKIE, "Missing SUPER_ADMIN_SESSION_COOKIE");
  assert.ok(USER_COOKIE, "Missing NON_ADMIN_SESSION_COOKIE or USER_SESSION_COOKIE");

  const fixture = await seedFixture();

  try {
    const denied = await request("/api/admin/events", USER_COOKIE);
    assert.equal(denied.status, 403, `tenant admin/user should be blocked: ${denied.text}`);

    const superAll = await request("/api/admin/events?limit=10", SUPER_ADMIN_COOKIE);
    assert.equal(superAll.status, 200, `super admin list failed: ${superAll.text}`);
    const tenantIds = new Set((superAll.json?.items || []).map((item: any) => item?.tenant?.id).filter(Boolean));
    assert.ok(tenantIds.has(fixture.tenantAId), "SUPER_ADMIN should see tenant A events");
    assert.ok(tenantIds.has(fixture.tenantBId), "SUPER_ADMIN should see tenant B events");

    const opsAll = await request("/api/admin/events?limit=10", OPS_ADMIN_COOKIE);
    assert.equal(opsAll.status, 200, `ops admin list failed: ${opsAll.text}`);
    const opsTenantIds = new Set((opsAll.json?.items || []).map((item: any) => item?.tenant?.id).filter(Boolean));
    assert.ok(opsTenantIds.has(fixture.tenantAId), "OPS_ADMIN should see tenant A events under current platform-wide policy");
    assert.ok(opsTenantIds.has(fixture.tenantBId), "OPS_ADMIN should see tenant B events under current platform-wide policy");

    const byEntity = await request(`/api/admin/events?entityId=${encodeURIComponent(fixture.ticketEntityId)}`, SUPER_ADMIN_COOKIE);
    assert.equal(byEntity.status, 200, `entity filter failed: ${byEntity.text}`);
    assert.ok(
      (byEntity.json?.items || []).some((item: any) => item.entityId === fixture.ticketEntityId),
      "entity filter should return the matching ticket event"
    );

    const entitySearch = await request(
      `/api/admin/events?q=${encodeURIComponent(`inv-`)}`,
      SUPER_ADMIN_COOKIE
    );
    assert.equal(entitySearch.status, 200, `search query failed: ${entitySearch.text}`);
    assert.ok(
      (entitySearch.json?.items || []).some((item: any) => String(item?.entityId || "").includes("inv-")),
      "search should match entity id"
    );

    const severityFiltered = await request("/api/admin/events?severity=CRITICAL&limit=10", SUPER_ADMIN_COOKIE);
    assert.equal(severityFiltered.status, 200, `severity filter failed: ${severityFiltered.text}`);
    assert.ok(
      (severityFiltered.json?.items || []).every((item: any) => item.severity === "CRITICAL"),
      "severity filter should only return critical events"
    );

    const paged = await request("/api/admin/events?limit=1", SUPER_ADMIN_COOKIE);
    assert.equal(paged.status, 200, `pagination page one failed: ${paged.text}`);
    assert.ok(paged.json?.nextCursor, "first page should include nextCursor");
    const pagedNext = await request(
      `/api/admin/events?limit=1&cursor=${encodeURIComponent(String(paged.json?.nextCursor || ""))}`,
      SUPER_ADMIN_COOKIE
    );
    assert.equal(pagedNext.status, 200, `pagination page two failed: ${pagedNext.text}`);
    assert.notEqual(paged.json?.items?.[0]?.id, pagedNext.json?.items?.[0]?.id, "cursor should advance");

    const allMetadata = (superAll.json?.items || []).flatMap((item: any) => [JSON.stringify(item.metadata || {})]).join(" ");
    assert.ok(!allMetadata.includes("secret-token-value"), "token must be redacted");
    assert.ok(!allMetadata.includes("very-secret-token"), "access token must be redacted");
    assert.ok(!allMetadata.includes("do-not-store"), "password must be redacted");
    assert.ok(allMetadata.includes("[REDACTED]"), "redacted marker should be present");

    console.log("ok admin events explorer integration checks passed");
  } finally {
    await cleanupFixture(fixture);
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
