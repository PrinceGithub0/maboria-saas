import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import { attemptFlutterwaveSubscriptionRenewal } from "@/lib/subscription-renewal";
import { requireSystemFlag } from "@/lib/system-flags-guard";

function mapRenewalFailure(reason: string) {
  switch (reason) {
    case "unsupported_provider":
      return "This renewal flow is not available for the current billing provider.";
    case "missing_subscription":
      return "No active subscription was found.";
    case "not_due":
      return "This subscription is not due for renewal yet.";
    case "auto_renew_disabled":
      return "Auto-renew is turned off for this subscription.";
    case "missing_payment_method":
      return "No reusable Flutterwave payment method is stored for this workspace yet.";
    case "missing_country":
      return "Billing country is missing for this saved payment method.";
    case "unsupported_amount":
      return "This renewal amount could not be calculated safely.";
    case "existing_pending_renewal":
      return "A Flutterwave renewal attempt is already in progress.";
    default:
      return "Unable to start renewal right now.";
  }
}

export const POST = withErrorHandling(async (req: Request) => {
  const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
  if (paymentsDisabled) return paymentsDisabled;

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

  assertRateLimit(`sub:renew-now:${session.user.id}`, 4, 60_000);

  const result = await attemptFlutterwaveSubscriptionRenewal({
    ownerUserId: access.context.ownerUserId,
    orgId: access.context.orgId,
    req,
  });

  if (!result.ok) {
    const status = result.reason === "existing_pending_renewal" ? 409 : 400;
    return NextResponse.json(
      {
        error: mapRenewalFailure(result.reason),
        code: result.reason,
        reference: result.reference ?? null,
        redirectUrl: result.redirectUrl ?? null,
      },
      { status }
    );
  }

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: "SUBSCRIPTION_RENEWAL_ATTEMPTED",
    metadata: {
      status: result.status,
      reference: result.reference,
    },
  });

  return NextResponse.json(result);
});
