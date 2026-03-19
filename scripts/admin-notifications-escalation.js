const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";

async function resolveSuperAdminRecipients() {
  const setting = await prisma.setting.findUnique({
    where: { key: ROOT_SUPER_ADMIN_SETTING },
    select: { value: true },
  });

  const rootId = String(setting?.value || "").trim();
  if (!rootId) return [];
  const admin = await prisma.user.findFirst({
    where: { id: rootId, role: "OPS_ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  return admin ? [admin.id] : [];
}

async function main() {
  const thresholdMinutes = Math.max(5, Number(process.env.ADMIN_NOTIFICATION_ESCALATION_MINUTES || 30));
  const thresholdDate = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const recipients = await resolveSuperAdminRecipients();
  if (!recipients.length) {
    console.log("No super admin recipient available for escalation.");
    return;
  }

  const pendingCritical = await prisma.adminNotification.findMany({
    where: {
      severity: "CRITICAL",
      status: "UNREAD",
      createdAt: { lt: thresholdDate },
    },
    select: {
      id: true,
      tenantId: true,
      sourceEventType: true,
      sourceEventId: true,
      title: true,
      message: true,
      metadata: true,
    },
    take: 250,
  });

  let escalatedCount = 0;
  for (const notification of pendingCritical) {
    const metadata =
      notification.metadata &&
      typeof notification.metadata === "object" &&
      !Array.isArray(notification.metadata)
        ? notification.metadata
        : {};
    if (metadata.escalatedAt) continue;

    for (const recipientId of recipients) {
      const dedupeKey = `ESCALATION:${notification.id}:${recipientId}`;
      const exists = await prisma.adminNotification.findFirst({
        where: {
          recipientAdminId: recipientId,
          dedupeKey,
        },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.adminNotification.create({
        data: {
          tenantId: notification.tenantId,
          recipientAdminId: recipientId,
          title: `Escalation: ${notification.title}`,
          message: notification.message,
          type: "SYSTEM",
          severity: "CRITICAL",
          sourceEventType: "NOTIFICATION_ESCALATION",
          sourceEventId: notification.id,
          dedupeKey,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          status: "UNREAD",
          metadata: {
            escalatedFromNotificationId: notification.id,
            sourceEventType: notification.sourceEventType,
            sourceEventId: notification.sourceEventId,
          },
        },
      });
      escalatedCount += 1;
    }

    await prisma.adminNotification.update({
      where: { id: notification.id },
      data: {
        metadata: {
          ...metadata,
          escalatedAt: new Date().toISOString(),
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        thresholdMinutes,
        escalatedCount,
        pendingChecked: pendingCritical.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Admin notification escalation job failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
