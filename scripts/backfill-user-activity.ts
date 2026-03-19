import crypto from "crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { USER_ACTIVITY_EVENT_TYPES, type UserActivityEventType } from "../lib/user-activity";

type Candidate = {
  id: string;
  tenantId: string;
  userId: string;
  eventType: UserActivityEventType;
  actorId: string | null;
  createdAt: Date;
  metadata: Prisma.InputJsonObject;
};

const TENANT_HINT_KEYS = [
  "tenantId",
  "tenant_id",
  "businessId",
  "business_id",
  "workspaceId",
  "workspace_id",
  "organizationId",
  "organization_id",
  "orgId",
  "org_id",
];

const EVENT_TYPE_SET = new Set<string>(USER_ACTIVITY_EVENT_TYPES);

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function hashId(key: string) {
  return `ual_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function toEventType(value: string): UserActivityEventType | null {
  return EVENT_TYPE_SET.has(value) ? (value as UserActivityEventType) : null;
}

function eventFromActivityAction(action: string): UserActivityEventType | null {
  const normalized = String(action || "").trim().toUpperCase();
  switch (normalized) {
    case "USER_SIGNIN":
      return "login";
    case "USER_SIGNOUT":
      return "logout";
    case "INVOICE_CREATED":
      return "invoice_created";
    case "INVOICE_SENT":
      return "invoice_sent";
    case "AUTOMATION_RUN_SUCCESS":
    case "AUTOMATION_RUN_FAILED":
    case "AUTOMATION_RUN_PENDING":
      return "automation_triggered";
    case "AUTOMATION_EMAIL_DISPATCH":
      return "notification_sent";
    default:
      return null;
  }
}

async function run() {
  const existingBusinesses = await prisma.business.findMany({
    select: { id: true },
  });
  const validTenantIds = new Set(existingBusinesses.map((row) => row.id));

  const tenantByUserCache = new Map<string, string | null>();
  const candidates = new Map<string, Candidate>();
  let skippedNoTenant = 0;
  let skippedInvalidUser = 0;

  const getTenantForUser = async (userId: string, hints: string[]) => {
    for (const hint of hints) {
      if (hint && validTenantIds.has(hint)) return hint;
    }

    if (tenantByUserCache.has(userId)) {
      return tenantByUserCache.get(userId) || null;
    }

    const activeMembership = await prisma.businessMember.findFirst({
      where: { userId, status: "active" },
      orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
      select: { businessId: true },
    });
    if (activeMembership?.businessId) {
      tenantByUserCache.set(userId, activeMembership.businessId);
      return activeMembership.businessId;
    }

    const ownedBusiness = await prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const resolved = ownedBusiness?.id || null;
    tenantByUserCache.set(userId, resolved);
    return resolved;
  };

  const addCandidate = async (input: {
    sourceKey: string;
    userId: string | null | undefined;
    actorId?: string | null;
    eventType: UserActivityEventType | null;
    createdAt: Date;
    metadata?: Record<string, unknown>;
    tenantHints?: string[];
  }) => {
    if (!input.eventType) return;
    const userId = asString(input.userId);
    if (!userId) {
      skippedInvalidUser += 1;
      return;
    }

    const hints = (input.tenantHints || []).map(asString).filter(Boolean);
    const tenantId = await getTenantForUser(userId, hints);
    if (!tenantId) {
      skippedNoTenant += 1;
      return;
    }

    const id = hashId(input.sourceKey);
    const metadata = toObject(input.metadata);
    candidates.set(id, {
      id,
      tenantId,
      userId,
      eventType: input.eventType,
      actorId: asString(input.actorId) || null,
      createdAt: input.createdAt,
      metadata: {
        ...metadata,
        backfillSource: "historical",
        backfillKey: input.sourceKey,
      } as Prisma.InputJsonObject,
    });
  };

  const activityLogs = await prisma.activityLog.findMany({
    where: {
      action: {
        in: [
          "USER_SIGNIN",
          "USER_SIGNOUT",
          "INVOICE_CREATED",
          "INVOICE_SENT",
          "AUTOMATION_RUN_SUCCESS",
          "AUTOMATION_RUN_FAILED",
          "AUTOMATION_RUN_PENDING",
          "AUTOMATION_EMAIL_DISPATCH",
        ],
      },
    },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      userId: true,
      action: true,
      timestamp: true,
      metadata: true,
      resourceId: true,
    },
  });

  for (const row of activityLogs) {
    const metadata = toObject(row.metadata);
    const hints = TENANT_HINT_KEYS.map((key) => asString(metadata[key])).filter(Boolean);
    await addCandidate({
      sourceKey: `activity_log:${row.id}:${row.action}`,
      userId: row.userId,
      actorId: row.userId,
      eventType: eventFromActivityAction(row.action),
      createdAt: row.timestamp,
      metadata: {
        sourceTable: "activity_log",
        sourceId: row.id,
        action: row.action,
        resourceId: row.resourceId || null,
      },
      tenantHints: hints,
    });
  }

  const invoices = await prisma.invoice.findMany({
    orderBy: { generatedAt: "asc" },
    select: {
      id: true,
      userId: true,
      invoiceNumber: true,
      generatedAt: true,
      metadata: true,
    },
  });

  for (const invoice of invoices) {
    const metadata = toObject(invoice.metadata);
    const hints = TENANT_HINT_KEYS.map((key) => asString(metadata[key])).filter(Boolean);
    await addCandidate({
      sourceKey: `invoice:${invoice.id}:invoice_created`,
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "invoice_created",
      createdAt: invoice.generatedAt,
      metadata: {
        sourceTable: "invoice",
        sourceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
      tenantHints: hints,
    });
  }

  const invoicePayments = await prisma.invoicePayment.findMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.SUCCEEDED, PaymentStatus.FAILED] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      provider: true,
      reference: true,
      currency: true,
      amount: true,
      metadata: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          metadata: true,
        },
      },
    },
  });

  for (const payment of invoicePayments) {
    const paymentMeta = toObject(payment.metadata);
    const invoiceMeta = toObject(payment.invoice.metadata);
    const hints = [
      ...TENANT_HINT_KEYS.map((key) => asString(paymentMeta[key])).filter(Boolean),
      ...TENANT_HINT_KEYS.map((key) => asString(invoiceMeta[key])).filter(Boolean),
    ];
    const baseMeta = {
      sourceTable: "invoice_payment",
      sourceId: payment.id,
      invoiceId: payment.invoice.id,
      invoiceNumber: payment.invoice.invoiceNumber,
      provider: payment.provider,
      reference: payment.reference,
      currency: payment.currency,
      amount: Number(payment.amount),
    };

    await addCandidate({
      sourceKey: `invoice_payment:${payment.id}:payment_attempt`,
      userId: payment.userId,
      actorId: payment.userId,
      eventType: "payment_attempt",
      createdAt: payment.createdAt,
      metadata: baseMeta,
      tenantHints: hints,
    });

    if (payment.status === PaymentStatus.SUCCEEDED) {
      await addCandidate({
        sourceKey: `invoice_payment:${payment.id}:payment_succeeded`,
        userId: payment.userId,
        actorId: payment.userId,
        eventType: "payment_succeeded",
        createdAt: payment.confirmedAt || payment.createdAt,
        metadata: baseMeta,
        tenantHints: hints,
      });
      await addCandidate({
        sourceKey: `invoice_payment:${payment.id}:invoice_paid`,
        userId: payment.userId,
        actorId: payment.userId,
        eventType: "invoice_paid",
        createdAt: payment.confirmedAt || payment.createdAt,
        metadata: baseMeta,
        tenantHints: hints,
      });
    } else if (payment.status === PaymentStatus.FAILED) {
      await addCandidate({
        sourceKey: `invoice_payment:${payment.id}:payment_failed`,
        userId: payment.userId,
        actorId: payment.userId,
        eventType: "payment_failed",
        createdAt: payment.createdAt,
        metadata: baseMeta,
        tenantHints: hints,
      });
    }
  }

  const receipts = await prisma.receipt.findMany({
    orderBy: { issuedAt: "asc" },
    select: {
      id: true,
      userId: true,
      invoiceId: true,
      receiptNumber: true,
      issuedAt: true,
      provider: true,
      reference: true,
      metadata: true,
    },
  });

  for (const receipt of receipts) {
    const metadata = toObject(receipt.metadata);
    const hints = TENANT_HINT_KEYS.map((key) => asString(metadata[key])).filter(Boolean);
    await addCandidate({
      sourceKey: `receipt:${receipt.id}:receipt_generated`,
      userId: receipt.userId,
      actorId: receipt.userId,
      eventType: "receipt_generated",
      createdAt: receipt.issuedAt,
      metadata: {
        sourceTable: "receipt",
        sourceId: receipt.id,
        invoiceId: receipt.invoiceId,
        receiptNumber: receipt.receiptNumber,
        provider: receipt.provider,
        reference: receipt.reference,
      },
      tenantHints: hints,
    });
  }

  const runs = await prisma.automationRun.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      flowId: true,
      createdAt: true,
      output: true,
      flow: {
        select: {
          id: true,
          title: true,
          businessId: true,
        },
      },
    },
  });

  for (const run of runs) {
    const output = toObject(run.output);
    const inputMeta = toObject(output.input);
    const hints = [
      run.flow.businessId || "",
      ...TENANT_HINT_KEYS.map((key) => asString(inputMeta[key])).filter(Boolean),
    ];
    await addCandidate({
      sourceKey: `automation_run:${run.id}:automation_triggered`,
      userId: run.userId,
      actorId: run.userId,
      eventType: "automation_triggered",
      createdAt: run.createdAt,
      metadata: {
        sourceTable: "automation_run",
        sourceId: run.id,
        flowId: run.flowId,
        flowName: run.flow.title,
      },
      tenantHints: hints,
    });
  }

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      type: true,
      message: true,
      createdAt: true,
    },
  });

  for (const notification of notifications) {
    await addCandidate({
      sourceKey: `notification:${notification.id}:notification_sent`,
      userId: notification.userId,
      actorId: notification.userId,
      eventType: "notification_sent",
      createdAt: notification.createdAt,
      metadata: {
        sourceTable: "notification",
        sourceId: notification.id,
        notificationType: notification.type,
        message: notification.message,
      },
      tenantHints: [],
    });
  }

  const impersonationAudits = await prisma.auditLog.findMany({
    where: {
      action: { in: ["IMPERSONATION_STARTED", "IMPERSONATION_STOPPED"] },
      targetUserId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      userId: true,
      targetUserId: true,
      orgId: true,
      createdAt: true,
      metadata: true,
    },
  });

  for (const audit of impersonationAudits) {
    const eventType = toEventType(
      audit.action === "IMPERSONATION_STARTED" ? "impersonation_started" : "impersonation_ended"
    );
    const metadata = toObject(audit.metadata);
    const hints = [asString(audit.orgId), ...TENANT_HINT_KEYS.map((key) => asString(metadata[key]))];
    await addCandidate({
      sourceKey: `audit:${audit.id}:${audit.action}`,
      userId: audit.targetUserId || "",
      actorId: audit.userId || null,
      eventType,
      createdAt: audit.createdAt,
      metadata: {
        sourceTable: "audit_log",
        sourceId: audit.id,
        action: audit.action,
      },
      tenantHints: hints,
    });
  }

  const payload = Array.from(candidates.values());
  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const result = await prisma.userActivityLog.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.log("user_activity_backfill_completed", {
    candidates: payload.length,
    inserted,
    skippedNoTenant,
    skippedInvalidUser,
  });
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("user_activity_backfill_failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
