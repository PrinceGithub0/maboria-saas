import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { verifyAutomationAuditChain } from "@/lib/automation/audit";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";

const readFlowId = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const flowId = (metadata as Record<string, unknown>)["flowId"];
  const normalized = String(flowId || "").trim();
  return normalized || null;
};

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  const flowId = String(url.searchParams.get("flowId") || "").trim();
  const userId = String(url.searchParams.get("userId") || "").trim();
  const limitRaw = Number(url.searchParams.get("limit") || 1000);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(5000, Math.floor(limitRaw)) : 1000;

  const where: Record<string, unknown> = {
    action: { startsWith: "AUTOMATION_AUDIT_" },
  };
  if (userId) where.userId = userId;
  if (flowId) {
    where.metadata = { path: ["flowId"], equals: flowId };
  }

  const logs = await prisma.auditLog.findMany({
    where: where as any,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
  });

  const grouped = new Map<string, Array<{ createdAt: Date; metadata: unknown; id: string }>>();
  for (const entry of logs) {
    const key = readFlowId(entry.metadata) || "__unknown__";
    const list = grouped.get(key) || [];
    list.push({ createdAt: entry.createdAt, metadata: entry.metadata, id: entry.id });
    grouped.set(key, list);
  }

  const perFlow = Array.from(grouped.entries()).map(([key, entries]) => ({
    flowId: key === "__unknown__" ? null : key,
    count: entries.length,
    verification: verifyAutomationAuditChain(
      entries.map((entry) => ({ createdAt: entry.createdAt, metadata: entry.metadata }))
    ),
  }));

  const invalidFlows = perFlow.filter((flow) => !flow.verification.valid).length;
  const invalidEntries = perFlow.reduce((acc, flow) => acc + flow.verification.invalidCount, 0);

  return NextResponse.json({
    scanned: logs.length,
    groups: perFlow.length,
    invalidFlows,
    invalidEntries,
    perFlow,
  });
});
