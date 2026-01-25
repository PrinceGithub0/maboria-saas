import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { z } from "zod";
import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  isAllowedCurrency,
  isProviderCurrency,
  getPaystackEnabledCurrencies,
  isPaystackCurrencyEnabled,
  normalizeCurrency,
  toMinorUnits,
} from "@/lib/payments/currency-allowlist";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z
    .object({
      plan: z.enum(["starter", "pro", "growth", "business", "enterprise"]).optional(),
      currency: z.string().optional(),
      amount: z.number().optional(),
      interval: z.enum(["monthly", "yearly"]).optional(),
    })
    .parse(await req.json());

  assertRateLimit(`paystack:${session.user.id}`, 20, 60_000);
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const paystackEnabled = getPaystackEnabledCurrencies();
  let currency = normalizeCurrency(parsed.currency || paystackEnabled[0] || "NGN");
  if (!isAllowedCurrency(currency) || !isProviderCurrency("PAYSTACK", currency)) {
    currency = paystackEnabled[0] || "NGN";
  }
  if (!isPaystackCurrencyEnabled(currency)) {
    currency = paystackEnabled[0] || "NGN";
  }
  if (parsed.plan === "enterprise") {
    return NextResponse.json({ error: "Enterprise is contact sales" }, { status: 400 });
  }

  const plan = parsed.plan ?? "starter";
  const interval: BillingInterval = parsed.interval === "yearly" ? "yearly" : "monthly";
  const planCurrency =
    plan === "pro"
      ? "PRO"
      : plan === "growth"
        ? "GROWTH"
        : plan === "business"
          ? "BUSINESS"
          : "STARTER";
  const price = getPlanPriceForInterval(planCurrency, currency, interval);

  if (!price) {
    return NextResponse.json({ error: "Pricing not configured for currency" }, { status: 500 });
  }

  // Paystack expects amount in minor units (kobo/pesewa/etc). Never trust the client-provided amount.
  const amountMinor = toMinorUnits(price, currency);
  if (typeof parsed.amount === "number" && parsed.amount !== amountMinor) {
    return NextResponse.json({ error: "Invalid amount for selected plan" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const appUrl =
    process.env.NODE_ENV === "production"
      ? process.env.APP_URL || process.env.NEXTAUTH_URL || origin
      : origin;

  const reference = `mb_${Date.now().toString(36).slice(-6)}_${crypto.randomBytes(2).toString("hex")}`;
  const init = await initializePaystackTransaction({
    reference,
    amount: amountMinor,
    currency,
    email: user.email,
    callback_url: `${appUrl}/dashboard?payment=success&provider=paystack&amount=${price}&currency=${currency}&reference=${encodeURIComponent(
      reference
    )}`,
    metadata: { userId: user.id, plan: planCurrency, interval },
  });
  return NextResponse.json(init);
}));
