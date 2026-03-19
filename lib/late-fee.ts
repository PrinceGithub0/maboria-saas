import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "@/lib/subscriber-settings";

type ApplyLateFeeContext = {
  triggeredBy: "manual" | "automation";
  automationId?: string;
};

export type LateFeeResult =
  | {
      applied: false;
      amount: number;
      reason:
        | "not_found"
        | "not_requested"
        | "not_overdue"
        | "disabled"
        | "automation_blocked"
        | "grace_period"
        | "already_locked"
        | "interval_not_configured"
        | "interval_not_reached"
        | "max_applications_reached"
        | "outstanding_zero"
        | "zero_fee";
    }
  | {
      applied: true;
      amount: number;
      reason: "applied";
      totalDue: number;
      outstandingBalance: number;
      lateFeeCount: number;
      lateFeeTotalAccumulated: number;
    };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysSince = (value: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)));

const getInvoiceDueDate = (metadata: Prisma.JsonValue | null | undefined, generatedAt: Date) => {
  const dueDate = toDate(asRecord(metadata).dueDate);
  return dueDate ?? generatedAt;
};

const calculateOutstanding = async (tx: Prisma.TransactionClient, invoice: {
  id: string;
  userId: string;
  total: Prisma.Decimal | number;
  lateFeeTotalAccumulated: Prisma.Decimal | number;
  lateFeeAmount: Prisma.Decimal | number;
}) => {
  const paid = await tx.invoicePayment.aggregate({
    where: {
      userId: invoice.userId,
      invoiceId: invoice.id,
      status: { in: ["SUCCEEDED", "REFUNDED"] },
    },
    _sum: { amount: true },
  });
  const paidAmount = Number(paid._sum.amount || 0);
  const lateFees = Number(invoice.lateFeeTotalAccumulated || invoice.lateFeeAmount || 0);
  const principal = Math.max(0, Number(invoice.total || 0) - lateFees);
  const outstandingBalance = roundMoney(principal + lateFees - paidAmount);
  return {
    paidAmount: roundMoney(paidAmount),
    principal: roundMoney(principal),
    lateFees: roundMoney(lateFees),
    outstandingBalance: roundMoney(Math.max(0, outstandingBalance)),
  };
};

export async function applyLateFee(invoiceId: string, context: ApplyLateFeeContext): Promise<LateFeeResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`late-fee:${invoiceId}`}))`;

    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        total: true,
        generatedAt: true,
        metadata: true,
        lateFeeAmount: true,
        lateFeeTotalAccumulated: true,
        lateFeeAppliedAt: true,
        lastLateFeeAppliedAt: true,
        lateFeeCount: true,
        lateFeeLocked: true,
      },
    });

    if (!invoice) return { applied: false, amount: 0, reason: "not_found" };
    const status = String(invoice.status || "").toUpperCase();
    if (status !== "OVERDUE") return { applied: false, amount: 0, reason: "not_overdue" };

    const settingsRow = await getOrCreateSubscriberSetting(invoice.userId, tx as any);
    const settings = toLateFeeSettingsSnapshot(settingsRow);
    if (!settings.enabled) return { applied: false, amount: 0, reason: "disabled" };
    if (context.triggeredBy === "automation" && !settings.allowAutomationLateFee) {
      return { applied: false, amount: 0, reason: "automation_blocked" };
    }

    const dueDate = getInvoiceDueDate(invoice.metadata, invoice.generatedAt);
    const daysOverdue = daysSince(dueDate, now);
    if (daysOverdue <= settings.graceDays) {
      return { applied: false, amount: 0, reason: "grace_period" };
    }

    if (settings.mode === "one_time") {
      if (invoice.lateFeeLocked || invoice.lateFeeCount > 0) {
        return { applied: false, amount: 0, reason: "already_locked" };
      }
    } else {
      if (!settings.intervalDays) {
        return { applied: false, amount: 0, reason: "interval_not_configured" };
      }
      if (settings.maxApplications !== null && invoice.lateFeeCount >= settings.maxApplications) {
        return { applied: false, amount: 0, reason: "max_applications_reached" };
      }
      const lastAppliedAt = invoice.lastLateFeeAppliedAt || invoice.lateFeeAppliedAt;
      if (lastAppliedAt) {
        const elapsedDays = daysSince(lastAppliedAt, now);
        if (elapsedDays < settings.intervalDays) {
          return { applied: false, amount: 0, reason: "interval_not_reached" };
        }
      }
    }

    const outstanding = await calculateOutstanding(tx, invoice);
    if (outstanding.outstandingBalance <= 0) {
      return { applied: false, amount: 0, reason: "outstanding_zero" };
    }

    let lateFeeAmount =
      settings.type === "percentage"
        ? roundMoney(outstanding.outstandingBalance * (settings.value / 100))
        : roundMoney(settings.value);
    if (settings.cap !== null) {
      lateFeeAmount = Math.min(lateFeeAmount, roundMoney(settings.cap));
    }
    lateFeeAmount = roundMoney(Math.max(0, lateFeeAmount));
    if (lateFeeAmount <= 0) return { applied: false, amount: 0, reason: "zero_fee" };

    const nextLateFeeAccumulated = roundMoney(Number(invoice.lateFeeTotalAccumulated || invoice.lateFeeAmount || 0) + lateFeeAmount);
    const nextTotalDue = roundMoney(Number(invoice.total || 0) + lateFeeAmount);
    const nextLateFeeCount = Number(invoice.lateFeeCount || 0) + 1;
    const metadata = asRecord(invoice.metadata);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        total: nextTotalDue,
        lateFeeAmount: nextLateFeeAccumulated,
        lateFeeTotalAccumulated: nextLateFeeAccumulated,
        lateFeeCount: nextLateFeeCount,
        lateFeeAppliedAt: now,
        lastLateFeeAppliedAt: now,
        lateFeeLocked: settings.mode === "one_time",
        metadata: {
          ...metadata,
          lateFeePolicyNotice: `Late fee may apply after ${settings.graceDays} days.`,
        } as Prisma.InputJsonValue,
      },
    });

    await Promise.all([
      tx.activityLog.create({
        data: {
          userId: invoice.userId,
          action: "LATE_FEE_APPLIED",
          resourceType: "invoice",
          resourceId: invoice.id,
          metadata: {
            type: "late_fee_applied",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: lateFeeAmount,
            currency: invoice.currency,
            triggeredBy: context.triggeredBy,
            automationId: context.automationId ?? null,
            ruleSnapshot: settings,
          },
        },
      }),
      tx.auditLog.create({
        data: {
          userId: invoice.userId,
          action: "LATE_FEE_APPLIED",
          metadata: {
            type: "late_fee_applied",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: lateFeeAmount,
            currency: invoice.currency,
            triggeredBy: context.triggeredBy,
            automationId: context.automationId ?? null,
            ruleSnapshot: settings,
          },
        },
      }),
    ]);

    return {
      applied: true,
      amount: lateFeeAmount,
      reason: "applied",
      totalDue: nextTotalDue,
      outstandingBalance: roundMoney(outstanding.outstandingBalance + lateFeeAmount),
      lateFeeCount: nextLateFeeCount,
      lateFeeTotalAccumulated: nextLateFeeAccumulated,
    };
  });
}
