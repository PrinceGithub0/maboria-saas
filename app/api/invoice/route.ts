import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validators";
import {
  buildInvoiceBlueprintArtifacts,
  buildInvoiceEInvoicingSnapshot,
  calculateTotals,
  type CustomerSnapshot,
  buildBusinessProfileSnapshot,
  buildInvoiceComplianceSnapshot,
  createInvoiceRecord,
  getEInvoiceSendBlockingReason,
  getInvoiceSendBlockingReason,
} from "@/lib/invoice";
import { resolveInvoiceSenderForCustomer } from "@/lib/invoice-sender-resolver";
import { parseDateInput } from "@/lib/date";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import { isSupportedBusinessCurrency } from "@/lib/business-currencies";
import { isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { requireBillingAccess } from "@/lib/permissions";
import { assertOwnedActiveCustomer } from "@/lib/customers";
import { withFormattedInvoiceTotals } from "@/lib/invoice-totals";
import { deriveInvoiceDisplayStatus, getInvoiceSummaryCounts } from "@/lib/invoice-refund-status";
import { logUserActivity } from "@/lib/user-activity";
import { triggerInvoiceCreatedAutomations } from "@/lib/automation/events";
import { resolveEInvoiceConnectionForUser, toConnectionConfig } from "@/lib/einvoicing/connections";
import { normalizeVatSettings } from "@/lib/vat";
import {
  buildInvoiceIssuerCode,
  formatSequentialInvoiceNumber,
  getInvoiceNumberYear,
} from "@/lib/invoice-number";

export const runtime = "nodejs";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetUserId = access.ownerUserId;

  const entitlement = await enforceEntitlement(targetUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const query = String(url.searchParams.get("q") || "").trim();
  const normalizedQuery = query.toLowerCase();
  const rawTake = Number(url.searchParams.get("take") || 20);
  const rawSkip = Number(url.searchParams.get("skip") || 0);
  const take = Number.isFinite(rawTake) ? Math.max(1, Math.min(50, Math.trunc(rawTake))) : 20;
  const skip = Number.isFinite(rawSkip) ? Math.max(0, Math.trunc(rawSkip)) : 0;

  const statusSearchMap: Record<string, string[]> = {
    draft: ["DRAFT"],
    sent: ["SENT"],
    unpaid: ["SENT", "OVERDUE"],
    overdue: ["OVERDUE"],
    paid: ["PAID"],
    failed: ["FAILED"],
    canceled: ["CANCELED"],
    cancelled: ["CANCELED"],
    expired: ["EXPIRED"],
  };
  const statusMatches = statusSearchMap[normalizedQuery] || [];
  const searchWhere = normalizedQuery
    ? {
        OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" as const } },
          { poNumber: { contains: query, mode: "insensitive" as const } },
          { currency: { contains: query, mode: "insensitive" as const } },
          { customer: { is: { name: { contains: query, mode: "insensitive" as const } } } },
          { customer: { is: { email: { contains: query, mode: "insensitive" as const } } } },
          ...(statusMatches.length > 0 ? [{ status: { in: statusMatches as any } }] : []),
        ],
      }
    : {};
  const where = {
    userId: targetUserId,
    subscriptionId: null,
    ...searchWhere,
  };

  const customerSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    taxId: true,
    companyName: true,
    registrationNumber: true,
    branchCode: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    state: true,
    postalCode: true,
    country: true,
    deliveryPreference: true,
    emailOptOut: true,
    whatsappOptOut: true,
    processingRestrictedAt: true,
    erasedAt: true,
  } as const;

  const currentYear = getInvoiceNumberYear();
  const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
  const startOfNextYear = new Date(Date.UTC(currentYear + 1, 0, 1));

  const [
    invoices,
    total,
    summaryInvoices,
    businessProfile,
    invoiceCountThisYear,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      skip,
      take,
      include: {
        customer: {
          select: customerSelect,
        },
        complianceRecord: {
          select: {
            blockingIssueCount: true,
            warningIssueCount: true,
            infoIssueCount: true,
          },
        },
        invoicePayments: {
          select: {
            status: true,
            refundOfId: true,
            amount: true,
            amountOriginal: true,
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where: { userId: targetUserId, subscriptionId: null },
      select: {
        status: true,
        invoicePayments: {
          select: {
            status: true,
            refundOfId: true,
            amount: true,
            amountOriginal: true,
          },
        },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { userId: targetUserId },
      select: { businessName: true },
    }),
    prisma.invoice.count({
      where: {
        userId: targetUserId,
        subscriptionId: null,
        generatedAt: {
          gte: startOfYear,
          lt: startOfNextYear,
        },
      },
    }),
  ]);

  const issuerCode = buildInvoiceIssuerCode(businessProfile?.businessName || null, targetUserId);
  const suggestedInvoiceNumber = formatSequentialInvoiceNumber(
    currentYear,
    invoiceCountThisYear + 1,
    issuerCode
  );
  const summary = getInvoiceSummaryCounts(summaryInvoices);

  return NextResponse.json({
    items: invoices.map((invoice) => ({
      ...withFormattedInvoiceTotals(invoice),
      displayStatus: deriveInvoiceDisplayStatus(invoice),
    })),
    total,
    skip,
    take,
    hasMore: skip + invoices.length < total,
    summary,
    suggestedInvoiceNumber,
  });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetUserId = access.ownerUserId;

  const entitlement = await enforceEntitlement(targetUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }
  const usage = await enforceUsageLimit(targetUserId, "invoices");
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        {
          error: "Payment required",
          type: "payment_required",
          reason: "Active subscription required to create invoices",
          plan: usage.plan,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "Invoice limit reached for this month",
        requiredPlan: nextPlanAfter(usage.plan),
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const body = await req.json();
  const selectedSenderId = String(body?.selectedSenderId || "").trim() || null;
  const setDefaultSender = body?.setDefaultSender === true;
  const parsed = invoiceSchema.parse(body);
  const normalizedCurrency = normalizeCurrency(parsed.currency);
  if (!isSupportedBusinessCurrency(normalizedCurrency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  const customer = await assertOwnedActiveCustomer({
    userId: targetUserId,
    customerId: parsed.customerId,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer is required." }, { status: 400 });
  }
  const issueDate = parsed.issueDate ? parseDateInput(parsed.issueDate) : undefined;
  if (issueDate === null) {
    return NextResponse.json({ error: "Invalid issue date" }, { status: 400 });
  }
  const dueDate = parsed.dueDate ? parseDateInput(parsed.dueDate) : undefined;
  if (dueDate === null) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }
  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: targetUserId },
    select: {
      businessName: true,
      country: true,
      defaultCurrency: true,
      businessAddress: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      businessEmail: true,
      businessPhone: true,
      taxId: true,
      registrationNumber: true,
      branchCode: true,
      vatEnabled: true,
      vatRate: true,
      vatRateDisplay: true,
      vatPricingMode: true,
    },
  });
  if (!businessProfile) {
    return NextResponse.json({ error: "Business profile required before creating invoices" }, { status: 400 });
  }
  const businessSnapshot = buildBusinessProfileSnapshot({
    ...businessProfile,
    vatRate: businessProfile.vatRate ? Number(businessProfile.vatRate) : 0,
  });
  const blueprintVatSettings = normalizeVatSettings({
    enabled: businessSnapshot.vatEnabled ?? false,
    rate: businessSnapshot.vatRate ?? 0,
    mode:
      String(businessSnapshot.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const blueprintTotals = calculateTotals(parsed.items, blueprintVatSettings, parsed.discount);
  const customerType: CustomerSnapshot["type"] =
    parsed.customerType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL";
  const customerSnapshot: CustomerSnapshot = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    type: customerType,
    companyName: parsed.customerCompany ?? customer.companyName ?? null,
    taxId: customer.taxId,
    registrationNumber: customer.registrationNumber,
    branchCode: customer.branchCode,
    address: [customer.addressLine1, customer.addressLine2, customer.city, customer.state, customer.postalCode, customer.country]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n"),
    streetAddress: customer.addressLine1,
    addressLine2: customer.addressLine2,
    city: customer.city,
    state: customer.state,
    postalCode: customer.postalCode,
    country: customer.country,
    deliveryPreference: customer.deliveryPreference,
    emailOptOut: customer.emailOptOut,
    whatsappOptOut: customer.whatsappOptOut,
    processingRestrictedAt: customer.processingRestrictedAt,
    erasedAt: customer.erasedAt,
  };
  const compliance = buildInvoiceComplianceSnapshot({
    business: businessSnapshot,
    customer: customerSnapshot,
    items: parsed.items,
    buyerType: parsed.buyerType ?? null,
    supplyType: parsed.supplyType ?? null,
  });
  const eInvoicingConnection = toConnectionConfig(
    await resolveEInvoiceConnectionForUser({
      userId: targetUserId,
      context: {
        sellerCountry: compliance.sellerCountry,
        buyerCountry: compliance.buyerCountry,
        currency: normalizedCurrency,
        compliance,
      },
    })
  );
  const eInvoicingSnapshot = buildInvoiceEInvoicingSnapshot({
    invoiceNumber: parsed.invoiceNumber,
    invoiceStatus: parsed.status,
    currency: normalizedCurrency,
    issuedAt: issueDate,
    dueDate,
    business: businessSnapshot,
    customer: customerSnapshot,
    items: parsed.items,
    totals: null,
    compliance,
    connection: eInvoicingConnection,
  });
  const blueprintArtifacts = buildInvoiceBlueprintArtifacts({
    invoiceNumber: parsed.invoiceNumber,
    issueDate,
    dueDate,
    currency: normalizedCurrency,
    business: businessSnapshot,
    customer: customerSnapshot,
    items: parsed.items,
    totals: {
      subtotal: blueprintTotals.subtotal,
      taxAmount: blueprintTotals.taxAmount,
      discountAmount: blueprintTotals.discountAmount,
      total: blueprintTotals.total,
    },
    note: parsed.note ?? null,
    buyerType: parsed.buyerType ?? null,
    supplyType: parsed.supplyType ?? null,
    compliance,
  });
  if (parsed.status === "SENT") {
    const sendBlockingReason = getInvoiceSendBlockingReason(
      compliance,
      blueprintArtifacts.validation
    );
    if (sendBlockingReason) {
      return NextResponse.json({ error: sendBlockingReason }, { status: 400 });
    }
    const eInvoiceBlockingReason = getEInvoiceSendBlockingReason(eInvoicingSnapshot);
    if (eInvoiceBlockingReason) {
      return NextResponse.json({ error: eInvoiceBlockingReason }, { status: 400 });
    }
    const merchant = await prisma.merchantAccount.findUnique({
      where: { userId: targetUserId },
    });
    if (!merchant) {
      return NextResponse.json(
        {
          error:
            "Payment setup required. Add your Paystack or Flutterwave subaccount in Settings > Invoice payout setup.",
        },
        { status: 400 }
      );
    }
    if (merchant.currency && normalizeCurrency(merchant.currency) !== normalizedCurrency) {
      return NextResponse.json(
        { error: "Your payout account currency is not compatible with this invoice currency." },
        { status: 400 }
      );
    }
    if (merchant.payoutType === "SEPA" && normalizedCurrency !== "EUR") {
      return NextResponse.json(
        { error: "Your payout account cannot settle this invoice currency." },
        { status: 400 }
      );
    }
    const providerOk =
      (merchant.paystackSubaccountCode && isProviderCurrency("PAYSTACK", normalizedCurrency)) ||
      (merchant.flutterwaveSubaccountId &&
        isProviderCurrency("FLUTTERWAVE", normalizedCurrency));
    if (!providerOk) {
      return NextResponse.json(
        { error: "No payout account can settle this invoice currency." },
        { status: 400 }
      );
    }
    await resolveInvoiceSenderForCustomer({
      workspaceId: access.businessId,
      selectedSenderId,
      replyToAddress: businessSnapshot.businessEmail || null,
      customer: customerSnapshot,
    });
  }
  assertRateLimit(`invoice:${targetUserId}`, 50, 60_000);
  const invoice = await createInvoiceRecord({
    userId: targetUserId,
    workspaceId: access.businessId,
    customerId: customer.id,
    invoiceNumber: parsed.invoiceNumber,
    poNumber: parsed.poNumber,
    attachments: parsed.attachments,
    currency: normalizedCurrency,
    items: parsed.items,
    status: parsed.status,
    discount: parsed.discount,
    customer: customerSnapshot,
    issueDate,
    dueDate,
    note: parsed.note,
    buyerType: parsed.buyerType,
    supplyType: parsed.supplyType,
    selectedSenderId,
    setDefaultSender,
  });
  await prisma.activityLog.create({
    data: {
      userId: targetUserId,
      action: "INVOICE_CREATED",
      metadata: { invoiceNumber: invoice.invoiceNumber, actorUserId: session.user.id },
    },
  });

  await logUserActivity({
    userId: targetUserId,
    actorId: session.user.id,
    eventType: "invoice_created",
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
    },
  });
  triggerInvoiceCreatedAutomations({
    userId: targetUserId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    eventId: `invoice:${invoice.id}:created`,
    occurredAt: invoice.generatedAt,
    source: "invoice:create",
  }).catch(() => null);
  return NextResponse.json(invoice, { status: 201 });
});
