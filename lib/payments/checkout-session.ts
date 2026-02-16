import "server-only";

import crypto from "crypto";
import { Prisma, type PaymentProvider, type SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import { initializeFlutterwavePayment } from "@/lib/payments/flutterwave";
import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  isAllowedCurrency,
  isProviderCurrency,
  isPaystackCurrencyEnabled,
  normalizeCurrency,
  toMinorUnits,
} from "@/lib/payments/currency-allowlist";
import {
  getCountryFromRequestHeaders,
  normalizeCountryCode,
  resolvePaymentProvider,
  toPaymentProviderEnum,
} from "@/lib/payments/payment-providers";

type StartCheckoutSessionInput = {
  req: Request;
  userId: string;
  selectedPlan?: string | null;
  billingCycle: BillingInterval;
  detectedCountry?: string | null;
  requestedCurrency?: string | null;
};

type ProviderInitResult = {
  redirectUrl?: string;
  payload?: unknown;
};

const createHttpError = (message: string, status: number) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

const toPlanEnum = (plan: string): SubscriptionPlan => {
  switch (String(plan || "").toUpperCase()) {
    case "PRO":
      return "PRO";
    case "GROWTH":
      return "GROWTH";
    case "BUSINESS":
    case "PREMIUM":
      return "BUSINESS";
    case "ENTERPRISE":
      return "ENTERPRISE";
    default:
      return "STARTER";
  }
};

const getAppUrl = (req: Request) => {
  const origin = new URL(req.url).origin;
  if (process.env.NODE_ENV === "production") {
    return process.env.APP_URL || process.env.NEXTAUTH_URL || origin;
  }
  return origin;
};

async function initializeProviderCheckout({
  provider,
  amount,
  currency,
  reference,
  checkoutId,
  subscriptionId,
  userId,
  userEmail,
  userName,
  plan,
  billingCycle,
  appUrl,
  countryCode,
}: {
  provider: PaymentProvider;
  amount: number;
  currency: string;
  reference: string;
  checkoutId: string;
  subscriptionId: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: SubscriptionPlan;
  billingCycle: BillingInterval;
  appUrl: string;
  countryCode: string | null;
}): Promise<ProviderInitResult> {
  if (provider === "PAYSTACK") {
    const init = await initializePaystackTransaction({
      reference,
      amount: toMinorUnits(amount, currency),
      currency,
      email: userEmail,
      callback_url: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
      metadata: {
        type: "checkout_session",
        checkoutSessionId: checkoutId,
        subscriptionId,
        userId,
        plan,
        interval: billingCycle,
        country: countryCode,
      },
    });
    return {
      redirectUrl: init?.data?.authorization_url || init?.authorization_url,
      payload: init ?? null,
    };
  }

  const init = await initializeFlutterwavePayment({
    amount,
    currency,
    email: userEmail,
    name: userName || userEmail,
    txRef: reference,
    redirectUrl: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
    metadata: {
      type: "checkout_session",
      checkoutSessionId: checkoutId,
      subscriptionId,
      userId,
      plan,
      interval: billingCycle,
      country: countryCode,
    },
  });
  return {
    redirectUrl: init?.data?.link || init?.link,
    payload: init ?? null,
  };
}

export async function startCheckoutSession({
  req,
  userId,
  selectedPlan,
  billingCycle,
  detectedCountry,
  requestedCurrency,
}: StartCheckoutSessionInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      preferredCurrency: true,
      businessProfile: { select: { country: true } },
      merchantAccount: { select: { country: true } },
    },
  });
  if (!user?.email) {
    throw createHttpError("User not found", 404);
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) {
    throw createHttpError("Subscription not found", 404);
  }

  const plan = toPlanEnum(subscription.plan);
  if (plan === "ENTERPRISE") {
    throw createHttpError("Enterprise is contact sales", 400);
  }

  if (selectedPlan && toPlanEnum(selectedPlan) !== plan) {
    throw createHttpError("Selected plan mismatch", 400);
  }

  let currency = normalizeCurrency(
    requestedCurrency || user.preferredCurrency || subscription.currency || "USD"
  );
  if (!isAllowedCurrency(currency)) {
    currency = "USD";
  }

  const billingCountry =
    normalizeCountryCode(user.businessProfile?.country) ||
    normalizeCountryCode(user.merchantAccount?.country);
  const ipCountry = getCountryFromRequestHeaders(req.headers);
  const detected = normalizeCountryCode(detectedCountry);
  const resolvedCountry = billingCountry || ipCountry || detected;

  let provider = toPaymentProviderEnum(resolvePaymentProvider(resolvedCountry));

  if (
    provider === "PAYSTACK" &&
    (!isProviderCurrency("PAYSTACK", currency) || !isPaystackCurrencyEnabled(currency))
  ) {
    provider = "FLUTTERWAVE";
  }

  if (!isProviderCurrency(provider, currency)) {
    currency = "USD";
  }
  if (!isProviderCurrency(provider, currency)) {
    throw createHttpError("Unsupported currency", 400);
  }

  const planAmount = getPlanPriceForInterval(plan, currency, billingCycle);
  if (!planAmount) {
    throw createHttpError("Pricing not configured for currency", 500);
  }

  log("info", "checkout_provider_resolved", {
    userId,
    billingCountry,
    ipCountry,
    detectedCountry: detected,
    resolvedCountry: resolvedCountry || null,
    provider,
    currency,
  });

  const reference = `mb_${Date.now().toString(36).slice(-6)}_${crypto.randomBytes(2).toString("hex")}`;
  const checkout = await prisma.checkoutSession.create({
    data: {
      userId,
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

  const appUrl = getAppUrl(req);
  let finalProvider: PaymentProvider = provider;
  let finalCurrency = currency;
  let finalAmount = planAmount;
  let initialized: ProviderInitResult | null = null;
  let initError: unknown = null;

  try {
    initialized = await initializeProviderCheckout({
      provider: finalProvider,
      amount: finalAmount,
      currency: finalCurrency,
      reference,
      checkoutId: checkout.id,
      subscriptionId: subscription.id,
      userId,
      userEmail: user.email,
      userName: user.name || user.email,
      plan,
      billingCycle,
      appUrl,
      countryCode: resolvedCountry || null,
    });
  } catch (error) {
    initError = error;
    log("error", "checkout_provider_init_failed", {
      userId,
      reference,
      provider: finalProvider,
      error: (error as Error).message,
    });
  }

  if ((initError || !initialized?.redirectUrl) && finalProvider !== "FLUTTERWAVE") {
    finalProvider = "FLUTTERWAVE";
    if (!isProviderCurrency("FLUTTERWAVE", finalCurrency)) {
      finalCurrency = "USD";
    }
    const fallbackAmount = getPlanPriceForInterval(plan, finalCurrency, billingCycle);
    if (!fallbackAmount) {
      throw createHttpError("Pricing not configured for fallback currency", 500);
    }
    finalAmount = fallbackAmount;

    await prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: {
        provider: finalProvider,
        currency: finalCurrency,
        amount: finalAmount,
      },
    });

    log("warn", "checkout_provider_fallback", {
      userId,
      reference,
      fallbackTo: finalProvider,
    });

    initError = null;
    try {
      initialized = await initializeProviderCheckout({
        provider: finalProvider,
        amount: finalAmount,
        currency: finalCurrency,
        reference,
        checkoutId: checkout.id,
        subscriptionId: subscription.id,
        userId,
        userEmail: user.email,
        userName: user.name || user.email,
        plan,
        billingCycle,
        appUrl,
        countryCode: resolvedCountry || null,
      });
    } catch (error) {
      initError = error;
      log("error", "checkout_provider_init_failed", {
        userId,
        reference,
        provider: finalProvider,
        error: (error as Error).message,
      });
    }
  }

  if (initError || !initialized?.redirectUrl) {
    await prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: { status: "FAILED" },
    });
    throw createHttpError("Unable to start checkout", 500);
  }

  await prisma.checkoutSession.update({
    where: { id: checkout.id },
    data: {
      provider: finalProvider,
      currency: finalCurrency,
      amount: finalAmount,
      status: "REDIRECTED",
      providerPayload:
        initialized.payload == null
          ? Prisma.JsonNull
          : (initialized.payload as Prisma.InputJsonValue),
    },
  });

  return {
    reference,
    redirectUrl: initialized.redirectUrl,
  };
}
