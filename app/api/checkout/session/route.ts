import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import { initializeFlutterwavePayment } from "@/lib/payments/flutterwave";
import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  isAllowedCurrency,
  isProviderCurrency,
  getPaystackEnabledCurrencies,
  isPaystackCurrencyEnabled,
  normalizeCurrency,
  toMinorUnits,
} from "@/lib/payments/currency-allowlist";
import { z } from "zod";

const requestSchema = z.object({
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  interval: z.enum(["monthly", "yearly"]),
  currency: z.string().optional(),
});

const toPlanEnum = (plan: string) => {
  switch (plan.toLowerCase()) {
    case "pro":
      return "PRO";
    case "growth":
      return "GROWTH";
    case "business":
      return "BUSINESS";
    case "enterprise":
      return "ENTERPRISE";
    default:
      return "STARTER";
  }
};

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    assertRateLimit(`checkout:${session.user.id}`, 8, 60_000);
    const { provider, interval, currency: rawCurrency } = requestSchema.parse(await req.json());

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, preferredCurrency: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const plan = toPlanEnum(subscription.plan);
    if (plan === "ENTERPRISE") {
      return NextResponse.json({ error: "Enterprise is contact sales" }, { status: 400 });
    }

    const billingCycle: BillingInterval = interval === "yearly" ? "yearly" : "monthly";
    let currency = normalizeCurrency(rawCurrency || user.preferredCurrency || "USD");

    if (!isAllowedCurrency(currency)) {
      currency = "USD";
    }

    if (provider === "PAYSTACK") {
      const paystackEnabled = getPaystackEnabledCurrencies();
      if (!isProviderCurrency("PAYSTACK", currency) || !isPaystackCurrencyEnabled(currency)) {
        currency = paystackEnabled[0] || "NGN";
      }
    }

    if (!isProviderCurrency(provider, currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const planAmount = getPlanPriceForInterval(plan, currency, billingCycle);
    if (!planAmount) {
      return NextResponse.json({ error: "Pricing not configured for currency" }, { status: 500 });
    }

    const reference = `mb_${Date.now().toString(36).slice(-6)}_${crypto.randomBytes(2).toString("hex")}`;
    const checkout = await prisma.checkoutSession.create({
      data: {
        userId: session.user.id,
        subscriptionId: subscription.id,
        plan,
        billingCycle,
        provider,
        currency,
        amount: planAmount,
        reference,
        status: "CREATED",
      },
    });

    const origin = new URL(req.url).origin;
    const appUrl =
      process.env.NODE_ENV === "production"
        ? process.env.APP_URL || process.env.NEXTAUTH_URL || origin
        : origin;

    let redirectUrl: string | undefined;
    if (provider === "PAYSTACK") {
      const init = await initializePaystackTransaction({
        reference,
        amount: toMinorUnits(planAmount, currency),
        currency,
        email: user.email,
        callback_url: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
        metadata: {
          type: "checkout_session",
          checkoutSessionId: checkout.id,
          subscriptionId: subscription.id,
          userId: session.user.id,
          plan,
          interval: billingCycle,
        },
      });
      redirectUrl = init?.data?.authorization_url || init?.authorization_url;
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { status: "REDIRECTED", providerPayload: init ?? null },
      });
    } else {
      const init = await initializeFlutterwavePayment({
        amount: planAmount,
        currency,
        email: user.email,
        name: user.name || user.email,
        txRef: reference,
        redirectUrl: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
        metadata: {
          type: "checkout_session",
          checkoutSessionId: checkout.id,
          subscriptionId: subscription.id,
          userId: session.user.id,
          plan,
          interval: billingCycle,
        },
      });
      redirectUrl = init?.data?.link || init?.link;
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { status: "REDIRECTED", providerPayload: init ?? null },
      });
    }

    if (!redirectUrl) {
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { status: "FAILED" },
      });
      return NextResponse.json({ error: "Unable to start checkout" }, { status: 500 });
    }

    return NextResponse.json({ reference, redirectUrl });
  })
);
