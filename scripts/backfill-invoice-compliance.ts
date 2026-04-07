import { prisma } from "../lib/prisma";
import { upsertInvoiceComplianceArtifacts } from "../lib/invoicing/blueprint/storage";
import {
  buildUniversalInvoiceDocument,
  validateUniversalInvoiceDocument,
} from "../lib/invoicing/blueprint/validation";
import { resolveInvoiceCompliance } from "../lib/invoicing/resolve-compliance";

const PAGE_SIZE = 50;

type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
  unitCode?: string;
  classificationCode?: string;
  taxCategory?: string;
  taxExemptionReason?: string;
  incomeClassification?: string;
  taxAmount?: number;
  taxRate?: number;
};

const normalizeInvoiceItems = (value: unknown): InvoiceItem[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const quantity = Number(item?.quantity || 0);
    const price = Number(item?.price || 0);
    return {
      name: String(item?.name || item?.description || "Item"),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      price: Number.isFinite(price) ? price : 0,
      description: typeof item?.description === "string" ? item.description : undefined,
      unitCode: typeof item?.unitCode === "string" ? item.unitCode : undefined,
      classificationCode:
        typeof item?.classificationCode === "string" ? item.classificationCode : undefined,
      taxCategory: typeof item?.taxCategory === "string" ? item.taxCategory : undefined,
      taxExemptionReason:
        typeof item?.taxExemptionReason === "string" ? item.taxExemptionReason : undefined,
      incomeClassification:
        typeof item?.incomeClassification === "string" ? item.incomeClassification : undefined,
      taxAmount:
        item?.taxAmount !== undefined && item?.taxAmount !== null ? Number(item.taxAmount) : undefined,
      taxRate: item?.taxRate !== undefined && item?.taxRate !== null ? Number(item.taxRate) : undefined,
    };
  });
};

const normalizeText = (value: unknown) => {
  const raw = String(value ?? "").trim();
  return raw.length ? raw : null;
};

async function main() {
  let cursor: string | null = null;
  let processed = 0;
  let persisted = 0;

  for (;;) {
    const invoices: any[] = await prisma.invoice.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: {
        customer: true,
      },
    });
    if (invoices.length === 0) break;

    for (const invoice of invoices) {
      processed += 1;
      const metadata = (invoice.metadata as any) || {};
      const items = normalizeInvoiceItems(invoice.items);
      const businessSnapshot =
        metadata?.businessProfile ||
        (await prisma.businessProfile.findUnique({
          where: { userId: invoice.userId },
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
          },
        }));
      if (!businessSnapshot?.businessName) continue;

      const customerSnapshot = metadata?.customer || null;
      const note = typeof metadata?.note === "string" ? metadata.note : null;
      const issueDate = invoice.generatedAt ?? null;
      const dueDate = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
      const discountAmount = Number(invoice.discount || 0);
      const taxAmount = Number(invoice.tax || 0);
      const total = Number(invoice.total || subtotal - discountAmount + taxAmount);

      const compliance =
        metadata?.compliance ||
        resolveInvoiceCompliance({
          sellerCountry: businessSnapshot.country,
          sellerTaxId: businessSnapshot.taxId,
          buyerCountry: customerSnapshot?.country,
          buyerTaxId: customerSnapshot?.taxId,
          buyerType: customerSnapshot?.type,
          buyerCompanyName: customerSnapshot?.companyName,
          customerClassification: customerSnapshot?.type,
          supplyType: metadata?.compliance?.supplyType ?? null,
          itemNames: items.map((item) => [item.name, item.description].filter(Boolean).join(" ")),
        });

      const document = buildUniversalInvoiceDocument({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate,
        dueDate,
        currency: invoice.currency,
        supplier: {
          legalName: normalizeText(businessSnapshot.businessName),
          tradeName: normalizeText(businessSnapshot.businessName),
          taxId: normalizeText(businessSnapshot.taxId),
          registrationNumber: normalizeText(businessSnapshot.registrationNumber),
          branchCode: normalizeText(businessSnapshot.branchCode),
          email: normalizeText(businessSnapshot.businessEmail),
          phone: normalizeText(businessSnapshot.businessPhone),
          addressLine1: normalizeText(businessSnapshot.addressLine1 || businessSnapshot.businessAddress),
          addressLine2: normalizeText(businessSnapshot.addressLine2),
          city: normalizeText(businessSnapshot.city),
          stateRegion: normalizeText(businessSnapshot.state),
          postalCode: normalizeText(businessSnapshot.postalCode),
          countryCode: normalizeText(businessSnapshot.country),
        },
        customer: {
          legalName: normalizeText(customerSnapshot?.companyName || customerSnapshot?.name),
          tradeName: normalizeText(customerSnapshot?.companyName || customerSnapshot?.name),
          taxId: normalizeText(customerSnapshot?.taxId),
          registrationNumber: normalizeText(customerSnapshot?.registrationNumber),
          branchCode: normalizeText(customerSnapshot?.branchCode),
          email: normalizeText(customerSnapshot?.email),
          phone: normalizeText(customerSnapshot?.phone),
          addressLine1: normalizeText(customerSnapshot?.streetAddress || customerSnapshot?.address),
          addressLine2: normalizeText(customerSnapshot?.addressLine2),
          city: normalizeText(customerSnapshot?.city),
          stateRegion: normalizeText(customerSnapshot?.state),
          postalCode: normalizeText(customerSnapshot?.postalCode),
          countryCode: normalizeText(customerSnapshot?.country),
          classification:
            customerSnapshot?.type === "BUSINESS"
              ? "BUSINESS"
              : customerSnapshot?.type === "INDIVIDUAL"
                ? "INDIVIDUAL"
                : "UNKNOWN",
        },
        buyerType: compliance.buyerType,
        supplyType: compliance.supplyType,
        lines: items.map((item) => ({
          description: [item.name, item.description].filter(Boolean).join(" ").trim() || item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          taxCode: item.taxCategory,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          lineTotal: item.quantity * item.price,
          classificationCode: item.classificationCode,
          unitCode: item.unitCode,
          exemptionReason: item.taxExemptionReason,
        })),
        totals: {
          subtotal,
          taxTotal: taxAmount,
          discountTotal: discountAmount,
          grandTotal: total,
        },
        notes: note,
        complianceSnapshot: compliance,
      });
      const validation = validateUniversalInvoiceDocument(document);

      const result = await upsertInvoiceComplianceArtifacts({
        invoiceId: invoice.id,
        validation,
      });
      if (result.persisted) {
        persisted += 1;
      }
    }

    cursor = invoices[invoices.length - 1]?.id ?? null;
  }

  console.log(
    JSON.stringify(
      {
        processed,
        persisted,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
