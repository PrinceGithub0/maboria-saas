import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);

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
    prisma.unifiedConversation.count({
      where: {
        tenantId: context.orgId,
        status: { in: ["OPEN", "PENDING"] },
      },
    }),
    prisma.unifiedMessage.findMany({
      where: {
        tenantId: context.orgId,
        createdAt: { gte: start14 },
        direction: { in: ["INBOUND", "OUTBOUND"] },
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
    const day = new Date(start14);
    day.setDate(start14.getDate() + i);
    daily[dayKey(day)] = 0;
  }

  for (const message of messages) {
    const key = dayKey(message.createdAt);
    if (daily[key] !== undefined) daily[key] += 1;
  }

  const messagesToday = messages.filter((message) => message.createdAt >= startToday).length;
  const messagesWeek = messages.filter((message) => message.createdAt >= start7).length;

  const responseTimes: number[] = [];
  const lastInboundByConversation: Record<string, Date> = {};
  for (const message of messages) {
    if (message.direction === "INBOUND") {
      lastInboundByConversation[message.conversationId] = message.createdAt;
      continue;
    }
    const inboundAt = lastInboundByConversation[message.conversationId];
    if (inboundAt && inboundAt >= start7) {
      responseTimes.push(message.createdAt.getTime() - inboundAt.getTime());
      delete lastInboundByConversation[message.conversationId];
    }
  }

  const avgResponseMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
      : 0;

  return NextResponse.json({
    messagesToday,
    messagesWeek,
    avgResponseMs,
    openCount,
    series: Object.entries(daily).map(([date, count]) => ({ date, count })),
    generatedAt: new Date().toISOString(),
  });
});
