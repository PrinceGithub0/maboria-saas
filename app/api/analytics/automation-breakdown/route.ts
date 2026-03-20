import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAutomationRunWhere, resolveAutomationScope } from "@/lib/automation/access";
import { getWorkspaceScope } from "@/lib/entitlements";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageScope = await getWorkspaceScope(session.user.id);
  const start = usageScope.start;
  const end = usageScope.resetAt ?? new Date();
  const automationScope = await resolveAutomationScope(session.user.id);

  const runs = await prisma.automationRun.findMany({
    where: buildAutomationRunWhere(automationScope, {
      createdAt: { gte: start, lte: end },
      runStatus: "SUCCESS",
    }),
    select: {
      flowId: true,
      flow: { select: { title: true } },
    },
  });

  const grouped = new Map<string, { id: string; name: string; count: number }>();
  for (const run of runs) {
    const id = run.flowId ?? "unknown";
    const name = run.flow?.title ?? "Unknown";
    const entry = grouped.get(id);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(id, { id, name, count: 1 });
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  return NextResponse.json({ items });
}
