import assert from "node:assert/strict";

import { BUSINESS_CURRENCIES, isSupportedBusinessCurrency } from "../lib/business-currencies";
import { isSupportedCountry } from "../lib/business-profile";

function run() {
  assert.ok(BUSINESS_CURRENCIES.includes("USD"), "USD should remain available");
  assert.ok(BUSINESS_CURRENCIES.includes("AED"), "AED should be available for global businesses");
  assert.ok(BUSINESS_CURRENCIES.includes("JPY"), "JPY should be available for global businesses");

  assert.equal(isSupportedBusinessCurrency("aed"), true, "currency matching should be case-insensitive");
  assert.equal(isSupportedBusinessCurrency("ZZZ"), false, "unknown currency codes should be rejected");

  assert.equal(isSupportedCountry("US"), true, "United States should be supported");
  assert.equal(isSupportedCountry("DE"), true, "Germany should be supported");
  assert.equal(isSupportedCountry("NG"), true, "Nigeria should be supported");
  assert.equal(isSupportedCountry("ZZ"), false, "unknown country codes should be rejected");

  console.log("business profile options checks passed");
}

run();
