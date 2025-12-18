import {
  PrismaClient,
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
      role: Role.ADMIN,
    },
  });

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
        provider: PaymentProvider.STRIPE,
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

  await prisma.invoice.create({
    data: {
      userId: user.id,
      invoiceNumber: "INV-1001",
      currency: "USD",
      status: InvoiceStatus.PAID,
      total: 19900,
      tax: 1200,
      discount: 0,
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
