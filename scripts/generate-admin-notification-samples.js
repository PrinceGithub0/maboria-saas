const { PrismaClient, AdminNotificationSeverity, AdminNotificationType } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: "OPS_ADMIN", status: "ACTIVE" },
    select: { id: true },
    take: 10,
  });
  const tenant = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!admins.length || !tenant) {
    throw new Error("Missing admin users or tenant. Seed baseline data first.");
  }

  const now = new Date();
  for (const admin of admins) {
    await prisma.adminNotification.create({
      data: {
        recipientAdminId: admin.id,
        tenantId: tenant.id,
        title: "Automation run failed",
        message: `Automation failure detected for ${tenant.name}.`,
        type: AdminNotificationType.AUTOMATION,
        severity: AdminNotificationSeverity.WARNING,
        sourceEventType: "AUTOMATION_RUN_FAILED",
        sourceEventId: `sample-run-${Date.now()}`,
        dedupeKey: `${tenant.id}:AUTOMATION_RUN_FAILED`,
        firstSeenAt: now,
        lastSeenAt: now,
        status: "UNREAD",
        metadata: {
          tenantName: tenant.name,
          runId: `sample-run-${Date.now()}`,
        },
      },
    });
  }

  const assigneeId = admins[0].id;
  await prisma.adminNotification.create({
    data: {
      recipientAdminId: assigneeId,
      tenantId: tenant.id,
      title: "Ticket assigned to you",
      message: "Ticket sample-ticket-1001 has been assigned to you.",
      type: AdminNotificationType.SUPPORT,
      severity: AdminNotificationSeverity.INFO,
      sourceEventType: "SUPPORT_TICKET_ASSIGNED",
      sourceEventId: "sample-ticket-1001",
      dedupeKey: `${tenant.id}:SUPPORT_TICKET_ASSIGNED:sample-ticket-1001`,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "UNREAD",
      metadata: {
        ticketId: "sample-ticket-1001",
        assigneeAdminId: assigneeId,
      },
    },
  });

  const incident = await prisma.adminIncident.create({
    data: {
      title: "System outage",
      summary: "Sample incident for QA verification",
      severity: "CRITICAL",
      status: "ACTIVE",
      startedAt: now,
      createdByAdminId: assigneeId,
    },
  });

  for (const admin of admins) {
    await prisma.adminNotification.create({
      data: {
        recipientAdminId: admin.id,
        title: "System incident detected",
        message: incident.summary || "System outage",
        type: AdminNotificationType.SYSTEM,
        severity: AdminNotificationSeverity.CRITICAL,
        sourceEventType: "SYSTEM_OUTAGE",
        sourceEventId: incident.id,
        dedupeKey: "SYSTEM_OUTAGE",
        firstSeenAt: now,
        lastSeenAt: now,
        status: "UNREAD",
        metadata: {
          incidentId: incident.id,
          title: incident.title,
        },
      },
    });
  }

  console.log("Admin notification samples generated.");
}

main()
  .catch((error) => {
    console.error("Failed to generate admin notification samples", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
