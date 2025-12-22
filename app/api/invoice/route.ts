import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validators";
import { createInvoiceRecord } from "@/lib/invoice";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { enforceUsageLimit } from "@/lib/entitlements";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    orderBy: { generatedAt: "desc" },
  });

  return NextResponse.json(invoices);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usage = await enforceUsageLimit(session.user.id, "invoices");
  if (!usage.ok) {
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
  assertRateLimit(`invoice:${session.user.id}`, 50, 60_000);
  const invoice = await createInvoiceRecord({
    userId: session.user.id,
    invoiceNumber: parsed.invoiceNumber,
    currency: parsed.currency,
    items: parsed.items,
    status: parsed.status,
    tax: parsed.tax,
    discount: parsed.discount,
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
