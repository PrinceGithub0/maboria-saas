import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { requireOrgPermission } from "@/lib/org-auth";
import { startCheckoutSession } from "@/lib/payments/checkout-session";
import { CHECKOUT_PROVIDER_VALUES } from "@/lib/payments/payment-providers";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const requestSchema = z.object({
  selectedPlan: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  interval: z.enum(["monthly", "yearly"]).optional(),
  userId: z.string().optional(),
  detectedCountry: z.string().optional(),
  currency: z.string().optional(),
  provider: z.enum(CHECKOUT_PROVIDER_VALUES).optional(),
});

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    assertRateLimit(`checkout:${session.user.id}`, 8, 60_000);

    const parsed = requestSchema.parse(await req.json());
    const access = await requireOrgPermission(session.user.id, {
      permission: "subscription:manage",
      requireActiveSubscription: false,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    if (parsed.userId && parsed.userId !== access.context.ownerUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const billingCycle = parsed.billingCycle || parsed.interval || "monthly";
    const result = await startCheckoutSession({
      req,
      userId: access.context.ownerUserId,
      selectedPlan: parsed.selectedPlan,
      billingCycle,
      detectedCountry: parsed.detectedCountry,
      requestedCurrency: parsed.currency,
      requestedProvider: parsed.provider,
    });

    return NextResponse.json(result);
  })
);
