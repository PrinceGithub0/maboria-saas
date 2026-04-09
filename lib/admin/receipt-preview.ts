import "server-only";

import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { formatDateDMY } from "@/lib/date";
import {
  buildInvoicePdfBuffer,
  calculateTotalsFromAmounts,
  getBusinessLogoBuffer,
  normalizeInvoiceItems,
  resolveInvoicePaymentDetails,
  resolveInvoiceCustomer,
} from "@/lib/invoice";
import { buildInvoiceReceiptPdfBuffer, readStoredInvoiceReceiptPdf } from "@/lib/invoice-receipt";
import { buildSubscriptionReceiptPdfBuffer } from "@/lib/subscription-receipt";
import { normalizeVatSettings } from "@/lib/vat";

export const RECEIPT_PREVIEW_TYPES = [
  "subscription_receipt",
  "customer_invoice",
  "payment_receipt",
] as const;

export type ReceiptPreviewDocumentType = (typeof RECEIPT_PREVIEW_TYPES)[number];
export type ReceiptPreviewMode = "template" | "real";

export type ReceiptPreviewExample = {
  id: string;
  label: string;
};

type ReceiptPreviewResult = {
  buffer: Buffer;
  filename: string;
};

type BusinessSnapshot = {
  businessName: string;
  country: string;
  businessAddress: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  vatEnabled: boolean;
  vatRate: number;
  vatPricingMode: "EXCLUSIVE" | "INCLUSIVE";
};

const DEFAULT_BUSINESS: BusinessSnapshot = {
  businessName: "Test Company",
  country: "US",
  businessAddress: "123 Main Street, City",
  businessEmail: "finance@testcompany.com",
  businessPhone: "+1 555 555 0100",
  vatEnabled: false,
  vatRate: 0,
  vatPricingMode: "EXCLUSIVE",
};

const httpError = (message: string, status: number, code?: string) => {
  const error = new Error(message);
  (error as Error & { status?: number; code?: string }).status = status;
  if (code) {
    (error as Error & { status?: number; code?: string }).code = code;
  }
  return error;
};

function sanitizeFilename(value: string) {
  return String(value || "document").replace(/[^a-zA-Z0-9-_]/g, "_");
}

function compactId(value: string, head = 10, tail = 4) {
  const input = String(value || "").trim();
  if (!input) return input;
  if (input.length <= head + tail + 1) return input;
  return `${input.slice(0, head)}...${input.slice(-tail)}`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function mapSubscriptionPlanLabel(plan?: string | null) {
  const normalized = String(plan || "").trim().toUpperCase();
  if (normalized === "PRO") return "Pro Plan";
  if (normalized === "GROWTH") return "Growth Plan";
  if (normalized === "BUSINESS") return "Business Plan";
  if (normalized === "PREMIUM") return "Premium Plan";
  if (normalized === "ENTERPRISE") return "Enterprise Plan";
  if (normalized === "STARTER") return "Starter Plan";
  return "Subscription Plan";
}

async function resolveBusinessSnapshot(userId?: string | null) {
  if (!userId) return DEFAULT_BUSINESS;
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: {
      businessName: true,
      businessAddress: true,
      country: true,
      businessEmail: true,
      businessPhone: true,
      vatEnabled: true,
      vatRate: true,
      vatPricingMode: true,
    },
  });

  if (!profile) return DEFAULT_BUSINESS;
  return {
    businessName: profile.businessName || DEFAULT_BUSINESS.businessName,
    country: profile.country || DEFAULT_BUSINESS.country,
    businessAddress: profile.businessAddress || null,
    businessEmail: profile.businessEmail || null,
    businessPhone: profile.businessPhone || null,
    vatEnabled: Boolean(profile.vatEnabled),
    vatRate: profile.vatRate ? Number(profile.vatRate) : 0,
    vatPricingMode:
      String(profile.vatPricingMode || "EXCLUSIVE").toUpperCase() === "INCLUSIVE"
        ? "INCLUSIVE"
        : "EXCLUSIVE",
  };
}

function buildTemplateSubscriptionReceipt() {
  return buildSubscriptionReceiptPdfBuffer({
    receiptNumber: "MBR-TPL-SUB-001",
    paidAt: new Date(),
    plan: "Pro Plan",
    amount: 59,
    currency: "USD",
    customerName: "Test Company",
    customerEmail: "billing@testcompany.com",
    provider: "PAYSTACK",
    reference: "txn_test_001",
    interval: "monthly",
    paymentMethod: "Card",
  });
}

function buildTemplateCustomerInvoice() {
  const items = [{ name: "Platform Services", quantity: 1, price: 300 }];
  const totals = calculateTotalsFromAmounts(
    items,
    normalizeVatSettings({ enabled: false, rate: 0, mode: "exclusive" }),
    0
  );

  return buildInvoicePdfBuffer({
    invoiceNumber: "INV-TEST-001",
    status: "SENT",
    issuedAt: new Date(),
    dueDate: null,
    currency: "USD",
    items,
    totals,
    business: {
      businessName: "Test Company",
      country: "US",
      defaultCurrency: "USD",
      businessAddress: "123 Main Street, City",
      businessEmail: "billing@testcompany.com",
      businessPhone: "+1 555 555 0100",
      taxId: null,
      vatEnabled: false,
      vatRate: 0,
      vatPricingMode: "EXCLUSIVE",
    },
    billTo: {
      name: "John Doe",
      email: "john@example.com",
      address: "101 Customer Avenue, New York",
    },
  });
}

function buildTemplatePaymentReceipt() {
  const items = [{ name: "Platform Services", quantity: 1, price: 300 }];
  const totals = calculateTotalsFromAmounts(
    items,
    normalizeVatSettings({ enabled: false, rate: 0, mode: "exclusive" }),
    0
  );

  return buildInvoiceReceiptPdfBuffer({
    receiptNumber: "RCT-TEST-001",
    paidAt: new Date(),
    invoiceNumber: "INV-TEST-001",
    amount: 300,
    currency: "USD",
    provider: "PAYSTACK",
    paymentMethod: "Card",
    reference: "txn_test_001",
    business: {
      businessName: "Test Company",
      businessAddress: "123 Main Street, City",
      businessEmail: "billing@testcompany.com",
      businessPhone: "+1 555 555 0100",
    },
    billTo: {
      name: "John Doe",
      email: "john@example.com",
      address: "101 Customer Avenue, New York",
    },
    items,
    totals,
  });
}

async function buildRealSubscriptionReceipt(exampleId: string): Promise<ReceiptPreviewResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: exampleId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!payment) {
    throw httpError("Subscription receipt example not found.", 404, "NOT_FOUND");
  }

  const metadata = asRecord(payment.metadata);
  const interval = String(metadata.interval || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
  const receiptNumber = String(payment.reference || payment.id);
  const plan = mapSubscriptionPlanLabel((metadata.plan as string | undefined) || null);
  const pdfBuffer = await buildSubscriptionReceiptPdfBuffer({
    receiptNumber,
    paidAt: payment.createdAt,
    plan,
    amount: Number(payment.amount),
    currency: payment.currency || "USD",
    customerName: (metadata.customerName as string | undefined) || payment.user?.name || "Subscriber",
    customerEmail: (metadata.customerEmail as string | undefined) || payment.user?.email || undefined,
    provider: payment.provider === "FLUTTERWAVE" ? "FLUTTERWAVE" : "PAYSTACK",
    reference: payment.reference || undefined,
    interval,
    paymentMethod: (metadata.paymentMethod as string | undefined) || "Card",
  });

  return {
    buffer: pdfBuffer,
    filename: `Subscription_Receipt_${sanitizeFilename(receiptNumber)}.pdf`,
  };
}

async function buildRealCustomerInvoice(exampleId: string): Promise<ReceiptPreviewResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: exampleId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      customer: {
        select: {
          name: true,
          email: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
    },
  });

  if (!invoice) {
    throw httpError("Customer invoice example not found.", 404, "NOT_FOUND");
  }

  const business = await resolveBusinessSnapshot(invoice.userId);
  const metadata = asRecord(invoice.metadata);
  const customerFromMetadata = resolveInvoiceCustomer(metadata);
  const billTo =
    customerFromMetadata ||
    ({
      name: invoice.customer?.name || null,
      email: invoice.customer?.email || null,
      address: [
        invoice.customer?.addressLine1,
        invoice.customer?.addressLine2,
        invoice.customer?.city,
        invoice.customer?.state,
        invoice.customer?.postalCode,
        invoice.customer?.country,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", "),
    } as const);

  const items = normalizeInvoiceItems(invoice.items);
  const vatSettings = normalizeVatSettings({
    enabled: business.vatEnabled,
    rate: business.vatRate,
    mode: business.vatPricingMode === "INCLUSIVE" ? "inclusive" : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(items, vatSettings, Number(invoice.discount || 0));
  const dueDateRaw = typeof metadata.dueDate === "string" ? new Date(metadata.dueDate) : null;
  const dueDate = dueDateRaw && !Number.isNaN(dueDateRaw.getTime()) ? dueDateRaw : null;
  const paymentDetails = await resolveInvoicePaymentDetails(invoice.userId, null);

  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issuedAt: invoice.generatedAt,
    dueDate,
    currency: invoice.currency || "USD",
    items,
    totals,
    lateFeeAmount: Number(invoice.lateFeeTotalAccumulated ?? invoice.lateFeeAmount ?? 0),
    totalDue: Number(invoice.total || totals.total),
    business: {
      businessName: business.businessName,
      country: business.country,
      defaultCurrency: invoice.currency || "USD",
      businessAddress: business.businessAddress,
      businessEmail: business.businessEmail,
      businessPhone: business.businessPhone,
      taxId: null,
      vatEnabled: business.vatEnabled,
      vatRate: business.vatRate,
      vatPricingMode: business.vatPricingMode,
    },
    billTo,
    paymentDetails,
    logoBuffer: await getBusinessLogoBuffer(invoice.userId),
  });

  return {
    buffer: pdfBuffer,
    filename: `Customer_Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`,
  };
}

async function buildRealPaymentReceipt(exampleId: string): Promise<ReceiptPreviewResult> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: exampleId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      invoice: {
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              postalCode: true,
              country: true,
            },
          },
        },
      },
      invoicePayment: {
        select: {
          metadata: true,
        },
      },
    },
  });

  if (!receipt) {
    throw httpError("Payment receipt example not found.", 404, "NOT_FOUND");
  }

  if (receipt.pdfUrl) {
    const existing = await readStoredInvoiceReceiptPdf(receipt.pdfUrl);
    if (existing) {
      return {
        buffer: existing,
        filename: `Payment_Receipt_${sanitizeFilename(receipt.receiptNumber)}.pdf`,
      };
    }
  }

  const business = await resolveBusinessSnapshot(receipt.userId);
  const metadata = asRecord(receipt.invoice?.metadata);
  const paymentMetadata = asRecord(receipt.invoicePayment?.metadata);
  const customerFromMetadata = resolveInvoiceCustomer(metadata);
  const billTo =
    customerFromMetadata ||
    ({
      name: receipt.invoice?.customer?.name || receipt.user?.name || "Customer",
      email: receipt.invoice?.customer?.email || receipt.user?.email || undefined,
      address: [
        receipt.invoice?.customer?.addressLine1,
        receipt.invoice?.customer?.addressLine2,
        receipt.invoice?.customer?.city,
        receipt.invoice?.customer?.state,
        receipt.invoice?.customer?.postalCode,
        receipt.invoice?.customer?.country,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", "),
    } as const);

  const items = normalizeInvoiceItems(receipt.invoice?.items || []);
  const vatSettings = normalizeVatSettings({
    enabled: business.vatEnabled,
    rate: business.vatRate,
    mode: business.vatPricingMode === "INCLUSIVE" ? "inclusive" : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(items, vatSettings, Number(receipt.invoice?.discount || 0));
  const pdfBuffer = await buildInvoiceReceiptPdfBuffer({
    receiptNumber: receipt.receiptNumber,
    paidAt: receipt.issuedAt,
    invoiceNumber: receipt.invoice?.invoiceNumber || "INV",
    amount: Number(receipt.amount),
    currency: receipt.currency || "USD",
    provider: receipt.provider === "FLUTTERWAVE" ? "FLUTTERWAVE" : "PAYSTACK",
    paymentMethod:
      receipt.paymentMethod ||
      (paymentMetadata.paymentMethod as string | undefined) ||
      (metadata.paymentMethod as string | undefined) ||
      "Card",
    reference: receipt.reference || undefined,
    business: {
      businessName: business.businessName,
      businessAddress: business.businessAddress,
      businessEmail: business.businessEmail,
      businessPhone: business.businessPhone,
    },
    billTo,
    logoBuffer: await getBusinessLogoBuffer(receipt.userId),
    items,
    totals,
  });

  return {
    buffer: pdfBuffer,
    filename: `Payment_Receipt_${sanitizeFilename(receipt.receiptNumber)}.pdf`,
  };
}

export async function listReceiptPreviewExamples(
  type: ReceiptPreviewDocumentType
): Promise<ReceiptPreviewExample[]> {
  if (type === "customer_invoice") {
    const invoices = await prisma.invoice.findMany({
      orderBy: { generatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        invoiceNumber: true,
        generatedAt: true,
        user: { select: { email: true } },
      },
    });
    return invoices.map((invoice) => ({
      id: invoice.id,
      label: `${compactId(invoice.invoiceNumber, 14, 4)} · ${formatDateDMY(invoice.generatedAt)}`,
    }));
  }

  if (type === "payment_receipt") {
    const receipts = await prisma.receipt.findMany({
      orderBy: { issuedAt: "desc" },
      take: 40,
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        invoice: { select: { invoiceNumber: true } },
      },
    });
    return receipts.map((receipt) => ({
      id: receipt.id,
      label: `${compactId(receipt.receiptNumber, 14, 4)} · ${formatDateDMY(receipt.issuedAt)}`,
    }));
  }

  const payments = await prisma.payment.findMany({
    where: { status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      createdAt: true,
      reference: true,
      metadata: true,
      user: { select: { email: true } },
    },
  });

  const filtered = payments.filter((payment) => {
    const metadata = asRecord(payment.metadata);
    return Boolean(metadata.plan || metadata.interval || metadata.billingCycle);
  });
  const source = filtered.length ? filtered : payments;
  return source.slice(0, 40).map((payment) => ({
    id: payment.id,
    label: `${compactId(String(payment.reference || payment.id), 14, 4)} · ${formatDateDMY(payment.createdAt)}`,
  }));
}

export async function buildReceiptPreviewPdf(input: {
  type: ReceiptPreviewDocumentType;
  mode: ReceiptPreviewMode;
  exampleId?: string | null;
}): Promise<ReceiptPreviewResult> {
  if (input.mode === "template") {
    if (input.type === "subscription_receipt") {
      return {
        buffer: await buildTemplateSubscriptionReceipt(),
        filename: "Subscription_Receipt_Template.pdf",
      };
    }
    if (input.type === "customer_invoice") {
      return {
        buffer: await buildTemplateCustomerInvoice(),
        filename: "Customer_Invoice_Template.pdf",
      };
    }
    return {
      buffer: await buildTemplatePaymentReceipt(),
      filename: "Payment_Receipt_Template.pdf",
    };
  }

  if (!input.exampleId) {
    throw httpError("Example document is required in real example mode.", 400, "MISSING_EXAMPLE_ID");
  }

  if (input.type === "subscription_receipt") {
    return buildRealSubscriptionReceipt(input.exampleId);
  }
  if (input.type === "customer_invoice") {
    return buildRealCustomerInvoice(input.exampleId);
  }
  return buildRealPaymentReceipt(input.exampleId);
}
