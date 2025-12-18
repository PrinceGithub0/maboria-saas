import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { z } from "zod";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z
    .object({
      priceId: z.string().optional(),
      plan: z.enum(["starter", "pro", "enterprise"]).optional(),
      currency: z.string().optional(),
    })
    .parse(await req.json());

  assertRateLimit(`stripe:${session.user.id}`, 20, 60_000);

  const priceStarter = process.env.STRIPE_PRICE_STARTER || process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER;
  const pricePro = process.env.STRIPE_PRICE_GROWTH || process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH;
  const priceEnterprise = process.env.STRIPE_PRICE_ENTERPRISE || process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE;

  if (!priceStarter || !pricePro) {
    return NextResponse.json(
      {
        error: "Stripe pricing is not configured",
        missing: ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH"],
      },
      { status: 500 }
    );
  }

  if (parsed.plan === "enterprise") {
    return NextResponse.json({ error: "Enterprise is contact sales" }, { status: 400 });
  }

  const allowedByPlan = {
    starter: priceStarter,
    pro: pricePro,
    enterprise: priceEnterprise,
  } as const;

  let priceId = parsed.priceId;
  let plan: "starter" | "pro" | undefined = parsed.plan as any;

  if (plan) {
    priceId = allowedByPlan[plan];
  } else if (priceId) {
    if (priceId === allowedByPlan.starter) plan = "starter";
    if (priceId === allowedByPlan.pro) plan = "pro";
  }

  if (!priceId || (priceId !== allowedByPlan.starter && priceId !== allowedByPlan.pro)) {
    return NextResponse.json(
      {
        error: "Invalid Stripe priceId",
        code: "INVALID_PRICE",
      },
      { status: 400 }
    );
  }

  const checkout = await createStripeCheckoutSession({
    userId: session.user.id,
    priceId,
    currency: (parsed.currency || "USD").toUpperCase(),
    plan: plan?.toUpperCase() === "PRO" ? "GROWTH" : "STARTER",
    successUrl: `${process.env.APP_URL}/dashboard/payments?status=success`,
    cancelUrl: `${process.env.APP_URL}/dashboard/payments?status=cancelled`,
  });
  return NextResponse.json({ url: checkout.url });
}));
