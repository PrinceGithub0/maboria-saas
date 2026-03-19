import "server-only";

import { PrismaClient, LateFeeType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export type LateFeeSettingsSnapshot = {
  enabled: boolean;
  type: "fixed" | "percentage";
  value: number;
  graceDays: number;
  mode: "one_time" | "recurring";
  intervalDays: number | null;
  cap: number | null;
  maxApplications: number | null;
  allowAutomationLateFee: boolean;
  policyText: string | null;
  reminderCooldownMinutes: number;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function getOrCreateSubscriberSetting(userId: string, tx?: DbClient) {
  const db = (tx || prisma) as any;
  return db.subscriberSetting.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export function toLateFeeSettingsSnapshot(setting: {
  lateFeeEnabled: boolean;
  lateFeeType: LateFeeType;
  lateFeeValue: any;
  gracePeriodDays?: number | null;
  lateFeeMode?: "ONE_TIME" | "RECURRING" | null;
  lateFeeIntervalDays?: number | null;
  allowAutomationLateFee?: boolean;
  maxLateFeeApplications?: number | null;
  lateFeeGraceDays: number;
  lateFeeCap: any;
  lateFeeRecurring: boolean;
  lateFeeRecurringIntervalDays: number | null;
  lateFeePolicyText: string | null;
  reminderCooldownMinutes: number;
}): LateFeeSettingsSnapshot {
  return {
    enabled: Boolean(setting.lateFeeEnabled),
    type: setting.lateFeeType === "PERCENTAGE" ? "percentage" : "fixed",
    value: toNumber(setting.lateFeeValue),
    graceDays: Math.max(
      0,
      Number(
        setting.gracePeriodDays ??
          (setting.lateFeeGraceDays ?? 0)
      )
    ),
    mode:
      setting.lateFeeMode === "RECURRING" || setting.lateFeeRecurring
        ? "recurring"
        : "one_time",
    intervalDays: (() => {
      const raw = setting.lateFeeIntervalDays ?? setting.lateFeeRecurringIntervalDays;
      if (raw === null || typeof raw === "undefined") return null;
      return Math.max(1, Number(raw));
    })(),
    cap: setting.lateFeeCap === null ? null : toNumber(setting.lateFeeCap),
    maxApplications:
      setting.maxLateFeeApplications === null || typeof setting.maxLateFeeApplications === "undefined"
        ? null
        : Math.max(1, Number(setting.maxLateFeeApplications)),
    allowAutomationLateFee: Boolean(setting.allowAutomationLateFee),
    policyText: setting.lateFeePolicyText ? String(setting.lateFeePolicyText).trim() : null,
    reminderCooldownMinutes: Math.max(1, Number(setting.reminderCooldownMinutes || 10)),
  };
}
