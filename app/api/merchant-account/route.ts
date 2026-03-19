import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { merchantAccountSchema } from "@/lib/validators";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export const GET = withRequestLogging(
  withErrorHandling(async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "settings:payout:read",
      requireActiveSubscription: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const record = await prisma.merchantAccount.findUnique({
      where: { userId: access.context.ownerUserId },
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  })
);

export const PUT = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "settings:payout:write",
      requireActiveSubscription: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const parsed = merchantAccountSchema.parse(await req.json());
    const paystackCode = parsed.paystackSubaccountCode?.trim() || null;
    const flutterwaveId = parsed.flutterwaveSubaccountId?.trim() || null;

    const existing = await prisma.merchantAccount.findUnique({
      where: { userId: access.context.ownerUserId },
    });

    if (existing?.payoutType === "SEPA" && paystackCode) {
      return NextResponse.json(
        { error: "Paystack is not supported for SEPA payouts." },
        { status: 400 }
      );
    }

    if (!paystackCode && !flutterwaveId) {
      return NextResponse.json(
        { error: "At least one payout account is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.merchantAccount.upsert({
      where: { userId: access.context.ownerUserId },
      create: {
        userId: access.context.ownerUserId,
        paystackSubaccountCode: paystackCode,
        flutterwaveSubaccountId: flutterwaveId,
      },
      update: {
        paystackSubaccountCode: paystackCode,
        flutterwaveSubaccountId: flutterwaveId,
      },
    });

    await writeOrgAuditLog({
      orgId: access.context.orgId,
      actorUserId: session.user.id,
      actionType: "PAYOUT_SETTINGS_UPDATED",
      metadata: {
        provider: updated.provider,
        payoutType: updated.payoutType,
      },
    });

    return NextResponse.json(updated);
  })
);
