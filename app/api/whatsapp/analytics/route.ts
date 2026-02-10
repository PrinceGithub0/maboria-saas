import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const now = new Date();
  const start14 = new Date(now);
  start14.setDate(start14.getDate() - 13);
  start14.setHours(0, 0, 0, 0);

  const start7 = new Date(now);
  start7.setDate(start7.getDate() - 6);
  start7.setHours(0, 0, 0, 0);

  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const [openCount, messages] = await Promise.all([
    prisma.conversation.count({
      where: { businessId, status: { in: ["OPEN", "PENDING"] } },
    }),
    prisma.message.findMany({
      where: {
        createdAt: { gte: start14 },
        conversation: { businessId },
      },
      select: {
        id: true,
        direction: true,
        createdAt: true,
        conversationId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const daily: Record<string, number> = {};
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(start14);
    d.setDate(start14.getDate() + i);
    daily[dayKey(d)] = 0;
  }
  for (const msg of messages) {
    const key = dayKey(msg.createdAt);
    if (daily[key] !== undefined) daily[key] += 1;
  }

  const messagesToday = messages.filter((m) => m.createdAt >= startToday).length;
  const messagesWeek = messages.filter((m) => m.createdAt >= start7).length;

  const responseTimes: number[] = [];
  const lastInboundByConv: Record<string, Date> = {};
  for (const msg of messages) {
    if (msg.direction === "INBOUND") {
      lastInboundByConv[msg.conversationId] = msg.createdAt;
      continue;
    }
    const inboundAt = lastInboundByConv[msg.conversationId];
    if (inboundAt && inboundAt >= start7) {
      responseTimes.push(msg.createdAt.getTime() - inboundAt.getTime());
      delete lastInboundByConv[msg.conversationId];
    }
  }

  const avgResponseMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((acc, value) => acc + value, 0) / responseTimes.length)
      : 0;

  return NextResponse.json({
    messagesToday,
    messagesWeek,
    avgResponseMs,
    openCount,
    series: Object.entries(daily).map(([date, count]) => ({ date, count })),
  });
});
