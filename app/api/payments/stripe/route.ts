import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId, currency } = await req.json();
  assertRateLimit(`stripe:${session.user.id}`, 20, 60_000);

  const checkout = await createStripeCheckoutSession({
    userId: session.user.id,
    priceId,
    currency,
    successUrl: `${process.env.APP_URL}/dashboard/payments?status=success`,
    cancelUrl: `${process.env.APP_URL}/dashboard/payments?status=cancelled`,
  });
  return NextResponse.json({ url: checkout.url });
}));
