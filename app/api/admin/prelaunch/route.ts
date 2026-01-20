import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await prisma.$queryRaw`SELECT 1`;
  let loggingStatus: "ok" | "pending" = "pending";
  try {
    await prisma.activityLog.create({
      data: {
        action: "prelaunch_log_check",
        userId: session.user.id,
        metadata: { source: "admin_prelaunch" },
      },
    });
    await prisma.activityLog.findFirst({
      where: { action: "prelaunch_log_check", userId: session.user.id },
      select: { id: true },
    });
    loggingStatus = "ok";
  } catch {
    loggingStatus = "pending";
  }

  const emailConfigured = Boolean(
    env.emailHost && env.emailUser && env.emailPass && env.emailPort && env.emailFrom
  );
  let emailStatus: "ok" | "pending" = "pending";
  if (emailConfigured) {
    const cooldownMinutes = 30;
    const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);
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
        await sendEmail({
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
    { item: "API health", status: "ok" },
    { item: "Database", status: health ? "ok" : "fail" },
    { item: "Webhooks configured", status: "pending" },
    { item: "Billing live mode", status: "pending" },
    { item: "Emails sending", status: emailStatus },
    { item: "Admin panel", status: "ok" },
    { item: "Logging/Monitoring", status: loggingStatus },
  ];
  return NextResponse.json(checklist);
});
