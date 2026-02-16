import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { startCheckoutSession } from "@/lib/payments/checkout-session";

const requestSchema = z.object({
  selectedPlan: z.string().optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  interval: z.enum(["monthly", "yearly"]).optional(),
  userId: z.string().optional(),
  detectedCountry: z.string().optional(),
  currency: z.string().optional(),
});

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    assertRateLimit(`checkout:${session.user.id}`, 8, 60_000);

    const parsed = requestSchema.parse(await req.json());
    if (parsed.userId && parsed.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const billingCycle = parsed.billingCycle || parsed.interval || "monthly";
    const result = await startCheckoutSession({
      req,
      userId: session.user.id,
      selectedPlan: parsed.selectedPlan,
      billingCycle,
      detectedCountry: parsed.detectedCountry,
      requestedCurrency: parsed.currency,
    });

    return NextResponse.json(result);
  })
);
