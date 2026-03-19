import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { requireOrgPermission } from "@/lib/org-auth";
import { startCheckoutSession } from "@/lib/payments/checkout-session";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const requestSchema = z.object({
  plan: z.string().optional(),
  currency: z.string().optional(),
  interval: z.enum(["monthly", "yearly"]).optional(),
});

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    assertRateLimit(`stripe-checkout:${session.user.id}`, 8, 60_000);

    const parsed = requestSchema.parse(await req.json());
    const access = await requireOrgPermission(session.user.id, {
      permission: "subscription:manage",
      requireActiveSubscription: false,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const result = await startCheckoutSession({
      req,
      userId: access.context.ownerUserId,
      selectedPlan: parsed.plan,
      billingCycle: parsed.interval || "monthly",
      requestedCurrency: parsed.currency,
      requestedProvider: "STRIPE",
    });

    return NextResponse.json(result);
  })
);
