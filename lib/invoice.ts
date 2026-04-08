import PDFDocument from "pdfkit";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "./prisma";
import { sendBillingMail } from "./email";
import { log } from "./logger";
import { formatCurrency } from "./currency";
import { isSupportedBusinessCurrency } from "./business-currencies";
import { normalizeCurrency } from "./payments/currency-allowlist";
import { notifyInvoiceCreated, sendWhatsAppDocument, sendWhatsAppText } from "./whatsapp";
import { formatDateDMY } from "./date";
import { ensureInvoicePaymentLink } from "./invoice-payments";
import { getOrCreateInvoicePublicLink } from "./invoice-public-link";
import { env } from "./env";
import { triggerInvoiceStatusAutomations } from "./automation/events";
import { enforceEntitlement, enforceUsageLimit, getWorkspaceScope } from "./entitlements";
import { calculateVatFromAmount, formatVatRateLabel, normalizeVatSettings, VatSettings } from "./vat";
import { recordAnalyticsEvent } from "./analytics";
import { parseBusinessAddress } from "./address";
import { getCountryName } from "./countries";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "./subscriber-settings";
import { sanitizePayoutDetails } from "./payments/payout-requirements";
import { resolveCustomerContactPolicy } from "./customers/compliance";
import {
  buildUniversalInvoiceDocument,
  validateUniversalInvoiceDocument,
} from "./invoicing/blueprint/validation";
import { getBlueprintValidationBlockingReason } from "./invoicing/blueprint/blocking";
import type {
  InvoiceDeliveryMode,
} from "./invoicing/blueprint/types";
import { resolveInvoiceCompliance } from "./invoicing/resolve-compliance";
import { resolveInvoiceEInvoicingSnapshot } from "./einvoicing/resolve-provider";
import {
  resolveEInvoiceConnectionForUser,
  resolvePrivateEInvoiceConnectionForUser,
  toConnectionConfig,
} from "./einvoicing/connections";
import { submitEInvoiceDocument } from "./einvoicing/submit-document";
import {
  getComplianceInvoiceNote,
  getComplianceSendBlockingReason,
} from "./invoicing/note-templates";
import type { InvoiceBuyerType, InvoiceComplianceResult, InvoiceSupplyType } from "./invoicing/types";
import type { EInvoiceConnectionConfig, InvoiceEInvoicingSnapshot } from "./einvoicing/types";
import {
  buildInvoiceIssuerCode,
  formatSequentialInvoiceNumber,
  getInvoiceNumberYear,
  shouldAutoGenerateInvoiceNumber,
} from "./invoice-number";
import {
  InvoiceSupportingFileInput,
  persistInvoiceSupportingFiles,
  readInvoiceSupportingFilesFromMetadata,
  readStoredInvoiceSupportingFile,
} from "./invoice-supporting-files";
import {
  getBusinessLogoBuffer as getStoredBusinessLogoBuffer,
  getBusinessLogoDataUrl as getStoredBusinessLogoDataUrl,
} from "./business-logo";

export type InvoiceItem = {
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

const formatCountryName = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length === 2) return getCountryName(raw.toUpperCase(), "en");
  return raw;
};

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const INVOICE_PDF_VERSION = "inv24-v57";
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const ensureInvoiceFont = () => {
  if (!existsSync(interFontPath)) {
    throw new Error("Invoice font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
};
export const getBusinessLogoBuffer = async (userId: string) => getStoredBusinessLogoBuffer(userId);
export const getBusinessLogoDataUrl = async (userId: string) => getStoredBusinessLogoDataUrl(userId);

export type BusinessProfileSnapshot = {
  businessName: string;
  country: string;
  defaultCurrency: string;
  businessAddress?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  branchCode?: string | null;
  vatEnabled?: boolean | null;
  vatRate?: number | null;
  vatRateDisplay?: string | null;
  vatPricingMode?: string | null;
};

export type CustomerSnapshot = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  streetAddress?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS" | null;
  companyName?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  branchCode?: string | null;
  deliveryPreference?: "EMAIL" | "WHATSAPP" | "BOTH" | null;
  emailOptOut?: boolean | null;
  whatsappOptOut?: boolean | null;
  processingRestrictedAt?: string | Date | null;
  erasedAt?: string | Date | null;
};

type InvoiceTotalsSnapshot = {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  vatRate?: number | null;
  vatEnabled?: boolean | null;
  vatMode?: string | null;
};

export function buildBusinessProfileSnapshot(
  profile: {
    businessName: string;
    country: string;
    defaultCurrency: string;
    businessAddress?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
    registrationNumber?: string | null;
    branchCode?: string | null;
    vatEnabled?: boolean | null;
    vatRate?: number | null;
    vatRateDisplay?: string | null;
    vatPricingMode?: string | null;
  }
): BusinessProfileSnapshot {
  const parsedAddress = parseBusinessAddress(profile.businessAddress);
  return {
    businessName: profile.businessName,
    country: profile.country,
    defaultCurrency: profile.defaultCurrency,
    businessAddress: profile.businessAddress ?? null,
    addressLine1: profile.addressLine1 ?? parsedAddress.streetAddress ?? null,
    addressLine2: profile.addressLine2 ?? null,
    city: profile.city ?? parsedAddress.city ?? null,
    state: profile.state ?? parsedAddress.region ?? null,
    postalCode: profile.postalCode ?? parsedAddress.postalCode ?? null,
    businessEmail: profile.businessEmail ?? null,
    businessPhone: profile.businessPhone ?? null,
    taxId: profile.taxId ?? null,
    registrationNumber: profile.registrationNumber ?? null,
    branchCode: profile.branchCode ?? null,
    vatEnabled: profile.vatEnabled ?? false,
    vatRate: profile.vatRate !== undefined && profile.vatRate !== null ? Number(profile.vatRate) : 0,
    vatRateDisplay: profile.vatRateDisplay ?? null,
    vatPricingMode: profile.vatPricingMode ?? "EXCLUSIVE",
  };
}

export function buildInvoiceComplianceSnapshot(input: {
  business: BusinessProfileSnapshot;
  customer?: CustomerSnapshot | null;
  items: InvoiceItem[];
  buyerType?: InvoiceBuyerType | null;
  supplyType?: InvoiceSupplyType | null;
}): InvoiceComplianceResult {
  return resolveInvoiceCompliance({
    sellerCountry: input.business.country,
    sellerTaxId: input.business.taxId,
    buyerCountry: input.customer?.country,
    buyerTaxId: input.customer?.taxId,
    buyerType: input.buyerType,
    buyerCompanyName: input.customer?.companyName,
    customerClassification: input.customer?.type,
    supplyType: input.supplyType,
    itemNames: input.items.map((item) => [item.name, item.description].filter(Boolean).join(" ")),
  });
}

const buildInvoiceBlueprintDeliveryModes = (
  customer: CustomerSnapshot | null | undefined,
  compliance: InvoiceComplianceResult
) => {
  const deliveryModes = new Set<InvoiceDeliveryMode>(["pdf_download"]);
  if (customer?.deliveryPreference === "EMAIL" || customer?.deliveryPreference === "BOTH") {
    deliveryModes.add("email_delivery");
  }
  if (compliance.requiresEInvoicing) {
    deliveryModes.add("xml_export");
    deliveryModes.add("api_submission");
  }
  return [...deliveryModes];
};

export function buildInvoiceBlueprintArtifacts(input: {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  issueDate?: Date | null;
  dueDate?: Date | null;
  currency: string;
  business: BusinessProfileSnapshot;
  customer?: CustomerSnapshot | null;
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
  };
  note?: string | null;
  buyerType?: InvoiceBuyerType | null;
  supplyType?: InvoiceSupplyType | null;
  compliance?: InvoiceComplianceResult | null;
}) {
  const compliance =
    input.compliance ||
    buildInvoiceComplianceSnapshot({
      business: input.business,
      customer: input.customer,
      items: input.items,
      buyerType: input.buyerType,
      supplyType: input.supplyType,
    });

  const document = buildUniversalInvoiceDocument({
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency,
    supplier: {
      legalName: input.business.businessName,
      tradeName: input.business.businessName,
      taxId: input.business.taxId,
      registrationNumber: input.business.registrationNumber,
      branchCode: input.business.branchCode,
      email: input.business.businessEmail,
      phone: input.business.businessPhone,
      addressLine1: input.business.addressLine1 || input.business.businessAddress,
      addressLine2: input.business.addressLine2,
      city: input.business.city,
      stateRegion: input.business.state,
      postalCode: input.business.postalCode,
      countryCode: input.business.country,
    },
    customer: {
      legalName: input.customer?.companyName || input.customer?.name || null,
      tradeName: input.customer?.companyName || input.customer?.name || null,
      taxId: input.customer?.taxId,
      registrationNumber: input.customer?.registrationNumber,
      branchCode: input.customer?.branchCode,
      email: input.customer?.email,
      phone: input.customer?.phone,
      addressLine1: input.customer?.streetAddress || input.customer?.address,
      addressLine2: input.customer?.addressLine2,
      city: input.customer?.city,
      stateRegion: input.customer?.state,
      postalCode: input.customer?.postalCode,
      countryCode: input.customer?.country,
      classification:
        input.customer?.type === "BUSINESS"
          ? "BUSINESS"
          : input.customer?.type === "INDIVIDUAL"
            ? "INDIVIDUAL"
            : "UNKNOWN",
    },
    buyerType: input.buyerType || undefined,
    supplyType: input.supplyType || undefined,
    lines: input.items.map((item) => ({
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
      subtotal: input.totals.subtotal,
      taxTotal: input.totals.taxAmount,
      discountTotal: input.totals.discountAmount,
      grandTotal: input.totals.total,
    },
    deliveryModes: buildInvoiceBlueprintDeliveryModes(input.customer, compliance),
    notes: input.note,
    complianceSnapshot: compliance,
  });
  const validation = validateUniversalInvoiceDocument(document);

  return {
    compliance,
    document: validation.document,
    validation,
  };
}

export function getInvoiceSendBlockingReason(
  compliance: InvoiceComplianceResult,
  validation?: import("./invoicing/blueprint/types").BlueprintValidationResult | null
) {
  const blueprintBlockingReason = getBlueprintValidationBlockingReason(validation);
  if (blueprintBlockingReason) {
    return blueprintBlockingReason;
  }
  return getComplianceSendBlockingReason(compliance);
}

export function getEInvoiceSendBlockingReason(snapshot: InvoiceEInvoicingSnapshot) {
  if (snapshot.requirement !== "REQUIRED") return null;
  if (snapshot.status !== "READY") {
    return snapshot.lastError || "A required e-invoicing connection is not configured for this country yet.";
  }
  if (!snapshot.productionReady) {
    return (
      snapshot.productionBlockers[0] ||
      "This country is still blocked on e-invoicing production signoff."
    );
  }
  return null;
}

export async function submitRequiredInvoiceEInvoicing(input: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  currency: string;
  issuedAt?: Date | null;
  dueDate?: Date | null;
  business: BusinessProfileSnapshot;
  customer?: CustomerSnapshot | null;
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
  };
  compliance: InvoiceComplianceResult;
}) {
  if (!input.compliance.requiresEInvoicing) {
    return null;
  }

  const connection = await resolvePrivateEInvoiceConnectionForUser({
    userId: input.userId,
    context: {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      invoiceStatus: input.invoiceStatus,
      sellerCountry: input.compliance.sellerCountry,
      buyerCountry: input.compliance.buyerCountry,
      currency: input.currency,
      compliance: input.compliance,
    },
  });
  const fallbackSnapshot = buildInvoiceEInvoicingSnapshot({
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    invoiceStatus: input.invoiceStatus,
    currency: input.currency,
    issuedAt: input.issuedAt,
    dueDate: input.dueDate,
    business: input.business,
    customer: input.customer,
    items: input.items,
    totals: input.totals,
    compliance: input.compliance,
    connection,
  });
  const blockingReason = getEInvoiceSendBlockingReason(fallbackSnapshot);
  if (blockingReason) {
    return {
      payload: null,
      snapshot: {
        ...fallbackSnapshot,
        status: "VALIDATION_FAILED",
        lastError: blockingReason,
        warnings: [
          ...fallbackSnapshot.warnings,
          "Live e-invoice submission is blocked until the required production gates are complete.",
        ],
      },
    };
  }

  try {
    return await submitEInvoiceDocument({
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      invoiceStatus: input.invoiceStatus,
      sellerCountry: input.compliance.sellerCountry,
      buyerCountry: input.compliance.buyerCountry,
      currency: input.currency,
      issuedAt: input.issuedAt?.toISOString() ?? null,
      dueDate: input.dueDate?.toISOString() ?? null,
      business: {
        legalName: input.business.businessName,
        email: input.business.businessEmail,
        phone: input.business.businessPhone,
        taxId: input.business.taxId,
        registrationNumber: input.business.registrationNumber,
        country: input.business.country,
        addressLine1: input.business.addressLine1 || input.business.businessAddress,
        addressLine2: input.business.addressLine2,
        city: input.business.city,
        postalCode: input.business.postalCode,
      },
      customer: input.customer
        ? {
            legalName: input.customer.companyName || input.customer.name,
            contactName: input.customer.name,
            email: input.customer.email,
            phone: input.customer.phone,
            taxId: input.customer.taxId,
            registrationNumber: input.customer.registrationNumber,
            country: input.customer.country,
            addressLine1: input.customer.streetAddress || input.customer.address,
            addressLine2: input.customer.addressLine2,
            city: input.customer.city,
            postalCode: input.customer.postalCode,
          }
        : null,
      items: input.items.map((item) => ({
        name: item.name,
        description: item.description ?? null,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        lineTotal: Number(item.quantity || 0) * Number(item.price || 0),
        taxAmount: item.taxAmount ?? null,
        unitCode: item.unitCode ?? null,
        classificationCode: item.classificationCode ?? null,
        taxCategory: item.taxCategory ?? null,
        taxExemptionReason: item.taxExemptionReason ?? null,
        incomeClassification: item.incomeClassification ?? null,
      })),
      totals: input.totals,
      compliance: input.compliance,
      connection,
    });
  } catch (error: any) {
    return {
      payload: null,
      snapshot: {
        ...fallbackSnapshot,
        status: "VALIDATION_FAILED",
        lastError: String(error?.message || "E-invoice submission failed.").trim(),
        warnings: [
          ...fallbackSnapshot.warnings,
          "Live e-invoice submission failed before the invoice could be sent.",
        ],
      },
    };
  }
}

export function buildInvoiceEInvoicingSnapshot(input: {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  currency?: string | null;
  issuedAt?: Date | null;
  dueDate?: Date | null;
  business?: BusinessProfileSnapshot | null;
  customer?: CustomerSnapshot | null;
  items?: InvoiceItem[];
  totals?: {
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
  } | null;
  transportDocument?: {
    format?: "XML" | "UBL_XML" | "JSON" | null;
    documentBase64?: string | null;
    invoiceHash?: string | null;
    uuid?: string | null;
    digest?: string | null;
    mode?: "CLEARANCE" | "REPORTING" | null;
  } | null;
  compliance: InvoiceComplianceResult;
  connection?: EInvoiceConnectionConfig | null;
}): InvoiceEInvoicingSnapshot {
  return resolveInvoiceEInvoicingSnapshot({
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    invoiceStatus: input.invoiceStatus,
    sellerCountry: input.compliance.sellerCountry,
    buyerCountry: input.compliance.buyerCountry,
    currency: input.currency,
    issuedAt: input.issuedAt?.toISOString() ?? null,
    dueDate: input.dueDate?.toISOString() ?? null,
    business: input.business
      ? {
          legalName: input.business.businessName,
          email: input.business.businessEmail,
          phone: input.business.businessPhone,
          taxId: input.business.taxId,
          registrationNumber: input.business.registrationNumber,
          country: input.business.country,
          addressLine1: input.business.addressLine1 || input.business.businessAddress,
          addressLine2: input.business.addressLine2,
          city: input.business.city,
          postalCode: input.business.postalCode,
        }
      : null,
    customer: input.customer
      ? {
          legalName: input.customer.companyName || input.customer.name,
          contactName: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone,
          taxId: input.customer.taxId,
          registrationNumber: input.customer.registrationNumber,
          country: input.customer.country,
          addressLine1: input.customer.streetAddress || input.customer.address,
          addressLine2: input.customer.addressLine2,
          city: input.customer.city,
          postalCode: input.customer.postalCode,
        }
      : null,
    items: (input.items || []).map((item) => ({
      name: item.name,
      description: item.description ?? null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.price || 0),
      lineTotal: Number(item.quantity || 0) * Number(item.price || 0),
      taxAmount: item.taxAmount ?? null,
      unitCode: item.unitCode ?? null,
      classificationCode: item.classificationCode ?? null,
      taxCategory: item.taxCategory ?? null,
      taxExemptionReason: item.taxExemptionReason ?? null,
      incomeClassification: item.incomeClassification ?? null,
    })),
    totals: input.totals || null,
    transportDocument: input.transportDocument ?? null,
    compliance: input.compliance,
    connection: input.connection ?? null,
  });
}

export function resolveInvoiceCustomer(metadata: any): CustomerSnapshot | null {
  const raw = (metadata?.customer ?? {}) as Record<string, any>;
  const name = raw.name ?? raw.customerName ?? metadata?.customerName;
  const email = raw.email ?? raw.customerEmail ?? metadata?.customerEmail;
  const rawAddress =
    raw.address ??
    raw.customerAddress ??
    raw.addressLine1 ??
    metadata?.customerAddress ??
    metadata?.customer_address;
  const parsedAddress = parseBusinessAddress(rawAddress);
  const streetAddress =
    raw.streetAddress ?? raw.street ?? raw.addressLine1 ?? parsedAddress.streetAddress;
  const city = raw.city ?? parsedAddress.city;
  const state = raw.state ?? parsedAddress.region;
  const postalCode = raw.postalCode ?? raw.zip ?? parsedAddress.postalCode;
  const country = formatCountryName(raw.country ?? raw.region ?? parsedAddress.region);
  const composedAddress = [streetAddress, city, postalCode, country]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  const address = composedAddress || rawAddress;
  const type = (raw.type ?? metadata?.customerType ?? "").toString().toUpperCase();
  const companyName = raw.companyName ?? raw.company ?? metadata?.customerCompany;
  const taxId = raw.taxId ?? metadata?.customerTaxId;
  const phone = raw.phone ?? metadata?.customerPhone;
  const deliveryPreference = raw.deliveryPreference ?? metadata?.customerDeliveryPreference;
  if (!name && !email && !address && !companyName && !taxId && !phone) return null;
  return {
    name,
    email,
    phone,
    address,
    streetAddress,
    addressLine2: raw.addressLine2 ?? null,
    city,
    state,
    postalCode,
    country,
    type: type === "BUSINESS" ? "BUSINESS" : type === "INDIVIDUAL" ? "INDIVIDUAL" : undefined,
    companyName,
    taxId,
    deliveryPreference:
      deliveryPreference === "WHATSAPP" || deliveryPreference === "BOTH" || deliveryPreference === "EMAIL"
        ? deliveryPreference
        : undefined,
  };
}

const composeInvoiceNote = (metadata: any) => {
  const note = typeof metadata?.note === "string" ? metadata.note.trim() : "";
  const compliance = metadata?.compliance as Partial<InvoiceComplianceResult> | undefined;
  const complianceNote = getComplianceInvoiceNote(compliance);
  const lateFeeNotice =
    typeof metadata?.lateFeePolicyNotice === "string"
      ? metadata.lateFeePolicyNotice.trim()
      : "";
  const parts = [note, complianceNote, lateFeeNotice].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
};

export function calculateTotals(
  items: InvoiceItem[],
  vatSettings: VatSettings,
  discount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discountAmount = (subtotal * discount) / 100;
  const baseAmount = subtotal - discountAmount;
  const vatTotals = calculateVatFromAmount(baseAmount, vatSettings);
  return {
    subtotal: vatTotals.subtotal,
    taxAmount: vatTotals.vatAmount,
    discountAmount,
    total: vatTotals.total,
    vatRate: vatTotals.rate,
    vatMode: vatSettings.mode,
    vatEnabled: vatSettings.enabled,
  };
}

export function calculateTotalsFromAmounts(
  items: InvoiceItem[],
  vatSettings: VatSettings,
  discountAmount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const baseAmount = subtotal - discountAmount;
  const vatTotals = calculateVatFromAmount(baseAmount, vatSettings);
  return {
    subtotal: vatTotals.subtotal,
    taxAmount: vatTotals.vatAmount,
    discountAmount,
    total: vatTotals.total,
    vatRate: vatTotals.rate,
    vatMode: vatSettings.mode,
    vatEnabled: vatSettings.enabled,
  };
}

const normalizeBusinessProfileSnapshot = (
  value?: Partial<BusinessProfileSnapshot> | null
): BusinessProfileSnapshot | null => {
  if (!value?.businessName) return null;
  return {
    businessName: String(value.businessName || "").trim(),
    country: String(value.country || "").trim(),
    defaultCurrency: String(value.defaultCurrency || "USD").trim() || "USD",
    businessAddress: value.businessAddress ?? null,
    addressLine1: value.addressLine1 ?? parseBusinessAddress(value.businessAddress).streetAddress ?? null,
    addressLine2: value.addressLine2 ?? null,
    city: value.city ?? parseBusinessAddress(value.businessAddress).city ?? null,
    state: value.state ?? parseBusinessAddress(value.businessAddress).region ?? null,
    postalCode: value.postalCode ?? parseBusinessAddress(value.businessAddress).postalCode ?? null,
    businessEmail: value.businessEmail ?? null,
    businessPhone: value.businessPhone ?? null,
    taxId: value.taxId ?? null,
    registrationNumber: value.registrationNumber ?? null,
    branchCode: value.branchCode ?? null,
    vatEnabled: value.vatEnabled ?? false,
    vatRate: value.vatRate !== undefined && value.vatRate !== null ? Number(value.vatRate) : 0,
    vatRateDisplay: value.vatRateDisplay ?? null,
    vatPricingMode: value.vatPricingMode ?? "EXCLUSIVE",
  };
};

export function resolveInvoiceBusinessSnapshot(
  invoice: { metadata?: any } | null | undefined,
  fallback?: Partial<BusinessProfileSnapshot> | null
): BusinessProfileSnapshot | null {
  const metadata = (invoice as any)?.metadata || {};
  return (
    normalizeBusinessProfileSnapshot(metadata?.businessProfile as Partial<BusinessProfileSnapshot> | null) ||
    normalizeBusinessProfileSnapshot(fallback)
  );
}

export function resolveStoredInvoiceTotals(
  invoice: { items: unknown; tax?: any; discount?: any; total?: any; metadata?: any } | null | undefined,
  business?: Partial<BusinessProfileSnapshot> | null
): InvoiceTotalsSnapshot {
  const metadata = (invoice as any)?.metadata || {};
  const snapshot = metadata?.invoiceTotals && typeof metadata.invoiceTotals === "object"
    ? (metadata.invoiceTotals as Partial<InvoiceTotalsSnapshot>)
    : null;
  const items = normalizeInvoiceItems((invoice as any)?.items);
  const itemsSubtotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0)
  );
  const discountAmount = roundMoney(
    Number(snapshot?.discountAmount ?? (invoice as any)?.discount ?? 0)
  );
  const subtotal = roundMoney(
    Number(snapshot?.subtotal ?? Math.max(0, itemsSubtotal - discountAmount))
  );
  const taxAmount = roundMoney(Number(snapshot?.taxAmount ?? (invoice as any)?.tax ?? 0));
  const computedTotal = roundMoney(subtotal + taxAmount);
  const total = roundMoney(Number(snapshot?.total ?? (invoice as any)?.total ?? computedTotal));
  const vatRate = Number(snapshot?.vatRate ?? business?.vatRate ?? 0);
  const vatEnabled =
    snapshot?.vatEnabled !== undefined && snapshot?.vatEnabled !== null
      ? Boolean(snapshot.vatEnabled)
      : taxAmount > 0 || Boolean(business?.vatEnabled);

  return {
    subtotal,
    taxAmount,
    discountAmount,
    total,
    vatRate,
    vatEnabled,
    vatMode: String(snapshot?.vatMode ?? business?.vatPricingMode ?? "exclusive"),
  };
}

export const normalizeInvoiceItems = (value: unknown): InvoiceItem[] => {
  let items: unknown = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const rawName =
      typeof item?.name === "string" && item.name.trim()
        ? item.name.trim()
        : typeof item?.description === "string" && item.description.trim()
          ? item.description.trim()
          : "Item";
    const quantity = Number(item?.quantity ?? item?.qty ?? 0);
    const priceCandidate = item?.price ?? item?.unitPrice ?? item?.unit_price;
    const price =
      Number(priceCandidate ?? 0) ||
      (quantity > 0 && Number(item?.total ?? item?.lineTotal ?? 0) / quantity) ||
      0;
    return {
      name: rawName,
      quantity,
      price,
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

export async function createInvoiceRecord({
  userId,
  invoiceNumber,
  poNumber,
  currency,
  items,
  status,
  customerId,
  discount,
  attachments,
  customer,
  issueDate,
  dueDate,
  note,
  buyerType,
  supplyType,
}: {
  userId: string;
  invoiceNumber: string;
  poNumber?: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  customerId: string;
  discount?: number;
  attachments?: InvoiceSupportingFileInput[];
  customer?: CustomerSnapshot | null;
  issueDate?: Date;
  dueDate?: Date;
  note?: string;
  buyerType?: InvoiceBuyerType | null;
  supplyType?: InvoiceSupplyType | null;
}) {
  const entitlement = await enforceEntitlement(userId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    const error = new Error(entitlement.reason || "Access denied");
    (error as any).status = 403;
    throw error;
  }

  const usage = await enforceUsageLimit(userId, "invoices");
  if (!usage.ok) {
    const error = new Error("Invoice limit reached for this month");
    (error as any).status = usage.code === "payment_required" ? 403 : 402;
    (error as any).code = "limit_reached";
    throw error;
  }

  const normalizedStatus = String(status || "DRAFT").toUpperCase();
  const customerRecord = await prisma.customer.findFirst({
    where: { id: customerId, userId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      taxId: true,
      companyName: true,
      registrationNumber: true,
      branchCode: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      deliveryPreference: true,
      emailOptOut: true,
      whatsappOptOut: true,
      processingRestrictedAt: true,
      erasedAt: true,
    },
  });
  if (!customerRecord) {
    const error = new Error("Customer is required.");
    (error as any).status = 400;
    throw error;
  }

  const liveCustomer: CustomerSnapshot = customer || {
    name: customerRecord.name,
    email: customerRecord.email,
    phone: customerRecord.phone,
    taxId: customerRecord.taxId,
    companyName: customerRecord.companyName,
    registrationNumber: customerRecord.registrationNumber,
    branchCode: customerRecord.branchCode,
    address: [customerRecord.addressLine1, customerRecord.addressLine2, customerRecord.city, customerRecord.state, customerRecord.postalCode, customerRecord.country]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n"),
    streetAddress: customerRecord.addressLine1,
    addressLine2: customerRecord.addressLine2,
    city: customerRecord.city,
    state: customerRecord.state,
    postalCode: customerRecord.postalCode,
    country: customerRecord.country,
    deliveryPreference: customerRecord.deliveryPreference,
    emailOptOut: customerRecord.emailOptOut,
    whatsappOptOut: customerRecord.whatsappOptOut,
    processingRestrictedAt: customerRecord.processingRestrictedAt,
    erasedAt: customerRecord.erasedAt,
  };

  const immutableCustomerSnapshot =
    normalizedStatus === "SENT" || normalizedStatus === "PAID"
      ? {
          name: customerRecord.name,
          email: customerRecord.email,
          phone: customerRecord.phone,
          taxId: customerRecord.taxId,
          companyName: customerRecord.companyName,
          registrationNumber: customerRecord.registrationNumber,
          branchCode: customerRecord.branchCode,
          address: {
            addressLine1: customerRecord.addressLine1,
            addressLine2: customerRecord.addressLine2,
            city: customerRecord.city,
            state: customerRecord.state,
            postalCode: customerRecord.postalCode,
            country: customerRecord.country,
          },
          deliveryPreference: customerRecord.deliveryPreference,
          emailOptOut: customerRecord.emailOptOut,
          whatsappOptOut: customerRecord.whatsappOptOut,
          processingRestrictedAt: customerRecord.processingRestrictedAt,
          erasedAt: customerRecord.erasedAt,
        }
      : undefined;
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
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
  if (!profile) {
    const error = new Error("Business profile required before creating invoices");
    (error as any).status = 400;
    throw error;
  }

  const normalizedCurrency = normalizeCurrency(currency || "USD");
  if (!isSupportedBusinessCurrency(normalizedCurrency)) {
    const error = new Error("Unsupported currency");
    (error as any).status = 400;
    throw error;
  }

  const businessSnapshot = buildBusinessProfileSnapshot({
    ...profile,
    vatRate: profile.vatRate ? Number(profile.vatRate) : 0,
  });
  const vatSettings = normalizeVatSettings({
    enabled: businessSnapshot.vatEnabled ?? false,
    rate: businessSnapshot.vatRate ?? 0,
    mode:
      String(businessSnapshot.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const subscriberSetting = await getOrCreateSubscriberSetting(userId);
  const lateFeeSettings = toLateFeeSettingsSnapshot(subscriberSetting);
  const lateFeePolicyNotice =
    lateFeeSettings.enabled && lateFeeSettings.policyText
      ? `Late fee may apply after ${lateFeeSettings.graceDays} days.`
      : undefined;
  const totals = calculateTotals(items, vatSettings, discount);
  const totalsSnapshot: InvoiceTotalsSnapshot = {
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    total: totals.total,
    vatRate: totals.vatRate,
    vatEnabled: totals.vatEnabled,
    vatMode: totals.vatMode,
  };
  const compliance = buildInvoiceComplianceSnapshot({
    business: businessSnapshot,
    customer: liveCustomer,
    items,
    buyerType,
    supplyType,
  });
  const buildBlueprintArtifactsForInvoiceNumber = (resolvedInvoiceNumber: string) =>
    buildInvoiceBlueprintArtifacts({
      invoiceNumber: resolvedInvoiceNumber,
      issueDate,
      dueDate,
      currency: normalizedCurrency,
      business: businessSnapshot,
      customer: liveCustomer,
      items,
      totals: {
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        total: totals.total,
      },
      note,
      buyerType,
      supplyType,
      compliance,
    });
  const eInvoicingConnection = toConnectionConfig(
    await resolveEInvoiceConnectionForUser({
      userId,
      context: {
        sellerCountry: compliance.sellerCountry,
        buyerCountry: compliance.buyerCountry,
        currency: normalizedCurrency,
        compliance,
      },
    })
  );
  const sanitizedInvoiceNumber = String(invoiceNumber || "").trim();
  const shouldGenerateInvoiceNumber = shouldAutoGenerateInvoiceNumber(sanitizedInvoiceNumber);
  const invoiceYear = getInvoiceNumberYear(issueDate);
  const issuerCode = buildInvoiceIssuerCode(businessSnapshot.businessName, userId);
  const startOfYear = new Date(Date.UTC(invoiceYear, 0, 1));
  const startOfNextYear = new Date(Date.UTC(invoiceYear + 1, 0, 1));
  const baseSequence = shouldGenerateInvoiceNumber
    ? (await prisma.invoice.count({
        where: {
          userId,
          generatedAt: {
            gte: startOfYear,
            lt: startOfNextYear,
          },
        },
      })) + 1
    : null;
  const base = shouldGenerateInvoiceNumber
    ? formatSequentialInvoiceNumber(invoiceYear, baseSequence || 1, issuerCode)
    : sanitizedInvoiceNumber;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = shouldGenerateInvoiceNumber
      ? formatSequentialInvoiceNumber(invoiceYear, (baseSequence || 1) + attempt, issuerCode)
      : attempt === 0
        ? base
        : `${base}-${crypto.randomInt(1000, 10000)}`;
    try {
      const blueprintArtifacts = buildBlueprintArtifactsForInvoiceNumber(candidate);
      let created = await prisma.invoice.create({
        data: {
          userId,
          customerId: customerRecord.id,
          invoiceNumber: candidate,
          poNumber: poNumber ? String(poNumber).trim() : null,
          currency: normalizedCurrency,
          status: normalizedStatus as any,
          items,
          tax: totals.taxAmount,
          discount: totals.discountAmount,
          total: totals.total,
          generatedAt: issueDate,
          invoiceCustomerSnapshot: immutableCustomerSnapshot as any,
          metadata: {
            businessProfile: businessSnapshot,
            invoiceTotals: totalsSnapshot,
            compliance,
            complianceDocument: blueprintArtifacts.document as any,
            complianceValidation: blueprintArtifacts.validation as any,
            eInvoicing: buildInvoiceEInvoicingSnapshot({
              invoiceNumber: candidate,
              invoiceStatus: normalizedStatus,
              currency: normalizedCurrency,
              issuedAt: issueDate,
              dueDate,
              business: businessSnapshot,
              customer: liveCustomer,
              items,
              totals: totalsSnapshot,
              compliance,
              connection: eInvoicingConnection,
            }),
            customer: liveCustomer,
            poNumber: poNumber ? String(poNumber).trim() : undefined,
            dueDate: dueDate ? dueDate.toISOString() : undefined,
            organizationId: userId,
            note: note ? String(note).trim() : undefined,
            lateFeePolicyNotice,
          },
        },
      });
      if (Array.isArray(attachments) && attachments.length > 0) {
        const storedSupportingFiles = await persistInvoiceSupportingFiles(created.id, attachments);
        created = await prisma.invoice.update({
          where: { id: created.id },
          data: {
            metadata: {
              ...((created.metadata as any) || {}),
              supportingFiles: storedSupportingFiles,
            },
          },
        });
      }
      if (normalizedStatus === "SENT" && compliance.requiresEInvoicing) {
        const eInvoiceResult = await submitRequiredInvoiceEInvoicing({
          userId,
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
          invoiceStatus: created.status,
          currency: normalizedCurrency,
          issuedAt: issueDate,
          dueDate,
          business: businessSnapshot,
          customer: liveCustomer,
          items,
          totals: {
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            total: totals.total,
          },
          compliance,
        });
        if (eInvoiceResult) {
          const successfulSubmissionStatuses = new Set(["QUEUED", "SUBMITTED", "ACCEPTED"]);
          const nextStatus = successfulSubmissionStatuses.has(eInvoiceResult.snapshot.status) ? "SENT" : "DRAFT";
          created = await prisma.invoice.update({
            where: { id: created.id },
            data: {
              status: nextStatus as any,
              metadata: {
                ...((created.metadata as any) || {}),
                eInvoicing: eInvoiceResult.snapshot,
              },
            },
          });
          if (nextStatus !== "SENT") {
            throw new Error(eInvoiceResult.snapshot.lastError || "Could not submit the e-invoice.");
          }
        }
      }
      try {
        const { upsertInvoiceComplianceArtifacts } = await import("./invoicing/blueprint/storage");
        await upsertInvoiceComplianceArtifacts({
          invoiceId: created.id,
          validation: blueprintArtifacts.validation,
        });
      } catch (error) {
        log("warn", "invoice_compliance_record_persist_failed", {
          invoiceId: created.id,
          error,
        });
      }
      try {
        await notifyInvoiceCreated({
          userId,
          invoiceNumber: created.invoiceNumber,
          customerName: liveCustomer?.name,
          total: totals.total,
          currency: normalizedCurrency,
        });
      } catch (error) {
        log("warn", "invoice_whatsapp_failed", { invoiceId: created.id, error });
      }
      if (normalizedStatus === "SENT") {
        try {
          const { pdfBuffer } = await generateAndStoreInvoicePdf(created, businessSnapshot, liveCustomer);
          await deliverInvoiceToCustomer(created, businessSnapshot, {
            ...liveCustomer,
            phone: customerRecord.phone,
            deliveryPreference: customerRecord.deliveryPreference,
            emailOptOut: customerRecord.emailOptOut,
            whatsappOptOut: customerRecord.whatsappOptOut,
            processingRestrictedAt: customerRecord.processingRestrictedAt,
            erasedAt: customerRecord.erasedAt,
          }, pdfBuffer);
        } catch (error) {
          await persistInvoiceDeliveryAttempt({
            invoiceId: created.id,
            currentMetadata: ((created.metadata as any) || {}) as Record<string, unknown>,
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Could not send invoice.",
          });
          (created as any).deliveryWarning =
            error instanceof Error ? error.message : "Invoice was issued, but delivery failed.";
          log("error", "invoice_pdf_or_email_failed", { invoiceId: created.id, error });
        }
      }
      if (normalizedStatus !== "DRAFT") {
        triggerInvoiceStatusAutomations({
          userId,
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
          status: normalizedStatus,
        }).catch((error) => {
          log("error", "invoice_status_trigger_failed", { invoiceId: created.id, error });
        });
      }
      if (normalizedStatus === "SENT") {
        const usageScope = await getWorkspaceScope(userId);
        const workspaceId = usageScope.businessId ?? userId;
        await recordAnalyticsEvent({
          userId,
          workspaceId,
          orgId: workspaceId,
          type: "INVOICE_SENT",
          count: 1,
          idempotencyKey: `invoice:${created.id}`,
        });
      }
      return created;
    } catch (error: any) {
      if (error?.code === "P2002") {
        const targets = Array.isArray(error?.meta?.target) ? error.meta.target : [];
        if (targets.includes("invoiceNumber")) {
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error("Invoice number already exists. Please choose another.");
}

export type InvoicePdfInput = {
  invoiceNumber: string;
  poNumber?: string | null;
  status: string;
  issuedAt: Date;
  dueDate?: Date | null;
  currency: string;
  items: InvoiceItem[];
  totals: InvoiceTotalsSnapshot;
  lateFeeAmount?: number;
  totalDue?: number;
  business: BusinessProfileSnapshot;
  billTo?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    streetAddress?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    type?: "INDIVIDUAL" | "BUSINESS" | null;
    companyName?: string | null;
    taxId?: string | null;
  } | null;
  paymentLink?: string;
  directPaymentLink?: string;
  paymentDetails?: InvoicePaymentDetails | null;
  logoBuffer?: Buffer | null;
  note?: string | null;
  compliance?: Partial<InvoiceComplianceResult> | null;
};

export type InvoicePaymentDetails = {
  onlinePaymentUrl?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  bicSwift?: string | null;
  bankCode?: string | null;
  branchCode?: string | null;
  routingNumber?: string | null;
  sortCode?: string | null;
  payoutType?: string | null;
  provider?: string | null;
  currency?: string | null;
  country?: string | null;
};

export async function resolveInvoicePaymentDetails(
  userId?: string | null,
  paymentLink?: string | null
): Promise<InvoicePaymentDetails | null> {
  const fallback: InvoicePaymentDetails = {
    onlinePaymentUrl: paymentLink || null,
  };

  if (!userId) {
    return fallback.onlinePaymentUrl ? fallback : null;
  }

  const merchantAccount = await prisma.merchantAccount.findUnique({
    where: { userId },
    select: {
      provider: true,
      payoutType: true,
      accountName: true,
      accountNumber: true,
      iban: true,
      bicSwift: true,
      payoutDetails: true,
      currency: true,
      country: true,
    },
  });

  if (!merchantAccount) {
    return fallback.onlinePaymentUrl ? fallback : null;
  }

  const payoutDetails = sanitizePayoutDetails(merchantAccount.payoutDetails);
  const payoutSource =
    merchantAccount.payoutDetails && typeof merchantAccount.payoutDetails === "object"
      ? (merchantAccount.payoutDetails as Record<string, unknown>)
      : {};
  const resolved: InvoicePaymentDetails = {
    ...fallback,
    accountName: merchantAccount.accountName || null,
    accountNumber: merchantAccount.accountNumber || null,
    iban: merchantAccount.iban || null,
    bicSwift: merchantAccount.bicSwift || null,
    bankCode: typeof payoutSource.bankCode === "string" ? payoutSource.bankCode : null,
    branchCode: payoutDetails.branchCode || null,
    routingNumber: payoutDetails.routingNumber || null,
    sortCode: payoutDetails.sortCode || null,
    payoutType: merchantAccount.payoutType || null,
    provider: merchantAccount.provider || null,
    currency: merchantAccount.currency || null,
    country: merchantAccount.country || null,
  };

  const hasInstruction =
    Boolean(resolved.onlinePaymentUrl) ||
    Boolean(resolved.accountName) ||
    Boolean(resolved.accountNumber) ||
    Boolean(resolved.iban) ||
    Boolean(resolved.bicSwift) ||
    Boolean(resolved.bankCode) ||
    Boolean(resolved.branchCode) ||
    Boolean(resolved.routingNumber) ||
    Boolean(resolved.sortCode);

  return hasInstruction ? resolved : null;
}

function sanitizeFilename(value: string) {
  return String(value || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function persistInvoicePdf(
  invoiceId: string,
  invoiceNumber: string,
  pdfBuffer: Buffer
) {
  const safeNumber = sanitizeFilename(invoiceNumber);
  const fileName = `Invoice_${safeNumber}_${invoiceId}.pdf`;
  const dir = path.join(process.cwd(), "public", "invoices");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/invoices/${fileName}`;
}

async function readStoredPdf(pdfUrl?: string | null) {
  if (!pdfUrl) return null;
  const filePath = path.join(process.cwd(), "public", pdfUrl.replace(/^\//, ""));
  return fs.readFile(filePath);
}

const getInvoiceDeliveryChannels = (customer?: CustomerSnapshot | null) => {
  const policy = resolveCustomerContactPolicy(customer);
  return {
    shouldEmail: policy.shouldEmail,
    shouldWhatsapp: policy.shouldWhatsapp,
    blockedReason: policy.blockedReason,
  };
};

const getInvoiceSupportingFiles = (metadata: any) =>
  readInvoiceSupportingFilesFromMetadata(metadata);

export function buildInvoicePdfBuffer(input: InvoicePdfInput) {
  return new Promise<Buffer>((resolve, reject) => {
    const normalizedCurrency = normalizeCurrency(input.currency || "USD");
    if (!isSupportedBusinessCurrency(normalizedCurrency)) {
      reject(new Error("Unsupported invoice currency"));
      return;
    }
    const fontPath = ensureInvoiceFont();
    const doc = new PDFDocument({ margin: 48, size: "A4", font: fontPath });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.registerFont("Inter", fontPath);
    doc.font("Inter");

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    let y = doc.page.margins.top;

    const colors = {
      text: "#0f172a",
      muted: "#475569",
      line: "#d7e2ee",
      accent: "#0f5ec6",
      dueFill: "#fff7ed",
      dueText: "#b45309",
      paidFill: "#ecfdf5",
      paidText: "#047857",
    };

    const formatMoney = (value: number) => formatCurrency(value, normalizedCurrency);
    const statusLabel = String(input.status || "DUE").toUpperCase() === "PAID" ? "PAID" : "DUE";

    const drawLabel = (
      textValue: string,
      x: number,
      yPos: number,
      size = 8.75,
      color = colors.muted,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(color).text(textValue, x, yPos, options);
    };
    const drawText = (
      textValue: string,
      x: number,
      yPos: number,
      size = 10,
      color = colors.text,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(color).text(textValue, x, yPos, options);
    };
    const drawBold = (
      textValue: string,
      x: number,
      yPos: number,
      size = 11,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(colors.text).text(textValue, x, yPos, options);
      doc.font("Inter").fontSize(size).fillColor(colors.text).text(textValue, x + 0.4, yPos, options);
    };
    const getFittedFontSize = (
      textValue: string,
      width: number,
      maxSize: number,
      minSize: number
    ) => {
      let size = maxSize;
      while (
        size > minSize &&
        doc.font("Inter").fontSize(size).widthOfString(String(textValue || "")) > width
      ) {
        size -= 0.25;
      }
      return Math.max(minSize, size);
    };
    const drawFittedText = (
      textValue: string,
      x: number,
      yPos: number,
      width: number,
      maxSize: number,
      minSize: number,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      const size = getFittedFontSize(textValue, width, maxSize, minSize);
      drawText(textValue, x, yPos, size, colors.text, { ...options, width, lineBreak: false });
    };
    const drawFittedBold = (
      textValue: string,
      x: number,
      yPos: number,
      width: number,
      maxSize: number,
      minSize: number,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      const size = getFittedFontSize(textValue, width, maxSize, minSize);
      drawBold(textValue, x, yPos, size, { ...options, width, lineBreak: false });
    };
    const drawRule = (yPos: number) => {
      doc.moveTo(left, yPos).lineTo(right, yPos).strokeColor(colors.line).lineWidth(1).stroke();
    };
    const measureLineBlockHeight = (lines: string[], width: number, size = 10, gap = 4) =>
      lines.reduce((sum, line) => {
        const height = doc.font("Inter").fontSize(size).heightOfString(String(line), { width });
        return sum + height + gap;
      }, 0);
    const drawLineBlock = (
      lines: string[],
      startX: number,
      startY: number,
      width: number,
      size = 10,
      color = colors.text,
      gap = 4
    ) => {
      let cursorY = startY;
      lines.forEach((line) => {
        const text = String(line);
        const height = doc.font("Inter").fontSize(size).heightOfString(text, { width });
        drawText(text, startX, cursorY, size, color, { width });
        cursorY += height + gap;
      });
      return cursorY - startY;
    };
    const splitAddressLines = (value?: string | null) => {
      if (!value) return [];
      return String(value)
        .split(/\n|,/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    };
    const buildAddressLines = ({
      rawAddress,
      streetAddress,
      city,
      postalCode,
      country,
    }: {
      rawAddress?: string | null;
      streetAddress?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
    }) => {
      const parsed = parseBusinessAddress(rawAddress || "");
      const street = String(streetAddress || parsed.streetAddress || "").trim();
      const cityValue = String(city || parsed.city || "").trim();
      const postalValue = String(postalCode || parsed.postalCode || "").trim();
      const countryValue = formatCountryName(country || parsed.region || "");
      const lines = [
        street,
        [cityValue, postalValue].filter(Boolean).join(" "),
        countryValue,
      ].filter(Boolean);
      if (lines.length > 0) return lines;
      return splitAddressLines(rawAddress);
    };

    const showTax =
      Boolean((input.totals as any).vatEnabled) && Number((input.totals as any).vatRate || 0) > 0;
    const taxRate = Number((input.totals as any).vatRate || 0);
    const taxLabelBase = String(input.compliance?.taxLabel || "VAT").trim() || "VAT";
    const taxLabelWithRate = `${taxLabelBase} (${formatVatRateLabel(taxRate, (input.business as any)?.vatRateDisplay)}%)`;
    const lateFeeAmount = roundMoney(Math.max(0, Number(input.lateFeeAmount || 0)));
    const showLateFee = lateFeeAmount > 0;
    const totalDue = roundMoney(
      Number.isFinite(Number(input.totalDue))
        ? Number(input.totalDue)
        : Number(input.totals.total || 0)
    );
    const paymentDetails = input.paymentDetails || null;
    const rawBusinessAddress = String(input.business.businessAddress || "").trim();
    const businessAddressLines = buildAddressLines({
      rawAddress: rawBusinessAddress,
      country: input.business.country,
    });
    const issuedLabel = formatDateDMY(input.issuedAt);
    const dueLabel = input.dueDate ? formatDateDMY(input.dueDate) : "Due on receipt";
    const businessMetaLines = [
      input.business.businessEmail || "",
      ...businessAddressLines,
      input.business.taxId ? `Tax ID: ${input.business.taxId}` : "",
    ].filter(Boolean);

    const billAddressLines = buildAddressLines({
      rawAddress: input.billTo?.address,
      streetAddress: input.billTo?.streetAddress,
      city: input.billTo?.city,
      postalCode: input.billTo?.postalCode,
      country: input.billTo?.country,
    });
    const billToPrimaryName =
      input.billTo?.companyName && input.billTo?.name && input.billTo.companyName !== input.billTo.name
        ? input.billTo.companyName
        : input.billTo?.name || input.billTo?.companyName || "Customer";
    const billLines = [
      billToPrimaryName,
      input.billTo?.email || "",
      ...billAddressLines,
    ].filter((line) => line && String(line).trim().length > 0);
    const invoicedByLines = [
      input.business.businessName,
      ...businessMetaLines,
    ].filter((line) => line && String(line).trim().length > 0);
    const logoSize = input.logoBuffer ? 60 : 0;
    const logoX = left;
    const businessX = input.logoBuffer ? logoX + logoSize + 18 : left;
    const businessNameOffsetY = input.logoBuffer ? 16 : 0;
    const rightMetaWidth = 246;
    const businessWidth = pageWidth - rightMetaWidth - (businessX - left) - 18;

    if (input.logoBuffer) {
      try {
        doc.image(input.logoBuffer, logoX, y + 2, { width: logoSize, height: logoSize });
      } catch (error) {
        log("warn", "invoice_logo_failed", { error });
      }
    }

    const businessNameSize = getFittedFontSize(input.business.businessName, businessWidth, 21, 14);
    drawBold(input.business.businessName, businessX, y + businessNameOffsetY, businessNameSize, {
      width: businessWidth,
      align: "left",
    });
    const businessNameHeight = doc.font("Inter").fontSize(businessNameSize).heightOfString(input.business.businessName, {
      width: businessWidth,
    });
    const businessBlockHeight = businessNameOffsetY + businessNameHeight;

    const metaRows = [
      { label: "Invoice No:", value: input.invoiceNumber },
      { label: "Issue Date:", value: issuedLabel },
      { label: "Due Date:", value: dueLabel },
    ];
    const metaLabelWidth =
      Math.max(
        ...metaRows.map((row) =>
          doc.font("Inter").fontSize(10).widthOfString(String(row.label || ""))
        )
      ) + 2;
    const metaGap = 6;
    const metaValueWidth = Math.max(
      ...metaRows.map((row) =>
        doc.font("Inter").fontSize(10).widthOfString(String(row.value || ""))
      )
    );
    const metaGroupWidth = metaLabelWidth + metaGap + metaValueWidth;
    const metaGroupX = right - metaGroupWidth;
    drawLabel("INVOICE", metaGroupX, y + 1, 9, colors.accent, {
      width: metaGroupWidth,
      align: "right",
      characterSpacing: 2.1,
      lineBreak: false,
    });
    const metaValueX = metaGroupX + metaLabelWidth + metaGap;
    let metaY = y + 22;
    metaRows.forEach((row) => {
      drawBold(row.label, metaGroupX, metaY, 10, {
        width: metaLabelWidth,
        align: "left",
        lineBreak: false,
      });
      drawText(row.value, metaValueX, metaY, 10, colors.text, {
        width: metaValueWidth,
        align: "left",
        lineBreak: false,
      });
      metaY += 16;
    });

    const pillWidth = 78;
    const pillHeight = 22;
    const pillX = right - pillWidth;
    const pillY = metaY + 8;
    doc.save();
    doc
      .roundedRect(pillX, pillY, pillWidth, pillHeight, 11)
      .fill(statusLabel === "PAID" ? colors.paidFill : colors.dueFill);
    doc.restore();
    drawText(
      statusLabel,
      pillX,
      pillY + 6,
      9,
      statusLabel === "PAID" ? colors.paidText : colors.dueText,
      { width: pillWidth, align: "center", lineBreak: false }
    );

    y += Math.max(logoSize, businessBlockHeight, pillY + pillHeight - y) + 16;
    drawRule(y);
    y += 18;

    const upperSectionGap = 28;
    const upperColumnWidth = (pageWidth - upperSectionGap) / 2;
    const upperSectionPadding = 2;
    const upperContentWidth = upperColumnWidth - upperSectionPadding * 2;
    const billBlockHeight = measureLineBlockHeight(billLines, upperContentWidth, 10, 4);
    const invoicedByOffset = 104;
    const invoicedByContentWidth = upperContentWidth - invoicedByOffset;
    const invoicedByBlockHeight = measureLineBlockHeight(invoicedByLines, invoicedByContentWidth, 10, 4);
    const upperSectionHeight = Math.max(billBlockHeight, invoicedByBlockHeight) + 24;
    const invoicedByX = left + upperColumnWidth + upperSectionGap + invoicedByOffset;

    drawLabel("BILLED TO", left + upperSectionPadding, y, 8.25, colors.accent, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
    drawLineBlock(billLines, left + upperSectionPadding, y + 20, upperContentWidth, 10, colors.text, 4);
    drawLabel("INVOICED BY", invoicedByX + upperSectionPadding, y, 8.25, colors.accent, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
    drawLineBlock(
      invoicedByLines,
      invoicedByX + upperSectionPadding,
      y + 20,
      invoicedByContentWidth,
      10,
      colors.text,
      4
    );
    y += upperSectionHeight + 18;

    const lowerGap = 28;
    const totalBoxWidth = 170;
    const detailBoxWidth = pageWidth - totalBoxWidth - lowerGap;
    const detailPadding = 16;
    const detailInnerWidth = detailBoxWidth - detailPadding * 2;
    const totalBoxX = left + detailBoxWidth + lowerGap;
    const buttonHeight = 38;
    const totalDueDisplay = formatMoney(totalDue);
    const totalDueFontSize = getFittedFontSize(totalDueDisplay, totalBoxWidth - 32, 20, 10);
    const totalDueTextHeight = doc.font("Inter").fontSize(totalDueFontSize).heightOfString(totalDueDisplay, {
      width: totalBoxWidth - 32,
      lineBreak: false,
    });
    const detailTextHeight = 54 + doc.font("Inter").fontSize(10).heightOfString(
      `${input.items.length} ${input.items.length === 1 ? "item" : "items"}`,
      { width: detailInnerWidth }
    );
    const taxChipHeight = showTax ? 38 : 0;
    const lowerBoxHeight = Math.max(
      116,
      detailTextHeight + (showTax ? taxChipHeight + 26 : 26),
      14 + 24 + totalDueTextHeight + 18 + buttonHeight + 18
    );

    drawLabel("INVOICE DETAILS", left + detailPadding, y + 14, 8.25, colors.accent, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
    drawText("Description", left + detailPadding, y + 34, 10, colors.muted, {
      width: detailInnerWidth,
    });
    drawText(
      `${input.items.length} ${input.items.length === 1 ? "item" : "items"}`,
      left + detailPadding,
      y + 54,
      10,
      colors.text,
      { width: detailInnerWidth }
    );
    if (showTax) {
      const taxChipWidth = 118;
      const taxChipHeight = 38;
      const taxChipX = left + detailBoxWidth - taxChipWidth - 14;
      const taxChipY = y + lowerBoxHeight - taxChipHeight - 10;
      drawFittedText(
        taxLabelWithRate,
        taxChipX + 10,
        taxChipY + 8,
        taxChipWidth - 20,
        7.5,
        6.5,
        { align: "left" }
      );
      drawFittedText(formatMoney(input.totals.taxAmount), taxChipX + 10, taxChipY + 19, taxChipWidth - 20, 10.5, 8, {
        align: "left",
      });
    }

    drawLabel("TOTAL DUE", totalBoxX + 16, y + 14, 8.25, colors.accent, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
    drawFittedBold(totalDueDisplay, totalBoxX + 16, y + 38, totalBoxWidth - 32, 20, 10, {
      align: "left",
    });
    const buttonX = totalBoxX + 16;
    const buttonY = y + lowerBoxHeight - buttonHeight - 10;
    const buttonWidth = totalBoxWidth - 32;
    doc.save();
    doc.fillColor("#5046e5").roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 6).fill();
    doc.restore();
    drawText("Pay Now", buttonX, buttonY + 12, 10, "#ffffff", {
      width: buttonWidth,
      align: "center",
      lineBreak: false,
    });
    if (input.directPaymentLink) {
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, input.directPaymentLink);
    } else if (paymentDetails?.onlinePaymentUrl) {
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, paymentDetails.onlinePaymentUrl);
    } else if (input.paymentLink) {
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, input.paymentLink);
    }
    y += lowerBoxHeight + 14;

    const tableTop = y;
    const tableHeaderHeight = 22;
    const qtyWidth = 70;
    const unitWidth = 120;
    const totalWidth = 130;
    const tableWidth = pageWidth;
    const descWidth = Math.max(180, tableWidth - (qtyWidth + unitWidth + totalWidth));
    const columnWidths = [descWidth, qtyWidth, unitWidth, totalWidth];
    const headerLabels = ["Description", "Qty", "Unit Price", "Total"];
    const drawTableHeader = (yPos: number) => {
      doc.save();
      doc.rect(left, yPos, tableWidth, tableHeaderHeight).fill("#eef2f6");
      doc.restore();
      headerLabels.reduce((x, label, idx) => {
        const width = columnWidths[idx];
        const align = idx === 0 ? "left" : idx === 1 ? "center" : "right";
        drawBold(label, x + 6, yPos + 6, 8.5, {
          width: width - 12,
          align,
          lineBreak: false,
        });
        return x + width;
      }, left);
      doc.moveTo(left, yPos + tableHeaderHeight).lineTo(right, yPos + tableHeaderHeight).strokeColor(colors.line).lineWidth(1).stroke();
    };
    drawTableHeader(tableTop);
    let yTable = tableTop + tableHeaderHeight;

    const noteText = input.note ? String(input.note).trim() : "";
    const showDiscount = Number(input.totals.discountAmount || 0) > 0;
    const totalsWidth = 210;
    const noteWidth = pageWidth - totalsWidth - 28;
    const noteTitleHeight = noteText ? 14 : 0;
    const noteBodyHeight = noteText
      ? doc.font("Inter").fontSize(9.5).heightOfString(noteText, { width: noteWidth })
      : 0;
    const noteBlockHeight = noteText ? noteTitleHeight + noteBodyHeight + 6 : 0;
    const totalsRowCount = 2 + (showTax ? 1 : 0) + (showDiscount ? 1 : 0) + (showLateFee ? 1 : 0);
    const totalsBlockHeight = totalsRowCount * 18;
    const summarySectionHeight = Math.max(noteBlockHeight, totalsBlockHeight, 44);
    const footerMessage =
      "Please make the payment by the due date. Thank you for your business.";
    const footerMessageHeight = doc.font("Inter").fontSize(10).heightOfString(footerMessage, {
      width: pageWidth,
    });
    const brandText = "Generated with Maboria";
    const brandHeight = doc.font("Inter").fontSize(8).heightOfString(brandText, {
      width: pageWidth,
    });
    const tableToFooterGap = 12;
    const minTableToFooterGap = 8;
    const paginationEpsilon = 10;
    const footerBlockHeight = summarySectionHeight + 26 + footerMessageHeight + 18 + brandHeight;
    const compactRequired = footerBlockHeight + minTableToFooterGap;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const descriptionColumnWidth = columnWidths[0] - 16;
    const rowTopPadding = 8;
    const rowBottomPadding = 12;
    const rowTextOptions = {
      width: descriptionColumnWidth,
      lineGap: 2,
      paragraphGap: 0,
    };
    const rowMeta = input.items.map((item) => {
      const normalizedName = String(item.name || "").trim();
      const normalizedDescription = String(item.description || "").trim();
      const descText =
        normalizedDescription &&
        normalizedDescription.toLowerCase() !== normalizedName.toLowerCase()
          ? `${normalizedName}\n${normalizedDescription}`
          : normalizedName || normalizedDescription || "Item";
      const descHeight = doc.font("Inter").fontSize(10).heightOfString(descText, rowTextOptions);
      const rowHeight = Math.max(
        42,
        rowTopPadding + descHeight + rowBottomPadding
      );
      return { item, descText, rowHeight };
    });
    const rowPrefix = rowMeta.reduce((acc, row) => {
      acc.push((acc[acc.length - 1] || 0) + row.rowHeight);
      return acc;
    }, [] as number[]);
    const remainingRowsHeight = (index: number) =>
      rowPrefix.length === 0
        ? 0
        : rowPrefix[rowPrefix.length - 1] - (index > 0 ? rowPrefix[index - 1] : 0);
    const tableRowsHeight = rowPrefix.length > 0 ? rowPrefix[rowPrefix.length - 1] : 0;
    const fitsSinglePage =
      yTable +
        tableRowsHeight +
        minTableToFooterGap +
        footerBlockHeight <=
      pageBottom + paginationEpsilon;
    const forceSinglePageForShortList =
      fitsSinglePage || (rowMeta.length <= 5 && footerBlockHeight <= 220);
    const forceSinglePage = false;
    const allowPagination = !forceSinglePage;

    let rowIndex = 0;
    while (rowIndex < rowMeta.length) {
      const remainingHeight = pageBottom - yTable;
      const remainingHeightNeeded = remainingRowsHeight(rowIndex);
      const enforcedAfterTable = forceSinglePageForShortList
        ? footerBlockHeight + minTableToFooterGap
        : compactRequired;
      const isFinalPage =
        forceSinglePageForShortList ||
        remainingHeightNeeded + enforcedAfterTable <= remainingHeight + paginationEpsilon;
      const maxTableY = isFinalPage ? pageBottom - enforcedAfterTable : pageBottom - 12;
      const startIndex = rowIndex;

      while (rowIndex < rowMeta.length && yTable + rowMeta[rowIndex].rowHeight <= maxTableY) {
        const { item, descText, rowHeight } = rowMeta[rowIndex];
        drawText(descText, left + 8, yTable + rowTopPadding, 10, colors.text, rowTextOptions);
        drawText(String(item.quantity), left + columnWidths[0] + 8, yTable + rowTopPadding, 10, colors.text, {
          width: columnWidths[1] - 16,
          align: "center",
          lineBreak: false,
        });
        drawFittedText(
          formatMoney(item.price),
          left + columnWidths[0] + columnWidths[1] + 8,
          yTable + rowTopPadding,
          columnWidths[2] - 16,
          10,
          7.5,
          { align: "right" }
        );
        drawFittedBold(
          formatMoney(item.price * item.quantity),
          left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8,
          yTable + rowTopPadding,
          columnWidths[3] - 16,
          10,
          7.5,
          { align: "right" }
        );
        yTable += rowHeight;
        doc
          .moveTo(left, yTable)
          .lineTo(left + tableWidth, yTable)
          .strokeColor(colors.line)
          .lineWidth(0.8)
          .stroke();
        rowIndex += 1;
      }

      if (rowIndex < rowMeta.length) {
        if (rowIndex === startIndex) {
          const { item, descText, rowHeight } = rowMeta[rowIndex];
          drawText(descText, left + 8, yTable + rowTopPadding, 10, colors.text, rowTextOptions);
          drawText(String(item.quantity), left + columnWidths[0] + 8, yTable + rowTopPadding, 10, colors.text, {
            width: columnWidths[1] - 16,
            align: "center",
            lineBreak: false,
          });
          drawFittedText(
            formatMoney(item.price),
            left + columnWidths[0] + columnWidths[1] + 8,
            yTable + rowTopPadding,
            columnWidths[2] - 16,
            10,
            7.5,
            { align: "right" }
          );
          drawFittedBold(
            formatMoney(item.price * item.quantity),
            left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8,
            yTable + rowTopPadding,
            columnWidths[3] - 16,
            10,
            7.5,
            { align: "right" }
          );
          yTable += rowHeight;
          doc
            .moveTo(left, yTable)
            .lineTo(left + tableWidth, yTable)
            .strokeColor(colors.line)
            .lineWidth(0.8)
            .stroke();
          rowIndex += 1;
          continue;
        }
        if (allowPagination) {
          doc.addPage();
          yTable = doc.page.margins.top;
          drawTableHeader(yTable);
          yTable += tableHeaderHeight;
        }
      }
    }

    let footerStart = yTable + tableToFooterGap;
    if (forceSinglePageForShortList) {
      footerStart = Math.min(footerStart, pageBottom - footerBlockHeight);
    }
    const footerOverflows = footerStart + footerBlockHeight > pageBottom + paginationEpsilon;
    if (allowPagination && footerOverflows && !forceSinglePageForShortList) {
      doc.addPage();
      footerStart = doc.page.margins.top;
    }
    if (noteText) {
      drawBold("Note", left + 12, footerStart, 10, {
        width: noteWidth,
        align: "left",
      });
      drawText(noteText, left + 12, footerStart + 14, 9.5, colors.muted, {
        width: noteWidth,
      });
    }

    const totalsX = right - totalsWidth;
    const totalsLabelWidth = 98;
    const totalsValueWidth = totalsWidth - totalsLabelWidth;
    let totalsCursorY = footerStart;
    const drawSummaryRow = (label: string, value: string, emphasize = false) => {
      if (emphasize) {
        drawBold(label, totalsX, totalsCursorY, 10.5, {
          width: totalsLabelWidth,
          align: "left",
          lineBreak: false,
        });
        drawFittedBold(value, totalsX + totalsLabelWidth, totalsCursorY, totalsValueWidth, 10.5, 8, {
          align: "right",
        });
      } else {
        drawText(label, totalsX, totalsCursorY, 10, colors.muted, {
          width: totalsLabelWidth,
          align: "left",
          lineBreak: false,
        });
        drawFittedText(value, totalsX + totalsLabelWidth, totalsCursorY, totalsValueWidth, 10, 8, {
          align: "right",
        });
      }
      totalsCursorY += 18;
    };

    drawSummaryRow("Subtotal", formatMoney(input.totals.subtotal));
    if (showTax) {
      drawSummaryRow(taxLabelWithRate, formatMoney(input.totals.taxAmount));
    }
    if (showDiscount) {
      drawSummaryRow("Discount", `-${formatMoney(input.totals.discountAmount)}`);
    }
    if (showLateFee) {
      drawSummaryRow("Late fee", formatMoney(lateFeeAmount));
    }
    drawSummaryRow("Total Due", formatMoney(totalDue), true);

    const footerMessageY = footerStart + summarySectionHeight + 18;
    drawLabel(footerMessage, left, footerMessageY, 10, colors.muted, {
      width: pageWidth,
      align: "center",
    });
    drawLabel(brandText, left, footerMessageY + footerMessageHeight + 18, 8, colors.muted, {
      width: pageWidth,
      align: "center",
    });

    doc.end();
  });
}

export async function ensureInvoicePdf({
  invoice,
  business,
  billTo,
  forceRegenerate,
}: {
  invoice: {
    id: string;
    invoiceNumber: string;
    poNumber?: string | null;
    status: string;
    generatedAt: Date;
    currency: string;
    items: unknown;
    tax?: any;
    discount?: any;
    total?: any;
    lateFeeAmount?: any;
    lateFeeTotalAccumulated?: any;
    pdfUrl?: string | null;
    metadata?: any;
    userId?: string;
  };
  business: BusinessProfileSnapshot;
  billTo?: CustomerSnapshot | null;
  forceRegenerate?: boolean;
}) {
  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  if (!isSupportedBusinessCurrency(normalizedCurrency)) {
    throw new Error("Unsupported invoice currency");
  }

  const metadata = (invoice as any).metadata || {};
  const currentPdfVersion = metadata?.pdfVersion || null;
  const shouldRegenerate = currentPdfVersion !== INVOICE_PDF_VERSION;
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;

  if (invoice.pdfUrl && !shouldRegenerate && !forceRegenerate) {
    try {
      const existingBuffer = await readStoredPdf(invoice.pdfUrl);
      if (existingBuffer) {
        return { pdfUrl: invoice.pdfUrl, pdfBuffer: existingBuffer };
      }
    } catch (error) {
      log("warn", "invoice_pdf_read_failed", { invoiceId: invoice.id, error });
    }
  }

  const normalizedItems = normalizeInvoiceItems(invoice.items);
  const effectiveBusiness = resolveInvoiceBusinessSnapshot(invoice, business) || business;
  const totals = resolveStoredInvoiceTotals(invoice, effectiveBusiness);
  const lateFeeAmount = Number(invoice.lateFeeTotalAccumulated ?? invoice.lateFeeAmount ?? 0);
  const totalDue = Number(invoice.total ?? totals.total);
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  const paymentLink = `${env.appUrl}/pay/invoice/${encodeURIComponent(publicLink.token)}`;
  const directPaymentLink = `${env.appUrl}/api/invoice/pay/${encodeURIComponent(publicLink.token)}`;
  const paymentDetails = await resolveInvoicePaymentDetails(invoice.userId, paymentLink);
  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    poNumber: invoice.poNumber || metadata?.poNumber || undefined,
    status: invoice.status,
    issuedAt: invoice.generatedAt,
    dueDate,
    currency: normalizedCurrency,
    items: normalizedItems,
    totals,
    lateFeeAmount,
    totalDue,
    business: effectiveBusiness,
    billTo,
    paymentLink,
    directPaymentLink,
    paymentDetails,
    logoBuffer: await getStoredBusinessLogoBuffer(invoice.userId || ""),
    note: composeInvoiceNote(metadata),
    compliance: metadata?.compliance || null,
  });
  const pdfUrl = await persistInvoicePdf(invoice.id, invoice.invoiceNumber, pdfBuffer);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfUrl,
      metadata: {
        ...metadata,
        pdfVersion: INVOICE_PDF_VERSION,
      },
    },
  });
  return { pdfUrl, pdfBuffer };
}

export async function generateAndStoreInvoicePdf(
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: unknown;
    tax?: any;
    discount?: any;
    total?: any;
    lateFeeAmount?: any;
    lateFeeTotalAccumulated?: any;
    pdfUrl?: string | null;
    userId?: string;
  },
  business: BusinessProfileSnapshot,
  billTo?: CustomerSnapshot | null
) {
  return ensureInvoicePdf({ invoice, business, billTo });
}

export async function emailInvoice({
  to,
  invoiceNumber,
  pdfBuffer,
  businessName,
  paymentLink,
  supportingAttachments,
}: {
  to: string;
  invoiceNumber: string;
  pdfBuffer: Buffer;
  businessName: string;
  paymentLink?: string;
  supportingAttachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}) {
  const linkHtml = paymentLink
    ? `<p style="margin-top:12px">Pay this invoice: <a href="${paymentLink}">${paymentLink}</a></p>`
    : "";
  await sendBillingMail({
    to,
    subject: `Invoice from ${businessName}`,
    html: `<p>Please find attached invoice <strong>${invoiceNumber}</strong>.</p>${linkHtml}`,
    attachments: [
      {
        filename: `Invoice_${sanitizeFilename(invoiceNumber)}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
      ...(supportingAttachments || []),
    ],
  });
  log("info", "Invoice email prepared", { to, invoiceNumber, size: pdfBuffer.length });
}

export async function persistInvoiceDeliveryAttempt(input: {
  invoiceId: string;
  currentMetadata?: Record<string, unknown> | null;
  status: "DELIVERED" | "FAILED";
  channelsSent?: Array<"EMAIL" | "WHATSAPP">;
  errorMessage?: string | null;
  attemptedAt?: Date;
}) {
  const attemptedAt = input.attemptedAt || new Date();
  const latestInvoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { metadata: true },
  });
  const currentMetadata =
    latestInvoice?.metadata && typeof latestInvoice.metadata === "object"
      ? (latestInvoice.metadata as Record<string, unknown>)
      : input.currentMetadata || {};
  const existingDelivery =
    currentMetadata.delivery && typeof currentMetadata.delivery === "object"
      ? (currentMetadata.delivery as Record<string, unknown>)
      : {};

  return prisma.invoice.update({
    where: { id: input.invoiceId },
    data: {
      metadata: {
        ...currentMetadata,
        delivery: {
          ...existingDelivery,
          status: input.status,
          attemptedAt: attemptedAt.toISOString(),
          deliveredAt:
            input.status === "DELIVERED"
              ? attemptedAt.toISOString()
              : (existingDelivery.deliveredAt as string | undefined) || null,
          failedAt: input.status === "FAILED" ? attemptedAt.toISOString() : null,
          channelsSent:
            input.status === "DELIVERED"
              ? input.channelsSent || []
              : (Array.isArray(existingDelivery.channelsSent)
                  ? existingDelivery.channelsSent
                  : []),
          lastError: input.status === "FAILED" ? String(input.errorMessage || "Delivery failed.") : null,
          requiresAttention: input.status === "FAILED",
        },
      },
    },
  });
}

export async function deliverInvoiceToCustomer(
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: unknown;
    tax?: any;
    discount?: any;
    total?: any;
    lateFeeAmount?: any;
    lateFeeTotalAccumulated?: any;
    pdfUrl?: string | null;
    metadata?: any;
    userId?: string;
  },
  business: BusinessProfileSnapshot,
  customer?: CustomerSnapshot | null,
  pdfBuffer?: Buffer
) {
  const channels = getInvoiceDeliveryChannels(customer);
  if (
    !channels.shouldEmail &&
    !channels.shouldWhatsapp
  ) {
    const error = new Error(channels.blockedReason || "Customer contact policy blocks delivery.");
    (error as any).status = 400;
    throw error;
  }

  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  await ensureInvoicePaymentLink({
    invoice,
    customerName: customer?.name ?? null,
    returnUrl: `${env.appUrl}/api/invoice/confirm/${encodeURIComponent(publicLink.token)}`,
  });

  const paymentLink = `${env.appUrl}/api/invoice/pay/${encodeURIComponent(publicLink.token)}`;
  const pdfPublicUrl = `${env.appUrl}/api/invoice/public-file/${encodeURIComponent(publicLink.token)}?type=pdf`;
  const metadata = (invoice as any).metadata || {};
  const storedSupportingFiles = getInvoiceSupportingFiles(metadata);

  const resolvedPdfBuffer =
    pdfBuffer ||
    (
      await ensureInvoicePdf({
        invoice: invoice as any,
        business,
        billTo: customer,
      })
    ).pdfBuffer;

  const supportingEmailAttachments = await Promise.all(
    storedSupportingFiles.map(async (file) => ({
      filename: file.filename,
      contentType: file.contentType,
      content: await readStoredInvoiceSupportingFile(file),
    }))
  );

  const channelsSent: Array<"EMAIL" | "WHATSAPP"> = [];
  const deliveryErrors: Error[] = [];

  if (channels.shouldEmail) {
    try {
      await emailInvoice({
        to: String(customer?.email),
        invoiceNumber: invoice.invoiceNumber,
        pdfBuffer: resolvedPdfBuffer,
        businessName: business.businessName,
        paymentLink,
        supportingAttachments: supportingEmailAttachments,
      });
      channelsSent.push("EMAIL");
    } catch (error) {
      deliveryErrors.push(error as Error);
      log("error", "invoice_email_failed", { invoiceId: invoice.id, error });
    }
  }

  if (channels.shouldWhatsapp) {
    const toPhone = String(customer?.phone || "");
    const supportingPublicFiles = storedSupportingFiles.map((file) => ({
      ...file,
      publicUrl: `${env.appUrl}/api/invoice/public-file/${encodeURIComponent(publicLink.token)}?id=${encodeURIComponent(file.id)}`,
    }));
    try {
      await sendWhatsAppText({
        to: toPhone,
        body: `Invoice ${invoice.invoiceNumber} from ${business.businessName}.\nPay: ${paymentLink}`,
      });
      await sendWhatsAppDocument({
        to: toPhone,
        link: pdfPublicUrl,
        filename: `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`,
        caption: `Invoice ${invoice.invoiceNumber}`,
      });
      for (const file of supportingPublicFiles) {
        await sendWhatsAppDocument({
          to: toPhone,
          link: file.publicUrl,
          filename: file.filename,
          caption: `Supporting file for ${invoice.invoiceNumber}`,
        });
      }
      channelsSent.push("WHATSAPP");
    } catch (error) {
      deliveryErrors.push(error as Error);
      log("error", "invoice_whatsapp_delivery_failed", { invoiceId: invoice.id, error });
    }
  }

  if (channelsSent.length === 0) {
    const firstError = deliveryErrors[0] || new Error("Could not send invoice.");
    throw firstError;
  }

  await persistInvoiceDeliveryAttempt({
    invoiceId: invoice.id,
    currentMetadata: ((invoice as any).metadata as Record<string, unknown> | undefined) || {},
    status: "DELIVERED",
    channelsSent,
  });

  return { channelsSent };
}

export async function sendInvoiceEmailToCustomer(
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: unknown;
    tax?: any;
    discount?: any;
    total?: any;
    lateFeeAmount?: any;
    lateFeeTotalAccumulated?: any;
    pdfUrl?: string | null;
    metadata?: any;
    userId?: string;
  },
  business: BusinessProfileSnapshot,
  customer?: CustomerSnapshot | null,
  pdfBuffer?: Buffer
) {
  const recipient = customer?.email;
  if (!recipient) {
    log("info", "invoice_email_skipped_missing_customer", { invoiceNumber: invoice.invoiceNumber });
    return;
  }
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  await ensureInvoicePaymentLink({
    invoice,
    customerName: customer?.name ?? null,
    returnUrl: `${env.appUrl}/api/invoice/confirm/${encodeURIComponent(publicLink.token)}`,
  });
  const paymentLink = `${env.appUrl}/api/invoice/pay/${encodeURIComponent(publicLink.token)}`;
  const storedSupportingFiles = getInvoiceSupportingFiles((invoice as any).metadata || {});
  let resolvedBuffer: Buffer;
  try {
    const metadata = (invoice as any).metadata || {};
    const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
    const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
    const normalizedItems = normalizeInvoiceItems(invoice.items);
    const vatSettings = normalizeVatSettings({
      enabled: business.vatEnabled ?? false,
      rate: business.vatRate ?? 0,
      mode:
        String(business.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
          ? "inclusive"
          : "exclusive",
    });
    const totals = calculateTotalsFromAmounts(normalizedItems, vatSettings, Number(invoice.discount || 0));
    const lateFeeAmount = Number(invoice.lateFeeTotalAccumulated ?? invoice.lateFeeAmount ?? 0);
    const totalDue = Number(invoice.total ?? totals.total);
    const normalizedCurrency = normalizeCurrency(
      invoice.currency || business.defaultCurrency || "USD"
    );
    const directPaymentLink = `${env.appUrl}/api/invoice/pay/${encodeURIComponent(publicLink.token)}`;
    const paymentDetails = await resolveInvoicePaymentDetails(invoice.userId, paymentLink);
    resolvedBuffer = await buildInvoicePdfBuffer({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.generatedAt,
      dueDate,
      currency: normalizedCurrency,
      items: normalizedItems,
      totals,
      lateFeeAmount,
      totalDue,
      business,
      billTo: customer,
      paymentLink,
      directPaymentLink,
      paymentDetails,
      logoBuffer: await getStoredBusinessLogoBuffer(invoice.userId || ""),
      note: composeInvoiceNote(metadata),
      compliance: metadata?.compliance || null,
    });
  } catch (error) {
    log("warn", "invoice_email_pdf_fallback", { invoiceId: invoice.id, error });
    resolvedBuffer =
      pdfBuffer ||
      (await ensureInvoicePdf({
        invoice: invoice as any,
        business,
        billTo: customer,
      })).pdfBuffer;
  }
  const supportingAttachments = await Promise.all(
    storedSupportingFiles.map(async (file) => ({
      filename: file.filename,
      contentType: file.contentType,
      content: await readStoredInvoiceSupportingFile(file),
    }))
  );
  await emailInvoice({
    to: recipient,
    invoiceNumber: invoice.invoiceNumber,
    pdfBuffer: resolvedBuffer,
    businessName: business.businessName,
    paymentLink,
    supportingAttachments,
  });
}
