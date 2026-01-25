import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { recordPaystackPayment, verifyPaystackTransaction } from "@/lib/payments/paystack";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveTransactionByReference,
} from "@/lib/payments/flutterwave";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import {
  getPlanFromAmountWithInterval,
  getPlanPriceForInterval,
  type BillingInterval,
} from "@/lib/pricing";
import { fromMinorUnits } from "@/lib/payments/currency-allowlist";
import { log } from "@/lib/logger";

const payloadSchema = z.object({
  provider: z.enum(["paystack", "flutterwave"]),
  reference: z.string().optional(),
  transactionId: z.union([z.string(), z.number()]).optional(),
  txRef: z.string().optional(),
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
    const amount = fromMinorUnits(Number(data?.amount || 0), data?.currency || "NGN");
    const currency = (data?.currency || "NGN").toUpperCase();
    const inferred = getPlanFromAmountWithInterval(currency, amount);
    const userId = (data?.metadata?.userId as string | undefined) || session.user.id;
    const plan = (data?.metadata?.plan as string | undefined) || inferred?.plan;
    const rawInterval = String(data?.metadata?.interval || "");
    const interval: BillingInterval =
      rawInterval === "yearly" ? "yearly" : rawInterval === "monthly" ? "monthly" : inferred?.interval || "monthly";
    if (data?.metadata?.userId && data?.metadata?.userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid user for payment" }, { status: 403 });
    }

    const normalizedPlan = plan === "PREMIUM" ? "BUSINESS" : plan;
    data.metadata = { ...(data?.metadata || {}), userId, plan: normalizedPlan ?? plan, interval };

    if (normalizedPlan) {
      const planKey =
        normalizedPlan === "STARTER" ||
        normalizedPlan === "PRO" ||
        normalizedPlan === "GROWTH" ||
        normalizedPlan === "BUSINESS" ||
        normalizedPlan === "PREMIUM" ||
        normalizedPlan === "ENTERPRISE"
          ? normalizedPlan
          : null;
      const expected = planKey ? getPlanPriceForInterval(planKey, currency, interval) : null;
      if (expected && Math.abs(amount - expected) > 0.01) {
        log("warn", "paystack_amount_mismatch", { userId, plan: normalizedPlan, amount, expected, source: "verify" });
        return NextResponse.json({ status: "pending" });
      }
    }

    await recordPaystackPayment(data);
    if (normalizedPlan === "STARTER" || normalizedPlan === "PRO" || normalizedPlan === "GROWTH" || normalizedPlan === "BUSINESS") {
      const renewalDate =
        interval === "yearly"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const existingForPlan = await prisma.subscription.findFirst({
        where: { userId, plan: normalizedPlan },
        orderBy: { createdAt: "desc" },
      });
      if (existingForPlan) {
        await prisma.subscription.update({
          where: { id: existingForPlan.id },
          data: { status: "ACTIVE", renewalDate, currency, interval, plan: normalizedPlan },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId,
            plan: normalizedPlan,
            status: "ACTIVE",
            renewalDate,
            currency,
            interval,
          },
        });
      }
      log("info", "paystack_subscription_synced", { userId, plan: normalizedPlan, status: "ACTIVE", source: "verify" });
      const newPlan = subscriptionPlanToUserPlan(normalizedPlan);
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

  if (!parsed.transactionId && !parsed.txRef) {
    return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
  }

  const verification = parsed.transactionId
    ? await verifyFlutterwaveTransaction(parsed.transactionId)
    : await verifyFlutterwaveTransactionByReference(parsed.txRef as string);
  const verified = verification?.data;
  if (!verified || verification?.status !== "success" || verified?.status !== "successful") {
    return NextResponse.json({ status: "pending" });
  }

  const amount = Number(verified?.amount || 0);
  const currency = (verified?.currency || "USD").toUpperCase();
  const inferred = getPlanFromAmountWithInterval(currency, amount);
  const userId = (verified?.meta?.userId as string | undefined) || session.user.id;
  const plan = (verified?.meta?.plan as string | undefined) || inferred?.plan;
  const rawInterval = String(verified?.meta?.interval || "");
  const interval: BillingInterval =
    rawInterval === "yearly" ? "yearly" : rawInterval === "monthly" ? "monthly" : inferred?.interval || "monthly";
  if (verified?.meta?.userId && verified?.meta?.userId !== session.user.id) {
    return NextResponse.json({ error: "Invalid user for payment" }, { status: 403 });
  }

  const normalizedPlan = plan === "PREMIUM" ? "BUSINESS" : plan;
  if (normalizedPlan) {
    const planKey =
      normalizedPlan === "STARTER" ||
      normalizedPlan === "PRO" ||
      normalizedPlan === "GROWTH" ||
      normalizedPlan === "BUSINESS" ||
      normalizedPlan === "PREMIUM" ||
      normalizedPlan === "ENTERPRISE"
        ? normalizedPlan
        : null;
    const expected = planKey ? getPlanPriceForInterval(planKey, currency, interval) : null;
    if (expected && Math.abs(amount - expected) > 0.01) {
      log("warn", "flutterwave_amount_mismatch", { userId, plan: normalizedPlan, amount, expected, source: "verify" });
      return NextResponse.json({ status: "pending" });
    }
  }

  await recordFlutterwavePayment({ ...verified, meta: { ...(verified?.meta || {}), userId, plan: normalizedPlan ?? plan, interval } });
  if (normalizedPlan === "STARTER" || normalizedPlan === "PRO" || normalizedPlan === "GROWTH" || normalizedPlan === "BUSINESS") {
    const renewalDate =
      interval === "yearly"
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existingForPlan = await prisma.subscription.findFirst({
      where: { userId, plan: normalizedPlan },
      orderBy: { createdAt: "desc" },
    });
    if (existingForPlan) {
      await prisma.subscription.update({
        where: { id: existingForPlan.id },
        data: { status: "ACTIVE", renewalDate, currency, interval, plan: normalizedPlan },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId,
          plan: normalizedPlan,
          status: "ACTIVE",
          renewalDate,
          currency,
          interval,
        },
      });
    }
    log("info", "flutterwave_subscription_synced", { userId, plan: normalizedPlan, status: "ACTIVE", source: "verify" });
    const newPlan = subscriptionPlanToUserPlan(normalizedPlan);
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
