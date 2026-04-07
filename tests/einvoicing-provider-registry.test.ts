import assert from "node:assert/strict";

import {
  getEInvoiceProviderDefinition,
  listEInvoiceProviderDefinitions,
} from "@/lib/einvoicing/provider-registry";

function main() {
  const definitions = listEInvoiceProviderDefinitions();
  const keys = definitions.map((definition) => definition.key);

  assert.equal(new Set(keys).size, definitions.length, "provider registry should not contain duplicate keys");

  const italy = getEInvoiceProviderDefinition("IT_SDI");
  assert.equal(italy?.completionStage, "PRODUCTION_READY");
  assert.equal(italy?.liveSubmissionAvailable, true);
  assert.equal(italy?.supportsStatusSync, true);
  assert.equal(italy?.credentialFields.some((field) => field.key === "vatNumber"), true);
  assert.equal(italy?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const brazil = getEInvoiceProviderDefinition("BR_NFE");
  assert.equal(brazil?.completionStage, "PRODUCTION_READY");
  assert.equal(brazil?.liveSubmissionAvailable, true);
  assert.equal(brazil?.supportsStatusSync, true);
  assert.equal(brazil?.credentialFields.some((field) => field.key === "cnpj" && field.required), true);
  assert.equal(brazil?.credentialFields.some((field) => field.key === "uf" && field.required), true);
  assert.equal(brazil?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const chile = getEInvoiceProviderDefinition("CL_DTE");
  assert.equal(chile?.completionStage, "PRODUCTION_READY");
  assert.equal(chile?.liveSubmissionAvailable, true);
  assert.equal(chile?.supportsStatusSync, true);
  assert.equal(chile?.credentialFields.some((field) => field.key === "siiUser" && field.required), true);
  assert.equal(chile?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const colombia = getEInvoiceProviderDefinition("CO_DIAN");
  assert.equal(colombia?.completionStage, "PRODUCTION_READY");
  assert.equal(colombia?.liveSubmissionAvailable, true);
  assert.equal(colombia?.supportsStatusSync, true);
  assert.equal(colombia?.credentialFields.some((field) => field.key === "softwareId" && field.required), true);
  assert.equal(colombia?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const hungary = getEInvoiceProviderDefinition("HU_NAV");
  assert.equal(hungary?.completionStage, "PRODUCTION_READY");
  assert.equal(hungary?.liveSubmissionAvailable, true);
  assert.equal(hungary?.supportsStatusSync, true);
  assert.equal(hungary?.credentialFields.some((field) => field.key === "taxNumber" && field.required), true);
  assert.equal(hungary?.credentialFields.some((field) => field.key === "technicalUserName" && field.required), true);
  assert.equal(hungary?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const malaysia = getEInvoiceProviderDefinition("MYINVOIS");
  assert.equal(malaysia?.completionStage, "PRODUCTION_READY");
  assert.equal(malaysia?.liveSubmissionAvailable, true);
  assert.equal(malaysia?.supportsStatusSync, true);
  assert.equal(malaysia?.credentialFields.some((field) => field.key === "clientId" && field.required), true);

  const romania = getEInvoiceProviderDefinition("RO_EFACTURA");
  assert.equal(romania?.completionStage, "PRODUCTION_READY");
  assert.equal(romania?.liveSubmissionAvailable, true);
  assert.equal(romania?.supportsStatusSync, true);
  assert.equal(romania?.credentialFields.some((field) => field.key === "refreshToken" && field.required), true);

  const greece = getEInvoiceProviderDefinition("MYDATA");
  assert.equal(greece?.completionStage, "PRODUCTION_READY");
  assert.equal(greece?.liveSubmissionAvailable, true);
  assert.equal(greece?.supportsStatusSync, true);

  const saudi = getEInvoiceProviderDefinition("ZATCA");
  assert.equal(saudi?.completionStage, "PRODUCTION_READY");
  assert.equal(saudi?.liveSubmissionAvailable, true);
  assert.equal(saudi?.supportsStatusSync, true);

  const mexico = getEInvoiceProviderDefinition("MX_CFDI");
  assert.equal(mexico?.completionStage, "PRODUCTION_READY");
  assert.equal(mexico?.liveSubmissionAvailable, true);
  assert.equal(mexico?.supportsStatusSync, true);
  assert.equal(mexico?.credentialFields.some((field) => field.key === "pacStatusUrl"), true);

  const peru = getEInvoiceProviderDefinition("PE_SUNAT");
  assert.equal(peru?.completionStage, "PRODUCTION_READY");
  assert.equal(peru?.liveSubmissionAvailable, true);
  assert.equal(peru?.supportsStatusSync, true);
  assert.equal(peru?.credentialFields.some((field) => field.key === "solUser" && field.required), true);
  assert.equal(peru?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const moldova = getEInvoiceProviderDefinition("MD_EFACTURA");
  assert.equal(moldova?.completionStage, "PRODUCTION_READY");
  assert.equal(moldova?.liveSubmissionAvailable, true);
  assert.equal(moldova?.supportsStatusSync, true);
  assert.equal(moldova?.credentialFields.some((field) => field.key === "username" && field.required), true);
  assert.equal(moldova?.credentialFields.some((field) => field.key === "submissionUrl"), true);

  const unitedArabEmirates = getEInvoiceProviderDefinition("AE_EINVOICING");
  assert.equal(unitedArabEmirates?.completionStage, "CANCEL_READY");
  assert.equal(unitedArabEmirates?.liveSubmissionAvailable, true);
  assert.equal(unitedArabEmirates?.supportsStatusSync, true);
  assert.equal(
    unitedArabEmirates?.credentialFields.some((field) => field.key === "companyTaxId" && field.required),
    true
  );
  assert.equal(
    unitedArabEmirates?.credentialFields.some((field) => field.key === "apiKey" && field.required),
    true
  );

  const belgium = getEInvoiceProviderDefinition("BE_PEPPOL");
  assert.equal(belgium?.completionStage, "CANCEL_READY");
  assert.equal(belgium?.liveSubmissionAvailable, true);
  assert.equal(belgium?.supportsStatusSync, true);

  const egypt = getEInvoiceProviderDefinition("EG_EINVOICE");
  assert.equal(egypt?.completionStage, "CANCEL_READY");
  assert.equal(egypt?.liveSubmissionAvailable, true);
  assert.equal(egypt?.supportsStatusSync, true);

  const mauritius = getEInvoiceProviderDefinition("MU_MRA_EINVOICE");
  assert.equal(mauritius?.completionStage, "CANCEL_READY");
  assert.equal(mauritius?.liveSubmissionAvailable, true);
  assert.equal(mauritius?.supportsStatusSync, true);

  const poland = getEInvoiceProviderDefinition("PL_KSEF");
  assert.equal(poland?.completionStage, "CANCEL_READY");
  assert.equal(poland?.liveSubmissionAvailable, true);
  assert.equal(poland?.supportsStatusSync, true);

  const rwanda = getEInvoiceProviderDefinition("RW_EBM");
  assert.equal(rwanda?.completionStage, "CANCEL_READY");
  assert.equal(rwanda?.liveSubmissionAvailable, true);
  assert.equal(rwanda?.supportsStatusSync, true);

  console.log("einvoicing provider registry passed");
}

main();
