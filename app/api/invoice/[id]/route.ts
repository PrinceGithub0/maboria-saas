import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceSchema } from "@/lib/validators";
import { parseDateInput } from "@/lib/date";
import { enforceEntitlement } from "@/lib/entitlements";
import {
  generateAndStoreInvoicePdf,
  resolveInvoiceCustomer,
  sendInvoiceEmailToCustomer,
} from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { triggerInvoiceStatusAutomations } from "@/lib/automation/events";
import { STANDARD_VAT_RATE, applyVatToSubtotal } from "@/lib/vat";

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
  }

  const existingMeta = (existing.metadata as any) || {};
  const existingCustomer = resolveInvoiceCustomer(existingMeta) || {};
  const shouldUpdateCustomer =
    parsed.customerEmail !== undefined ||
    parsed.customerName !== undefined ||
    parsed.customerAddress !== undefined;
  const shouldUpdateDates = parsed.issueDate !== undefined || parsed.dueDate !== undefined;
  const nextItems = (parsed.items ?? (existing as any).items) as any[];
  const subtotal = Array.isArray(nextItems)
    ? nextItems.reduce((sum, item: any) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0)
    : 0;
  const discountAmount =
    typeof parsed.discount === "number" ? parsed.discount : Number((existing as any).discount || 0);
  const vatTotals = applyVatToSubtotal(subtotal, STANDARD_VAT_RATE);
  const total = Math.max(0, vatTotals.total - discountAmount);

  const updated = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      invoiceNumber: parsed.invoiceNumber ?? undefined,
      items: parsed.items ?? undefined,
      currency: nextCurrency,
      status: parsed.status as any,
      generatedAt: issueDate ?? undefined,
      tax: vatTotals.vat,
      discount: discountAmount,
      total,
      metadata: shouldUpdateCustomer || shouldUpdateDates
        ? {
            ...existingMeta,
            customer: shouldUpdateCustomer
              ? {
                  name: parsed.customerName ?? existingCustomer.name ?? undefined,
                  email: parsed.customerEmail ?? existingCustomer.email ?? undefined,
                  address: parsed.customerAddress ?? existingCustomer.address ?? undefined,
                }
              : existingMeta?.customer,
            dueDate: parsed.dueDate ? dueDate?.toISOString() : existingMeta?.dueDate,
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
