import assert from "node:assert/strict";

import { merchantAccountCreateSchema } from "../lib/validators";
import { isProviderCurrency } from "../lib/payments/currency-allowlist";
import {
  resolvePayoutRequirements,
  sanitizePayoutDetails,
} from "../lib/payments/payout-requirements";

function run() {
  const valid = merchantAccountCreateSchema.safeParse({
    provider: "FLUTTERWAVE",
    businessName: "  Maboria Labs  ",
    businessEmail: "  owner@example.com  ",
    accountName: "  Nelson Mandela  ",
    accountNumber: " 0123456789 ",
    bankCode: " 044 ",
    country: " ng ",
    currency: " ngn ",
    phone: "  +2348012345678  ",
  });

  assert.equal(valid.success, true, "trimmed payout payload should pass schema");
  if (!valid.success) return;
  assert.equal(valid.data.businessName, "Maboria Labs");
  assert.equal(valid.data.businessEmail, "owner@example.com");
  assert.equal(valid.data.accountName, "Nelson Mandela");
  assert.equal(valid.data.country, "ng");
  assert.equal(valid.data.currency, "ngn");
  assert.equal(valid.data.phone, "+2348012345678");

  const blankBusinessName = merchantAccountCreateSchema.safeParse({
    provider: "FLUTTERWAVE",
    businessName: "   ",
    businessEmail: "owner@example.com",
    accountName: "Nelson Mandela",
    country: "NG",
    currency: "NGN",
    phone: "+2348012345678",
  });
  assert.equal(blankBusinessName.success, false, "blank business name should fail");

  const blankAccountName = merchantAccountCreateSchema.safeParse({
    provider: "FLUTTERWAVE",
    businessName: "Maboria Labs",
    businessEmail: "owner@example.com",
    accountName: "   ",
    country: "NG",
    currency: "NGN",
    phone: "+2348012345678",
  });
  assert.equal(blankAccountName.success, false, "blank account name should fail");

  assert.equal(isProviderCurrency("PAYSTACK", "NGN"), true, "Paystack should support NGN");
  assert.equal(isProviderCurrency("PAYSTACK", "USD"), false, "Paystack should not support USD");
  assert.equal(isProviderCurrency("FLUTTERWAVE", "EUR"), true, "Flutterwave should support EUR");

  const sepaRequirements = resolvePayoutRequirements({
    provider: "FLUTTERWAVE",
    country: "DE",
    currency: "EUR",
  });
  assert.equal(sepaRequirements.payoutType, "sepa", "EUR in SEPA countries should use SEPA route");
  assert.deepEqual(
    sepaRequirements.requiredFields,
    ["accountName", "iban", "bicSwift"],
    "SEPA route should require account name, IBAN, and BIC/SWIFT"
  );

  const usRequirements = resolvePayoutRequirements({
    provider: "FLUTTERWAVE",
    country: "US",
    currency: "USD",
  });
  assert.equal(usRequirements.supported, true, "Flutterwave US route should be supported");
  assert.equal(
    usRequirements.requiredFields.includes("routingNumber"),
    true,
    "US route should require routing number"
  );
  assert.equal(
    usRequirements.requiredFields.includes("bicSwift"),
    true,
    "US route should require SWIFT details"
  );

  const ghRequirements = resolvePayoutRequirements({
    provider: "FLUTTERWAVE",
    country: "GH",
    currency: "GHS",
  });
  assert.equal(
    ghRequirements.requiredFields.includes("branchCode"),
    true,
    "Ghana route should require branch code"
  );

  const paystackFrance = resolvePayoutRequirements({
    provider: "PAYSTACK",
    country: "FR",
    currency: "EUR",
  });
  assert.equal(paystackFrance.supported, false, "Paystack payouts should reject unsupported countries");

  const details = sanitizePayoutDetails({
    branchCode: " 001 ",
    routingNumber: " 021000021 ",
    ignored: "x",
  });
  assert.deepEqual(
    details,
    { branchCode: "001", routingNumber: "021000021" },
    "payout detail sanitizer should keep only known trimmed values"
  );

  console.log("payout settings rule checks passed");
}

run();
