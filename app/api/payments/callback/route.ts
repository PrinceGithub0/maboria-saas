import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { recordPaystackPayment, verifyPaystackTransaction } from "@/lib/payments/paystack";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveTransactionByReference,
} from "@/lib/payments/flutterwave";

function redirectWithStatus(origin: string, provider: string, status: string, params?: Record<string, string>) {
  const url = new URL("/dashboard", origin);
  url.searchParams.set("payment", status);
  url.searchParams.set("provider", provider);
  url.searchParams.set("source", "callback");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
}

export const GET = withRequestLogging(withErrorHandling(async (req: Request) => {
  const { searchParams, origin } = new URL(req.url);
  const provider = searchParams.get("provider");

  if (!provider || (provider !== "paystack" && provider !== "flutterwave")) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (provider === "paystack") {
    const reference = searchParams.get("reference") || "";
    if (!reference) {
      return redirectWithStatus(origin, provider, "failed");
    }

    const verification = await verifyPaystackTransaction(reference);
    const data = verification?.data;
    if (!data || data.status !== "success") {
      return redirectWithStatus(origin, provider, "pending", { reference });
    }

    const priceTable = pricingTableDualCurrency();
    const starter = priceTable.find((p) => p.plan === "STARTER");
    const pro = priceTable.find((p) => p.plan === "GROWTH");
    const amountNgn = Number(data?.amount || 0) / 100;
    const currency = (data?.currency || "NGN").toUpperCase();
    const inferredPlan =
      currency === "NGN" && starter?.ngn === amountNgn
        ? "STARTER"
        : currency === "NGN" && pro?.ngn === amountNgn
          ? "GROWTH"
          : undefined;
    const userId = (data?.metadata?.userId as string | undefined) || undefined;
    const plan = (data?.metadata?.plan as string | undefined) || inferredPlan;

    data.metadata = { ...(data?.metadata || {}), userId, plan };
    await recordPaystackPayment(data);

    if (userId && (plan === "STARTER" || plan === "GROWTH")) {
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
      log("info", "paystack_subscription_synced", { userId, plan, status: "ACTIVE", source: "callback" });
      const newPlan = subscriptionPlanToUserPlan(plan);
      log("info", "billing_plan_transition", {
        provider: "paystack",
        event: "callback",
        userId,
        oldPlan: "free",
        newPlan,
      });
    }

    return redirectWithStatus(origin, provider, "success", {
      reference,
      amount: amountNgn.toString(),
      currency,
    });
  }

  const transactionId = searchParams.get("transaction_id");
  const txRef = searchParams.get("tx_ref");

  if (!transactionId && !txRef) {
    return redirectWithStatus(origin, provider, "failed");
  }

  const verification = transactionId
    ? await verifyFlutterwaveTransaction(transactionId)
    : await verifyFlutterwaveTransactionByReference(txRef as string);
  const verified = verification?.data;
  if (!verified || verification?.status !== "success" || verified?.status !== "successful") {
    return redirectWithStatus(origin, provider, "pending", { tx_ref: txRef || "" });
  }

  const priceTable = pricingTableDualCurrency();
  const starter = priceTable.find((p) => p.plan === "STARTER");
  const pro = priceTable.find((p) => p.plan === "GROWTH");
  const amount = Number(verified?.amount || 0);
  const currency = (verified?.currency || "USD").toUpperCase();
  const inferredPlan =
    currency === "NGN" && starter?.ngn === amount
      ? "STARTER"
      : currency === "NGN" && pro?.ngn === amount
        ? "GROWTH"
        : currency === "USD" && starter?.usd === amount
          ? "STARTER"
          : currency === "USD" && pro?.usd === amount
            ? "GROWTH"
            : undefined;
  const userId = (verified?.meta?.userId as string | undefined) || undefined;
  const plan = (verified?.meta?.plan as string | undefined) || inferredPlan;

  await recordFlutterwavePayment({ ...verified, meta: { ...(verified?.meta || {}), userId, plan } });

  if (userId && (plan === "STARTER" || plan === "GROWTH")) {
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
    log("info", "flutterwave_subscription_synced", { userId, plan, status: "ACTIVE", source: "callback" });
    const newPlan = subscriptionPlanToUserPlan(plan);
    log("info", "billing_plan_transition", {
      provider: "flutterwave",
      event: "callback",
      userId,
      oldPlan: "free",
      newPlan,
    });
  }

  return redirectWithStatus(origin, provider, "success", {
    tx_ref: txRef || "",
    transaction_id: transactionId || "",
    amount: amount.toString(),
    currency,
  });
}));

export const dynamic = "force-dynamic";
