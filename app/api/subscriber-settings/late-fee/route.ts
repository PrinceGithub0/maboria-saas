import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lateFeeSettingsSchema } from "@/lib/validators";
import { getOrCreateSubscriberSetting } from "@/lib/subscriber-settings";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";

const isUnknownArgValidationError = (error: any) => {
  const message = String(error?.message || "");
  return (
    error?.name === "PrismaClientValidationError" &&
    message.includes("Unknown argument")
  );
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const settings = await getOrCreateSubscriberSetting(access.context.ownerUserId);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permission = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!permission.ok) {
    return NextResponse.json({ error: permission.message, code: permission.code }, { status: permission.status });
  }

  let hasExistingRow: boolean | null = null;
  try {
    const body = await request.json().catch(() => null);
    const parsed = lateFeeSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid late fee settings payload." }, { status: 400 });
    }

    const mode =
      parsed.data.lateFeeMode ??
      (parsed.data.lateFeeRecurring ? "RECURRING" : "ONE_TIME");
    const gracePeriodDays =
      parsed.data.gracePeriodDays ?? parsed.data.lateFeeGraceDays ?? 0;
    const lateFeeIntervalDays =
      mode === "RECURRING"
        ? parsed.data.lateFeeIntervalDays ?? parsed.data.lateFeeRecurringIntervalDays ?? null
        : null;
    const recurring = mode === "RECURRING";

    if (recurring && !lateFeeIntervalDays) {
      return NextResponse.json(
        { error: "Recurring late fee interval is required." },
        { status: 400 }
      );
    }

    if (parsed.data.lateFeeEnabled && !parsed.data.lateFeePolicyText?.trim()) {
      return NextResponse.json(
        { error: "Late fee policy text is required when late fee is enabled." },
        { status: 400 }
      );
    }

    if (parsed.data.lateFeeEnabled) {
      const value = Number(parsed.data.lateFeeValue);
      const hasInvalidFlat = parsed.data.lateFeeType === "FIXED" && value <= 0;
      const hasInvalidPercentage =
        parsed.data.lateFeeType === "PERCENTAGE" && (value <= 0 || value > 100);
      const hasInvalidGrace = !Number.isFinite(gracePeriodDays) || gracePeriodDays < 0;
      const hasInvalidRecurringInterval =
        recurring && (!Number.isFinite(Number(lateFeeIntervalDays)) || Number(lateFeeIntervalDays) < 1);
      const hasInvalidMaxApplications =
        parsed.data.maxLateFeeApplications !== null &&
        parsed.data.maxLateFeeApplications !== undefined &&
        Number(parsed.data.maxLateFeeApplications) < 1;

      if (
        hasInvalidFlat ||
        hasInvalidPercentage ||
        hasInvalidGrace ||
        hasInvalidRecurringInterval ||
        hasInvalidMaxApplications
      ) {
        console.error("late_fee_settings_validation_failed", {
          userId: permission.context.ownerUserId,
          lateFeeType: parsed.data.lateFeeType,
          lateFeeValue: parsed.data.lateFeeValue,
          gracePeriodDays,
          recurring,
          lateFeeIntervalDays,
          maxLateFeeApplications: parsed.data.maxLateFeeApplications ?? null,
        });
        return NextResponse.json(
          { error: "Invalid late fee settings values." },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.subscriberSetting.findUnique({
      where: { userId: permission.context.ownerUserId },
      select: { id: true },
    });
    hasExistingRow = Boolean(existing);

    const fullUpdateData = {
      lateFeeEnabled: parsed.data.lateFeeEnabled,
      lateFeeType: parsed.data.lateFeeType,
      lateFeeValue: parsed.data.lateFeeValue,
      gracePeriodDays,
      lateFeeMode: mode,
      lateFeeIntervalDays,
      allowAutomationLateFee: parsed.data.allowAutomationLateFee ?? false,
      maxLateFeeApplications: parsed.data.maxLateFeeApplications ?? null,
      lateFeeGraceDays: gracePeriodDays,
      lateFeeCap: parsed.data.lateFeeCap ?? null,
      lateFeeRecurring: recurring,
      lateFeeRecurringIntervalDays: lateFeeIntervalDays,
      lateFeePolicyText: parsed.data.lateFeePolicyText ?? null,
      reminderCooldownMinutes: parsed.data.reminderCooldownMinutes ?? 10,
    };

    const legacyUpdateData = {
      lateFeeEnabled: parsed.data.lateFeeEnabled,
      lateFeeType: parsed.data.lateFeeType,
      lateFeeValue: parsed.data.lateFeeValue,
      lateFeeGraceDays: gracePeriodDays,
      lateFeeCap: parsed.data.lateFeeCap ?? null,
      lateFeeRecurring: recurring,
      lateFeeRecurringIntervalDays: lateFeeIntervalDays,
      lateFeePolicyText: parsed.data.lateFeePolicyText ?? null,
      reminderCooldownMinutes: parsed.data.reminderCooldownMinutes ?? 10,
    };

    let updated: any;
    try {
      updated = await prisma.subscriberSetting.upsert({
        where: { userId: permission.context.ownerUserId },
        update: fullUpdateData,
        create: {
          userId: permission.context.ownerUserId,
          ...fullUpdateData,
        },
      });
    } catch (error: any) {
      if (!isUnknownArgValidationError(error)) throw error;
      console.warn("late_fee_settings_save_legacy_fallback", {
        userId: permission.context.ownerUserId,
        reason: "new_schema_fields_not_available",
        message: error?.message,
      });
      updated = await prisma.subscriberSetting.upsert({
        where: { userId: permission.context.ownerUserId },
        update: legacyUpdateData,
        create: {
          userId: permission.context.ownerUserId,
          ...legacyUpdateData,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: permission.context.ownerUserId,
        action: "LATE_FEE_SETTINGS_UPDATED",
        metadata: {
          lateFeeEnabled: updated.lateFeeEnabled,
          lateFeeType: updated.lateFeeType,
          lateFeeMode: updated.lateFeeMode,
        },
      },
    });

    await writeOrgAuditLog({
      orgId: permission.context.orgId,
      actorUserId: session.user.id,
      actionType: "BUSINESS_SETTINGS_UPDATED",
      metadata: {
        section: "late_fee",
        lateFeeEnabled: updated.lateFeeEnabled,
        lateFeeType: updated.lateFeeType,
        lateFeeMode: updated.lateFeeMode,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const isDev = process.env.NODE_ENV !== "production";
    console.error("late_fee_settings_save_failed", {
      userId: permission.context.ownerUserId,
      hasExistingRow,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: isDev ? error?.stack : undefined,
    });
    return NextResponse.json(
      { error: isDev ? error?.message || "Unable to save late fee settings." : "Unable to save late fee settings." },
      { status: 500 }
    );
  }
}
