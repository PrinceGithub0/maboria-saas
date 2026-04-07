import "server-only";

import { prisma } from "@/lib/prisma";
import {
  buildBusinessProfileSnapshot,
  buildInvoiceComplianceSnapshot,
  buildInvoiceEInvoicingSnapshot,
  normalizeInvoiceItems,
  resolveInvoiceBusinessSnapshot,
  resolveInvoiceCustomer,
  resolveStoredInvoiceTotals,
} from "@/lib/invoice";
import {
  resolvePrivateEInvoiceConnectionForUser,
} from "@/lib/einvoicing/connections";
import { resolveInvoiceEInvoicingSnapshot } from "@/lib/einvoicing/resolve-provider";
import type { EInvoiceProviderContext, InvoiceEInvoicingSnapshot } from "@/lib/einvoicing/types";
import type { InvoiceComplianceResult } from "@/lib/invoicing/types";

const buildSnapshotTransportFields = (metadata: Record<string, any> | null | undefined) => {
  const transport = metadata?.eInvoiceTransport;
  return {
    transportDocumentAttached: Boolean(transport?.documentBase64),
    transportDocumentFormat: transport?.format ?? null,
    transportUuid: transport?.uuid ?? null,
    transportHashPresent: Boolean(transport?.invoiceHash || transport?.digest),
  };
};

export type InvoiceEInvoiceRuntimeRecord = {
  invoice: any;
  business: NonNullable<ReturnType<typeof resolveInvoiceBusinessSnapshot>>;
  customer: ReturnType<typeof resolveInvoiceCustomer>;
  items: ReturnType<typeof normalizeInvoiceItems>;
  totals: ReturnType<typeof resolveStoredInvoiceTotals>;
  compliance: InvoiceComplianceResult;
  connection: EInvoiceProviderContext["connection"];
  snapshot: InvoiceEInvoicingSnapshot;
  context: EInvoiceProviderContext;
  dueDate: Date | null;
};

export async function loadInvoiceEInvoiceRuntime(input: {
  userId: string;
  invoiceId: string;
}): Promise<InvoiceEInvoiceRuntimeRecord | null> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: input.invoiceId,
      userId: input.userId,
      subscriptionId: null,
    },
  });
  if (!invoice) return null;

  const metadata = (invoice.metadata as any) || {};
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : null;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : null;

  const fallbackProfile = await prisma.businessProfile.findUnique({
    where: { userId: input.userId },
    select: {
      businessName: true,
      country: true,
      defaultCurrency: true,
      businessAddress: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      businessEmail: true,
      businessPhone: true,
      taxId: true,
      registrationNumber: true,
      branchCode: true,
      vatEnabled: true,
      vatRate: true,
      vatRateDisplay: true,
      vatPricingMode: true,
    },
  });

  const normalizedFallbackProfile = fallbackProfile
    ? buildBusinessProfileSnapshot({
        ...fallbackProfile,
        vatRate: fallbackProfile.vatRate ? Number(fallbackProfile.vatRate) : 0,
      })
    : null;
  const business = resolveInvoiceBusinessSnapshot(invoice, normalizedFallbackProfile);
  if (!business) return null;

  const customer = resolveInvoiceCustomer(metadata);
  const items = normalizeInvoiceItems(invoice.items);
  const totals = resolveStoredInvoiceTotals(invoice, business);
  const compliance = (metadata?.compliance as InvoiceComplianceResult | undefined) ||
    buildInvoiceComplianceSnapshot({
      business,
      customer,
      items,
      buyerType: (metadata?.compliance?.buyerType as any) || null,
      supplyType: (metadata?.compliance?.supplyType as any) || null,
    });
  const connection = await resolvePrivateEInvoiceConnectionForUser({
    userId: input.userId,
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      sellerCountry: compliance.sellerCountry,
      buyerCountry: compliance.buyerCountry,
      currency: invoice.currency,
      compliance,
    },
  });

  const context: EInvoiceProviderContext = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceStatus: invoice.status,
    sellerCountry: compliance.sellerCountry,
    buyerCountry: compliance.buyerCountry,
    currency: invoice.currency,
    issuedAt: invoice.generatedAt?.toISOString?.() ?? null,
    dueDate: dueDate?.toISOString() ?? null,
    business: {
      legalName: business.businessName,
      email: business.businessEmail,
      phone: business.businessPhone,
      taxId: business.taxId,
      registrationNumber: business.registrationNumber,
      branchCode: business.branchCode,
      country: business.country,
      addressLine1: business.addressLine1 || business.businessAddress,
      addressLine2: business.addressLine2,
      city: business.city,
      state: business.state,
      postalCode: business.postalCode,
    },
    customer: customer
      ? {
          legalName: customer.companyName || customer.name,
          contactName: customer.name,
          email: customer.email,
          phone: customer.phone,
          taxId: customer.taxId,
          registrationNumber: customer.registrationNumber,
          branchCode: customer.branchCode,
          country: customer.country,
          addressLine1: customer.streetAddress || customer.address,
          addressLine2: customer.addressLine2,
          city: customer.city,
          state: customer.state,
          postalCode: customer.postalCode,
        }
      : null,
    items: items.map((item) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.price || 0),
      lineTotal: Number(item.quantity || 0) * Number(item.price || 0),
      taxAmount: null,
    })),
    totals: {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discountAmount: totals.discountAmount,
      total: totals.total,
    },
    transportDocument:
      metadata?.eInvoiceTransport &&
      typeof metadata.eInvoiceTransport === "object"
        ? {
            format: metadata.eInvoiceTransport.format ?? null,
            documentBase64: metadata.eInvoiceTransport.documentBase64 ?? null,
            invoiceHash: metadata.eInvoiceTransport.invoiceHash ?? null,
            uuid: metadata.eInvoiceTransport.uuid ?? null,
            digest: metadata.eInvoiceTransport.digest ?? null,
            mode: metadata.eInvoiceTransport.mode ?? null,
          }
        : null,
    compliance,
    connection,
  };

  const storedSnapshot = metadata?.eInvoicing as InvoiceEInvoicingSnapshot | undefined;
  const currentReadinessSnapshot = resolveInvoiceEInvoicingSnapshot(context);
  const snapshot = storedSnapshot
    ? {
        ...storedSnapshot,
        statusSyncAvailable: currentReadinessSnapshot.statusSyncAvailable,
        cancellationAvailable: currentReadinessSnapshot.cancellationAvailable,
        productionReady: currentReadinessSnapshot.productionReady,
        productionBlockers: currentReadinessSnapshot.productionBlockers,
        warnings: Array.from(new Set([...(storedSnapshot.warnings || []), ...currentReadinessSnapshot.warnings])),
        note: currentReadinessSnapshot.note || storedSnapshot.note || null,
        ...buildSnapshotTransportFields(metadata),
      }
    : buildInvoiceEInvoicingSnapshot({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      currency: invoice.currency,
      issuedAt: invoice.generatedAt,
      dueDate,
      business,
      customer,
      items,
      totals: {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
      },
      transportDocument:
        metadata?.eInvoiceTransport &&
        typeof metadata.eInvoiceTransport === "object"
          ? {
              format: metadata.eInvoiceTransport.format ?? null,
              documentBase64: metadata.eInvoiceTransport.documentBase64 ?? null,
              invoiceHash: metadata.eInvoiceTransport.invoiceHash ?? null,
              uuid: metadata.eInvoiceTransport.uuid ?? null,
              digest: metadata.eInvoiceTransport.digest ?? null,
              mode: metadata.eInvoiceTransport.mode ?? null,
            }
          : null,
      compliance,
      connection,
    });

  return {
    invoice,
    business,
    customer,
    items,
    totals,
    compliance,
    connection,
    snapshot,
    context,
    dueDate,
  };
}
