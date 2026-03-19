const {
  PrismaClient,
  AdminNotificationDedupeStrategy,
  AdminNotificationRecipientStrategy,
  AdminNotificationSeverity,
  AdminNotificationType,
} = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rules = [
    {
      eventType: "AUTOMATION_RUN_FAILED",
      defaultSeverity: AdminNotificationSeverity.WARNING,
      defaultType: AdminNotificationType.AUTOMATION,
      recipientStrategy: AdminNotificationRecipientStrategy.ALL_ADMINS,
      dedupeStrategy: AdminNotificationDedupeStrategy.BY_TENANT_AND_EVENT,
      dedupeWindowSeconds: 300,
      templateTitle: "Automation run failed",
      templateMessage: "Automation failure detected for {{tenantName}}.",
    },
    {
      eventType: "SUPPORT_TICKET_ASSIGNED",
      defaultSeverity: AdminNotificationSeverity.INFO,
      defaultType: AdminNotificationType.SUPPORT,
      recipientStrategy: AdminNotificationRecipientStrategy.ASSIGNEE_ONLY,
      dedupeStrategy: AdminNotificationDedupeStrategy.CUSTOM_KEY,
      dedupeWindowSeconds: 60,
      templateTitle: "Ticket assigned to you",
      templateMessage: "Ticket {{ticketId}} has been assigned to you.",
    },
    {
      eventType: "SLA_BREACH",
      defaultSeverity: AdminNotificationSeverity.WARNING,
      defaultType: AdminNotificationType.SLA,
      recipientStrategy: AdminNotificationRecipientStrategy.ASSIGNEE_ONLY,
      dedupeStrategy: AdminNotificationDedupeStrategy.CUSTOM_KEY,
      dedupeWindowSeconds: 300,
      templateTitle: "SLA breach detected",
      templateMessage: "Ticket {{ticketId}} has breached SLA thresholds.",
    },
    {
      eventType: "SYSTEM_OUTAGE",
      defaultSeverity: AdminNotificationSeverity.WARNING,
      defaultType: AdminNotificationType.SYSTEM,
      recipientStrategy: AdminNotificationRecipientStrategy.ALL_ADMINS,
      dedupeStrategy: AdminNotificationDedupeStrategy.BY_EVENT,
      dedupeWindowSeconds: 300,
      templateTitle: "System incident detected",
      templateMessage: "{{summary}}",
    },
  ];

  for (const rule of rules) {
    await prisma.adminNotificationRule.upsert({
      where: { eventType: rule.eventType },
      update: {
        defaultSeverity: rule.defaultSeverity,
        defaultType: rule.defaultType,
        enabled: true,
        recipientStrategy: rule.recipientStrategy,
        roleKey: null,
        dedupeStrategy: rule.dedupeStrategy,
        dedupeWindowSeconds: rule.dedupeWindowSeconds,
        templateTitle: rule.templateTitle,
        templateMessage: rule.templateMessage,
        metadataTemplate: {},
      },
      create: {
        eventType: rule.eventType,
        defaultSeverity: rule.defaultSeverity,
        defaultType: rule.defaultType,
        enabled: true,
        recipientStrategy: rule.recipientStrategy,
        roleKey: null,
        dedupeStrategy: rule.dedupeStrategy,
        dedupeWindowSeconds: rule.dedupeWindowSeconds,
        templateTitle: rule.templateTitle,
        templateMessage: rule.templateMessage,
        metadataTemplate: {},
      },
    });
  }

  console.log("Admin notification rules seeded.");
}

main()
  .catch((error) => {
    console.error("Failed to seed admin notification rules", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
