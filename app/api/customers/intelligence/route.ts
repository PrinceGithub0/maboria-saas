import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerQuerySchema } from "@/lib/validators";
import { requireBillingAccess } from "@/lib/permissions";
import { getVisibleCustomerWhere } from "@/lib/customers";
import { buildCustomerMetricsMap } from "@/lib/customers/intelligence";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const { searchParams } = new URL(request.url);
  const parsed = customerQuerySchema.safeParse({
    q: searchParams.get("q") || undefined,
    take: searchParams.get("take") || undefined,
    skip: searchParams.get("skip") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const query = String(parsed.data.q || "").trim();
  const take = Math.min(50, Math.max(1, Number(parsed.data.take || 12)));
  const skip = Math.max(0, Number(parsed.data.skip || 0));

  const where = {
    ...visibilityWhere,
    userId: targetUserId,
    deletedAt: null as Date | null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, total, businessProfile] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.customer.count({ where }),
    prisma.businessProfile.findUnique({
      where: { userId: targetUserId },
      select: { defaultCurrency: true },
    }),
  ]);
  const displayCurrency = String(businessProfile?.defaultCurrency || "USD").toUpperCase();

  const customerIds = customers.map((item) => item.id);
  const invoices = customerIds.length
    ? await prisma.invoice.findMany({
        where: {
          userId: targetUserId,
          subscriptionId: null,
          customerId: { in: customerIds },
        },
        select: {
          id: true,
          customerId: true,
          total: true,
          currency: true,
          status: true,
          generatedAt: true,
        },
      })
    : [];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = invoiceIds.length
    ? await prisma.invoicePayment.findMany({
        where: {
          userId: targetUserId,
          invoiceId: { in: invoiceIds },
          status: { in: ["SUCCEEDED", "REFUNDED"] },
        },
        select: {
          invoiceId: true,
          amount: true,
          currency: true,
          amountOriginal: true,
          currencyOriginal: true,
          amountConverted: true,
          currencyDefault: true,
          metadata: true,
          status: true,
        },
      })
    : [];
  const { metricsMap } = buildCustomerMetricsMap({
    invoices,
    payments,
    displayCurrency,
  });

  const items = customers.map((customer) => {
    const stats = metricsMap.get(customer.id) || {
      invoiced: 0,
      paid: 0,
      outstanding: 0,
      lastInvoiceAt: null,
    };
    const status =
      customer.status === "DISABLED"
        ? "DISABLED"
        : stats.outstanding > 0
          ? "ATTENTION"
          : stats.invoiced > 0
            ? "ACTIVE"
            : "NEW";
    return {
      ...customer,
      metrics: stats,
      status,
      accountStatus: customer.status,
    };
  });

  return NextResponse.json({
    items,
    total,
    take,
    skip,
    hasMore: skip + items.length < total,
    displayCurrency,
  });
}
