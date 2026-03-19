import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type CreatedFixture = {
  adminId: string;
  subscriberId: string;
  flowId: string;
  failedRootId: string;
  successRootId: string;
  limitRootId: string;
};

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;

if (!ADMIN_COOKIE) {
  throw new Error('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
}

const makeRunOutput = (input: Record<string, unknown>) =>
  ({
    trigger: "Test",
    source: "TestSuite",
    input,
    idempotencyKey: null,
    originalRunId: null,
    event: null,
    flowSnapshot: {
      title: "Automation Recovery Fixture",
      description: "Fixture flow",
      steps: [{ type: "parseText" }],
      updatedAt: new Date().toISOString(),
    },
    resumeState: {
      lastCompletedStepIndex: -1,
      retryState: {},
      updatedAt: new Date().toISOString(),
      nextStepIndex: undefined,
      nextRunAt: null,
    },
  }) as Prisma.InputJsonValue;

async function request(path: string, method = "GET") {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Cookie: ADMIN_COOKIE! },
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

async function seedFixture(): Promise<CreatedFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const admin = await prisma.user.create({
    data: {
      name: `Automation Admin ${suffix}`,
      email: `automation-admin-${suffix}@example.test`,
      passwordHash: "test",
      role: "OPS_ADMIN",
      status: "ACTIVE",
      isPlatformUser: true,
    },
  });

  const subscriber = await prisma.user.create({
    data: {
      name: `Automation Subscriber ${suffix}`,
      email: `automation-subscriber-${suffix}@example.test`,
      passwordHash: "test",
      role: "USER",
      status: "ACTIVE",
    },
  });

  const flow = await prisma.automationFlow.create({
    data: {
      userId: subscriber.id,
      title: `Automation Recovery ${suffix}`,
      description: "Fixture flow for replay hardening",
      status: "ACTIVE",
      steps: [{ type: "parseText" }],
    },
  });

  const baseCreatedAt = new Date(Date.now() - 20 * 60 * 1000);
  const failedRoot = await prisma.automationRun.create({
    data: {
      flowId: flow.id,
      userId: subscriber.id,
      runStatus: "FAILED",
      recoveryStatus: "FAILED",
      retryCount: 0,
      logs: [
        {
          timestamp: baseCreatedAt.toISOString(),
          step: "callApi",
          stepId: "step-api",
          stepIndex: 0,
          result: "failed",
          transient: true,
          error: "timeout",
        },
      ],
      output: makeRunOutput({ text: "first failed run" }),
      createdAt: baseCreatedAt,
    },
  });

  await prisma.automationRun.create({
    data: {
      flowId: flow.id,
      userId: subscriber.id,
      runStatus: "FAILED",
      recoveryStatus: "FAILED",
      retryCount: 0,
      logs: [
        {
          timestamp: new Date(baseCreatedAt.getTime() + 60_000).toISOString(),
          step: "sendEmail",
          stepId: "step-email",
          stepIndex: 0,
          result: "failed",
          transient: true,
          error: "network error",
        },
      ],
      output: makeRunOutput({ text: "second failed run" }),
      createdAt: new Date(baseCreatedAt.getTime() + 60_000),
    },
  });

  const successRoot = await prisma.automationRun.create({
    data: {
      flowId: flow.id,
      userId: subscriber.id,
      runStatus: "SUCCESS",
      recoveryStatus: "RESOLVED",
      retryCount: 1,
      logs: [],
      output: makeRunOutput({ text: "already success" }),
      createdAt: new Date(baseCreatedAt.getTime() + 120_000),
    },
  });

  const limitRoot = await prisma.automationRun.create({
    data: {
      flowId: flow.id,
      userId: subscriber.id,
      runStatus: "FAILED",
      recoveryStatus: "FAILED",
      retryCount: 5,
      lastRetryAt: new Date(baseCreatedAt.getTime() - 60_000),
      logs: [],
      output: makeRunOutput({ text: "retry limited" }),
      createdAt: new Date(baseCreatedAt.getTime() + 180_000),
    },
  });

  return {
    adminId: admin.id,
    subscriberId: subscriber.id,
    flowId: flow.id,
    failedRootId: failedRoot.id,
    successRootId: successRoot.id,
    limitRootId: limitRoot.id,
  };
}

async function cleanupFixture(fixture: CreatedFixture) {
  const runIds = (
    await prisma.automationRun.findMany({
      where: { flowId: fixture.flowId },
      select: { id: true },
    })
  ).map((row) => row.id);
  await prisma.automationStepExecution.deleteMany({
    where: {
      OR: [{ runId: { in: runIds } }, { originalRunId: { in: runIds } }],
    },
  });
  await prisma.automationRunError.deleteMany({ where: { flowId: fixture.flowId } });
  await prisma.automationRun.deleteMany({ where: { flowId: fixture.flowId } });
  await prisma.automationFlow.delete({ where: { id: fixture.flowId } });
  await prisma.activityLog.deleteMany({
    where: {
      userId: { in: [fixture.adminId, fixture.subscriberId] },
    },
  });
  await prisma.user.delete({ where: { id: fixture.adminId } });
  await prisma.user.delete({ where: { id: fixture.subscriberId } });
}

async function run() {
  const fixture = await seedFixture();
  try {
    const firstPage = await request(
      `/api/admin/automation/errors?flowId=${encodeURIComponent(fixture.flowId)}&pageSize=1&range=7d&sort=created_desc`
    );
    assert.equal(firstPage.status, 200, `list page 1 failed: ${firstPage.text}`);
    assert.equal(firstPage.json.items.length, 1, "first page should contain one run");
    assert.equal(firstPage.json.hasMore, true, "first page should have next page");
    assert.ok(firstPage.json.nextCursor, "first page should expose cursor");

    const secondPage = await request(
      `/api/admin/automation/errors?flowId=${encodeURIComponent(fixture.flowId)}&pageSize=1&range=7d&sort=created_desc&cursor=${encodeURIComponent(firstPage.json.nextCursor)}`
    );
    assert.equal(secondPage.status, 200, `list page 2 failed: ${secondPage.text}`);
    assert.equal(secondPage.json.items.length, 1, "second page should contain one run");
    assert.notEqual(secondPage.json.items[0]?.id, firstPage.json.items[0]?.id, "cursor should move forward");

    const replaySuccessRun = await request(`/api/admin/automation/errors/${fixture.successRootId}/replay`, "POST");
    assert.equal(replaySuccessRun.status, 409, "replay should be blocked for successful runs");
    assert.equal(replaySuccessRun.json?.code, "RUN_ALREADY_RESOLVED");

    const replayLimitedRun = await request(`/api/admin/automation/errors/${fixture.limitRootId}/replay`, "POST");
    assert.equal(replayLimitedRun.status, 409, "replay should be blocked at retry limit");
    assert.equal(replayLimitedRun.json?.code, "REPLAY_LIMIT_REACHED");

    const replayFailedRun = await request(`/api/admin/automation/errors/${fixture.failedRootId}/replay`, "POST");
    assert.equal(replayFailedRun.status, 200, `replay failed: ${replayFailedRun.text}`);
    const replayRunId = String(replayFailedRun.json?.replayRunId || "").trim();
    assert.ok(replayRunId, "replay response should include replayRunId");

    const createdReplay = await prisma.automationRun.findUnique({
      where: { id: replayRunId },
      select: { id: true, originalRunId: true },
    });
    assert.ok(createdReplay, "replay run should exist");
    assert.equal(createdReplay?.originalRunId, fixture.failedRootId, "replay should link originalRunId");

    const updatedRoot = await prisma.automationRun.findUnique({
      where: { id: fixture.failedRootId },
      select: { retryCount: true },
    });
    assert.equal(updatedRoot?.retryCount, 1, "retryCount should increment after replay");

    const replayAudit = await prisma.activityLog.findFirst({
      where: {
        action: "AUTOMATION_RUN_REPLAYED",
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(replayAudit, "replay audit event should be created");
    const metadata =
      replayAudit && replayAudit.metadata && typeof replayAudit.metadata === "object"
        ? (replayAudit.metadata as Record<string, unknown>)
        : {};
    assert.equal(metadata.runId, fixture.failedRootId, "audit event should reference root run");

    console.log("ok admin automation errors integration checks passed");
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
