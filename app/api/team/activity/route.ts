import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSubscription, hasOrgPermission, requireOrgPermission } from "@/lib/org-auth";
import { buildTeamActivityMessage, TEAM_ACTIVITY_ACTION_TYPES } from "@/lib/team-activity";

function jsonError(status: number, error: string, extras?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(extras || {}) }, { status });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "Unauthorized");

  const access = await requireOrgPermission(session.user.id, {
    permission: "team:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) return jsonError(access.status, access.message, { code: access.code });
  if (!(hasOrgPermission(access.context.role, "team:invite") || canManageSubscription(access.context.role))) {
    return jsonError(403, "You do not have permission to view team activity.", { code: "FORBIDDEN" });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") || "20");
  const take = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;
  const cursor = req.nextUrl.searchParams.get("cursor");

  const logs = await prisma.auditLog.findMany({
    where: {
      orgId: access.context.orgId,
      actionType: { in: [...TEAM_ACTIVITY_ACTION_TYPES] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const hasMore = logs.length > take;
  const items = hasMore ? logs.slice(0, take) : logs;

  const targetUserIds = Array.from(
    new Set(items.map((entry) => entry.targetUserId).filter((value): value is string => Boolean(value)))
  );
  const targetUsers = targetUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const targetUserMap = new Map(targetUsers.map((user) => [user.id, user]));

  return NextResponse.json({
    items: items.map((entry) => {
      const metadata =
        entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : null;
      const targetUser = entry.targetUserId ? targetUserMap.get(entry.targetUserId) : null;
      return {
        id: entry.id,
        actionType: entry.actionType || entry.action,
        createdAt: entry.createdAt,
        metadata,
        actor: {
          id: entry.user?.id || null,
          name: entry.user?.name || null,
          email: entry.user?.email || null,
        },
        target: {
          id: targetUser?.id || null,
          name: targetUser?.name || null,
          email: targetUser?.email || null,
        },
        message: buildTeamActivityMessage({
          actionType: entry.actionType || entry.action,
          actorName: entry.user?.name,
          actorEmail: entry.user?.email,
          targetName: targetUser?.name || null,
          targetEmail: targetUser?.email || null,
          metadata,
        }),
      };
    }),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
