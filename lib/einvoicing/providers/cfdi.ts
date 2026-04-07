import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import {
  cancelCfdiDocument,
  buildCfdiGuidesUrl,
  buildCfdiPacRegistryUrl,
  buildCfdiPortalUrl,
  buildCfdiTransmissionPreparation,
  getCfdiSubmissionStatus,
  submitCfdiDocument,
} from "@/lib/einvoicing/providers/cfdi-client";
import type {
  EInvoiceLineInput,
  EInvoiceProviderAdapter,
  EInvoiceProviderContext,
} from "@/lib/einvoicing/types";

const trim = (value: unknown) => String(value || "").trim();

const deriveSeriesAndFolio = (invoiceNumber?: string | null) => {
  const raw = trim(invoiceNumber);
  if (!raw) {
    return { serie: "INV", folio: "1", warnings: ["Invoice number was missing; CFDI series/folio defaulted."] };
  }

  const segments = raw.split(/[-/]/).map((segment) => segment.trim()).filter(Boolean);
  const serieCandidate = segments[0] || raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  const folioCandidate = segments.length > 1 ? segments[segments.length - 1] : raw.match(/(\d+)$/)?.[1] || "";
  const serie = serieCandidate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "INV";
  const folio = folioCandidate.replace(/[^A-Za-z0-9]/g, "") || "1";
  const warnings: string[] = [];
  if (!segments.length || !folioCandidate) {
    warnings.push("Invoice number did not map cleanly to a CFDI serie/folio pair; defaults were used.");
  }
  return { serie, folio, warnings };
};

const buildCfdiAddress = (party: NonNullable<EInvoiceProviderContext["business"]>) => ({
  street: trim(party.addressLine1),
  street2: trim(party.addressLine2),
  city: trim(party.city),
  state: trim(party.state),
  postalCode: trim(party.postalCode),
  country: trim(party.country),
});

const buildCfdiLine = (item: EInvoiceLineInput, index: number, context: EInvoiceProviderContext) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const lineTotal = Number(item.lineTotal ?? quantity * unitPrice);
  const taxAmount = Number(item.taxAmount ?? 0);
  const taxCategory = trim(item.taxCategory);

  return {
    lineNumber: String(index + 1),
    description: trim(item.description || item.name),
    quantity,
    unitPrice,
    lineTotal,
    unitCode: trim(item.unitCode) || "EA",
    productServiceCode: trim(item.classificationCode) || null,
    objectTax: taxAmount > 0 ? "02" : "01",
    taxCategory: taxCategory || null,
    taxExemptionReason: trim(item.taxExemptionReason) || null,
    taxAmount,
    invoiceContext: {
      sellerCountry: trim(context.sellerCountry),
      buyerCountry: trim(context.buyerCountry),
      supplyType: trim(context.compliance?.supplyType),
    },
  };
};

export const cfdiProvider: EInvoiceProviderAdapter = {
  key: "MX_CFDI",
  countries: ["MX"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const base = createBasePayload(context, "MX_CFDI", "UBL_XML");
    const warnings = [...base.warnings];
    const prep = buildCfdiTransmissionPreparation(context.connection);
    const supplier = context.business || {};
    const buyer = context.customer || {};
    const { serie, folio, warnings: seriesWarnings } = deriveSeriesAndFolio(context.invoiceNumber);
    const conceptLines = (context.items || []).map((item, index) => buildCfdiLine(item, index, context));

    warnings.push(...seriesWarnings);
    warnings.push(...prep.notes);
    if (prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Stamped CFDI XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid) {
      warnings.push("CFDI UUID is not attached to this invoice yet.");
    }

    if (!trim(supplier.legalName)) warnings.push("Supplier legal name is missing for CFDI preparation.");
    if (!trim(supplier.taxId)) warnings.push("Supplier RFC is missing for CFDI preparation.");
    if (!trim(supplier.addressLine1)) warnings.push("Supplier fiscal address line is missing for CFDI preparation.");
    if (!trim(supplier.postalCode)) warnings.push("Supplier postal code is missing; CFDI fiscal address may be incomplete.");
    if (!trim(buyer.legalName || buyer.contactName)) warnings.push("Customer legal name is missing for CFDI preparation.");
    if (context.compliance?.buyerType === "B2B" && !trim(buyer.taxId)) {
      warnings.push("Customer RFC is missing for a B2B Mexican invoice.");
    }
    if (!conceptLines.length) warnings.push("Mexico CFDI payload needs at least one invoice concept line.");
    conceptLines.forEach((line, index) => {
      if (!line.productServiceCode) {
        warnings.push(`Line ${index + 1} is missing a SAT product/service code.`);
      }
      if (!trim(context.items?.[index]?.unitCode)) {
        warnings.push(`Line ${index + 1} is missing a unit code and defaulted to EA.`);
      }
      if (!trim(context.items?.[index]?.taxCategory) && Number(line.taxAmount || 0) > 0) {
        warnings.push(`Line ${index + 1} is missing a CFDI tax category for a taxable amount.`);
      }
    });

    return {
      externalId: base.externalId,
      format: "UBL_XML",
      payload: {
        cfdiVersion: "4.0",
        serie,
        folio,
        fecha: trim(context.issuedAt),
        formaPago: null,
        metodoPago: context.compliance?.buyerType === "B2B" ? "PUE" : "PUE",
        tipoDeComprobante: "I",
        moneda: trim(context.currency),
        exportacion: "01",
        emisor: {
          rfc: trim(supplier.taxId),
          nombre: trim(supplier.legalName),
          regimenFiscal: trim(supplier.branchCode) || null,
          domicilioFiscalReceptor: trim(supplier.postalCode),
          address: buildCfdiAddress(supplier),
        },
        receptor: {
          rfc: trim(buyer.taxId),
          nombre: trim(buyer.legalName || buyer.contactName),
          regimenFiscalReceptor: trim(buyer.branchCode) || null,
          domicilioFiscalReceptor: trim(buyer.postalCode),
          usoCFDI: null,
          address: {
            street: trim(buyer.addressLine1),
            street2: trim(buyer.addressLine2),
            city: trim(buyer.city),
            state: trim(buyer.state),
            postalCode: trim(buyer.postalCode),
            country: trim(buyer.country),
          },
        },
        conceptos: conceptLines,
        impuestos: {
          totalImpuestosTrasladados: Number(context.totals?.taxAmount || 0),
          subtotal: Number(context.totals?.subtotal || 0),
          discount: Number(context.totals?.discountAmount || 0),
          total: Number(context.totals?.total || 0),
        },
        transportDocument: context.transportDocument || null,
        metadata: {
          provider: "MX_CFDI",
          portalUrl: buildCfdiPortalUrl(),
          pacRegistryUrl: buildCfdiPacRegistryUrl(),
          guidesUrl: buildCfdiGuidesUrl(),
          transportPreparation: prep,
        },
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
    const builtPayload = payload.payload as Record<string, unknown> | null;
    const concepts = Array.isArray(builtPayload?.conceptos) ? (builtPayload?.conceptos as Array<Record<string, unknown>>) : [];
    const prep = buildCfdiTransmissionPreparation(context.connection);

    if (!trim(supplier.legalName)) errors.push("Supplier legal name is required for Mexico CFDI.");
    if (!trim(supplier.taxId)) errors.push("Supplier RFC is required for Mexico CFDI.");
    if (!trim(supplier.addressLine1)) errors.push("Supplier fiscal address line 1 is required for Mexico CFDI.");
    if (!trim(supplier.postalCode)) warnings.push("Supplier postal code is missing and may be required for CFDI.");
    if (!trim(buyer.legalName || buyer.contactName)) errors.push("Customer legal name is required for Mexico CFDI.");
    if (context.compliance?.buyerType === "B2B" && !trim(buyer.taxId)) {
      errors.push("Customer RFC is required for Mexico B2B CFDI.");
    }
    if (!concepts.length) {
      errors.push("At least one concept line is required for Mexico CFDI.");
    }

    const lineWarnings = (context.items || []).flatMap((item, index) => {
      const lineWarnings: string[] = [];
      if (!trim(item.unitCode)) {
        lineWarnings.push(`Line ${index + 1} is missing a unit code and will default to EA.`);
      }
      if (!trim(item.classificationCode)) {
        lineWarnings.push(`Line ${index + 1} is missing a SAT product/service code.`);
      }
      if (!trim(item.taxCategory) && Number(item.taxAmount ?? 0) > 0) {
        lineWarnings.push(`Line ${index + 1} is missing a CFDI tax category.`);
      }
      return lineWarnings;
    });

    warnings.push(...prep.notes, ...lineWarnings);
    if (prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Stamped CFDI XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid) {
      warnings.push("CFDI UUID is not attached to this invoice yet.");
    }

    if (prep.missingArtifacts.length) {
      warnings.push(`CFDI preparation is incomplete: ${prep.missingArtifacts.join(", ")}.`);
    }

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const prep = buildCfdiTransmissionPreparation(context.connection);
    const warnings = [
      "Mexico may require CFDI-compliant electronic invoicing and PAC certification in addition to the PDF invoice.",
      ...prep.notes,
    ];
    if (prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the stamped CFDI XML before enabling live PAC submission.");
    }
    if (!trim(context.business?.taxId)) {
      warnings.push("Supplier RFC should be completed before CFDI preparation.");
    }
    if (context.compliance?.buyerType === "B2B" && !trim(context.customer?.taxId)) {
      warnings.push("Customer RFC should be completed before Mexico B2B CFDI submission.");
    }
    if (prep.missingArtifacts.length) {
      warnings.push(`CFDI preparation is incomplete: ${prep.missingArtifacts.join(", ")}.`);
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitCfdiDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getCfdiSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelCfdiDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
