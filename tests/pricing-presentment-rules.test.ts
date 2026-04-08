import assert from "node:assert/strict";

import {
  getCheckoutSupportedCurrencies,
  getPresentmentPricingCurrencies,
  hasPricingRateSupport,
} from "../lib/pricing-presentment";
import { getPlanPriceForIntervalLive } from "../lib/pricing-live";
import { pricingTableDualCurrency } from "../lib/pricing";

function run() {
  assert.deepEqual(
    getCheckoutSupportedCurrencies(["PAYSTACK", "FLUTTERWAVE"]),
    [
      "EGP",
      "EUR",
      "GBP",
      "GHS",
      "KES",
      "MZN",
      "NGN",
      "RWF",
      "TZS",
      "UGX",
      "USD",
      "XOF",
      "ZAR",
      "ZMW",
    ],
    "checkout-supported currencies should come from the enabled provider matrix"
  );

  assert.equal(
    hasPricingRateSupport("NGN", ["USD", "EUR", "GBP"]),
    true,
    "NGN should remain priceable via fallback rates even if the live snapshot omits it"
  );

  assert.equal(
    hasPricingRateSupport("JPY", ["USD", "EUR", "GBP"]),
    false,
    "currencies without snapshot coverage or fallback rates should not be considered priceable"
  );

  assert.deepEqual(
    getPresentmentPricingCurrencies({
      enabledProviders: ["PAYSTACK", "FLUTTERWAVE"],
      snapshotCurrencies: ["USD", "EUR", "GBP", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "ZMW", "MZN", "EGP"],
    }),
    [
      "EGP",
      "EUR",
      "GBP",
      "GHS",
      "KES",
      "MZN",
      "NGN",
      "RWF",
      "TZS",
      "UGX",
      "USD",
      "XOF",
      "ZAR",
      "ZMW",
    ],
    "presentment currencies should be the checkout-supported currencies we can actually price"
  );

  const legacyPlans = pricingTableDualCurrency();
  const legacyStarter = legacyPlans.find((plan) => plan.plan === "STARTER");

  assert.equal(
    legacyStarter?.ngn,
    61_000,
    "legacy dual-currency pricing should round NGN display amounts to clean bands"
  );
}

async function runAsync() {
  const ngnStarter = await getPlanPriceForIntervalLive("STARTER", "NGN", "monthly");
  const ngnBusiness = await getPlanPriceForIntervalLive("BUSINESS", "NGN", "monthly");

  assert.ok(
    typeof ngnStarter === "number" && ngnStarter % 100 === 0,
    "mid-range converted prices should round to a clean hundred increment"
  );

  assert.ok(
    typeof ngnBusiness === "number" && ngnBusiness % 1_000 === 0,
    "large converted prices should round to clean thousand-based amounts"
  );

  console.log("pricing presentment rules checks passed");
}

run();
runAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
