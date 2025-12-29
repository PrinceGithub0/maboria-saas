import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { recordPaystackPayment, verifyPaystackTransaction } from "@/lib/payments/paystack";
import { recordFlutterwavePayment, verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { log } from "@/lib/logger";

const payloadSchema = z.object({
  provider: z.enum(["paystack", "flutterwave"]),
  reference: z.string().optional(),
  transactionId: z.union([z.string(), z.number()]).optional(),
});

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.parse(await req.json());
  assertRateLimit(`payment-verify:${session.user.id}`, 10, 60_000);

  if (parsed.provider === "paystack") {
    if (!parsed.reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }
    const verification = await verifyPaystackTransaction(parsed.reference);
    const data = verification?.data;
    if (!data || data.status !== "success") {
      return NextResponse.json({ status: "pending" });
    }
    const userId = data?.metadata?.userId as string | undefined;
    const plan = data?.metadata?.plan as string | undefined;
    if (!userId || userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid user for payment" }, { status: 403 });
    }

    await recordPaystackPayment(data);
    if (plan === "STARTER" || plan === "GROWTH") {
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const existingForPlan = await prisma.subscription.findFirst({
        where: { userId, plan },
        orderBy: { createdAt: "desc" },
      });
      if (existingForPlan) {
        await prisma.subscription.update({
          where: { id: existingForPlan.id },
          data: { status: "ACTIVE", renewalDate },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId,
            plan,
            status: "ACTIVE",
            renewalDate,
            currency: "NGN",
            interval: "monthly",
          },
        });
      }
      log("info", "paystack_subscription_synced", { userId, plan, status: "ACTIVE", source: "verify" });
      const newPlan = subscriptionPlanToUserPlan(plan);
      log("info", "billing_plan_transition", {
        provider: "paystack",
        event: "verify",
        userId,
        oldPlan: "free",
        newPlan,
      });
    }

    return NextResponse.json({ status: "synced" });
  }

  if (!parsed.transactionId) {
    return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
  }

  const verification = await verifyFlutterwaveTransaction(parsed.transactionId);
  const verified = verification?.data;
  if (!verified || verification?.status !== "success" || verified?.status !== "successful") {
    return NextResponse.json({ status: "pending" });
  }

  const userId = verified?.meta?.userId as string | undefined;
  const plan = verified?.meta?.plan as string | undefined;
  const amount = Number(verified?.amount || 0);
  const currency = (verified?.currency || "USD").toUpperCase();
  if (!userId || userId !== session.user.id) {
    return NextResponse.json({ error: "Invalid user for payment" }, { status: 403 });
  }

  if (plan) {
    const priceTable = pricingTableDualCurrency();
    const planRow = plan === "GROWTH" ? priceTable.find((p) => p.plan === "GROWTH") : priceTable.find((p) => p.plan === "STARTER");
    const expected = currency === "NGN" ? planRow?.ngn : planRow?.usd;
    if (expected && amount !== expected) {
      log("warn", "flutterwave_amount_mismatch", { userId, plan, amount, expected, source: "verify" });
      return NextResponse.json({ status: "pending" });
    }
  }

  await recordFlutterwavePayment({ ...verified, meta: verified?.meta });
  if (plan === "STARTER" || plan === "GROWTH") {
    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existingForPlan = await prisma.subscription.findFirst({
      where: { userId, plan },
      orderBy: { createdAt: "desc" },
    });
    if (existingForPlan) {
      await prisma.subscription.update({
        where: { id: existingForPlan.id },
        data: { status: "ACTIVE", renewalDate },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId,
          plan,
          status: "ACTIVE",
          renewalDate,
          currency: currency === "NGN" ? "NGN" : "USD",
          interval: "monthly",
        },
      });
    }
    log("info", "flutterwave_subscription_synced", { userId, plan, status: "ACTIVE", source: "verify" });
    const newPlan = subscriptionPlanToUserPlan(plan);
    log("info", "billing_plan_transition", {
      provider: "flutterwave",
      event: "verify",
      userId,
      oldPlan: "free",
      newPlan,
    });
  }

  return NextResponse.json({ status: "synced" });
}));
