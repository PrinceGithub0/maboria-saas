import "server-only";

import crypto from "crypto";
import { Prisma, type PaymentProvider, type SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import { initializeFlutterwavePayment } from "@/lib/payments/flutterwave";
import { initializeStripeCheckoutSession } from "@/lib/payments/stripe";
import type { BillingInterval } from "@/lib/pricing";
import {
  isAllowedCurrency,
  isProviderCurrency,
  isPaystackCurrencyEnabled,
  isStripeSupportedCurrency,
  normalizeCurrency,
  toMinorUnits,
} from "@/lib/payments/currency-allowlist";
import {
  type CheckoutProvider,
  getCheckoutFallbackProviders,
  getCountryFromRequestHeaders,
  isCheckoutProviderEnabled,
  normalizeCountryCode,
  resolvePaymentProvider,
} from "@/lib/payments/payment-providers";
import { resolveOrgContext } from "@/lib/org-auth";
import {
  buildSubscriptionCheckoutQuote,
  isDowngradeChange,
  normalizeBillingInterval,
} from "@/lib/payments/subscription-change";

type StartCheckoutSessionInput = {
  req: Request;
  userId: string;
  selectedPlan?: string | null;
  billingCycle: BillingInterval;
  detectedCountry?: string | null;
  requestedCurrency?: string | null;
  requestedProvider?: CheckoutProvider | null;
};

type ProviderInitResult = {
  redirectUrl?: string;
  payload?: unknown;
};

type CheckoutContextPayload = {
  action: "new_subscription" | "renewal" | "upgrade";
  currentPlan: SubscriptionPlan | null;
  currentInterval: BillingInterval | null;
  targetPlan: SubscriptionPlan;
  targetInterval: BillingInterval;
  fullAmount: number;
  amountDue: number;
  creditAmount: number;
  remainingRatio: number;
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

const toSubscriptionStatusFromOrgStatus = (status?: string | null) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE" as const;
  if (normalized === "PAST_DUE") return "PAST_DUE" as const;
  if (normalized === "TRIALING") return "TRIALING" as const;
  if (normalized === "CANCELED") return "CANCELED" as const;
  return "INCOMPLETE" as const;
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

  if (provider === "STRIPE") {
    const init = await initializeStripeCheckoutSession({
      amount,
      currency,
      customerEmail: userEmail,
      customerName: userName,
      reference,
      successUrl: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
      cancelUrl: `${appUrl}/checkout`,
      planName: `Maboria ${plan} plan`,
      interval: billingCycle,
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
      redirectUrl: init?.url,
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
  requestedProvider,
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

  let subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    const orgContext = await resolveOrgContext(userId);
    if (orgContext?.role !== "owner") {
      throw createHttpError("Only organization owners can retry subscription payment", 403);
    }
    const orgSub = await prisma.orgSubscription.findUnique({
      where: { orgId: orgContext.orgId },
      select: {
        planId: true,
        status: true,
        billingInterval: true,
        paidThroughAt: true,
        provider: true,
      },
    });
    if (!orgSub) {
      throw createHttpError("Subscription not found", 404);
    }

    subscription = await prisma.subscription.create({
      data: {
        userId: orgContext.ownerUserId,
        plan: orgSub.planId,
        status: toSubscriptionStatusFromOrgStatus(orgSub.status),
        renewalDate: orgSub.paidThroughAt ?? new Date(),
        usageLimit: null,
        usagePeriod: "monthly",
        currency: "USD",
        autoRenew: true,
        cancelAtPeriodEnd: false,
        provider: orgSub.provider ?? undefined,
        interval: orgSub.billingInterval === "YEARLY" ? "yearly" : "monthly",
      },
    });
  }

  const plan = toPlanEnum(subscription.plan);
  if (plan === "ENTERPRISE") {
    throw createHttpError("Enterprise is contact sales", 400);
  }

  const currentInterval = normalizeBillingInterval(subscription.interval);
  const targetPlan = selectedPlan ? toPlanEnum(selectedPlan) : plan;
  if (targetPlan === "ENTERPRISE") {
    throw createHttpError("Enterprise is contact sales", 400);
  }

  if (
    isDowngradeChange({
      currentPlan: plan,
      targetPlan,
      currentInterval,
      targetInterval: billingCycle,
    })
  ) {
    throw createHttpError("Use scheduled downgrade for lower plans or shorter billing cycles", 400);
  }

  let currency = normalizeCurrency(
    requestedCurrency || user.preferredCurrency || subscription.currency || "USD"
  );
  if (!isAllowedCurrency(currency) && !isStripeSupportedCurrency(currency)) {
    currency = "USD";
  }

  const billingCountry =
    normalizeCountryCode(user.businessProfile?.country) ||
    normalizeCountryCode(user.merchantAccount?.country);
  const ipCountry = getCountryFromRequestHeaders(req.headers);
  const detected = normalizeCountryCode(detectedCountry);
  const resolvedCountry = billingCountry || ipCountry || detected;
  const providerCandidates = [
    resolvePaymentProvider(resolvedCountry, requestedProvider),
    ...getCheckoutFallbackProviders(
      resolvePaymentProvider(resolvedCountry, requestedProvider),
      resolvedCountry
    ),
  ].filter((provider, index, providers) => providers.indexOf(provider) === index);

  const checkoutCandidates = providerCandidates
    .map((provider) => {
      if (!isCheckoutProviderEnabled(provider)) return null;
      let providerCurrency = currency;
      const providerAcceptsRequestedCurrency =
        isProviderCurrency(provider, providerCurrency) &&
        (provider !== "PAYSTACK" || isPaystackCurrencyEnabled(providerCurrency));

      if (!providerAcceptsRequestedCurrency) {
        providerCurrency = "USD";
      }

      const providerAcceptsFallbackCurrency =
        isProviderCurrency(provider, providerCurrency) &&
        (provider !== "PAYSTACK" || isPaystackCurrencyEnabled(providerCurrency));

      if (!providerAcceptsFallbackCurrency) {
        return null;
      }

      const quote = buildSubscriptionCheckoutQuote({
        currency: providerCurrency,
        targetPlan,
        targetInterval: billingCycle,
        currentPlan: plan,
        currentInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
      if (!quote || quote.amountDue <= 0) return null;

      return {
        provider,
        currency: providerCurrency,
        amount: quote.amountDue,
        context: {
          action: quote.action,
          currentPlan: quote.currentPlan,
          currentInterval: quote.currentInterval,
          targetPlan: quote.targetPlan,
          targetInterval: quote.targetInterval,
          fullAmount: quote.fullAmount,
          amountDue: quote.amountDue,
          creditAmount: quote.creditAmount,
          remainingRatio: quote.remainingRatio,
        } satisfies CheckoutContextPayload,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        provider: CheckoutProvider;
        currency: string;
        amount: number;
        context: CheckoutContextPayload;
      } =>
        Boolean(candidate)
    );

  const initialCheckout = checkoutCandidates[0];
  if (!initialCheckout) {
    throw createHttpError("Unsupported currency", 400);
  }

  log("info", "checkout_provider_resolved", {
    userId,
    billingCountry,
    ipCountry,
    detectedCountry: detected,
    resolvedCountry: resolvedCountry || null,
    provider: initialCheckout.provider,
    currency: initialCheckout.currency,
    requestedProvider: requestedProvider || null,
  });

  const reference = `mb_${Date.now().toString(36).slice(-6)}_${crypto.randomBytes(2).toString("hex")}`;
  const checkout = await prisma.checkoutSession.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      plan: targetPlan,
      billingCycle,
      provider: initialCheckout.provider,
      currency: initialCheckout.currency,
      amount: initialCheckout.amount,
      reference,
      status: "CREATED",
      providerPayload: {
        checkoutContext: initialCheckout.context,
      } as Prisma.InputJsonValue,
    },
  });

  const appUrl = getAppUrl(req);
  let finalProvider: PaymentProvider = initialCheckout.provider;
  let finalCurrency = initialCheckout.currency;
  let finalAmount = initialCheckout.amount;
  let finalContext = initialCheckout.context;
  let initialized: ProviderInitResult | null = null;
  let initError: unknown = null;

  for (let index = 0; index < checkoutCandidates.length; index += 1) {
    const candidate = checkoutCandidates[index];
    finalProvider = candidate.provider;
    finalCurrency = candidate.currency;
    finalAmount = candidate.amount;
    finalContext = candidate.context;

    if (index > 0) {
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: {
          provider: finalProvider,
          currency: finalCurrency,
          amount: finalAmount,
          providerPayload: {
            checkoutContext: finalContext,
          } as Prisma.InputJsonValue,
        },
      });

      log("warn", "checkout_provider_fallback", {
        userId,
        reference,
        fallbackTo: finalProvider,
      });
    }

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
        plan: targetPlan,
        billingCycle,
        appUrl,
        countryCode: resolvedCountry || null,
      });
      initError = null;
      if (initialized?.redirectUrl) {
        break;
      }
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
      providerPayload: {
        checkoutContext: finalContext,
        providerInit:
          initialized.payload == null
            ? null
            : (initialized.payload as Prisma.InputJsonValue),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    reference,
    redirectUrl: initialized.redirectUrl,
  };
}
