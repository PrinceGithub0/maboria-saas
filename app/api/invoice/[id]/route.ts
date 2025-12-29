import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceSchema } from "@/lib/validators";
import { enforceEntitlement } from "@/lib/entitlements";
import { generateAndStoreInvoicePdf, sendInvoiceEmailToCustomer } from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

type Params = { params: { id: string } };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: true,
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
    allowTrial: true,
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

  const existing = await prisma.invoice.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { status: true, invoiceNumber: true, metadata: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.invoice.update({
    where: { id: params.id, userId: session.user.id },
    data: {
      invoiceNumber: parsed.invoiceNumber ?? undefined,
      items: parsed.items ?? undefined,
      currency: nextCurrency,
      status: parsed.status as any,
      tax: parsed.tax as any,
      discount: parsed.discount as any,
      metadata:
        parsed.customerEmail || parsed.customerName || parsed.customerAddress
          ? {
              ...(existing.metadata as any),
              customer: {
                name: parsed.customerName,
                email: parsed.customerEmail,
                address: parsed.customerAddress,
              },
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
      const customer = (updated.metadata as any)?.customer || null;
      const { pdfBuffer } = await generateAndStoreInvoicePdf(updated as any, businessProfile, customer);
      await sendInvoiceEmailToCustomer(updated as any, businessProfile, customer, pdfBuffer);
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
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: true,
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
