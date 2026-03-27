import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import {
  resumeSubscriptionAutoRenew,
  scheduleSubscriptionCancellation,
} from "@/lib/subscription-downgrade";
import { deriveSubscriptionManagement } from "@/lib/subscription-management";

const schema = z.object({
  enabled: z.boolean(),
});

function mapSubscriptionRenewalError(reason: string) {
  switch (reason) {
    case "no_active_subscription":
      return "No active subscription was found.";
    case "missing_period_end":
      return "We could not determine your current billing period end.";
    case "already_scheduled":
      return "Auto-renew is already turned off for the end of this billing period.";
    case "not_scheduled":
      return "Auto-renew is already active for this subscription.";
    default:
      return "Unable to update auto-renew.";
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

  assertRateLimit(`sub:renew:${session.user.id}`, 6, 60_000);
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
  if (!management.canManageAutoRenewInApp && management.billingMode === "provider_portal") {
    return NextResponse.json(
      {
        error: "Manage auto-renew in the Stripe billing portal.",
        code: "EXTERNAL_BILLING_PORTAL_REQUIRED",
        portalPath: management.portalPath,
      },
      { status: 409 }
    );
  }
  if (!management.canManageAutoRenewInApp && management.billingMode === "provider_external") {
    return NextResponse.json(
      {
        error: "Auto-renew changes for this billing provider are not self-serve in the dashboard yet.",
        code: "EXTERNAL_BILLING_PROVIDER_REQUIRED",
      },
      { status: 409 }
    );
  }

  const { enabled } = schema.parse(await req.json());
  const result = enabled
    ? await resumeSubscriptionAutoRenew(access.context.ownerUserId, access.context.orgId)
    : await scheduleSubscriptionCancellation(access.context.ownerUserId, access.context.orgId);

  if (!result.ok) {
    return NextResponse.json(
      { error: mapSubscriptionRenewalError(result.reason), code: result.reason },
      { status: 400 }
    );
  }

  const effectiveAt =
    !enabled && "effectiveAt" in result ? result.effectiveAt : null;

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: enabled ? "SUBSCRIPTION_RENEWAL_RESUMED" : "SUBSCRIPTION_CANCEL_SCHEDULED",
    metadata: effectiveAt ? { effectiveAt } : {},
  });

  return NextResponse.json({
    ok: true,
    enabled,
    effectiveAt,
  });
});
