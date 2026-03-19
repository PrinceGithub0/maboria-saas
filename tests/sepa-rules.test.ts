import assert from "node:assert/strict";

import { isSepaCountry, isValidIban } from "../lib/payments/sepa";

function run() {
  assert.equal(isSepaCountry("DE"), true, "Germany should be treated as SEPA");
  assert.equal(isSepaCountry("GB"), true, "United Kingdom should be treated as SEPA");
  assert.equal(isSepaCountry("RS"), true, "Serbia should be treated as SEPA");
  assert.equal(isSepaCountry("AL"), true, "Albania should be treated as SEPA");
  assert.equal(isSepaCountry("US"), false, "United States should not be treated as SEPA");

  assert.equal(isValidIban("DE89370400440532013000"), true, "Known valid IBAN should pass");
  assert.equal(isValidIban("DE89370400440532013001"), false, "Invalid IBAN should fail");

  console.log("sepa rules checks passed");
}

run();
