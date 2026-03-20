import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import {
  recordPaystackPayment,
  verifyPaystackTransaction,
  normalizePaystackPaymentMethod,
} from "@/lib/payments/paystack";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveTransactionByReference,
  normalizeFlutterwavePaymentMethod,
} from "@/lib/payments/flutterwave";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { requireOrgPermission } from "@/lib/org-auth";
import {
  getPlanFromAmountWithInterval,
  getPlanPriceForInterval,
  type BillingInterval,
} from "@/lib/pricing";
import { fromMinorUnits } from "@/lib/payments/currency-allowlist";
import { log } from "@/lib/logger";

const payloadSchema = z.object({
  provider: z.enum(["paystack", "flutterwave", "stripe"]).optional(),
  reference: z.string().optional(),
  transactionId: z.union([z.string(), z.number()]).optional(),
  txRef: z.string().optional(),
});

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = payloadSchema.parse(await req.json());
  assertRateLimit(`payment-verify:${session.user.id}`, 10, 60_000);

  const canActForUser = async (targetUserId: string) => {
    if (targetUserId === session.user.id) return true;
    const access = await requireOrgPermission(session.user.id, {
      permission: "subscription:manage",
      requireActiveSubscription: false,
    });
    return access.ok && access.context.ownerUserId === targetUserId;
  };

  let provider = parsed.provider;
  let checkoutStatus: "CREATED" | "REDIRECTED" | "SUCCESS" | "FAILED" | "ABANDONED" | null = null;
  if (!provider && parsed.reference) {
    const checkout = await prisma.checkoutSession.findUnique({
      where: { reference: parsed.reference },
      select: { provider: true, status: true, userId: true },
    });

    if (!checkout) {
      return NextResponse.json({ error: "Unknown checkout reference" }, { status: 404 });
    }
    if (!(await canActForUser(checkout.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    provider = checkout.provider.toLowerCase() as "paystack" | "flutterwave" | "stripe";
    checkoutStatus = checkout.status;

    if (checkout.status === "SUCCESS") {
      return NextResponse.json({ status: "synced" });
    }
    if (checkout.status === "ABANDONED" || checkout.status === "FAILED") {
      return NextResponse.json({ status: "failed" });
    }
    if (checkout.provider === "STRIPE") {
      return NextResponse.json({ status: "pending" });
    }
  }

  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  if (provider === "stripe") {
    if (!parsed.reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const checkout = await prisma.checkoutSession.findUnique({
      where: { reference: parsed.reference },
      select: { status: true, userId: true },
    });

    if (!checkout) {
      return NextResponse.json({ error: "Unknown checkout reference" }, { status: 404 });
    }
    if (!(await canActForUser(checkout.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (checkout.status === "SUCCESS") {
      return NextResponse.json({ status: "synced" });
    }
    if (checkout.status === "ABANDONED" || checkout.status === "FAILED") {
      return NextResponse.json({ status: "failed" });
    }
    return NextResponse.json({ status: "pending" });
  }

  if (provider === "paystack") {
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
    if (data?.metadata?.userId && !(await canActForUser(data.metadata.userId as string))) {
      return NextResponse.json({ error: "Invalid user for payment" }, { status: 403 });
    }

    const normalizedPlan = plan === "PREMIUM" ? "BUSINESS" : plan;
    data.metadata = {
      ...(data?.metadata || {}),
      userId,
      plan: normalizedPlan ?? plan,
      interval,
      verified: true,
      paymentMethod: normalizePaystackPaymentMethod(data),
    };

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
      const checkout = parsed.reference
        ? await prisma.checkoutSession.findUnique({
            where: { reference: parsed.reference },
            select: { amount: true },
          })
        : null;
      const expected = checkout ? Number(checkout.amount) : planKey ? getPlanPriceForInterval(planKey, currency, interval) : null;
      if (expected && Math.abs(amount - expected) > 0.01) {
        log("warn", "paystack_amount_mismatch", { userId, plan: normalizedPlan, amount, expected, source: "verify" });
        return NextResponse.json({ status: "pending" });
      }
    }

    await recordPaystackPayment(data);
    if (normalizedPlan === "STARTER" || normalizedPlan === "PRO" || normalizedPlan === "GROWTH" || normalizedPlan === "BUSINESS") {
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

  const flutterwaveTxRef = parsed.txRef || (provider === "flutterwave" ? parsed.reference : undefined);

  if (!parsed.transactionId && !flutterwaveTxRef) {
    if (checkoutStatus === "CREATED" || checkoutStatus === "REDIRECTED") {
      return NextResponse.json({ status: "pending" });
    }
    return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
  }

  const verification = parsed.transactionId
    ? await verifyFlutterwaveTransaction(parsed.transactionId)
    : await verifyFlutterwaveTransactionByReference(flutterwaveTxRef as string);
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
  if (verified?.meta?.userId && !(await canActForUser(verified.meta.userId as string))) {
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
    const checkoutReference = flutterwaveTxRef || parsed.txRef;
    const checkout = checkoutReference
      ? await prisma.checkoutSession.findUnique({
          where: { reference: checkoutReference },
          select: { amount: true },
        })
      : null;
    const expected = checkout ? Number(checkout.amount) : planKey ? getPlanPriceForInterval(planKey, currency, interval) : null;
    if (expected && Math.abs(amount - expected) > 0.01) {
      log("warn", "flutterwave_amount_mismatch", { userId, plan: normalizedPlan, amount, expected, source: "verify" });
      return NextResponse.json({ status: "pending" });
    }
  }

  await recordFlutterwavePayment({
    ...verified,
    meta: {
      ...(verified?.meta || {}),
      userId,
      plan: normalizedPlan ?? plan,
      interval,
      verified: true,
      paymentMethod: normalizeFlutterwavePaymentMethod(verified),
    },
  });
  if (normalizedPlan === "STARTER" || normalizedPlan === "PRO" || normalizedPlan === "GROWTH" || normalizedPlan === "BUSINESS") {
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
