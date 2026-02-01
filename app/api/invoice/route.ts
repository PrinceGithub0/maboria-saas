import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validators";
import { createInvoiceRecord } from "@/lib/invoice";
import { parseDateInput } from "@/lib/date";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

export const runtime = "nodejs";

export const GET = withErrorHandling(async () => {
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
        requiredPlan: nextPlanAfter(usage.plan),
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
    parsed.customerEmail ||
    parsed.customerName ||
    parsed.customerAddress ||
    parsed.customerCompany ||
    parsed.customerTaxId
      ? {
          name: parsed.customerName,
          email: parsed.customerEmail,
          address: parsed.customerAddress,
          type: parsed.customerType,
          companyName: parsed.customerCompany,
          taxId: parsed.customerTaxId,
        }
      : null;
  const issueDate = parsed.issueDate ? parseDateInput(parsed.issueDate) : undefined;
  if (issueDate === null) {
    return NextResponse.json({ error: "Invalid issue date" }, { status: 400 });
  }
  const dueDate = parsed.dueDate ? parseDateInput(parsed.dueDate) : undefined;
  if (dueDate === null) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }
  if (parsed.status === "SENT") {
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
  }
  assertRateLimit(`invoice:${session.user.id}`, 50, 60_000);
  const invoice = await createInvoiceRecord({
    userId: session.user.id,
    invoiceNumber: parsed.invoiceNumber,
    currency: normalizedCurrency,
    items: parsed.items,
    status: parsed.status,
    discount: parsed.discount,
    customer,
    issueDate,
    dueDate,
    note: parsed.note,
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
