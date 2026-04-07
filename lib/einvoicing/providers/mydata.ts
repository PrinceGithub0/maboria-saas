import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  cancelMyDataInvoice,
  getMyDataInvoiceStatus,
  submitMyDataInvoicesDocument,
} from "@/lib/einvoicing/providers/mydata-client";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

type MyDataInvoiceHeader = {
  series: string;
  aa: string;
  issueDate: string | null;
  invoiceType: string;
  currency: string | null;
  correlatedInvoiceMark: string | null;
  specialInvoiceCategory: string | null;
};

type MyDataParty = {
  name: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  branchCode: string | null;
  entityType: string | null;
  address: {
    street: string | null;
    city: string | null;
    postalCode: string | null;
    region: string | null;
    country: string | null;
  };
  contact: {
    email: string | null;
    phone: string | null;
  };
};

type MyDataInvoiceLine = {
  lineNumber: string;
  lineDescription: string | null;
  quantity: number;
  measurementUnit: string | null;
  netValue: number;
  vatCategory: string | null;
  vatAmount: number;
  incomeClassification: string | null;
  expenseClassification: string | null;
  taxExemptionReason: string | null;
  specialInvoiceCategory: string | null;
};

type MyDataPayload = {
  invoicesDoc: {
    invoice: {
      invoiceHeader: MyDataInvoiceHeader;
      issuer: MyDataParty;
      counterpart: MyDataParty;
      invoiceDetails: MyDataInvoiceLine[];
      invoiceSummary: {
        subtotal: number;
        taxAmount: number;
        discountAmount: number;
        total: number;
      };
      paymentMethods: Array<{
        methodType: string;
        amount: number;
      }>;
    };
  };
};

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

function deriveSeriesAndAa(invoiceNumber?: string | null) {
  const raw = String(invoiceNumber || "").trim();
  if (!raw) {
    return {
      series: "INV",
      aa: "1",
      warnings: ["Invoice number is missing; Greece series/AA were defaulted."],
    };
  }

  const segments = raw.split(/[-/]/).map((segment) => segment.trim()).filter(Boolean);
  const seriesCandidate = segments[0] || raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  const aaCandidate = segments.length > 1 ? segments[segments.length - 1] : raw.match(/(\d+)$/)?.[1] || "";
  const series = seriesCandidate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "INV";
  const aa = aaCandidate.replace(/[^A-Za-z0-9]/g, "") || "1";
  const warnings: string[] = [];
  if (!segments.length || !aaCandidate) {
    warnings.push("Invoice number did not map cleanly to a Greece series/AA pair; defaults were used.");
  }
  return { series, aa, warnings };
}

function buildParty(
  context: EInvoiceProviderContext,
  party: NonNullable<EInvoiceProviderContext["business"]>,
  role: "issuer" | "counterpart"
): MyDataParty {
  const isIssuer = role === "issuer";
  const addressSource = isIssuer ? party.addressLine1 : party.addressLine1 || party.addressLine2;
  const lines = [
    trimOrNull(addressSource),
    trimOrNull(party.addressLine2),
    trimOrNull(party.city),
    trimOrNull(party.postalCode),
    trimOrNull(party.state),
    trimOrNull(party.country || (isIssuer ? context.sellerCountry : context.buyerCountry)),
  ];

  return {
    name: trimOrNull(party.legalName || party.contactName),
    vatNumber: trimOrNull(party.taxId),
    registrationNumber: trimOrNull(party.registrationNumber),
    branchCode: trimOrNull(party.branchCode),
    entityType: isIssuer ? "issuer" : "counterpart",
    address: {
      street: lines[0],
      city: trimOrNull(party.city),
      postalCode: trimOrNull(party.postalCode),
      region: trimOrNull(party.state),
      country: trimOrNull(party.country || (isIssuer ? context.sellerCountry : context.buyerCountry)),
    },
    contact: {
      email: trimOrNull(party.email),
      phone: trimOrNull(party.phone),
    },
  };
}

function buildMyDataLine(
  item: NonNullable<EInvoiceProviderContext["items"]>[number],
  index: number,
  context: EInvoiceProviderContext
): MyDataInvoiceLine {
  const netValue = Number(item.lineTotal ?? item.quantity * item.unitPrice);
  return {
    lineNumber: String(index + 1),
    lineDescription: trimOrNull(item.description || item.name),
    quantity: Number(item.quantity || 0),
    measurementUnit: trimOrNull(item.unitCode) || "EA",
    netValue,
    vatCategory: trimOrNull(item.taxCategory),
    vatAmount: Number(item.taxAmount ?? 0),
    incomeClassification: trimOrNull(item.incomeClassification),
    expenseClassification: null,
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    specialInvoiceCategory: trimOrNull(context.compliance?.taxTreatment),
  };
}

export const myDataProvider: EInvoiceProviderAdapter = {
  key: "MYDATA",
  countries: ["GR"],
  documentFormat: "REPORTING",
  supportsClearance: false,
  buildPayload(context) {
    const invoiceNumber = trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "mydata-draft";
    const { series, aa, warnings: seriesWarnings } = deriveSeriesAndAa(invoiceNumber);
    const issuer = context.business
      ? buildParty(context, context.business, "issuer")
      : {
          name: null,
          vatNumber: null,
          registrationNumber: null,
          branchCode: null,
          entityType: "issuer",
          address: { street: null, city: null, postalCode: null, region: null, country: trimOrNull(context.sellerCountry) },
          contact: { email: null, phone: null },
        };
    const counterpart = context.customer
      ? buildParty(context, context.customer, "counterpart")
      : {
          name: null,
          vatNumber: null,
          registrationNumber: null,
          branchCode: null,
          entityType: "counterpart",
          address: { street: null, city: null, postalCode: null, region: null, country: trimOrNull(context.buyerCountry) },
          contact: { email: null, phone: null },
        };
    const invoiceDetails = (context.items || []).map((item, index) => buildMyDataLine(item, index, context));
    const payload: MyDataPayload = {
      invoicesDoc: {
        invoice: {
          invoiceHeader: {
            series,
            aa,
            issueDate: trimOrNull(context.issuedAt),
            invoiceType: context.compliance?.buyerType === "B2C" ? "1.1" : "1.1",
            currency: trimOrNull(context.currency),
            correlatedInvoiceMark: null,
            specialInvoiceCategory: trimOrNull(context.compliance?.taxTreatment),
          },
          issuer,
          counterpart,
          invoiceDetails,
          invoiceSummary: {
            subtotal: Number(context.totals?.subtotal || 0),
            taxAmount: Number(context.totals?.taxAmount || 0),
            discountAmount: Number(context.totals?.discountAmount || 0),
            total: Number(context.totals?.total || 0),
          },
          paymentMethods: [
            {
              methodType: "OTHER",
              amount: Number(context.totals?.total || 0),
            },
          ],
        },
      },
    };

    const resultWarnings = [
      "Greece myDATA payload is structured and supports live submission, status sync, and cancellation when AADE credentials are configured.",
      "Income classification and VAT category mapping must be supplied correctly for the reported invoice lines.",
      ...seriesWarnings,
    ];

    if (!issuer.name) {
      resultWarnings.push("Issuer legal name is missing from the current business profile.");
    }
    if (!issuer.vatNumber) {
      resultWarnings.push("Issuer VAT number is missing from the current business profile.");
    }
    if (!counterpart.name) {
      resultWarnings.push("Counterpart legal name is missing from the current customer profile.");
    }
    if (!counterpart.vatNumber && context.compliance?.buyerType === "B2B") {
      resultWarnings.push("Counterpart VAT number is missing for a B2B Greece invoice.");
    }
    if (!invoiceDetails.length) {
      resultWarnings.push("At least one invoice line is required for myDATA payload generation.");
    }

    invoiceDetails.forEach((line) => {
      if (!line.incomeClassification) {
        resultWarnings.push(`Line ${line.lineNumber} is missing income classification mapping.`);
      }
      if (!line.vatCategory && Number(line.vatAmount || 0) > 0) {
        resultWarnings.push(`Line ${line.lineNumber} is missing VAT category mapping.`);
      }
    });

    return {
      externalId: invoiceNumber,
      format: "REPORTING",
      payload,
      warnings: resultWarnings,
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
    const structuredPayload = payload.payload as Partial<MyDataPayload> | null;
    const invoice = structuredPayload?.invoicesDoc?.invoice;

    if (!invoice?.invoiceHeader?.series) {
      errors.push("Invoice series is required for myDATA payloads.");
    }
    if (!invoice?.invoiceHeader?.aa) {
      errors.push("Invoice AA is required for myDATA payloads.");
    }
    if (!invoice?.issuer?.name) {
      errors.push("Issuer legal name is required for Greece myDATA reporting.");
    }
    if (!invoice?.issuer?.vatNumber) {
      errors.push("Issuer VAT number is required for Greece myDATA reporting.");
    }
    if (!invoice?.counterpart?.name) {
      errors.push("Counterpart legal name is required for Greece myDATA reporting.");
    }
    if (!Array.isArray(invoice?.invoiceDetails) || invoice.invoiceDetails.length === 0) {
      errors.push("At least one invoice line is required for Greece myDATA reporting.");
    }

    const hasClassifications = (invoice?.invoiceDetails || []).every((line) => {
      if (!line.incomeClassification) {
        warnings.push(`Line ${line.lineNumber} is missing income classification.`);
        return false;
      }
      return true;
    });
    if (!hasClassifications) {
      warnings.push("myDATA income classification mapping is incomplete.");
    }

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  async submit(payload, context) {
    return submitMyDataInvoicesDocument({
      connection: context.connection,
      payload: payload.payload,
    });
  },
  async getStatus(submissionId, context) {
    return getMyDataInvoiceStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelMyDataInvoice({
      connection: context.connection,
      submissionId,
    });
  },
  buildWarnings(context) {
    const warnings = ["Greece may require myDATA electronic reporting even when a PDF invoice is also issued."];
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Issuer VAT number should be completed before Greece reporting.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Counterpart VAT number should be completed before Greece B2B reporting.");
    }
    return warnings;
  },
};
