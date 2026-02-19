import { prisma } from "../prisma";

type NotifyAutomationLimitInput = {
  userId: string;
  source: string;
  flowId?: string | null;
  plan?: string | null;
  limit?: number | null;
  used?: number | null;
  code?: string | null;
};

const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function notifyAutomationLimitReached(input: NotifyAutomationLimitInput) {
  const now = new Date();
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS);
  const source = String(input.source || "automation").trim();
  const flowId = String(input.flowId || "").trim() || null;

  const duplicates = await prisma.activityLog.count({
    where: {
      userId: input.userId,
      action: "AUTOMATION_LIMIT_REACHED_ALERT",
      timestamp: { gte: since },
      AND: [
        { metadata: { path: ["source"], equals: source } },
        ...(flowId ? ([{ metadata: { path: ["flowId"], equals: flowId } }] as any[]) : []),
      ],
    },
  });
  if (duplicates > 0) return { notified: false, reason: "deduped" as const };

  const message = `Automation runs are paused because your monthly limit is reached. Upgrade or wait for the next cycle.`;

  await prisma.$transaction([
    prisma.activityLog.create({
      data: {
        userId: input.userId,
        action: "AUTOMATION_LIMIT_REACHED_ALERT",
        metadata: {
          source,
          flowId,
          plan: input.plan ?? null,
          limit: input.limit ?? null,
          used: input.used ?? null,
          code: input.code ?? null,
          dedupeWindowHours: DEDUPE_WINDOW_MS / (60 * 60 * 1000),
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId: input.userId,
        type: "automation",
        message,
      },
    }),
  ]);

  return { notified: true as const };
}
