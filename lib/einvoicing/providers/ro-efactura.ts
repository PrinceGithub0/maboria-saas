import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import {
  cancelRoEFacturaDocument,
  getRoEFacturaSubmissionStatus,
  submitRoEFacturaDocument,
} from "@/lib/einvoicing/providers/ro-efactura-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&após;");

const serializeXmlNode = (tagName: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value.map((entry) => serializeXmlNode(tagName, entry)).join("");
  }
  if (typeof value === "object") {
    const objectEntries = Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => serializeXmlNode(childKey, childValue))
      .join("");
    return objectEntries ? `<${tagName}>${objectEntries}</${tagName}>` : "";
  }
  return `<${tagName}>${escapeXml(value)}</${tagName}>`;
};

const buildRoInvoiceXml = (payload: Record<string, unknown>) =>
  `<?xml version="1.0" encoding="UTF-8"?>${serializeXmlNode("Invoice", payload)}`;

const buildPartyAddress = (party: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) => ({
  streetName: trimOrNull(party.addressLine1),
  additionalStreetName: trimOrNull(party.addressLine2),
  cityName: trimOrNull(party.city),
  countrySubentity: trimOrNull(party.state),
  postalZone: trimOrNull(party.postalCode),
  countryIdentificationCode: trimOrNull(party.country),
});

const inferRoTaxCategoryCode = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const taxAmount = Number(context.totals?.taxAmount || 0);
  if (taxAmount <= 0) return "Z";
  return "S";
};

const buildPaymentMeans = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const method = context.compliance?.buyerType === "B2B" ? "31" : "42";
  return [
    {
      paymentMeansCode: method,
      paymentDueDate: trimOrNull(context.dueDate),
    },
  ];
};

const buildTaxSubtotal = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const taxAmount = Number(context.totals?.taxAmount || 0);
  const taxableAmount = Number(context.totals?.subtotal || 0);
  return [
    {
      taxableAmount,
      taxAmount,
      percent: taxableAmount > 0 ? Number(((taxAmount / taxableAmount) * 100).toFixed(2)) : 0,
      taxCategory: {
        id: inferRoTaxCategoryCode(context),
        name: taxAmount > 0 ? "VAT" : "Exempt",
        taxScheme: {
          id: "VAT",
          name: "Value Added Tax",
        },
      },
    },
  ];
};

const buildInvoiceLine = (
  context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0],
  index: number,
  item: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["items"]>[number]
) => {
  const lineTotal = Number(item.lineTotal ?? item.quantity * item.unitPrice);
  const lineTaxAmount = Number(item.taxAmount ?? 0);
  const description = trimOrNull(item.description) || trimOrNull(item.name) || `Item ${index + 1}`;
  const taxCategoryId = item.taxCategory || inferRoTaxCategoryCode(context);

  return {
    id: String(index + 1),
    note: description,
    invoicedQuantity: Number(item.quantity || 0),
    lineExtensionAmount: lineTotal,
    item: {
      name: trimOrNull(item.name) || `Item ${index + 1}`,
      description,
      classifiedTaxCategory: {
        id: taxCategoryId,
        name: taxCategoryId === "Z" ? "Exempt" : "VAT",
        taxScheme: {
          id: "VAT",
          name: "Value Added Tax",
        },
      },
      sellersItemIdentification: {
        id: trimOrNull(item.classificationCode) || null,
      },
    },
    price: {
      priceAmount: Number(item.unitPrice || 0),
      baseQuantity: 1,
    },
    taxTotal: {
      taxAmount: lineTaxAmount,
      taxCategory: {
        id: taxCategoryId,
        name: taxCategoryId === "Z" ? "Exempt" : "VAT",
        taxScheme: {
          id: "VAT",
          name: "Value Added Tax",
        },
      },
    },
  };
};

export const roEFacturaProvider: EInvoiceProviderAdapter = {
  key: "RO_EFACTURA",
  countries: ["RO"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const supplier = context.business || {};
    const buyer = context.customer || {};
    const base = createBasePayload(context, "RO_EFACTURA", "UBL_XML");
    const warnings = [...base.warnings];

    if (!trimOrNull(supplier.legalName)) {
      warnings.push("Seller legal name is missing; UBL supplier party will be incomplete.");
    }
    if (!trimOrNull(supplier.taxId)) {
      warnings.push("Seller tax ID is missing; Romanian supplier identification may be incomplete.");
    }
    if (!trimOrNull(supplier.registrationNumber)) {
      warnings.push("Seller registration number is missing; Romania may require a company registration identifier.");
    }
    if (!trimOrNull(supplier.addressLine1)) {
      warnings.push("Seller address line is missing; UBL postal address will be partial.");
    }
    if (!trimOrNull(buyer.legalName)) {
      warnings.push("Buyer legal name is missing; UBL customer party will be incomplete.");
    }
    if (!trimOrNull(buyer.taxId) && context.compliance?.buyerType === "B2B") {
      warnings.push("Buyer tax ID is missing for a B2B Romanian invoice.");
    }
    if (!trimOrNull(buyer.registrationNumber) && context.compliance?.buyerType === "B2B") {
      warnings.push("Buyer registration number is missing for a B2B Romanian invoice.");
    }
    if (!Array.isArray(context.items) || context.items.length === 0) {
      warnings.push("Romania e-Factura payload needs at least one invoice line.");
    }

    return {
      externalId: base.externalId,
      format: "UBL_XML",
      payload: {
        UBLVersionID: "2.1",
        CustomizationID: "urn:cen.eu:en16931:2017#compliant#urn:anaf:ro:e-Factura",
        ProfileID: "urn:fdc:anaf.ro:2021:eFactura:Invoice",
        ID: trimOrNull(context.invoiceNumber),
        IssueDate: trimOrNull(context.issuedAt),
        DueDate: trimOrNull(context.dueDate),
        InvoiceTypeCode: "380",
        DocumentCurrencyCode: trimOrNull(context.currency),
        TaxCurrencyCode: trimOrNull(context.currency),
        AccountingSupplierParty: {
          Party: {
            PartyName: {
              Name: trimOrNull(supplier.legalName),
            },
            PartyIdentification: [
              {
                ID: trimOrNull(supplier.taxId),
              },
              {
                ID: trimOrNull(supplier.registrationNumber),
              },
            ].filter((entry) => Boolean(entry.ID)),
            PostalAddress: buildPartyAddress({
              addressLine1: supplier.addressLine1,
              addressLine2: supplier.addressLine2,
              city: supplier.city,
              state: supplier.state,
              postalCode: supplier.postalCode,
              country: supplier.country || context.sellerCountry,
            }),
            Contact: {
              ElectronicMail: trimOrNull(supplier.email),
              Telephone: trimOrNull(supplier.phone),
            },
          },
        },
        AccountingCustomerParty: {
          Party: {
            PartyName: {
              Name: trimOrNull(buyer.legalName || buyer.contactName),
            },
            PartyIdentification: [
              {
                ID: trimOrNull(buyer.taxId),
              },
              {
                ID: trimOrNull(buyer.registrationNumber),
              },
            ].filter((entry) => Boolean(entry.ID)),
            PostalAddress: buildPartyAddress({
              addressLine1: buyer.addressLine1,
              addressLine2: buyer.addressLine2,
              city: buyer.city,
              state: buyer.state,
              postalCode: buyer.postalCode,
              country: buyer.country || context.buyerCountry,
            }),
            Contact: {
              ElectronicMail: trimOrNull(buyer.email),
              Telephone: trimOrNull(buyer.phone),
            },
          },
        },
        PaymentMeans: buildPaymentMeans(context),
        TaxTotal: [
          {
            TaxAmount: Number(context.totals?.taxAmount || 0),
            TaxSubtotal: buildTaxSubtotal(context),
          },
        ],
        LegalMonetaryTotal: {
          LineExtensionAmount: Number(context.totals?.subtotal || 0),
          TaxExclusiveAmount: Number(context.totals?.subtotal || 0) - Number(context.totals?.discountAmount || 0),
          TaxInclusiveAmount: Number(context.totals?.total || 0),
          PayableAmount: Number(context.totals?.total || 0),
        },
        InvoiceLine: (context.items || []).map((item, index) => buildInvoiceLine(context, index, item)),
        AdditionalDocumentReference: [
          {
            ID: "RO-EFACTURA",
            DocumentDescription: "Structured Romania e-Factura payload generated by Maboria.",
          },
        ],
        Notes: warnings,
      },
      warnings,
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
    const supplier = context.business || {};
    const buyer = context.customer || {};

    if (!trimOrNull(supplier.legalName)) errors.push("Seller legal name is required for Romania e-Factura.");
    if (!trimOrNull(supplier.taxId)) errors.push("Seller tax ID is required for Romania e-Factura.");
    if (!trimOrNull(supplier.addressLine1)) warnings.push("Seller address line is missing and may be required by ANAF.");
    if (!trimOrNull(supplier.city)) warnings.push("Seller city is missing and may be required by ANAF.");
    if (!trimOrNull(buyer.legalName || buyer.contactName)) errors.push("Buyer legal name is required for Romania e-Factura.");
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(buyer.taxId)) {
      warnings.push("Buyer tax ID is missing for B2B Romanian invoicing.");
    }
    if (!Array.isArray(context.items) || context.items.length === 0) {
      errors.push("At least one invoice line is required for Romania e-Factura.");
    }

    const lineWarnings = (context.items || []).flatMap((item, index) => {
      const itemWarnings: string[] = [];
      if (!trimOrNull(item.unitCode)) {
        itemWarnings.push(`Line ${index + 1} is missing a unit code and will default to EA.`);
      }
      if (!trimOrNull(item.classificationCode)) {
        itemWarnings.push(`Line ${index + 1} is missing a product/service classification code.`);
      }
      if (!trimOrNull(item.taxCategory)) {
        itemWarnings.push(`Line ${index + 1} is missing a Romanian tax category and will default to VAT/exempt logic.`);
      }
      return itemWarnings;
    });

    warnings.push(...lineWarnings);

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings() {
    return [
      "Romania may require RO e-Factura submission before or alongside delivery.",
      "This payload builder is UBL-leaning, but it still depends on future ANAF-specific schema tuning.",
    ];
  },
  async submit(payload, context) {
    return submitRoEFacturaDocument({
      connection: context.connection,
      cif: context.business?.taxId || null,
      standard: "UBL",
      xml: buildRoInvoiceXml(payload.payload),
    });
  },
  async getStatus(submissionId, context) {
    return getRoEFacturaSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelRoEFacturaDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
