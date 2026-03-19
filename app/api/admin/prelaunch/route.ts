import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { env } from "@/lib/env";
import { sendInfoMail } from "@/lib/email";
import { getActorSystemFlagRole } from "@/lib/system-flags";

type CheckStatus = "ok" | "pending" | "fail";

const EMAIL_COOLDOWN_MINUTES = 30;
const PRELAUNCH_RUN_LIMIT = { count: 8, windowMs: 10 * 60 * 1000 };

function isLikelyLiveSecret(value?: string | null) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return !["dummy", "test", "sandbox", "example", "placeholder", "changeme"].some((needle) =>
    normalized.includes(needle)
  );
}

function buildChecklist(input: {
  dbStatus: CheckStatus;
  loggingStatus: CheckStatus;
  emailStatus: CheckStatus;
  webhooksStatus: CheckStatus;
  billingLiveStatus: CheckStatus;
}) {
  return [
    { item: "API health", status: "ok" as const },
    { item: "Database", status: input.dbStatus },
    { item: "Webhooks configured", status: input.webhooksStatus },
    { item: "Billing live mode", status: input.billingLiveStatus },
    { item: "Emails sending", status: input.emailStatus },
    { item: "Admin panel", status: "ok" as const },
    { item: "Logging/Monitoring", status: input.loggingStatus },
  ];
}

async function resolveEmailSnapshotStatus(userId: string): Promise<CheckStatus> {
  const emailConfigured = Boolean(env.resendApiKey && env.emailFrom);
  if (!emailConfigured) return "pending";

  const recent = await prisma.activityLog.findFirst({
    where: {
      userId,
      action: { in: ["prelaunch_email_sent", "prelaunch_email_failed"] },
    },
    orderBy: { timestamp: "desc" },
    select: { action: true, timestamp: true },
  });

  if (!recent) return "pending";
  if (recent.action === "prelaunch_email_failed") return "fail";

  const cutoff = Date.now() - EMAIL_COOLDOWN_MINUTES * 60 * 1000;
  return recent.timestamp.getTime() >= cutoff ? "ok" : "pending";
}

async function resolveLoggingSnapshotStatus(userId: string): Promise<CheckStatus> {
  const recent = await prisma.activityLog.findFirst({
    where: { action: "prelaunch_log_check", userId },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true },
  });
  if (!recent) return "pending";

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return recent.timestamp.getTime() >= cutoff ? "ok" : "pending";
}

function resolveWebhooksStatus(): CheckStatus {
  const hasPaystack = isLikelyLiveSecret(env.paystackWebhookSecret);
  const hasFlutterwave = isLikelyLiveSecret(env.flutterwaveWebhookSecret);
  return hasPaystack || hasFlutterwave ? "ok" : "pending";
}

function resolveBillingLiveStatus(): CheckStatus {
  const paystackLive =
    isLikelyLiveSecret(env.paystackSecret) &&
    isLikelyLiveSecret(env.paystackPublic) &&
    isLikelyLiveSecret(env.paystackWebhookSecret);
  const flutterwaveLive =
    isLikelyLiveSecret(env.flutterwaveSecret) &&
    isLikelyLiveSecret(env.flutterwavePublic) &&
    isLikelyLiveSecret(env.flutterwaveWebhookSecret);
  return paystackLive || flutterwaveLive ? "ok" : "pending";
}

async function resolveDatabaseStatus(): Promise<CheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "fail";
  }
}

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (actorRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can access prelaunch diagnostics.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const [dbStatus, loggingStatus, emailStatus] = await Promise.all([
    resolveDatabaseStatus(),
    resolveLoggingSnapshotStatus(session.user.id),
    resolveEmailSnapshotStatus(session.user.id),
  ]);

  return NextResponse.json(
    buildChecklist({
      dbStatus,
      loggingStatus,
      emailStatus,
      webhooksStatus: resolveWebhooksStatus(),
      billingLiveStatus: resolveBillingLiveStatus(),
    })
  );
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (actorRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can run prelaunch diagnostics.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  assertRateLimit(`admin:prelaunch:run:${session.user.id}`, PRELAUNCH_RUN_LIMIT.count, PRELAUNCH_RUN_LIMIT.windowMs);

  const dbStatus = await resolveDatabaseStatus();

  let loggingStatus: CheckStatus = "pending";
  try {
    await prisma.activityLog.create({
      data: {
        action: "prelaunch_log_check",
        userId: session.user.id,
        metadata: { source: "admin_prelaunch" },
      },
    });
    loggingStatus = "ok";
  } catch {
    loggingStatus = "pending";
  }

  const emailConfigured = Boolean(env.resendApiKey && env.emailFrom);
  let emailStatus: CheckStatus = "pending";
  if (emailConfigured) {
    const cutoff = new Date(Date.now() - EMAIL_COOLDOWN_MINUTES * 60 * 1000);
    const recentSuccess = await prisma.activityLog.findFirst({
      where: {
        action: "prelaunch_email_sent",
        userId: session.user.id,
        timestamp: { gte: cutoff },
      },
      select: { id: true },
    });

    if (recentSuccess) {
      emailStatus = "ok";
    } else {
      try {
        const recipient = session.user.email || env.emailFrom;
        await sendInfoMail({
          to: recipient,
          subject: "Maboria email delivery check",
          html: "<p>Your Maboria email delivery check succeeded.</p>",
        });
        await prisma.activityLog.create({
          data: {
            action: "prelaunch_email_sent",
            userId: session.user.id,
            metadata: { to: recipient },
          },
        });
        emailStatus = "ok";
      } catch (error) {
        await prisma.activityLog.create({
          data: {
            action: "prelaunch_email_failed",
            userId: session.user.id,
            metadata: { error: (error as Error).message },
          },
        });
        emailStatus = "pending";
      }
    }
  }

  const checklist = [
    ...buildChecklist({
      dbStatus,
      loggingStatus,
      emailStatus,
      webhooksStatus: resolveWebhooksStatus(),
      billingLiveStatus: resolveBillingLiveStatus(),
    }),
  ];

  await prisma.activityLog.create({
    data: {
      action: "prelaunch_checks_run",
      userId: session.user.id,
      metadata: {
        source: "admin_prelaunch",
        dbStatus,
        loggingStatus,
        emailStatus,
      },
    },
  }).catch(() => undefined);

  return NextResponse.json(checklist);
});
