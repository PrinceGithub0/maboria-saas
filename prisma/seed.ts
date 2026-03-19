import {
  PrismaClient,
  AdminNotificationDedupeStrategy,
  AdminNotificationRecipientStrategy,
  AdminNotificationSeverity,
  AdminNotificationType,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  PaymentProvider,
  PaymentStatus,
  AutomationStatus,
  AutomationRunStatus,
  InvoiceStatus,
  SupportStatus,
} from "@prisma/client";
import { hashPassword } from "../lib/auth";
import { addDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  const password = await hashPassword("password123");
  const adminPassword = await hashPassword("admin123");

  const user = await prisma.user.upsert({
    where: { email: "user@maboria.com" },
    update: {},
    create: {
      name: "Maboria User",
      email: "user@maboria.com",
      passwordHash: password,
      role: Role.USER,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@maboria.com" },
    update: {},
    create: {
      name: "Maboria Admin",
      email: "admin@maboria.com",
      passwordHash: adminPassword,
      role: Role.OPS_ADMIN,
    },
  });

  const adminNotificationRules = [
    {
      eventType: "AUTOMATION_RUN_FAILED",
      defaultSeverity: AdminNotificationSeverity.WARNING,
      defaultType: AdminNotificationType.AUTOMATION,
      recipientStrategy: AdminNotificationRecipientStrategy.ALL_ADMINS,
      dedupeStrategy: AdminNotificationDedupeStrategy.BY_TENANT_AND_EVENT,
      dedupeWindowSeconds: 300,
      templateTitle: "Automation run failed",
      templateMessage: "Automation failure detected for {{tenantName}}.",
      metadataTemplate: {},
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
      metadataTemplate: {},
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
      metadataTemplate: {},
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
      metadataTemplate: {},
    },
  ] as const;

  for (const rule of adminNotificationRules) {
    await prisma.adminNotificationRule.upsert({
      where: { eventType: rule.eventType },
      update: {
        defaultSeverity: rule.defaultSeverity,
        defaultType: rule.defaultType,
        enabled: true,
        recipientStrategy: rule.recipientStrategy,
        dedupeStrategy: rule.dedupeStrategy,
        dedupeWindowSeconds: rule.dedupeWindowSeconds,
        templateTitle: rule.templateTitle,
        templateMessage: rule.templateMessage,
        metadataTemplate: rule.metadataTemplate as any,
      },
      create: {
        eventType: rule.eventType,
        defaultSeverity: rule.defaultSeverity,
        defaultType: rule.defaultType,
        enabled: true,
        recipientStrategy: rule.recipientStrategy,
        dedupeStrategy: rule.dedupeStrategy,
        dedupeWindowSeconds: rule.dedupeWindowSeconds,
        templateTitle: rule.templateTitle,
        templateMessage: rule.templateMessage,
        metadataTemplate: rule.metadataTemplate as any,
      },
    });
  }

  const business = await prisma.business.create({
    data: {
      name: "Maboria HQ",
      domain: "maboria.com",
      ownerId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: "owner" },
          { userId: user.id, role: "member" },
        ],
      },
    },
  });

  await prisma.subscription.createMany({
    data: [
      {
        userId: user.id,
        plan: SubscriptionPlan.STARTER,
        status: SubscriptionStatus.ACTIVE,
        renewalDate: addDays(new Date(), 30),
      },
      {
        userId: admin.id,
        plan: SubscriptionPlan.ENTERPRISE,
        status: SubscriptionStatus.ACTIVE,
        renewalDate: addDays(new Date(), 365),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.payment.createMany({
    data: [
      {
        userId: user.id,
        amount: 4900,
        currency: "USD",
        provider: PaymentProvider.FLUTTERWAVE,
        status: PaymentStatus.SUCCEEDED,
      },
      {
        userId: user.id,
        amount: 35000,
        currency: "NGN",
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCEEDED,
      },
    ],
  });

  const flow = await prisma.automationFlow.create({
    data: {
      userId: user.id,
      businessId: business.id,
      title: "Welcome + Invoice",
      description: "Parses contact, creates invoice, emails summary",
      status: AutomationStatus.ACTIVE,
      steps: [
        { type: "parseText", config: { field: "message" } },
        { type: "generateInvoice", config: { currency: "USD" } },
        { type: "sendEmail", config: { template: "welcome" } },
      ],
      triggers: {
        create: [{ type: "webhook", config: { path: "/webhooks/contact" }, conditions: {} }],
      },
      actions: {
        create: [
          { type: "sendEmail", config: { template: "welcome" }, order: 1 },
          { type: "createInvoice", config: { currency: "USD" }, order: 2 },
        ],
      },
    },
  });

  await prisma.automationRun.create({
    data: {
      flowId: flow.id,
      userId: user.id,
      runStatus: AutomationRunStatus.SUCCESS,
      logs: [{ message: "Flow executed in seed", status: "ok" }],
    },
  });

  const customer = await prisma.customer.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: "customer@example.com",
      },
    },
    update: {
      name: "Seed Customer",
      deletedAt: null,
    },
    create: {
      userId: user.id,
      name: "Seed Customer",
      email: "customer@example.com",
      deliveryPreference: "EMAIL",
    },
  });

  await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: customer.id,
      invoiceNumber: "INV-1001",
      currency: "USD",
      status: InvoiceStatus.PAID,
      total: 19900,
      tax: 1200,
      discount: 0,
      invoiceCustomerSnapshot: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: {
          addressLine1: customer.addressLine1,
          addressLine2: customer.addressLine2,
          city: customer.city,
          state: customer.state,
          postalCode: customer.postalCode,
          country: customer.country,
        },
        deliveryPreference: customer.deliveryPreference,
      } as any,
      items: [
        { name: "Automation credits", qty: 1, price: 19900 },
        { name: "Onboarding", qty: 1, price: 0 },
      ],
    },
  });

  await prisma.supportTicket.create({
    data: {
      userId: user.id,
      title: "How do I add Paystack?",
      message: "Please help me integrate Paystack payments",
      status: SupportStatus.OPEN,
    },
  });

  await prisma.activityLog.createMany({
    data: [
      { userId: user.id, action: "SIGNUP", metadata: { channel: "seed" } },
      { userId: admin.id, action: "ADMIN_CREATED", metadata: { channel: "seed" } },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
