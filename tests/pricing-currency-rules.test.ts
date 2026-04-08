import assert from "node:assert/strict";

import {
  getPricingCurrencyOptions,
  getCurrencyFromCountryCode,
  isPricingDisplayCurrency,
  resolveInitialPricingCurrency,
} from "../lib/pricing-currency";
import { formatCurrencyOption } from "../lib/payments/currency-allowlist";

function run() {
  const supportedCurrencies = ["USD", "EUR", "NGN"];

  assert.equal(
    isPricingDisplayCurrency("EUR", supportedCurrencies),
    true,
    "supported currencies should remain selectable"
  );

  assert.equal(
    isPricingDisplayCurrency("JPY", supportedCurrencies),
    false,
    "currencies outside the live price book should not be selectable"
  );

  assert.deepEqual(
    getPricingCurrencyOptions("JPY", supportedCurrencies).map((option) => option.code),
    ["USD", "EUR", "NGN"],
    "currency options should come from the supported price-book list"
  );

  assert.equal(
    formatCurrencyOption("USD"),
    "USD · US Dollar",
    "currency labels should use code and name instead of country flags"
  );

  assert.equal(
    formatCurrencyOption("AUD"),
    "AUD · Australian Dollar",
    "newly supported currencies should render with proper names"
  );

  assert.equal(
    resolveInitialPricingCurrency({
      cookieValue: "JPY",
      preferredCurrency: "EUR",
      supportedCurrencies,
    }),
    "EUR",
    "unsupported cookie currencies should fall back to a supported explicit preference"
  );

  assert.equal(
    resolveInitialPricingCurrency({
      cookieValue: "JPY",
      preferredCurrency: "JPY",
      supportedCurrencies,
    }),
    "USD",
    "unsupported explicit currencies should fall back to the first supported pricing currency"
  );

  assert.equal(
    getCurrencyFromCountryCode("AU"),
    "AUD",
    "major single-country currencies should resolve from country code"
  );

  assert.equal(
    getCurrencyFromCountryCode("CM"),
    "XAF",
    "central African CFA countries should resolve to XAF"
  );

  assert.equal(
    getCurrencyFromCountryCode("JP"),
    "JPY",
    "additional checkout-supported countries should resolve to their local currency"
  );

  console.log("pricing currency rules checks passed");
}

run();
