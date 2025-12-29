import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { z } from "zod";
import { pricingTableDualCurrency } from "@/lib/pricing";
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

  assertRateLimit(`paystack:${session.user.id}`, 20, 60_000);
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const currency = normalizeCurrency(parsed.currency || "NGN");
  if (!isAllowedCurrency(currency) || !isProviderCurrency("PAYSTACK", currency)) {
    return NextResponse.json({ error: "Paystack only supports NGN in this app" }, { status: 400 });
  }
  if (parsed.plan === "enterprise") {
    return NextResponse.json({ error: "Enterprise is contact sales" }, { status: 400 });
  }

  const plan = parsed.plan ?? "starter";
  const priceTable = pricingTableDualCurrency();
  const starter = priceTable.find((p) => p.plan === "STARTER");
  const pro = priceTable.find((p) => p.plan === "GROWTH");
  const planNgn = plan === "pro" ? pro?.ngn : starter?.ngn;

  if (!planNgn) {
    return NextResponse.json({ error: "Pricing not configured for NGN" }, { status: 500 });
  }

  // Paystack expects amount in kobo (NGN * 100). Never trust the client-provided amount.
  const amountKobo = planNgn * 100;
  if (typeof parsed.amount === "number" && parsed.amount !== amountKobo) {
    return NextResponse.json({ error: "Invalid amount for selected plan" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const appUrl =
    process.env.NODE_ENV === "production"
      ? process.env.APP_URL || process.env.NEXTAUTH_URL || origin
      : origin;

  const init = await initializePaystackTransaction({
    amount: amountKobo,
    currency,
    email: user.email,
    callback_url: `${appUrl}/dashboard?payment=success&provider=paystack&amount=${planNgn}&currency=${currency}`,
    metadata: { userId: user.id, plan: plan === "pro" ? "GROWTH" : "STARTER" },
  });
  return NextResponse.json(init);
}));
