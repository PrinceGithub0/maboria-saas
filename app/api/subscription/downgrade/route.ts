import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { cancelScheduledDowngrade, scheduleDowngrade } from "@/lib/subscription-downgrade";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import { deriveSubscriptionManagement } from "@/lib/subscription-management";

const schema = z.object({
  plan: z.enum(["STARTER", "PRO", "GROWTH", "BUSINESS"]),
});

function mapDowngradeError(reason: string) {
  switch (reason) {
    case "no_active_subscription":
      return "No active subscription was found for downgrade scheduling.";
    case "missing_period_end":
      return "We could not determine your current billing period end.";
    case "not_a_downgrade":
      return "Only lower-tier plans can be scheduled as downgrades.";
    case "already_scheduled":
      return "That downgrade is already scheduled for your next billing cycle.";
    case "not_scheduled":
      return "There is no scheduled downgrade to cancel.";
    default:
      return "Unable to schedule downgrade.";
  }
}

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  assertRateLimit(`sub:down:${session.user.id}`, 6, 60_000);
  const orgSub = await prisma.orgSubscription.findUnique({
    where: { orgId: access.context.orgId },
    select: {
      provider: true,
      providerCustomerId: true,
      providerPaymentMethodData: true,
    },
  });
  const management = deriveSubscriptionManagement({
    provider: orgSub?.provider ?? null,
    providerCustomerId: orgSub?.providerCustomerId ?? null,
    hasReusablePaymentMethod: Boolean(orgSub?.providerPaymentMethodData),
    stateSource: orgSub ? "org_subscription" : "none",
  });
  if (!management.canScheduleDowngradeInApp) {
    if (management.billingMode === "provider_portal") {
      return NextResponse.json(
        {
          error: "Manage plan changes in the Stripe billing portal.",
          code: "EXTERNAL_BILLING_PORTAL_REQUIRED",
          portalPath: management.portalPath,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Plan downgrades for this billing provider are not self-serve in the dashboard yet.",
        code: "EXTERNAL_BILLING_PROVIDER_REQUIRED",
      },
      { status: 409 }
    );
  }

  const { plan } = schema.parse(await req.json());
  const result = await scheduleDowngrade(access.context.ownerUserId, plan, access.context.orgId);
  if (!result.ok) {
    return NextResponse.json({ error: mapDowngradeError(result.reason), code: result.reason }, { status: 400 });
  }

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: "SUBSCRIPTION_DOWNGRADE_SCHEDULED",
    metadata: { plan },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  assertRateLimit(`sub:down:${session.user.id}`, 6, 60_000);
  const result = await cancelScheduledDowngrade(access.context.ownerUserId, access.context.orgId);
  if (!result.ok) {
    return NextResponse.json({ error: mapDowngradeError(result.reason), code: result.reason }, { status: 400 });
  }

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: "SUBSCRIPTION_DOWNGRADE_CANCELED",
  });

  return NextResponse.json({ ok: true });
});
