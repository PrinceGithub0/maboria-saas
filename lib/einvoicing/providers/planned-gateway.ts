import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildPlannedGatewayPreparation,
  cancelPlannedGatewayDocument,
  getPlannedGatewaySubmissionStatus,
  submitPlannedGatewayDocument,
} from "@/lib/einvoicing/providers/planned-gateway-client";
import type { EInvoiceProviderAdapter, EInvoiceProviderContext, EInvoiceProviderKey } from "@/lib/einvoicing/types";

type PlannedGatewaySeed = {
  key: EInvoiceProviderKey;
  country: string;
  providerLabel: string;
  taxLabel: string;
};

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const buildGatewayLine = (
  item: NonNullable<EInvoiceProviderContext["items"]>[number],
  index: number
) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const lineTotal = Number(item.lineTotal ?? quantity * unitPrice);

  return {
    lineNumber: index + 1,
    description: trimOrNull(item.description || item.name) || `Item ${index + 1}`,
    quantity,
    unitPrice,
    lineTotal,
    unitCode: trimOrNull(item.unitCode) || "EA",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory),
    taxAmount: Number(item.taxAmount ?? 0),
  };
};

function createPlannedGatewayProvider(seed: PlannedGatewaySeed): EInvoiceProviderAdapter {
  return {
    key: seed.key,
    countries: [seed.country],
    documentFormat: "JSON",
    supportsClearance: true,
    buildPayload(context) {
      const preparation = buildPlannedGatewayPreparation({
        connection: context.connection,
        country: seed.country,
        providerLabel: seed.providerLabel,
      });
      const supplier = context.business || {};
      const customer = context.customer || {};
      const invoiceLines = (context.items || []).map((item, index) => buildGatewayLine(item, index));
      const warnings = [...preparation.notes];

      if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for e-invoicing.");
      if (!trimOrNull(supplier.taxId)) warnings.push("Supplier tax ID is missing for e-invoicing.");
      if (!trimOrNull(customer.legalName || customer.contactName)) {
        warnings.push("Customer legal name is missing for e-invoicing.");
      }
      if (!invoiceLines.length) warnings.push("At least one invoice line is required for e-invoicing.");
      if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
        warnings.push(preparation.liveSubmissionBlockedReason);
      }

      return {
        externalId:
          trimOrNull(context.invoiceNumber) ||
          trimOrNull(context.invoiceId) ||
          `${seed.key.toLowerCase()}-draft`,
        format: "JSON",
        payload: {
          documentProfile: seed.key,
          documentType: "EINVOICE",
          invoiceNumber: trimOrNull(context.invoiceNumber),
          invoiceStatus: trimOrNull(context.invoiceStatus),
          issueDate: trimOrNull(context.issuedAt),
          dueDate: trimOrNull(context.dueDate),
          currencyCode: trimOrNull(context.currency),
          transportPreparation: preparation,
          supplier: {
            legalName: trimOrNull(supplier.legalName),
            taxId: trimOrNull(supplier.taxId),
            registrationNumber: trimOrNull(supplier.registrationNumber),
            branchCode: trimOrNull(supplier.branchCode),
            addressLine1: trimOrNull(supplier.addressLine1),
            addressLine2: trimOrNull(supplier.addressLine2),
            city: trimOrNull(supplier.city),
            state: trimOrNull(supplier.state),
            postalCode: trimOrNull(supplier.postalCode),
            countryCode: trimOrNull(supplier.country),
            email: trimOrNull(supplier.email),
            phone: trimOrNull(supplier.phone),
          },
          customer: {
            legalName: trimOrNull(customer.legalName || customer.contactName),
            taxId: trimOrNull(customer.taxId),
            registrationNumber: trimOrNull(customer.registrationNumber),
            branchCode: trimOrNull(customer.branchCode),
            addressLine1: trimOrNull(customer.addressLine1),
            addressLine2: trimOrNull(customer.addressLine2),
            city: trimOrNull(customer.city),
            state: trimOrNull(customer.state),
            postalCode: trimOrNull(customer.postalCode),
            countryCode: trimOrNull(customer.country),
            email: trimOrNull(customer.email),
            phone: trimOrNull(customer.phone),
          },
          invoiceLines,
          invoiceTotals: {
            subtotal: Number(context.totals?.subtotal || 0),
            taxAmount: Number(context.totals?.taxAmount || 0),
            discountAmount: Number(context.totals?.discountAmount || 0),
            total: Number(context.totals?.total || 0),
          },
          fiscalSummary: {
            buyerType: trimOrNull(context.compliance?.buyerType),
            supplyType: trimOrNull(context.compliance?.supplyType),
            taxTreatment: trimOrNull(context.compliance?.taxTreatment),
            taxLabel: trimOrNull(context.compliance?.taxLabel) || seed.taxLabel,
          },
        },
        warnings,
      };
    },
    validatePayload(payload, context) {
      const baseValidation = buildBaseValidationResult(payload, context);
      const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
      const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
      const structuredPayload = payload.payload as Record<string, unknown> | null;
      const preparation = (structuredPayload?.transportPreparation || {}) as {
        liveSubmissionReady?: boolean;
        liveSubmissionBlockedReason?: string | null;
      };

      if (!trimOrNull(context.business?.legalName)) {
        errors.push("Supplier legal name is required for e-invoicing.");
      }
      if (!trimOrNull(context.business?.taxId)) {
        errors.push("Supplier tax ID is required for e-invoicing.");
      }
      if (!trimOrNull(context.customer?.legalName || context.customer?.contactName)) {
        errors.push("Customer legal name is required for e-invoicing.");
      }
      if (!Array.isArray(context.items) || context.items.length === 0) {
        errors.push("At least one invoice line is required for e-invoicing.");
      }
      if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
        warnings.push(preparation.liveSubmissionBlockedReason);
      }

      return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
    },
    buildWarnings(context) {
      const preparation = buildPlannedGatewayPreparation({
        connection: context.connection,
        country: seed.country,
        providerLabel: seed.providerLabel,
      });
      return [
        ...preparation.notes,
        ...(!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason
          ? [preparation.liveSubmissionBlockedReason]
          : []),
      ];
    },
    async submit(payload, context) {
      return submitPlannedGatewayDocument({
        connection: context.connection,
        payload,
        providerKey: seed.key,
        providerLabel: seed.providerLabel,
      });
    },
    async getStatus(submissionId, context) {
      return getPlannedGatewaySubmissionStatus({
        connection: context.connection,
        submissionId,
        providerLabel: seed.providerLabel,
      });
    },
    async cancel(submissionId, context) {
      return cancelPlannedGatewayDocument({
        connection: context.connection,
        submissionId,
        providerLabel: seed.providerLabel,
      });
    },
  };
}

const gatewaySeeds: PlannedGatewaySeed[] = [
  { key: "AE_EINVOICING", country: "AE", providerLabel: "UAE E-Invoicing", taxLabel: "VAT" },
  { key: "AL_FISCALIZATION", country: "AL", providerLabel: "Albania Fiscalization", taxLabel: "VAT" },
  { key: "AR_AFIP", country: "AR", providerLabel: "AFIP / ARCA", taxLabel: "VAT" },
  { key: "AZ_ETAX_INVOICE", country: "AZ", providerLabel: "eTax Invoice", taxLabel: "VAT" },
  { key: "BE_PEPPOL", country: "BE", providerLabel: "Peppol Belgium", taxLabel: "VAT" },
  { key: "BO_SIAT", country: "BO", providerLabel: "SIAT", taxLabel: "VAT" },
  { key: "CI_FNE", country: "CI", providerLabel: "FNE", taxLabel: "VAT" },
  { key: "CR_HACIENDA", country: "CR", providerLabel: "Factura Electronica", taxLabel: "VAT" },
  { key: "DO_DGII_ECF", country: "DO", providerLabel: "DGII e-CF", taxLabel: "VAT" },
  { key: "EC_SRI", country: "EC", providerLabel: "SRI Comprobantes Electronicos", taxLabel: "VAT" },
  { key: "EG_EINVOICE", country: "EG", providerLabel: "Egypt eInvoicing", taxLabel: "VAT" },
  { key: "FR_PPFE", country: "FR", providerLabel: "PPF / PDP", taxLabel: "VAT" },
  { key: "GH_EVAT", country: "GH", providerLabel: "eVAT", taxLabel: "VAT" },
  { key: "GT_FEL", country: "GT", providerLabel: "FEL", taxLabel: "VAT" },
  { key: "ID_EFAKTUR", country: "ID", providerLabel: "e-Faktur", taxLabel: "VAT" },
  { key: "IL_ISRAEL_EINVOICE", country: "IL", providerLabel: "Israel E-Invoice", taxLabel: "VAT" },
  { key: "JO_JOFOTARA", country: "JO", providerLabel: "JoFotara", taxLabel: "VAT" },
  { key: "KE_ETIMS", country: "KE", providerLabel: "eTIMS", taxLabel: "VAT" },
  { key: "KR_HOMETAX", country: "KR", providerLabel: "Hometax e-Tax", taxLabel: "VAT" },
  { key: "KZ_IS_ESF", country: "KZ", providerLabel: "IS ESF", taxLabel: "VAT" },
  { key: "MU_MRA_EINVOICE", country: "MU", providerLabel: "MRA e-Invoicing", taxLabel: "VAT" },
  { key: "MW_MRA_EIS", country: "MW", providerLabel: "MRA EIS", taxLabel: "VAT" },
  { key: "NG_FIRS_EFS", country: "NG", providerLabel: "FIRS E-Invoicing", taxLabel: "VAT" },
  { key: "OM_EINVOICING", country: "OM", providerLabel: "Oman E-Invoicing", taxLabel: "VAT" },
  { key: "PA_DGI", country: "PA", providerLabel: "DGI Factura Electronica", taxLabel: "VAT" },
  { key: "PH_EIS", country: "PH", providerLabel: "EIS", taxLabel: "VAT" },
  { key: "PK_FBR_DIGITAL_INVOICING", country: "PK", providerLabel: "FBR Digital Invoicing", taxLabel: "VAT" },
  { key: "PL_KSEF", country: "PL", providerLabel: "KSeF", taxLabel: "VAT" },
  { key: "PY_SIFEN", country: "PY", providerLabel: "SIFEN", taxLabel: "VAT" },
  { key: "RS_EFISKALIZACIJA", country: "RS", providerLabel: "eFiskalizacija", taxLabel: "VAT" },
  { key: "RW_EBM", country: "RW", providerLabel: "EBM", taxLabel: "VAT" },
  { key: "SV_DTE", country: "SV", providerLabel: "DTE", taxLabel: "VAT" },
  { key: "TR_EFATURA", country: "TR", providerLabel: "e-Fatura", taxLabel: "VAT" },
  { key: "TW_EGUI", country: "TW", providerLabel: "e-GUI", taxLabel: "VAT" },
  { key: "UA_EINVOICE", country: "UA", providerLabel: "Ukraine E-Invoice", taxLabel: "VAT" },
  { key: "UG_EFRIS", country: "UG", providerLabel: "EFRIS", taxLabel: "VAT" },
  { key: "UY_CFE", country: "UY", providerLabel: "CFE", taxLabel: "VAT" },
  { key: "VN_EINVOICE", country: "VN", providerLabel: "Vietnam E-Invoice", taxLabel: "VAT" },
  { key: "ZM_SMART_INVOICE", country: "ZM", providerLabel: "Smart Invoice", taxLabel: "VAT" },
  { key: "ZW_FDMS", country: "ZW", providerLabel: "FDMS", taxLabel: "VAT" },
];

export const plannedGatewayProviders = gatewaySeeds.map((seed) => createPlannedGatewayProvider(seed));
