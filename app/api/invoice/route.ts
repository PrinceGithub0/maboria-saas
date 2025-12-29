import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validators";
import { createInvoiceRecord } from "@/lib/invoice";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { enforceEntitlement, enforceUsageLimit } from "@/lib/entitlements";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

export const GET = withErrorHandling(async () => {
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

  const invoices = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    orderBy: { generatedAt: "desc" },
  });

  return NextResponse.json(invoices);
});

export const POST = withErrorHandling(async (req: Request) => {
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

  const usage = await enforceUsageLimit(session.user.id, "invoices");
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
        requiredPlan: usage.plan === "free" ? "starter" : "pro",
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const body = await req.json();
  const parsed = invoiceSchema.parse(body);
  const normalizedCurrency = normalizeCurrency(parsed.currency);
  if (!isAllowedCurrency(normalizedCurrency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  const customer =
    parsed.customerEmail || parsed.customerName || parsed.customerAddress
      ? {
          name: parsed.customerName,
          email: parsed.customerEmail,
          address: parsed.customerAddress,
        }
      : null;
  assertRateLimit(`invoice:${session.user.id}`, 50, 60_000);
  const invoice = await createInvoiceRecord({
    userId: session.user.id,
    invoiceNumber: parsed.invoiceNumber,
    currency: normalizedCurrency,
    items: parsed.items,
    status: parsed.status,
    tax: parsed.tax,
    discount: parsed.discount,
    customer,
  });
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "INVOICE_CREATED",
      metadata: { invoiceNumber: parsed.invoiceNumber },
    },
  });
  return NextResponse.json(invoice, { status: 201 });
});
