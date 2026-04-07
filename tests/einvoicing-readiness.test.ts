import assert from "node:assert/strict";

import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { assessEInvoiceReadiness } from "@/lib/einvoicing/readiness";
import { getEInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";

function main() {
  const italy = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("IT_SDI"),
    rollout: getEInvoiceRolloutItem("IT"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["vatNumber", "submissionUrl", "statusUrl", "certificatePem", "privateKeyPem"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: false,
  });

  assert.equal(italy.syncReady, true);
  assert.equal(italy.cancelReady, false);
  assert.equal(italy.productionReady, false);
  assert.ok(italy.blockers.some((blocker) => blocker.includes("Cancellation support")));

  const sandboxConnection = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("BR_NFE"),
    rollout: getEInvoiceRolloutItem("BR"),
    connection: {
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentialKeys: ["cnpj", "submissionUrl"],
      lastValidatedAt: null,
      lastError: "Sandbox certificate mismatch",
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: false,
  });

  assert.equal(sandboxConnection.syncReady, false);
  assert.equal(sandboxConnection.productionReady, false);
  assert.ok(sandboxConnection.blockers.some((blocker) => blocker.includes("sandbox mode")));
  assert.ok(sandboxConnection.blockers.some((blocker) => blocker.includes("status sync endpoint")));
  assert.ok(sandboxConnection.blockers.some((blocker) => blocker.includes("Sandbox certificate mismatch")));

  const romania = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("RO_EFACTURA"),
    rollout: getEInvoiceRolloutItem("RO"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["clientId", "clientSecret", "redirectUri", "refreshToken", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });

  assert.equal(romania.syncReady, true);
  assert.equal(romania.cancelReady, true);
  assert.equal(romania.productionReady, true);

  const greece = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("MYDATA"),
    rollout: getEInvoiceRolloutItem("GR"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["aadeUserId", "subscriptionKey"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });

  assert.equal(greece.syncReady, true);
  assert.equal(greece.cancelReady, true);
  assert.equal(greece.productionReady, true);

  const saudi = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("ZATCA"),
    rollout: getEInvoiceRolloutItem("SA"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: [
        "tin",
        "portalUsername",
        "portalPassword",
        "otp",
        "csr",
        "csid",
        "privateKeyPem",
        "certificatePem",
        "binarySecurityToken",
        "binarySecurityTokenSecret",
        "complianceRequestId",
        "egsSerialNumber",
        "statusUrl",
        "cancelUrl",
      ],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });

  assert.equal(saudi.syncReady, true);
  assert.equal(saudi.cancelReady, true);
  assert.equal(saudi.productionReady, true);

  const italyReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("IT_SDI"),
    rollout: getEInvoiceRolloutItem("IT"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: [
        "vatNumber",
        "transmissionId",
        "recipientCode",
        "certificatePem",
        "privateKeyPem",
        "submissionUrl",
        "statusUrl",
        "cancelUrl",
      ],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });

  assert.equal(italyReady.syncReady, true);
  assert.equal(italyReady.cancelReady, true);
  assert.equal(italyReady.productionReady, true);

  const mexico = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("MX_CFDI"),
    rollout: getEInvoiceRolloutItem("MX"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: [
        "rfc",
        "csdCertificatePem",
        "csdPrivateKeyPem",
        "csdPrivateKeyPassword",
        "pacUrl",
        "pacStatusUrl",
        "pacCancelUrl",
      ],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });

  assert.equal(mexico.syncReady, true);
  assert.equal(mexico.cancelReady, true);
  assert.equal(mexico.productionReady, true);

  const brazilReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("BR_NFE"),
    rollout: getEInvoiceRolloutItem("BR"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["cnpj", "certificatePem", "privateKeyPem", "uf", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(brazilReady.syncReady, true);
  assert.equal(brazilReady.cancelReady, true);
  assert.equal(brazilReady.productionReady, true);

  const chileReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("CL_DTE"),
    rollout: getEInvoiceRolloutItem("CL"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["rut", "siiUser", "siiPassword", "certificatePem", "privateKeyPem", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(chileReady.syncReady, true);
  assert.equal(chileReady.cancelReady, true);
  assert.equal(chileReady.productionReady, true);

  const colombiaReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("CO_DIAN"),
    rollout: getEInvoiceRolloutItem("CO"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["nit", "softwareId", "softwarePin", "certificatePem", "privateKeyPem", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(colombiaReady.syncReady, true);
  assert.equal(colombiaReady.cancelReady, true);
  assert.equal(colombiaReady.productionReady, true);

  const peruReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("PE_SUNAT"),
    rollout: getEInvoiceRolloutItem("PE"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["ruc", "solUser", "solPassword", "certificatePem", "privateKeyPem", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(peruReady.syncReady, true);
  assert.equal(peruReady.cancelReady, true);
  assert.equal(peruReady.productionReady, true);

  const hungaryReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("HU_NAV"),
    rollout: getEInvoiceRolloutItem("HU"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["taxNumber", "technicalUserName", "technicalUserPassword", "signingKey", "exchangeKey", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(hungaryReady.syncReady, true);
  assert.equal(hungaryReady.cancelReady, true);
  assert.equal(hungaryReady.productionReady, true);

  const moldovaReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("MD_EFACTURA"),
    rollout: getEInvoiceRolloutItem("MD"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["taxpayerCode", "username", "password", "certificatePem", "privateKeyPem", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(moldovaReady.syncReady, true);
  assert.equal(moldovaReady.cancelReady, true);
  assert.equal(moldovaReady.productionReady, true);

  const malaysiaReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("MYINVOIS"),
    rollout: getEInvoiceRolloutItem("MY"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["clientId", "clientSecret", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(malaysiaReady.syncReady, true);
  assert.equal(malaysiaReady.cancelReady, true);
  assert.equal(malaysiaReady.productionReady, true);

  const uaeReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("AE_EINVOICING"),
    rollout: getEInvoiceRolloutItem("AE"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["companyTaxId", "apiKey", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(uaeReady.syncReady, true);
  assert.equal(uaeReady.cancelReady, true);
  assert.equal(uaeReady.productionReady, true);

  const egyptReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("EG_EINVOICE"),
    rollout: getEInvoiceRolloutItem("EG"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["companyTaxId", "apiKey", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(egyptReady.syncReady, true);
  assert.equal(egyptReady.cancelReady, true);
  assert.equal(egyptReady.productionReady, true);

  const mauritiusReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("MU_MRA_EINVOICE"),
    rollout: getEInvoiceRolloutItem("MU"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["companyTaxId", "apiKey", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(mauritiusReady.syncReady, true);
  assert.equal(mauritiusReady.cancelReady, true);
  assert.equal(mauritiusReady.productionReady, true);

  const rwandaReady = assessEInvoiceReadiness({
    providerDefinition: getEInvoiceProviderDefinition("RW_EBM"),
    rollout: getEInvoiceRolloutItem("RW"),
    connection: {
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      credentialKeys: ["companyTaxId", "apiKey", "submissionUrl", "statusUrl", "cancelUrl"],
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      lastError: null,
    },
    liveSubmissionImplemented: true,
    statusSyncImplemented: true,
    cancellationImplemented: true,
  });
  assert.equal(rwandaReady.syncReady, true);
  assert.equal(rwandaReady.cancelReady, true);
  assert.equal(rwandaReady.productionReady, true);

  console.log("einvoicing readiness passed");
}

main();
