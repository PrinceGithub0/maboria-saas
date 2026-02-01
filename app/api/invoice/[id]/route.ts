import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceSchema } from "@/lib/validators";
import { parseDateInput } from "@/lib/date";
import { enforceEntitlement, getWorkspaceScope } from "@/lib/entitlements";
import {
  calculateTotalsFromAmounts,
  generateAndStoreInvoicePdf,
  resolveInvoiceCustomer,
  sendInvoiceEmailToCustomer,
} from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { triggerInvoiceStatusAutomations } from "@/lib/automation/events";
import { normalizeVatSettings } from "@/lib/vat";
import { recordAnalyticsEvent } from "@/lib/analytics";

type Params = { params: { id: string } };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
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

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
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

  const body = await req.json();
  const parsed = invoiceSchema.partial().parse(body);
  let nextCurrency: string | undefined;
  if (parsed.currency) {
    const normalized = normalizeCurrency(parsed.currency);
    if (!isAllowedCurrency(normalized)) {
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

  const rawId = params?.id?.trim();
  const lookupNumber = parsed.invoiceNumber?.trim();
  const existing = await prisma.invoice.findFirst({
    where: {
      userId: session.user.id,
      OR: [
        rawId ? { id: rawId } : undefined,
        rawId ? { invoiceNumber: rawId } : undefined,
        lookupNumber ? { invoiceNumber: lookupNumber } : undefined,
      ].filter(Boolean) as any,
    },
    select: { id: true, status: true, invoiceNumber: true, metadata: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const existingCustomerEmail = (existing.metadata as any)?.customer?.email;
    if (!parsed.customerEmail && !existingCustomerEmail) {
      return NextResponse.json(
        { error: "Customer email is required to send an invoice." },
        { status: 400 }
      );
    }
    const invoiceCurrency = nextCurrency || normalizeCurrency((existing as any)?.currency || "USD");
    const merchant = await prisma.merchantAccount.findUnique({
      where: { userId: session.user.id },
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
  const existingCustomer = resolveInvoiceCustomer(existingMeta) || {};
  const shouldUpdateCustomer =
    parsed.customerEmail !== undefined ||
    parsed.customerName !== undefined ||
    parsed.customerAddress !== undefined ||
    parsed.customerType !== undefined ||
    parsed.customerCompany !== undefined ||
    parsed.customerTaxId !== undefined;
  const shouldUpdateDates = parsed.issueDate !== undefined || parsed.dueDate !== undefined;
  const shouldUpdateNote = parsed.note !== undefined;
  const nextItems = (parsed.items ?? (existing as any).items) as any[];
  const discountAmount =
    typeof parsed.discount === "number" ? parsed.discount : Number((existing as any).discount || 0);
  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: session.user.id },
    select: { vatEnabled: true, vatRate: true, vatPricingMode: true },
  });
  const vatSettings = normalizeVatSettings({
    enabled: businessProfile?.vatEnabled ?? false,
    rate: businessProfile?.vatRate ? Number(businessProfile.vatRate) : 0,
    mode:
      String(businessProfile?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(nextItems, vatSettings, discountAmount);

  const updated = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      invoiceNumber: parsed.invoiceNumber ?? undefined,
      items: parsed.items ?? undefined,
      currency: nextCurrency,
      status: parsed.status as any,
      generatedAt: issueDate ?? undefined,
      tax: totals.taxAmount,
      discount: discountAmount,
      total: totals.total,
      metadata: shouldUpdateCustomer || shouldUpdateDates || shouldUpdateNote
        ? {
            ...existingMeta,
            customer: shouldUpdateCustomer
              ? {
                  name: parsed.customerName ?? existingCustomer.name ?? undefined,
                  email: parsed.customerEmail ?? existingCustomer.email ?? undefined,
                  address: parsed.customerAddress ?? existingCustomer.address ?? undefined,
                  type: (parsed.customerType as any) ?? (existingCustomer as any).type ?? undefined,
                  companyName:
                    parsed.customerCompany ?? (existingCustomer as any).companyName ?? undefined,
                  taxId: parsed.customerTaxId ?? (existingCustomer as any).taxId ?? undefined,
                }
              : existingMeta?.customer,
            dueDate: parsed.dueDate ? dueDate?.toISOString() : existingMeta?.dueDate,
            note: shouldUpdateNote ? parsed.note ?? null : existingMeta?.note,
            vatRate: totals.vatRate,
            vatMode: totals.vatMode,
            vatEnabled: totals.vatEnabled,
          }
        : undefined,
    },
  });
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "INVOICE_UPDATED",
      resourceType: "invoice",
      resourceId: updated.id,
      metadata: { invoiceNumber: updated.invoiceNumber, status: updated.status },
    },
  });
  if (existing.status !== updated.status && updated.status === "SENT") {
    const businessProfile = (updated.metadata as any)?.businessProfile;
    if (businessProfile?.businessName) {
      const customer = resolveInvoiceCustomer(updated.metadata as any);
      try {
        const { pdfBuffer } = await generateAndStoreInvoicePdf(updated as any, businessProfile, customer);
        await sendInvoiceEmailToCustomer(updated as any, businessProfile, customer, pdfBuffer);
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
      const workspaceId = usageScope.businessId ?? session.user.id;
      await recordAnalyticsEvent({
        userId: session.user.id,
        workspaceId,
        orgId: usageScope.businessId ?? session.user.id,
        type: "INVOICE_SENT",
        count: 1,
      });
    } catch (error) {
      console.error("invoice_sent_analytics_failed", error);
    }
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "INVOICE_SENT",
        resourceType: "invoice",
        resourceId: updated.id,
        metadata: { invoiceNumber: updated.invoiceNumber },
      },
    });
  }
  if (existing.status !== updated.status && ["SENT", "OVERDUE"].includes(updated.status)) {
    triggerInvoiceStatusAutomations({
      userId: session.user.id,
      invoiceId: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
    }).catch((error) => {
      console.error("invoice_status_trigger_failed", error);
    });
  }
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
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

  await prisma.invoice.delete({
    where: { id: params.id, userId: session.user.id },
  });
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "INVOICE_DELETED",
      resourceType: "invoice",
      resourceId: params.id,
    },
  });
  return NextResponse.json({ success: true });
});
