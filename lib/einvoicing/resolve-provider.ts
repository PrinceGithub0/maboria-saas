import crypto from "crypto";

import { cfdiProvider } from "@/lib/einvoicing/providers/cfdi";
import { dianProvider } from "@/lib/einvoicing/providers/dian";
import { dteProvider } from "@/lib/einvoicing/providers/dte";
import { myDataProvider } from "@/lib/einvoicing/providers/mydata";
import { myInvoisProvider } from "@/lib/einvoicing/providers/myinvois";
import { mdEFacturaProvider } from "@/lib/einvoicing/providers/md-efactura";
import { navOnlineInvoiceProvider } from "@/lib/einvoicing/providers/nav-online-invoice";
import { nfeProvider } from "@/lib/einvoicing/providers/nfe";
import { plannedGatewayProviders } from "@/lib/einvoicing/providers/planned-gateway";
import { getEInvoiceCountryProductionSignoff } from "@/lib/einvoicing/production-signoffs";
import { roEFacturaProvider } from "@/lib/einvoicing/providers/ro-efactura";
import { sdiProvider } from "@/lib/einvoicing/providers/sdi";
import { sunatProvider } from "@/lib/einvoicing/providers/sunat";
import { zatcaProvider } from "@/lib/einvoicing/providers/zatca";
import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { assessEInvoiceReadiness } from "@/lib/einvoicing/readiness";
import { getEInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";
import type {
  EInvoiceProviderAdapter,
  EInvoiceProviderContext,
  InvoiceEInvoicingSnapshot,
} from "@/lib/einvoicing/types";

const PROVIDERS: EInvoiceProviderAdapter[] = [
  myInvoisProvider,
  roEFacturaProvider,
  myDataProvider,
  zatcaProvider,
  sdiProvider,
  cfdiProvider,
  nfeProvider,
  dteProvider,
  dianProvider,
  sunatProvider,
  navOnlineInvoiceProvider,
  mdEFacturaProvider,
  ...plannedGatewayProviders,
];

const normalizeCountry = (value?: string | null) => String(value || "").trim().toUpperCase() || null;
const buildTransportSnapshot = (context: EInvoiceProviderContext) => ({
  transportDocumentAttached: Boolean(context.transportDocument?.documentBase64),
  transportDocumentFormat: context.transportDocument?.format ?? null,
  transportUuid: context.transportDocument?.uuid ?? null,
  transportHashPresent: Boolean(context.transportDocument?.invoiceHash || context.transportDocument?.digest),
});
const hasActiveConnection = (context: EInvoiceProviderContext, provider: EInvoiceProviderAdapter) =>
  Boolean(
    context.connection &&
      context.connection.provider === provider.key &&
      context.connection.status === "ACTIVE" &&
      context.connection.hasCredentials
  );

export function getEInvoiceProviders() {
  return [...PROVIDERS];
}

export function resolveEInvoiceProvider(context: EInvoiceProviderContext) {
  const sellerCountry = normalizeCountry(context.sellerCountry ?? context.compliance?.sellerCountry);
  if (!sellerCountry) return null;
  return PROVIDERS.find((provider) => provider.countries.includes(sellerCountry)) || null;
}

export function resolveInvoiceEInvoicingSnapshot(
  context: EInvoiceProviderContext
): InvoiceEInvoicingSnapshot {
  const sellerCountry = normalizeCountry(context.sellerCountry ?? context.compliance?.sellerCountry);
  const provider = resolveEInvoiceProvider(context);
  const compliance = context.compliance;
  const requiresEInvoicing = Boolean(compliance?.requiresEInvoicing);
  const requirement = requiresEInvoicing ? "REQUIRED" : provider ? "OPTIONAL" : "NOT_REQUIRED";
  const providerWarnings = provider?.buildWarnings?.(context) || [];
  const providerDefinition = provider ? getEInvoiceProviderDefinition(provider.key) : null;
  const rollout = getEInvoiceRolloutItem(sellerCountry);
  const productionSignoff = sellerCountry ? getEInvoiceCountryProductionSignoff(sellerCountry) : null;
  const providerCapabilityNote = providerDefinition?.capabilitySummary || rollout?.notes || null;
  const readiness = assessEInvoiceReadiness({
    providerDefinition,
    rollout,
    connection: context.connection,
    liveSubmissionImplemented: Boolean(providerDefinition?.liveSubmissionAvailable) && Boolean(provider?.submit),
    statusSyncImplemented: Boolean(provider?.getStatus),
    cancellationImplemented: Boolean(provider?.cancel),
  });
  const productionBlockers = Array.from(
    new Set([
      ...readiness.blockers,
      ...(requiresEInvoicing ? productionSignoff?.blockers || [] : []),
    ])
  );
  const productionReady =
    readiness.productionReady && (!requiresEInvoicing || Boolean(productionSignoff?.productionReady));
  const note =
    providerWarnings[0] ||
    (requiresEInvoicing && productionSignoff?.notes ? productionSignoff.notes : null) ||
    providerCapabilityNote ||
    null;

  if (!requiresEInvoicing && !provider) {
    return {
      country: sellerCountry,
      providerKey: null,
      documentFormat: null,
      requirement: "NOT_REQUIRED",
      status: "NOT_REQUIRED",
      supportsClearance: false,
      statusSyncAvailable: false,
      cancellationAvailable: false,
      productionReady: false,
      ...buildTransportSnapshot(context),
      submissionId: null,
      providerReference: null,
      submittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      lastSyncAt: null,
      lastError: null,
      payloadHash: null,
      warnings: [],
      productionBlockers: [],
      note: null,
    };
  }

  if (!provider) {
    return {
      country: sellerCountry,
      providerKey: null,
      documentFormat: null,
      requirement,
      status: "NOT_CONFIGURED",
      supportsClearance: false,
      statusSyncAvailable: false,
      cancellationAvailable: false,
      productionReady: false,
      ...buildTransportSnapshot(context),
      submissionId: null,
      providerReference: null,
      submittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      lastSyncAt: null,
      lastError: "No country-specific e-invoicing adapter is configured yet for this seller country.",
      payloadHash: null,
      warnings: [
        "This country has e-invoicing requirements, but no adapter is configured yet in the app.",
      ],
      productionBlockers: ["No country-specific e-invoicing adapter is configured yet for this seller country."],
      note: note || "Country-specific e-invoicing integration is not configured yet.",
    };
  }

  const connectionIsActive = hasActiveConnection(context, provider);
  const liveSubmissionImplemented =
    Boolean(providerDefinition?.liveSubmissionAvailable) && typeof provider.submit === "function";
  if (requiresEInvoicing && !connectionIsActive) {
    return {
      country: sellerCountry,
      providerKey: provider.key,
      documentFormat: provider.documentFormat,
      requirement,
      status: "NOT_CONFIGURED",
      supportsClearance: provider.supportsClearance,
      statusSyncAvailable: readiness.syncReady,
      cancellationAvailable: readiness.cancelReady,
      productionReady: false,
      ...buildTransportSnapshot(context),
      submissionId: null,
      providerReference: null,
      submittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      lastSyncAt: null,
      lastError: "An active e-invoicing connection with stored credentials is required before sending invoices for this country.",
      payloadHash: null,
      warnings: [
        ...providerWarnings,
        "This country requires e-invoicing, but the workspace has no active e-invoicing connection yet.",
        ...(providerCapabilityNote ? [providerCapabilityNote] : []),
      ],
      productionBlockers,
      note: note || "Connect the country e-invoicing provider before sending invoices here.",
    };
  }

  if (requiresEInvoicing && !liveSubmissionImplemented) {
    return {
      country: sellerCountry,
      providerKey: provider.key,
      documentFormat: provider.documentFormat,
      requirement,
      status: "NOT_CONFIGURED",
      supportsClearance: provider.supportsClearance,
      statusSyncAvailable: readiness.syncReady,
      cancellationAvailable: readiness.cancelReady,
      productionReady: false,
      ...buildTransportSnapshot(context),
      submissionId: null,
      providerReference: null,
      submittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      lastSyncAt: null,
      lastError:
        providerCapabilityNote ||
        "Live submission is not implemented yet for this country e-invoicing provider.",
      payloadHash: null,
      warnings: [
        ...providerWarnings,
        "Live submission to the country e-invoicing platform is not implemented yet for this provider.",
        ...(providerCapabilityNote ? [providerCapabilityNote] : []),
      ],
      productionBlockers,
      note: note || "Live submission is not implemented yet for this e-invoicing provider.",
    };
  }

  const payloadFingerprint = [
    provider.key,
    context.invoiceNumber || "",
    sellerCountry || "",
    normalizeCountry(context.buyerCountry ?? context.compliance?.buyerCountry) || "",
    context.currency || "",
    JSON.stringify(context.compliance || {}),
  ].join("|");

  return {
    country: sellerCountry,
    providerKey: provider.key,
    documentFormat: provider.documentFormat,
    requirement,
    status: "READY",
    supportsClearance: provider.supportsClearance,
    statusSyncAvailable: readiness.syncReady,
    cancellationAvailable: readiness.cancelReady,
    productionReady,
    ...buildTransportSnapshot(context),
    submissionId: null,
    providerReference: null,
    submittedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    lastSyncAt: null,
    lastError: null,
    payloadHash: crypto.createHash("sha256").update(payloadFingerprint).digest("hex"),
    warnings: [
      ...providerWarnings,
      ...(providerCapabilityNote ? [providerCapabilityNote] : []),
      ...productionBlockers,
      ...(!connectionIsActive && requirement === "OPTIONAL"
        ? ["Add a provider connection when you need live electronic submission for this country."]
        : []),
    ],
    productionBlockers,
    note:
      note ||
      (!connectionIsActive && requirement === "OPTIONAL"
        ? "Live electronic submission can be connected later for this country."
        : null),
  };
}
