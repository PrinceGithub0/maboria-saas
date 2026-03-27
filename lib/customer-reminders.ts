import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendBillingMail } from "@/lib/email";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/currency";
import { getOrCreateInvoicePublicLink } from "@/lib/invoice-public-link";
import { env } from "@/lib/env";
import { assertRateLimit } from "@/lib/rate-limit";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "@/lib/subscriber-settings";
import { applyLateFee, type LateFeeResult } from "@/lib/late-fee";
import { getVisibleCustomerWhere } from "@/lib/customers";

const REMINDER_PER_INVOICE_PER_DAY_LIMIT = 3;
const DEFAULT_COOLDOWN_MINUTES = 10;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const asDate = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysSince = (value: Date) =>
  Math.max(0, Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000)));

const getInvoiceDueDate = (invoice: { metadata?: Prisma.JsonValue | null; generatedAt: Date }) => {
  const dueDateFromMeta = asDate(asRecord(invoice.metadata).dueDate);
  return dueDateFromMeta || invoice.generatedAt;
};

type ReminderInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  total: Prisma.Decimal | number;
  lateFeeAmount: Prisma.Decimal | number;
  lateFeeTotalAccumulated?: Prisma.Decimal | number;
  lateFeeAppliedAt?: Date | null;
  lastLateFeeAppliedAt?: Date | null;
  lateFeeCount?: number | null;
  lateFeeLocked?: boolean | null;
  status: string;
  generatedAt: Date;
  currency: string;
  metadata: Prisma.JsonValue | null;
};

export function pickReminderInvoice<T extends ReminderInvoiceRecord>(invoices: T[]): T | null {
  if (!Array.isArray(invoices) || invoices.length === 0) return null;

  const prioritized = [...invoices].sort((left, right) => {
    const leftStatus = String(left.status || "").toUpperCase();
    const rightStatus = String(right.status || "").toUpperCase();
    const leftPriority = leftStatus === "OVERDUE" ? 0 : 1;
    const rightPriority = rightStatus === "OVERDUE" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftDueAt = getInvoiceDueDate(left)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDueAt = getInvoiceDueDate(right)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (leftDueAt !== rightDueAt) {
      return leftDueAt - rightDueAt;
    }

    return left.generatedAt.getTime() - right.generatedAt.getTime();
  });

  return prioritized[0] || null;
}

const getLateFeeTotal = (invoice: {
  lateFeeAmount: Prisma.Decimal | number;
  lateFeeTotalAccumulated?: Prisma.Decimal | number;
}) => roundMoney(Number(invoice.lateFeeTotalAccumulated ?? invoice.lateFeeAmount ?? 0));

const getBaseAmount = (invoice: {
  total: Prisma.Decimal | number;
  lateFeeAmount: Prisma.Decimal | number;
  lateFeeTotalAccumulated?: Prisma.Decimal | number;
}) => roundMoney(Math.max(0, Number(invoice.total || 0) - getLateFeeTotal(invoice)));

const getReminderDedupeKey = (input: {
  userId: string;
  invoiceId: string;
  cooldownMinutes: number;
  now: Date;
}) => {
  const bucket = Math.floor(input.now.getTime() / (input.cooldownMinutes * 60_000));
  return `${input.userId}:${input.invoiceId}:${bucket}`;
};

const createAuditEvent = async (
  tx: Prisma.TransactionClient,
  input: { userId: string; action: string; metadata?: Prisma.InputJsonValue; resourceId?: string }
) => {
  await Promise.all([
    tx.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resourceType: "invoice",
        resourceId: input.resourceId,
        metadata: input.metadata,
      },
    }),
    tx.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        metadata: input.metadata,
      },
    }),
  ]);
};

export async function sendCustomerReminder(input: {
  userId: string;
  customerId: string;
  applyLateFee?: boolean;
  triggeredBy?: "manual" | "automation";
  automationId?: string;
}) {
  const now = new Date();
  const visibilityWhere = await getVisibleCustomerWhere(input.userId);
  const [customer, invoiceCandidates] = await Promise.all([
    prisma.customer.findFirst({
      where: { ...visibilityWhere, id: input.customerId, userId: input.userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        deliveryPreference: true,
        status: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        userId: input.userId,
        subscriptionId: null,
        customerId: input.customerId,
        status: { in: ["OVERDUE", "SENT"] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        lateFeeAmount: true,
        lateFeeTotalAccumulated: true,
        lateFeeAppliedAt: true,
        lastLateFeeAppliedAt: true,
        lateFeeCount: true,
        lateFeeLocked: true,
        status: true,
        generatedAt: true,
        currency: true,
        metadata: true,
      },
    }),
  ]);
  const invoice = pickReminderInvoice(invoiceCandidates);

  if (!customer) {
    const error = new Error("Customer not found.");
    (error as any).status = 404;
    throw error;
  }
  if (customer.status === "DISABLED") {
    const error = new Error("Customer is disabled.");
    (error as any).status = 400;
    throw error;
  }
  if (!invoice) {
    const error = new Error("No unpaid invoice found for this customer.");
    (error as any).status = 400;
    throw error;
  }

  const settingsRow = await getOrCreateSubscriberSetting(input.userId);
  const settings = toLateFeeSettingsSnapshot(settingsRow);
  const cooldownMinutes = Math.max(1, settings.reminderCooldownMinutes || DEFAULT_COOLDOWN_MINUTES);
  const dedupeKey = getReminderDedupeKey({
    userId: input.userId,
    invoiceId: invoice.id,
    cooldownMinutes,
    now,
  });

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dailyCount = await prisma.reminderDispatch.count({
    where: {
      userId: input.userId,
      invoiceId: invoice.id,
      createdAt: { gte: dayStart },
    },
  });
  if (dailyCount >= REMINDER_PER_INVOICE_PER_DAY_LIMIT) {
    const error = new Error("Reminder limit reached for this invoice today.");
    (error as any).status = 429;
    throw error;
  }

  const existingWindowDispatch = await prisma.reminderDispatch.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existingWindowDispatch) {
    const error = new Error("A reminder was already sent recently.");
    (error as any).status = 409;
    throw error;
  }

  const shouldApplyLateFee = Boolean(input.applyLateFee);
  let lateFeeResult: LateFeeResult = { applied: false, amount: 0, reason: "not_requested" };
  const canApplyLateFee =
    settings.enabled &&
    (input.triggeredBy !== "automation" || settings.allowAutomationLateFee);
  if (shouldApplyLateFee && canApplyLateFee) {
    lateFeeResult = await applyLateFee(invoice.id, {
      triggeredBy: input.triggeredBy || "manual",
      automationId: input.automationId,
    });
  } else if (shouldApplyLateFee && !canApplyLateFee) {
    lateFeeResult = {
      applied: false,
      amount: 0,
      reason: settings.enabled ? "automation_blocked" : "disabled",
    };
  }

  const updatedInvoice = await prisma.$transaction(async (tx) => {
    const currentInvoice = await tx.invoice.findUnique({
      where: { id: invoice.id },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        lateFeeAmount: true,
        lateFeeTotalAccumulated: true,
        status: true,
        generatedAt: true,
        currency: true,
        metadata: true,
      },
    });
    if (!currentInvoice) {
      const error = new Error("Invoice not found.");
      (error as any).status = 404;
      throw error;
    }

    await tx.reminderDispatch.create({
      data: {
        userId: input.userId,
        customerId: customer.id,
        invoiceId: invoice.id,
        channel: "PENDING",
        dedupeKey,
      },
    });

    return currentInvoice;
  });

  const paymentLinkToken = await getOrCreateInvoicePublicLink(updatedInvoice.id);
  const paymentLink = `${env.appUrl}/api/invoice/pay/${encodeURIComponent(paymentLinkToken.token)}`;
  const dueDate = getInvoiceDueDate(updatedInvoice);
  const daysOverdue = dueDate ? daysSince(dueDate) : 0;
  const baseAmount = getBaseAmount(updatedInvoice);
  const lateFeeAmount = getLateFeeTotal(updatedInvoice);
  const totalDue = roundMoney(Number(updatedInvoice.total || 0));

  const paidRows = await prisma.invoicePayment.findMany({
    where: {
      userId: input.userId,
      invoiceId: updatedInvoice.id,
      status: "SUCCEEDED",
    },
    select: { amount: true, refundOfId: true },
  });
  const totalPaid = roundMoney(
    paidRows.reduce((sum, row) => sum + (row.refundOfId ? -Number(row.amount || 0) : Number(row.amount || 0)), 0)
  );
  const basePaid = Math.min(baseAmount, Math.max(0, totalPaid));
  const feePaid = Math.max(0, totalPaid - basePaid);
  const baseOutstanding = roundMoney(Math.max(0, baseAmount - basePaid));
  const feeOutstanding = roundMoney(Math.max(0, lateFeeAmount - feePaid));
  const outstanding = roundMoney(baseOutstanding + feeOutstanding);

  const dueDateLabel = dueDate ? dueDate.toLocaleDateString() : "--";
  const recipientName = customer.name || "Customer";
  const currency = updatedInvoice.currency || "USD";

  const htmlRows = [
    `<p>Hi ${recipientName},</p>`,
    `<p>This is a reminder for invoice <strong>${updatedInvoice.invoiceNumber}</strong>.</p>`,
    `<ul>`,
    `<li>Original amount: ${formatCurrency(baseAmount, currency)}</li>`,
    lateFeeAmount > 0 ? `<li>Late fee: ${formatCurrency(lateFeeAmount, currency)}</li>` : "",
    `<li>Total due: ${formatCurrency(totalDue, currency)}</li>`,
    `<li>Outstanding balance: ${formatCurrency(outstanding, currency)}</li>`,
    `<li>Due date: ${dueDateLabel}</li>`,
    `<li>Days overdue: ${daysOverdue}</li>`,
    `</ul>`,
    `<p>Pay securely: <a href="${paymentLink}">${paymentLink}</a></p>`,
  ].filter(Boolean);
  const html = htmlRows.join("");

  const shouldEmail =
    (customer.deliveryPreference === "EMAIL" || customer.deliveryPreference === "BOTH") && Boolean(customer.email);
  const shouldWhatsapp =
    (customer.deliveryPreference === "WHATSAPP" || customer.deliveryPreference === "BOTH") &&
    Boolean(customer.phone);
  const fallbackEmail = !shouldEmail && !shouldWhatsapp && Boolean(customer.email);
  const fallbackWhatsapp = !shouldEmail && !shouldWhatsapp && Boolean(customer.phone);

  if (!shouldEmail && !shouldWhatsapp && !fallbackEmail && !fallbackWhatsapp) {
    await prisma.reminderDispatch.deleteMany({ where: { dedupeKey } });
    const error = new Error("Customer has no contact information.");
    (error as any).status = 400;
    throw error;
  }

  const channelsSent: string[] = [];
  try {
    if (shouldEmail || fallbackEmail) {
      await sendBillingMail({
        to: String(customer.email),
        subject: `Payment reminder: ${updatedInvoice.invoiceNumber}`,
        html,
      });
      channelsSent.push("EMAIL");
    }

    if (shouldWhatsapp || fallbackWhatsapp) {
      assertRateLimit(`reminder:whatsapp:${input.userId}`, 20, 60_000);
      await sendWhatsAppText({
        to: String(customer.phone),
        body: `Invoice ${updatedInvoice.invoiceNumber} is overdue.\nOriginal: ${formatCurrency(
          baseAmount,
          currency
        )}${
          lateFeeAmount > 0 ? `\nLate fee: ${formatCurrency(lateFeeAmount, currency)}` : ""
        }\nTotal due: ${formatCurrency(totalDue, currency)}\nPay: ${paymentLink}`,
      });
      channelsSent.push("WHATSAPP");
    }
  } catch (error) {
    await prisma.reminderDispatch.deleteMany({ where: { dedupeKey } });
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.reminderDispatch.updateMany({
      where: { dedupeKey },
      data: { channel: channelsSent.join(",") || "NONE" },
    });

    await createAuditEvent(tx, {
      userId: input.userId,
      action: "REMINDER_SENT",
      resourceId: updatedInvoice.id,
      metadata: {
        customerId: customer.id,
        invoiceId: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        channels: channelsSent,
        lateFeeIncluded: lateFeeAmount > 0,
      },
    });
  });

  return {
    success: true,
    reminder: {
      invoiceId: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoiceNumber,
      channels: channelsSent,
      lateFeeIncluded: lateFeeAmount > 0,
      lateFeeAmount: lateFeeAmount,
      lateFeeApplied: lateFeeResult.applied,
      outstanding,
      paymentLink,
    },
  };
}
