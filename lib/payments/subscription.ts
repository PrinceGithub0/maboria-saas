import "server-only";

import {
  OrgBillingInterval,
  OrgSubscriptionStatus,
  Prisma,
  type PaymentProvider,
  type SubscriptionPlan,
} from "@prisma/client";

import { syncBusinessPlanForUser, subscriptionPlanToUserPlan } from "../entitlements";
import { log } from "../logger";
import {
  buildInvoiceIssuerCode,
  formatSequentialInvoiceNumber,
  getInvoiceNumberYear,
} from "../invoice-number";
import { prisma } from "../prisma";
import { emitSystemEvent } from "../system-events";
import { clampAnchorDay } from "../usage/cycle";
import { getPlanPriceForInterval, type BillingInterval } from "../pricing";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "./currency-allowlist";
import { extractFlutterwaveStoredPaymentMethod } from "./flutterwave-recurring";
import { isSubscriptionReceiptProvider, maybeSendSubscriptionReceipt } from "../subscription-receipt";
import {
  buildBillingPeriodWindow,
  normalizeBillingInterval,
  type SubscriptionCheckoutAction,
  type SubscriptionCheckoutQuote,
} from "./subscription-change";

const normalizePlan = (plan?: string | null): SubscriptionPlan | null => {
  if (!plan) return null;
  const normalized = String(plan).toUpperCase();
  if (normalized === "PREMIUM") return "BUSINESS";
  if (["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"].includes(normalized)) {
    return normalized as SubscriptionPlan;
  }
  return null;
};

type StoredCheckoutContext = SubscriptionCheckoutQuote;

function mapSubscriptionStatusToOrgStatus(status: string | null | undefined): OrgSubscriptionStatus {
  const value = String(status || "").toUpperCase();
  if (value === "PAST_DUE") return "PAST_DUE";
  if (value === "TRIALING") return "TRIALING";
  if (value === "CANCELED" || value === "INACTIVE" || value === "REVOKED") return "CANCELED";
  return "ACTIVE";
}

function mapIntervalToOrgBillingInterval(interval: BillingInterval): OrgBillingInterval {
  return interval === "yearly" ? "YEARLY" : "MONTHLY";
}

function parseCheckoutContext(payload: Prisma.JsonValue | null): StoredCheckoutContext | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const checkoutContext = (payload as Record<string, unknown>).checkoutContext;
  if (!checkoutContext || typeof checkoutContext !== "object" || Array.isArray(checkoutContext)) {
    return null;
  }

  const record = checkoutContext as Record<string, unknown>;
  const targetPlan = normalizePlan(String(record.targetPlan || ""));
  const currentPlan = record.currentPlan ? normalizePlan(String(record.currentPlan || "")) : null;
  const targetInterval = normalizeBillingInterval(String(record.targetInterval || "monthly"));
  const currentInterval = record.currentInterval
    ? normalizeBillingInterval(String(record.currentInterval || "monthly"))
    : null;
  const action = String(record.action || "renewal") as SubscriptionCheckoutAction;
  if (!targetPlan) return null;

  return {
    action,
    targetPlan,
    targetInterval,
    currentPlan,
    currentInterval,
    fullAmount: Number(record.fullAmount || 0),
    amountDue: Number(record.amountDue || 0),
    creditAmount: Number(record.creditAmount || 0),
    remainingRatio: Number(record.remainingRatio || 0),
  };
}

async function ensureBillingCustomer(tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">, userId: string) {
  const userRecord = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const customerEmail = String(userRecord?.email || `unknown+${userId}@placeholder.local`)
    .trim()
    .toLowerCase();
  const customerName = String(userRecord?.name || "").trim() || "Subscription Customer";

  return tx.customer.upsert({
    where: {
      userId_email: {
        userId,
        email: customerEmail,
      },
    },
    update: {
      name: customerName,
      deletedAt: null,
    },
    create: {
      userId,
      name: customerName,
      email: customerEmail,
      deliveryPreference: "EMAIL",
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      deliveryPreference: true,
    },
  });
}

async function createSubscriptionInvoice(input: {
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
  userId: string;
  subscriptionId: string;
  plan: SubscriptionPlan;
  billingCycle: BillingInterval;
  amount: number;
  currency: string;
  checkoutSessionId: string;
  action: SubscriptionCheckoutAction;
  creditAmount: number;
  fullAmount: number;
}) {
  const customer = await ensureBillingCustomer(input.tx, input.userId);
  const invoiceYear = getInvoiceNumberYear();
  const issuerCode = buildInvoiceIssuerCode(input.userId, input.userId);
  const invoiceSequence =
    (await input.tx.invoice.count({
      where: {
        userId: input.userId,
        generatedAt: {
          gte: new Date(Date.UTC(invoiceYear, 0, 1)),
          lt: new Date(Date.UTC(invoiceYear + 1, 0, 1)),
        },
      },
    })) + 1;
  const invoiceNumber = formatSequentialInvoiceNumber(invoiceYear, invoiceSequence, issuerCode);
  const itemName =
    input.action === "upgrade" && input.creditAmount > 0
      ? `Prorated upgrade to ${input.plan} subscription (${input.billingCycle})`
      : `${input.plan} subscription (${input.billingCycle})`;

  await input.tx.invoice.create({
    data: {
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      customerId: customer.id,
      invoiceNumber,
      items: [
        {
          name: itemName,
          quantity: 1,
          price: Number(input.amount),
        },
      ],
      total: input.amount,
      currency: input.currency,
      status: "PAID",
      plan: input.plan,
      invoiceCustomerSnapshot: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: {
          addressLine1: customer.addressLine1,
          addressLine2: customer.addressLine2,
          city: customer.city,
          state: customer.state,
          postalCode: customer.postalCode,
          country: customer.country,
        },
        deliveryPreference: customer.deliveryPreference,
      } as Prisma.InputJsonValue,
      metadata: {
        checkoutSessionId: input.checkoutSessionId,
        action: input.action,
        creditAmount: input.creditAmount,
        fullAmount: input.fullAmount,
      } as Prisma.InputJsonValue,
    },
  });
}

export async function finalizeSubscriptionPayment({
  provider,
  reference,
  amount,
  currency,
  userId,
  plan,
  interval,
  paymentMethod,
  verifiedAt,
  rawPayload,
}: {
  provider: PaymentProvider;
  reference: string;
  amount: number;
  currency: string;
  userId: string;
  plan?: string | null;
  interval?: string | null;
  paymentMethod?: string | null;
  verifiedAt?: Date | string | null;
  rawPayload?: any;
}) {
  const normalizedCurrency = normalizeCurrency(currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency) || !isProviderCurrency(provider, normalizedCurrency)) {
    log("warn", "subscription_currency_unsupported", {
      userId,
      reference,
      provider,
      currency: normalizedCurrency,
    });
    return null;
  }

  const paidAt = verifiedAt ? new Date(verifiedAt) : new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const existingPayment = await tx.payment.findFirst({
      where: { provider, reference },
    });
    if (existingPayment) {
      return {
        payment: existingPayment,
        subscriptionId: null,
        alreadyExists: true,
        plan: normalizePlan(String((existingPayment.metadata as Record<string, unknown> | null)?.plan || plan || "")),
        interval: normalizeBillingInterval(
          String((existingPayment.metadata as Record<string, unknown> | null)?.interval || interval || "monthly")
        ),
        action: String((existingPayment.metadata as Record<string, unknown> | null)?.action || "renewal") as SubscriptionCheckoutAction,
      };
    }

    const checkout = await tx.checkoutSession.findUnique({
      where: { reference },
      select: {
        id: true,
        userId: true,
        subscriptionId: true,
        plan: true,
        billingCycle: true,
        provider: true,
        currency: true,
        amount: true,
        status: true,
        providerPayload: true,
      },
    });

    let normalizedPlan = normalizePlan(plan);
    let resolvedInterval = normalizeBillingInterval(interval);
    let checkoutAction: SubscriptionCheckoutAction = "renewal";
    let checkoutQuote: StoredCheckoutContext | null = null;
    let subscriptionId: string | null = null;

    if (checkout) {
      if (checkout.userId !== userId) {
        log("warn", "checkout_session_user_mismatch", { reference, provider, expectedUserId: checkout.userId, userId });
        return null;
      }

      normalizedPlan = checkout.plan;
      resolvedInterval = normalizeBillingInterval(checkout.billingCycle);
      checkoutQuote = parseCheckoutContext(checkout.providerPayload);
      checkoutAction = checkoutQuote?.action || "renewal";
      const expectedAmount = Number(checkout.amount || 0);
      if (Math.abs(Number(amount) - expectedAmount) > 0.01) {
        log("warn", "checkout_session_amount_mismatch", {
          userId,
          reference,
          provider,
          amount,
          expected: expectedAmount,
          currency: normalizedCurrency,
        });
        return null;
      }

      const { currentPeriodStart, currentPeriodEnd } = buildBillingPeriodWindow(resolvedInterval, paidAt);
      const renewalDate = currentPeriodEnd;
      const sourceSubscription = await tx.subscription.findUnique({
        where: { id: checkout.subscriptionId },
      });

      if (
        sourceSubscription &&
        (checkoutAction === "upgrade" ||
          sourceSubscription.plan !== normalizedPlan ||
          normalizeBillingInterval(sourceSubscription.interval) !== resolvedInterval)
      ) {
        await tx.subscription.update({
          where: { id: sourceSubscription.id },
          data: {
            status: "CANCELED",
            autoRenew: false,
            cancelAtPeriodEnd: false,
            cancellationReason: `upgraded_to_${normalizedPlan.toLowerCase()}`,
            pendingPlan: null,
            pendingEffectiveAt: null,
          },
        });

        const created = await tx.subscription.create({
          data: {
            userId,
            plan: normalizedPlan,
            status: "ACTIVE",
            renewalDate,
            currency: normalizedCurrency,
            interval: resolvedInterval,
            provider,
            currentPeriodStart,
            currentPeriodEnd,
            autoRenew: true,
            cancelAtPeriodEnd: false,
            lastPaymentReference: reference,
            lastPaymentProvider: provider,
          },
        });
        subscriptionId = created.id;
      } else if (sourceSubscription) {
        await tx.subscription.update({
          where: { id: sourceSubscription.id },
          data: {
            status: "ACTIVE",
            renewalDate,
            currency: normalizedCurrency,
            interval: resolvedInterval,
            plan: normalizedPlan,
            provider,
            currentPeriodStart,
            currentPeriodEnd,
            autoRenew: true,
            cancelAtPeriodEnd: false,
            pendingPlan: null,
            pendingEffectiveAt: null,
            lastPaymentReference: reference,
            lastPaymentProvider: provider,
          },
        });
        subscriptionId = sourceSubscription.id;
      } else {
        const created = await tx.subscription.create({
          data: {
            userId,
            plan: normalizedPlan,
            status: "ACTIVE",
            renewalDate,
            currency: normalizedCurrency,
            interval: resolvedInterval,
            provider,
            currentPeriodStart,
            currentPeriodEnd,
            autoRenew: true,
            cancelAtPeriodEnd: false,
            lastPaymentReference: reference,
            lastPaymentProvider: provider,
          },
        });
        subscriptionId = created.id;
      }

      await tx.checkoutSession.update({
        where: { id: checkout.id },
        data: {
          status: "SUCCESS",
          providerPayload: {
            ...(checkout.providerPayload && typeof checkout.providerPayload === "object" && !Array.isArray(checkout.providerPayload)
              ? (checkout.providerPayload as Prisma.InputJsonObject)
              : {}),
            paymentFinalizedAt: paidAt.toISOString(),
          },
        },
      });

      const payment = await tx.payment.create({
        data: {
          userId,
          amount,
          currency: normalizedCurrency,
          provider,
          status: "SUCCEEDED",
          reference,
          metadata: {
            type: "subscription_payment",
            source: "checkout_session",
            checkoutSessionId: checkout.id,
            plan: normalizedPlan,
            interval: resolvedInterval,
            action: checkoutAction,
            paymentMethod,
            verified: true,
            verifiedAt: paidAt.toISOString(),
            subscriptionId,
            creditAmount: checkoutQuote?.creditAmount ?? 0,
            fullAmount: checkoutQuote?.fullAmount ?? expectedAmount,
            raw: rawPayload || undefined,
          } as Prisma.InputJsonValue,
        },
      });

      if (subscriptionId) {
        await tx.subscription.updateMany({
          where: {
            userId,
            status: { in: ["ACTIVE", "PAST_DUE", "TRIALING"] },
            id: { not: subscriptionId },
          },
          data: {
            status: "CANCELED",
            autoRenew: false,
            cancelAtPeriodEnd: false,
            pendingPlan: null,
            pendingEffectiveAt: null,
            cancellationReason: `superseded_by_${subscriptionId}`,
          },
        });

        await createSubscriptionInvoice({
          tx,
          userId,
          subscriptionId,
          plan: normalizedPlan,
          billingCycle: resolvedInterval,
          amount,
          currency: normalizedCurrency,
          checkoutSessionId: checkout.id,
          action: checkoutAction,
          creditAmount: checkoutQuote?.creditAmount ?? 0,
          fullAmount: checkoutQuote?.fullAmount ?? expectedAmount,
        });

        await tx.activityLog.create({
          data: {
            userId,
            action: checkoutAction === "upgrade" ? "SUBSCRIPTION_UPGRADED" : "SUBSCRIPTION_UPDATED",
            resourceType: "subscription",
            resourceId: subscriptionId,
            metadata: {
              status: "ACTIVE",
              plan: normalizedPlan,
              interval: resolvedInterval,
              creditAmount: checkoutQuote?.creditAmount ?? 0,
              billedAmount: amount,
            },
          },
        });
      }

      const business = await tx.business.findFirst({
        where: { ownerId: userId },
        select: {
          id: true,
          orgSubscription: {
            select: {
              activationTimestamp: true,
              currentCycleStartAt: true,
              currentCycleEndAt: true,
              providerPaymentMethodData: true,
            },
          },
        },
      });
      if (business) {
        const storedFlutterwaveMethod =
          provider === "FLUTTERWAVE"
            ? extractFlutterwaveStoredPaymentMethod(rawPayload || null)
            : null;
        const providerPaymentMethodData =
          provider === "FLUTTERWAVE"
            ? ((storedFlutterwaveMethod ??
                business.orgSubscription?.providerPaymentMethodData ??
                Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull)
            : Prisma.JsonNull;
        await tx.orgSubscription.upsert({
          where: { orgId: business.id },
          update: {
            planId: normalizedPlan,
            status: mapSubscriptionStatusToOrgStatus("ACTIVE"),
            billingInterval: mapIntervalToOrgBillingInterval(resolvedInterval),
            provider,
            providerSubscriptionId: subscriptionId,
            providerPaymentMethodData,
            paidThroughAt: renewalDate,
            currentCycleStartAt: currentPeriodStart,
            currentCycleEndAt: currentPeriodEnd,
            apiAccessEnabled: normalizedPlan === "ENTERPRISE",
          },
          create: {
            orgId: business.id,
            planId: normalizedPlan,
            status: mapSubscriptionStatusToOrgStatus("ACTIVE"),
            billingInterval: mapIntervalToOrgBillingInterval(resolvedInterval),
            provider,
            providerCustomerId: null,
            providerSubscriptionId: subscriptionId,
            providerPaymentMethodData,
            paidThroughAt: renewalDate,
            usageCycleAnchorDay: clampAnchorDay(currentPeriodStart.getUTCDate()),
            activationTimestamp: business.orgSubscription?.activationTimestamp ?? paidAt,
            currentCycleStartAt: currentPeriodStart,
            currentCycleEndAt: currentPeriodEnd,
            apiAccessEnabled: normalizedPlan === "ENTERPRISE",
          },
        });
      }

      return {
        payment,
        subscriptionId,
        alreadyExists: false,
        plan: normalizedPlan,
        interval: resolvedInterval,
        action: checkoutAction,
      };
    }

    if (!normalizedPlan) {
      log("warn", "subscription_payment_missing_plan", { userId, reference, provider });
      return null;
    }

    const expected = getPlanPriceForInterval(
      normalizedPlan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE",
      normalizedCurrency,
      resolvedInterval
    );
    if (!expected || Math.abs(Number(amount) - expected) > 0.01) {
      log("warn", "subscription_amount_mismatch", {
        userId,
        reference,
        provider,
        amount,
        expected,
        currency: normalizedCurrency,
        interval: resolvedInterval,
        plan: normalizedPlan,
      });
      return null;
    }

    const { currentPeriodStart, currentPeriodEnd } = buildBillingPeriodWindow(resolvedInterval, paidAt);
    const renewalDate = currentPeriodEnd;
    const existingSubscription = await tx.subscription.findFirst({
      where: { userId, plan: normalizedPlan },
      orderBy: { createdAt: "desc" },
    });

    subscriptionId = existingSubscription?.id ?? null;
    if (existingSubscription) {
      await tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          status: "ACTIVE",
          renewalDate,
          currency: normalizedCurrency,
          interval: resolvedInterval,
          plan: normalizedPlan,
          provider,
          currentPeriodStart,
          currentPeriodEnd,
          autoRenew: true,
          cancelAtPeriodEnd: false,
          lastPaymentReference: reference,
          lastPaymentProvider: provider,
        },
      });
    } else {
      const created = await tx.subscription.create({
        data: {
          userId,
          plan: normalizedPlan,
          status: "ACTIVE",
          renewalDate,
          currency: normalizedCurrency,
          interval: resolvedInterval,
          provider,
          currentPeriodStart,
          currentPeriodEnd,
          autoRenew: true,
          cancelAtPeriodEnd: false,
          lastPaymentReference: reference,
          lastPaymentProvider: provider,
        },
      });
      subscriptionId = created.id;
    }

    const payment = await tx.payment.create({
      data: {
        userId,
        amount,
        currency: normalizedCurrency,
        provider,
        status: "SUCCEEDED",
        reference,
        metadata: {
          type: "subscription_payment",
          plan: normalizedPlan,
          interval: resolvedInterval,
          action: "renewal",
          paymentMethod,
          verified: true,
          verifiedAt: paidAt.toISOString(),
          subscriptionId,
          raw: rawPayload || undefined,
        } as Prisma.InputJsonValue,
      },
    });

    if (subscriptionId) {
      await tx.activityLog.create({
        data: {
          userId,
          action: "SUBSCRIPTION_UPDATED",
          resourceType: "subscription",
          resourceId: subscriptionId,
          metadata: { status: "ACTIVE", plan: normalizedPlan },
        },
      });
    }

    const business = await tx.business.findFirst({
      where: { ownerId: userId },
      select: {
        id: true,
        orgSubscription: {
          select: {
            activationTimestamp: true,
            currentCycleStartAt: true,
            currentCycleEndAt: true,
            providerPaymentMethodData: true,
          },
        },
      },
    });
    if (business) {
      const storedFlutterwaveMethod =
        provider === "FLUTTERWAVE"
          ? extractFlutterwaveStoredPaymentMethod(rawPayload || null)
          : null;
      const providerPaymentMethodData =
        provider === "FLUTTERWAVE"
          ? ((storedFlutterwaveMethod ??
              business.orgSubscription?.providerPaymentMethodData ??
              Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull)
          : Prisma.JsonNull;
      await tx.orgSubscription.upsert({
        where: { orgId: business.id },
        update: {
          planId: normalizedPlan,
          status: mapSubscriptionStatusToOrgStatus("ACTIVE"),
          billingInterval: mapIntervalToOrgBillingInterval(resolvedInterval),
          provider,
          providerSubscriptionId: subscriptionId,
          providerPaymentMethodData,
          paidThroughAt: renewalDate,
          currentCycleStartAt: currentPeriodStart,
          currentCycleEndAt: currentPeriodEnd,
          apiAccessEnabled: normalizedPlan === "ENTERPRISE",
        },
        create: {
          orgId: business.id,
          planId: normalizedPlan,
          status: mapSubscriptionStatusToOrgStatus("ACTIVE"),
          billingInterval: mapIntervalToOrgBillingInterval(resolvedInterval),
          provider,
          providerCustomerId: null,
          providerSubscriptionId: subscriptionId,
          providerPaymentMethodData,
          paidThroughAt: renewalDate,
          usageCycleAnchorDay: clampAnchorDay(currentPeriodStart.getUTCDate()),
          activationTimestamp: business.orgSubscription?.activationTimestamp ?? paidAt,
          currentCycleStartAt: currentPeriodStart,
          currentCycleEndAt: currentPeriodEnd,
          apiAccessEnabled: normalizedPlan === "ENTERPRISE",
        },
      });
    }

    return {
      payment,
      subscriptionId,
      alreadyExists: false,
      plan: normalizedPlan,
      interval: resolvedInterval,
      action: "renewal" as const,
    };
  });

  if (!result) {
    return null;
  }

  const resolvedPlan = result.plan;
  if (resolvedPlan) {
    await syncBusinessPlanForUser(userId, subscriptionPlanToUserPlan(resolvedPlan));
  }

  const nextPlan = resolvedPlan ? subscriptionPlanToUserPlan(resolvedPlan) : "free";
  log("info", "billing_plan_transition", {
    provider,
    event: "payment_verified",
    userId,
    oldPlan: result.action === "upgrade" ? "paid" : "free",
    newPlan: nextPlan,
  });

  await emitSystemEvent({
    userId,
    actorId: userId,
    eventType:
      result.action === "upgrade"
        ? "subscription_upgraded"
        : result.alreadyExists
          ? "subscription_renewed"
          : "subscription_created",
    severity: "INFO",
    source: "BILLING",
    entityType: "subscription",
    entityId: result.subscriptionId,
    message:
      result.action === "upgrade"
        ? "Subscription upgraded successfully."
        : result.alreadyExists
          ? "Subscription renewed successfully."
          : "Subscription created successfully.",
    metadata: {
      provider,
      reference,
      plan: resolvedPlan,
      interval: result.interval,
      currency: normalizedCurrency,
      amount,
      action: result.action,
    },
  });

  if (isSubscriptionReceiptProvider(provider)) {
    try {
      await maybeSendSubscriptionReceipt({
        paymentId: result.payment.id,
        userId,
        amount,
        currency: normalizedCurrency,
        provider,
        reference,
        paidAt,
        plan: resolvedPlan,
        interval: result.interval,
        paymentMethod,
        verified: true,
      });
    } catch (error: any) {
      log("error", "subscription_receipt_failed", {
        userId,
        reference,
        provider,
        error: error?.message || "Unknown receipt error",
      });
    }
  }

  return { ...result, plan: resolvedPlan, interval: result.interval, paidAt };
}
