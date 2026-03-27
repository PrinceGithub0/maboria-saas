import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "@/lib/subscriber-settings";
import { requireBillingAccess } from "@/lib/permissions";
import { getVisibleCustomerWhere } from "@/lib/customers";
import {
  convertCustomerInvoiceAmount,
  convertCustomerPaymentAmount,
} from "@/lib/customers/intelligence";
import { deriveInvoiceDisplayStatus } from "@/lib/invoice-refund-status";

type Params = { params: Promise<{ id: string }> };

const OUTSTANDING_STATUSES = new Set(["SENT", "OVERDUE"]);

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

  const [customer, businessProfile, subscriberSetting] = await Promise.all([
    prisma.customer.findFirst({
      where: {
        ...visibilityWhere,
        id,
        userId: targetUserId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        deliveryPreference: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.businessProfile.findUnique({
      where: { userId: targetUserId },
      select: { defaultCurrency: true },
    }),
    getOrCreateSubscriberSetting(targetUserId),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const displayCurrency = String(businessProfile?.defaultCurrency || "USD").toUpperCase();
  const lateFeePolicy = toLateFeeSettingsSnapshot(subscriberSetting);

  const invoices = await prisma.invoice.findMany({
    where: {
      userId: targetUserId,
      subscriptionId: null,
      customerId: customer.id,
    },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      currency: true,
      status: true,
      generatedAt: true,
      metadata: true,
      invoicePayments: {
        select: {
          status: true,
          refundOfId: true,
          amount: true,
          amountOriginal: true,
        },
      },
    },
    orderBy: { generatedAt: "desc" },
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = invoiceIds.length
    ? await prisma.invoicePayment.findMany({
        where: {
          userId: targetUserId,
          invoiceId: { in: invoiceIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
      id: true,
      amount: true,
      currency: true,
      amountOriginal: true,
      currencyOriginal: true,
      amountConverted: true,
      currencyDefault: true,
      status: true,
      provider: true,
      reference: true,
      createdAt: true,
      refundOfId: true,
      metadata: true,
      invoice: {
        select: {
          id: true,
              invoiceNumber: true,
            },
          },
        },
      })
    : [];

  let totalInvoiced = 0;
  let totalOutstanding = 0;
  for (const invoice of invoices) {
    const amount = convertCustomerInvoiceAmount(invoice, displayCurrency);
    totalInvoiced += amount;
    if (OUTSTANDING_STATUSES.has(invoice.status)) {
      totalOutstanding += amount;
    }
  }

  let totalPaid = 0;
  for (const payment of payments) {
    if (!["SUCCEEDED", "REFUNDED"].includes(payment.status)) continue;
    totalPaid += convertCustomerPaymentAmount(payment, displayCurrency);
  }
  totalPaid = Math.max(0, totalPaid);

  const status =
    customer.status === "DISABLED"
      ? "DISABLED"
      : totalOutstanding > 0
        ? "ATTENTION"
        : totalInvoiced > 0
          ? "ACTIVE"
          : "NEW";

  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() - 29);
  const chartMap = new Map<string, number>();
  for (let i = 0; i < 30; i += 1) {
    const point = new Date(thirtyDays);
    point.setDate(thirtyDays.getDate() + i);
    const key = point.toISOString().slice(0, 10);
    chartMap.set(key, 0);
  }

  for (const payment of payments) {
    if (!["SUCCEEDED", "REFUNDED"].includes(payment.status)) continue;
    const key = payment.createdAt.toISOString().slice(0, 10);
    if (!chartMap.has(key)) continue;
    chartMap.set(key, (chartMap.get(key) || 0) + convertCustomerPaymentAmount(payment, displayCurrency));
  }

  const chart = [...chartMap.entries()].map(([date, value]) => ({ date, value }));

  const activity = [
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "invoice",
      title: `Invoice ${invoice.invoiceNumber} created`,
      timestamp: invoice.generatedAt.toISOString(),
      amount: Number(invoice.total || 0),
      currency: invoice.currency,
      invoiceNumber: invoice.invoiceNumber,
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      type: "payment",
      title:
        payment.status === "SUCCEEDED"
          ? `Payment received for ${payment.invoice?.invoiceNumber || "invoice"}`
          : `Payment ${String(payment.status || "").toLowerCase()} for ${payment.invoice?.invoiceNumber || "invoice"}`,
      timestamp: payment.createdAt.toISOString(),
      amount: Number(payment.amount || 0),
      currency: payment.currency,
      invoiceNumber: payment.invoice?.invoiceNumber || null,
      status: payment.status,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);

  const lastInvoice = invoices[0] || null;
  const lastPayment = payments.find((item) => item.status === "SUCCEEDED" && !item.refundOfId) || null;

  return NextResponse.json({
    customer: {
      ...customer,
      status,
      accountStatus: customer.status,
      lifetimeValue: totalPaid,
      totals: {
        invoiced: totalInvoiced,
        paid: totalPaid,
        outstanding: totalOutstanding,
      },
      lastInvoice: lastInvoice
        ? {
            id: lastInvoice.id,
            invoiceNumber: lastInvoice.invoiceNumber,
            amount: Number(lastInvoice.total || 0),
            currency: lastInvoice.currency,
            createdAt: lastInvoice.generatedAt,
            status: deriveInvoiceDisplayStatus(lastInvoice),
          }
        : null,
      lastPayment: lastPayment
        ? {
            id: lastPayment.id,
            amount: Number(lastPayment.amount || 0),
            currency: lastPayment.currency,
            createdAt: lastPayment.createdAt,
            reference: lastPayment.reference,
          }
        : null,
    },
    chart,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.total || 0),
      currency: invoice.currency,
      status: deriveInvoiceDisplayStatus(invoice),
      issueDate: invoice.generatedAt,
      dueDate:
        (invoice.metadata as Record<string, unknown> | null)?.dueDate &&
        typeof (invoice.metadata as Record<string, unknown>).dueDate === "string"
          ? (invoice.metadata as Record<string, string>).dueDate
          : null,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount || 0),
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      reference: payment.reference,
      createdAt: payment.createdAt,
      invoiceId: payment.invoice?.id || null,
      invoiceNumber: payment.invoice?.invoiceNumber || null,
    })),
    activity,
    displayCurrency,
    lateFeePolicy: {
      enabled: lateFeePolicy.enabled,
      allowAutomationLateFee: lateFeePolicy.allowAutomationLateFee,
    },
  });
}
