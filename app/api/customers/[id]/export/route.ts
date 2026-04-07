import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getVisibleCustomerWhere } from "@/lib/customers";
import { requireBillingAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
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

  const customer = await prisma.customer.findFirst({
    where: {
      ...visibilityWhere,
      id,
      userId: targetUserId,
    },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [notes, invoices, payments, activityLogs, auditLogs] = await Promise.all([
    prisma.customerNote.findMany({
      where: { userId: targetUserId, customerId: customer.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: {
        userId: targetUserId,
        customerId: customer.id,
        subscriptionId: null,
      },
      orderBy: { generatedAt: "desc" },
      include: {
        invoicePayments: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.invoicePayment.findMany({
      where: {
        userId: targetUserId,
        invoice: {
          customerId: customer.id,
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
          },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: {
        userId: targetUserId,
        OR: [
          { resourceType: "customer", resourceId: customer.id },
          { metadata: { path: ["customerId"], equals: customer.id } },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: 500,
    }),
    prisma.auditLog.findMany({
      where: {
        userId: targetUserId,
        OR: [
          { metadata: { path: ["customerId"], equals: customer.id } },
          { targetUserId: customer.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const exportedAt = new Date().toISOString();
  const payload = {
    exportedAt,
    customer,
    notes,
    invoices,
    payments,
    activityLogs,
    auditLogs,
  };
  const safeName = String(customer.name || "customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "customer";

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-${customer.id}-export.json"`,
    },
  });
}
