import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [failedPayments, webhookFailures, automationFailures, newUsers, openTickets] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "FAILED", createdAt: { gt: last7d } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.webhookEvent.findMany({
      where: { status: "FAILED", receivedAt: { gt: last24h } },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
    prisma.automationRun.findMany({
      where: { runStatus: "FAILED", createdAt: { gt: last24h } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { flow: { select: { title: true } }, user: { select: { email: true } } },
    }),
    prisma.user.findMany({
      where: { createdAt: { gt: last24h } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, email: true, createdAt: true },
    }),
    prisma.supportTicket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, createdAt: { gt: last7d } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { email: true } } },
    }),
  ]);

  const alerts = [
    ...failedPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      type: "payment_failed",
      severity: "critical",
      message: `Payment failed (${payment.provider}) ${payment.reference || payment.id}`,
      createdAt: payment.createdAt,
    })),
    ...webhookFailures.map((event) => ({
      id: `webhook-${event.id}`,
      type: "webhook_failed",
      severity: "critical",
      message: `Webhook failed (${event.provider}) ${event.eventId}`,
      createdAt: event.receivedAt,
    })),
    ...automationFailures.map((run) => ({
      id: `automation-${run.id}`,
      type: "automation_failed",
      severity: "warning",
      message: `Automation failed: ${run.flow?.title || "Untitled"} (${run.user?.email || "Unknown"})`,
      createdAt: run.createdAt,
    })),
    ...openTickets.map((ticket) => ({
      id: `ticket-${ticket.id}`,
      type: "support_open",
      severity: "warning",
      message: `Support ticket ${ticket.title} (${ticket.user?.email || "Unknown"})`,
      createdAt: ticket.createdAt,
    })),
    ...newUsers.map((user) => ({
      id: `user-${user.id}`,
      type: "new_signup",
      severity: "info",
      message: `New signup ${user.email}`,
      createdAt: user.createdAt,
    })),
  ];

  alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(alerts);
});
