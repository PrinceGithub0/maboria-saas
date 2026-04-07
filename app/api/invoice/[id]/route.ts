import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceSchema } from "@/lib/validators";
import { parseDateInput } from "@/lib/date";
import { enforceEntitlement, getWorkspaceScope } from "@/lib/entitlements";
import {
  buildInvoiceBlueprintArtifacts,
  buildInvoiceEInvoicingSnapshot,
  type CustomerSnapshot,
  buildBusinessProfileSnapshot,
  buildInvoiceComplianceSnapshot,
  calculateTotalsFromAmounts,
  deliverInvoiceToCustomer,
  generateAndStoreInvoicePdf,
  getEInvoiceSendBlockingReason,
  getInvoiceSendBlockingReason,
  normalizeInvoiceItems,
  resolveInvoiceCustomer,
  submitRequiredInvoiceEInvoicing,
} from "@/lib/invoice";
import { isSupportedBusinessCurrency } from "@/lib/business-currencies";
import { isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { triggerInvoiceStatusAutomations } from "@/lib/automation/events";
import { normalizeVatSettings } from "@/lib/vat";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { requireBillingAccess } from "@/lib/permissions";
import { assertOwnedActiveCustomer } from "@/lib/customers";
import { withFormattedInvoiceTotals } from "@/lib/invoice-totals";
import { deriveInvoiceDisplayStatus } from "@/lib/invoice-refund-status";
import { appendInvoiceNumberAlias } from "@/lib/invoice-number";
import { logUserActivity } from "@/lib/user-activity";
import { resolveEInvoiceConnectionForUser, toConnectionConfig } from "@/lib/einvoicing/connections";
import { upsertInvoiceComplianceArtifacts } from "@/lib/invoicing/blueprint/storage";
import { getInvoiceComplianceRecord } from "@/lib/invoicing/blueprint/read";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
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
  const { id: invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: targetUserId, subscriptionId: null },
    include: {
      customer: {
        select: {
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
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const complianceRecord = await getInvoiceComplianceRecord(invoice.id);
  return NextResponse.json({
    ...withFormattedInvoiceTotals(invoice),
    displayStatus: deriveInvoiceDisplayStatus(invoice),
    complianceRecord,
  });
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
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
  const { id: rawRouteId } = await params;
  const body = await req.json();
  const parsed = invoiceSchema.partial().parse(body);
  let nextCurrency: string | undefined;
  if (parsed.currency) {
    const normalized = normalizeCurrency(parsed.currency);
    if (!isSupportedBusinessCurrency(normalized)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }
    nextCurrency = normalized;
  }
  const issueDate = parsed.issueDate ? parseDateInput(parsed.issueDate) : undefined;
  if (issueDate === null) {
    return NextResponse.json({ error: "Invalid issue date" }, { status: 400 });
  }
  const dueDate = parsed.dueDate ? parseDateInput(parsed.dueDate) : undefined;
  if (dueDate === null) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  const rawId = rawRouteId?.trim();
  const lookupNumber = parsed.invoiceNumber?.trim();
  const existing = await prisma.invoice.findFirst({
    where: {
      userId: targetUserId,
      subscriptionId: null,
      OR: [
        rawId ? { id: rawId } : undefined,
        rawId ? { invoiceNumber: rawId } : undefined,
        rawId
          ? { metadata: { path: ["invoiceNumberAliases"], array_contains: [rawId] } }
          : undefined,
        lookupNumber ? { invoiceNumber: lookupNumber } : undefined,
        lookupNumber
          ? { metadata: { path: ["invoiceNumberAliases"], array_contains: [lookupNumber] } }
          : undefined,
      ].filter(Boolean) as any,
    },
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      currency: true,
      items: true,
      discount: true,
      total: true,
      lateFeeAmount: true,
      lateFeeTotalAccumulated: true,
      customerId: true,
      metadata: true,
      invoiceCustomerSnapshot: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextCustomerId = parsed.customerId ?? existing.customerId;
  const nextCustomer = await assertOwnedActiveCustomer({
    userId: targetUserId,
    customerId: nextCustomerId,
  });
  if (!nextCustomer) {
    return NextResponse.json({ error: "Customer is required." }, { status: 400 });
  }

  if (nextCurrency && existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Invoice currency cannot be changed after issuance." },
      { status: 400 }
    );
  }

  if (existing.status === "PAID") {
    return NextResponse.json(
      { error: "Paid invoices cannot be edited." },
      { status: 403 }
    );
  }

  if (parsed.status === "PAID" || parsed.status === "FAILED") {
    return NextResponse.json(
      { error: "Invoice status is managed by payment verification." },
      { status: 400 }
    );
  }

  if (parsed.status === "SENT") {
    if (!nextCustomer.email) {
      return NextResponse.json(
        { error: "Customer is required." },
        { status: 400 }
      );
    }
    const invoiceCurrency = nextCurrency || normalizeCurrency(existing.currency || "USD");
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
    if (merchant.currency && normalizeCurrency(merchant.currency) !== invoiceCurrency) {
      return NextResponse.json(
        { error: "Your payout account currency is not compatible with this invoice currency." },
        { status: 400 }
      );
    }
    if (merchant.payoutType === "SEPA" && invoiceCurrency !== "EUR") {
      return NextResponse.json(
        { error: "Your payout account cannot settle this invoice currency." },
        { status: 400 }
      );
    }
    let providerOk = false;
    if (merchant.paystackSubaccountCode && isProviderCurrency("PAYSTACK", invoiceCurrency)) {
      providerOk = true;
    }
    if (merchant.flutterwaveSubaccountId && isProviderCurrency("FLUTTERWAVE", invoiceCurrency)) {
      providerOk = true;
    }
    if (!providerOk) {
      return NextResponse.json(
        { error: "No payout account can settle this invoice currency." },
        { status: 400 }
      );
    }
  }

  const existingMeta = (existing.metadata as any) || {};
  const nextInvoiceNumber = parsed.invoiceNumber?.trim();
  const invoiceNumberChanged =
    typeof nextInvoiceNumber === "string" &&
    nextInvoiceNumber.length > 0 &&
    nextInvoiceNumber.toLowerCase() !== String(existing.invoiceNumber || "").toLowerCase();
  const shouldUpdateDates = parsed.issueDate !== undefined || parsed.dueDate !== undefined;
  const shouldUpdateNote = parsed.note !== undefined;
  const shouldUpdatePoNumber = parsed.poNumber !== undefined;
  const shouldUpdateBuyerClassification =
    parsed.customerType !== undefined || parsed.customerCompany !== undefined;
  const shouldUpdateCompliance =
    shouldUpdateDates ||
    shouldUpdateNote ||
    shouldUpdatePoNumber ||
    parsed.customerId !== undefined ||
    parsed.items !== undefined ||
    parsed.discount !== undefined ||
    parsed.buyerType !== undefined ||
    parsed.supplyType !== undefined ||
    shouldUpdateBuyerClassification ||
    invoiceNumberChanged;
  const nextCustomerType: CustomerSnapshot["type"] =
    String(parsed.customerType || existingMeta?.customer?.type || "").toUpperCase() === "BUSINESS"
      ? "BUSINESS"
      : "INDIVIDUAL";
  const liveCustomer: CustomerSnapshot = {
    name: nextCustomer.name,
    email: nextCustomer.email,
    phone: nextCustomer.phone,
    taxId: nextCustomer.taxId,
    registrationNumber: nextCustomer.registrationNumber,
    branchCode: nextCustomer.branchCode,
    address: [
      nextCustomer.addressLine1,
      nextCustomer.addressLine2,
      nextCustomer.city,
      nextCustomer.state,
      nextCustomer.postalCode,
      nextCustomer.country,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n"),
    streetAddress: nextCustomer.addressLine1,
    addressLine2: nextCustomer.addressLine2,
    city: nextCustomer.city,
    state: nextCustomer.state,
    postalCode: nextCustomer.postalCode,
    country: nextCustomer.country,
    type: nextCustomerType,
    companyName:
      typeof parsed.customerCompany === "string"
        ? parsed.customerCompany
        : existingMeta?.customer?.companyName ?? nextCustomer.companyName ?? null,
    deliveryPreference: nextCustomer.deliveryPreference,
    emailOptOut: nextCustomer.emailOptOut,
    whatsappOptOut: nextCustomer.whatsappOptOut,
    processingRestrictedAt: nextCustomer.processingRestrictedAt,
    erasedAt: nextCustomer.erasedAt,
  };
  const immutableCustomerSnapshot = {
    name: nextCustomer.name,
    email: nextCustomer.email,
    phone: nextCustomer.phone,
    taxId: nextCustomer.taxId,
    companyName: nextCustomer.companyName,
    registrationNumber: nextCustomer.registrationNumber,
    branchCode: nextCustomer.branchCode,
    address: {
      addressLine1: nextCustomer.addressLine1,
      addressLine2: nextCustomer.addressLine2,
      city: nextCustomer.city,
      state: nextCustomer.state,
      postalCode: nextCustomer.postalCode,
      country: nextCustomer.country,
    },
    deliveryPreference: nextCustomer.deliveryPreference,
    emailOptOut: nextCustomer.emailOptOut,
    whatsappOptOut: nextCustomer.whatsappOptOut,
    processingRestrictedAt: nextCustomer.processingRestrictedAt,
    erasedAt: nextCustomer.erasedAt,
  };
  const nextItems = normalizeInvoiceItems(parsed.items ?? (existing as any).items);
  const discountAmount =
    typeof parsed.discount === "number" ? parsed.discount : Number((existing as any).discount || 0);
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
    return NextResponse.json({ error: "Business profile required before updating invoices." }, { status: 400 });
  }
  const businessSnapshot = buildBusinessProfileSnapshot({
    ...businessProfile,
    vatRate: businessProfile.vatRate ? Number(businessProfile.vatRate) : 0,
  });
  const vatSettings = normalizeVatSettings({
    enabled: businessSnapshot.vatEnabled ?? false,
    rate: businessSnapshot.vatRate ?? 0,
    mode:
      String(businessSnapshot.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(nextItems, vatSettings, discountAmount);
  const lateFeeAccumulated = Number(existing.lateFeeTotalAccumulated || existing.lateFeeAmount || 0);
  const nextTotalDue = totals.total + lateFeeAccumulated;
  const compliance = buildInvoiceComplianceSnapshot({
    business: businessSnapshot,
    customer: liveCustomer,
    items: nextItems,
    buyerType:
      parsed.buyerType ??
      ((existingMeta?.compliance?.buyerType as "B2B" | "B2C" | null | undefined) ?? null),
    supplyType:
      parsed.supplyType ??
      ((existingMeta?.compliance?.supplyType as "SAAS" | "SERVICES" | "GOODS" | null | undefined) ?? null),
  });
  const eInvoicingConnection = toConnectionConfig(
    await resolveEInvoiceConnectionForUser({
      userId: targetUserId,
      context: {
        sellerCountry: compliance.sellerCountry,
        buyerCountry: compliance.buyerCountry,
        currency: nextCurrency ?? existing.currency,
        compliance,
      },
    })
  );
  const eInvoicingSnapshot = buildInvoiceEInvoicingSnapshot({
    invoiceId: existing.id,
    invoiceNumber: nextInvoiceNumber ?? existing.invoiceNumber,
    invoiceStatus: parsed.status ?? existing.status,
    currency: nextCurrency ?? existing.currency,
    issuedAt: issueDate ?? undefined,
    dueDate: dueDate ?? undefined,
    business: businessSnapshot,
    customer: liveCustomer,
    items: nextItems,
    totals: {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discountAmount,
      total: totals.total,
    },
    transportDocument:
      existingMeta?.eInvoiceTransport &&
      typeof existingMeta.eInvoiceTransport === "object"
        ? {
            format: existingMeta.eInvoiceTransport.format ?? null,
            documentBase64: existingMeta.eInvoiceTransport.documentBase64 ?? null,
            invoiceHash: existingMeta.eInvoiceTransport.invoiceHash ?? null,
            uuid: existingMeta.eInvoiceTransport.uuid ?? null,
            digest: existingMeta.eInvoiceTransport.digest ?? null,
            mode: existingMeta.eInvoiceTransport.mode ?? null,
          }
        : null,
    compliance,
    connection: eInvoicingConnection,
  });
  const blueprintArtifacts = buildInvoiceBlueprintArtifacts({
    invoiceId: existing.id,
    invoiceNumber: nextInvoiceNumber ?? existing.invoiceNumber,
    issueDate: issueDate ?? undefined,
    dueDate: dueDate ?? undefined,
    currency: nextCurrency ?? existing.currency,
    business: businessSnapshot,
    customer: liveCustomer,
    items: nextItems,
    totals: {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discountAmount,
      total: totals.total,
    },
    note:
      parsed.note !== undefined
        ? parsed.note ?? null
        : typeof existingMeta?.note === "string"
          ? existingMeta.note
          : null,
    buyerType:
      parsed.buyerType ??
      ((existingMeta?.compliance?.buyerType as "B2B" | "B2C" | null | undefined) ?? null),
    supplyType:
      parsed.supplyType ??
      ((existingMeta?.compliance?.supplyType as "SAAS" | "SERVICES" | "GOODS" | null | undefined) ?? null),
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
  }

  const updated = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      customerId: nextCustomer.id,
      invoiceNumber: nextInvoiceNumber ?? undefined,
      poNumber: shouldUpdatePoNumber ? parsed.poNumber ?? null : undefined,
      items: parsed.items ?? undefined,
      currency: nextCurrency,
      status: parsed.status as any,
      generatedAt: issueDate ?? undefined,
      tax: totals.taxAmount,
      discount: discountAmount,
      total: nextTotalDue,
      invoiceCustomerSnapshot:
        parsed.status === "SENT"
          ? (existing.invoiceCustomerSnapshot as any) || (immutableCustomerSnapshot as any)
          : undefined,
      metadata:
        shouldUpdateCompliance
        ? {
            ...(invoiceNumberChanged ? appendInvoiceNumberAlias(existingMeta, existing.invoiceNumber) : existingMeta),
            businessProfile: businessSnapshot,
            customer: liveCustomer,
            compliance,
            complianceDocument: blueprintArtifacts.document as any,
            complianceValidation: blueprintArtifacts.validation as any,
            eInvoicing: eInvoicingSnapshot,
            poNumber: shouldUpdatePoNumber ? parsed.poNumber ?? null : existingMeta?.poNumber,
            dueDate: parsed.dueDate ? dueDate?.toISOString() : existingMeta?.dueDate,
            note: shouldUpdateNote ? parsed.note ?? null : existingMeta?.note,
            invoiceTotals: {
              subtotal: totals.subtotal,
              taxAmount: totals.taxAmount,
              discountAmount,
              total: totals.total,
              vatRate: totals.vatRate,
              vatMode: totals.vatMode,
              vatEnabled: totals.vatEnabled,
            },
          }
        : undefined,
    },
  });
  await upsertInvoiceComplianceArtifacts({
    invoiceId: updated.id,
    validation: blueprintArtifacts.validation,
  });
  await prisma.activityLog.create({
    data: {
      userId: targetUserId,
      action: "INVOICE_UPDATED",
      resourceType: "invoice",
      resourceId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        status: updated.status,
        actorUserId: session.user.id,
      },
    },
  });
  if (existing.status !== updated.status && updated.status === "SENT") {
    if (compliance.requiresEInvoicing) {
      const eInvoiceResult = await submitRequiredInvoiceEInvoicing({
        userId: targetUserId,
        invoiceId: updated.id,
        invoiceNumber: updated.invoiceNumber,
        invoiceStatus: updated.status,
        currency: nextCurrency ?? existing.currency,
        issuedAt: issueDate ?? undefined,
        dueDate: dueDate ?? undefined,
        business: businessSnapshot,
        customer: liveCustomer,
        items: nextItems,
        totals: {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discountAmount,
          total: totals.total,
        },
        compliance,
      });
      if (eInvoiceResult) {
        const successfulSubmissionStatuses = new Set(["QUEUED", "SUBMITTED", "ACCEPTED"]);
        const canRemainSent = successfulSubmissionStatuses.has(eInvoiceResult.snapshot.status);
        const failedInvoice = await prisma.invoice.update({
          where: { id: updated.id },
          data: {
            status: canRemainSent ? "SENT" : "DRAFT",
            metadata: {
              ...((updated.metadata as any) || {}),
              eInvoicing: eInvoiceResult.snapshot,
            },
          },
        });
        if (!canRemainSent) {
          return NextResponse.json(
            { error: eInvoiceResult.snapshot.lastError || "Could not submit the e-invoice." },
            { status: 400 }
          );
        }
        Object.assign(updated, failedInvoice);
      }
    }
    const businessProfile = (updated.metadata as any)?.businessProfile;
    if (businessProfile?.businessName) {
      const customer = resolveInvoiceCustomer(updated.metadata as any);
      try {
        const { pdfBuffer } = await generateAndStoreInvoicePdf(updated as any, businessProfile, customer);
        await deliverInvoiceToCustomer(updated as any, businessProfile, {
          ...customer,
          phone: nextCustomer.phone,
          deliveryPreference: nextCustomer.deliveryPreference,
          emailOptOut: nextCustomer.emailOptOut,
          whatsappOptOut: nextCustomer.whatsappOptOut,
          processingRestrictedAt: nextCustomer.processingRestrictedAt,
          erasedAt: nextCustomer.erasedAt,
        }, pdfBuffer);
      } catch (error: any) {
        await prisma.invoice.update({
          where: { id: updated.id },
          data: { status: "DRAFT" },
        });
        return NextResponse.json(
          { error: error?.message || "Could not send invoice." },
          { status: (error as any)?.status || 500 }
        );
      }
    }
    try {
      const usageScope = await getWorkspaceScope(session.user.id);
      const workspaceId = usageScope.businessId ?? targetUserId;
      await recordAnalyticsEvent({
        userId: targetUserId,
        workspaceId,
        orgId: usageScope.businessId ?? targetUserId,
        type: "INVOICE_SENT",
        count: 1,
        idempotencyKey: `invoice:${updated.id}`,
      });
    } catch (error) {
      console.error("invoice_sent_analytics_failed", error);
    }
    await prisma.activityLog.create({
      data: {
        userId: targetUserId,
        action: "INVOICE_SENT",
        resourceType: "invoice",
        resourceId: updated.id,
        metadata: { invoiceNumber: updated.invoiceNumber, actorUserId: session.user.id },
      },
    });

    await logUserActivity({
      userId: targetUserId,
      actorId: session.user.id,
      eventType: "invoice_sent",
      metadata: {
        invoiceId: updated.id,
        invoiceNumber: updated.invoiceNumber,
      },
    });
  }
  if (existing.status !== updated.status && ["SENT", "OVERDUE"].includes(updated.status)) {
    const eventOccurredAt = new Date();
    const eventOccurredAtIso = eventOccurredAt.toISOString();
    triggerInvoiceStatusAutomations({
      userId: targetUserId,
      invoiceId: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
      eventId: `invoice-manual:${updated.id}:${updated.status}:${eventOccurredAtIso}`,
      occurredAt: eventOccurredAt,
      source: "invoice:manual-status-update",
    }).catch((error) => {
      console.error("invoice_status_trigger_failed", error);
    });
  }
  return NextResponse.json(withFormattedInvoiceTotals(updated));
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
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

  const { id: invoiceId } = await params;
  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: targetUserId, subscriptionId: null },
    select: { id: true, status: true, invoiceNumber: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (String(existing.status || "").toUpperCase() !== "DRAFT") {
    return NextResponse.json({ error: "Only draft invoices can be deleted." }, { status: 400 });
  }

  await prisma.invoice.delete({
    where: { id: existing.id },
  });
  await prisma.activityLog.create({
    data: {
      userId: targetUserId,
      action: "INVOICE_DELETED",
      resourceType: "invoice",
      resourceId: existing.id,
      metadata: { actorUserId: session.user.id, invoiceNumber: existing.invoiceNumber },
    },
  });
  return NextResponse.json({ success: true });
});
