import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initializeFlutterwavePayment } from "@/lib/payments/flutterwave";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { z } from "zod";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z
    .object({
      plan: z.enum(["starter", "pro", "enterprise"]).optional(),
      currency: z.string().optional(),
      amount: z.number().optional(),
    })
    .parse(await req.json());

  assertRateLimit(`flutterwave:${session.user.id}`, 20, 60_000);

  if (parsed.plan === "enterprise") {
    return NextResponse.json({ error: "Enterprise is contact sales" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const currency = normalizeCurrency(parsed.currency || "USD");
  if (!isAllowedCurrency(currency) || !isProviderCurrency("FLUTTERWAVE", currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  const plan = parsed.plan ?? "starter";
  const priceTable = pricingTableDualCurrency();
  const starter = priceTable.find((p) => p.plan === "STARTER");
  const pro = priceTable.find((p) => p.plan === "GROWTH");
  const planAmount =
    currency === "NGN"
      ? plan === "pro"
        ? pro?.ngn
        : starter?.ngn
      : currency === "USD"
        ? plan === "pro"
          ? pro?.usd
          : starter?.usd
        : null;

  if (!planAmount) {
    return NextResponse.json({ error: "Pricing not configured for selected currency" }, { status: 400 });
  }

  if (typeof parsed.amount === "number" && parsed.amount !== planAmount) {
    return NextResponse.json({ error: "Invalid amount for selected plan" }, { status: 400 });
  }

  const txRef = `maboria_${session.user.id}_${Date.now()}`;
  const origin = new URL(req.url).origin;
  const appUrl =
    process.env.NODE_ENV === "production"
      ? process.env.APP_URL || process.env.NEXTAUTH_URL || origin
      : origin;
  const init = await initializeFlutterwavePayment({
    amount: planAmount,
    currency,
    email: user.email,
    name: user.name,
    txRef,
    redirectUrl: `${appUrl}/dashboard?payment=success&provider=flutterwave&amount=${planAmount}&currency=${currency}`,
    metadata: {
      userId: session.user.id,
      plan: plan === "pro" ? "GROWTH" : "STARTER",
    },
  });

  return NextResponse.json(init);
}));
