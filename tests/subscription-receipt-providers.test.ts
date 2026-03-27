import assert from "node:assert/strict";

import {
  SUPPORTED_SUBSCRIPTION_RECEIPT_PROVIDERS,
  isSubscriptionReceiptProvider,
} from "../lib/subscription-receipt";

function run() {
  assert.deepEqual(
    SUPPORTED_SUBSCRIPTION_RECEIPT_PROVIDERS,
    ["PAYSTACK", "FLUTTERWAVE", "STRIPE"],
    "confirmed subscription payments should support receipts for all current billing providers"
  );

  assert.equal(isSubscriptionReceiptProvider("PAYSTACK"), true);
  assert.equal(isSubscriptionReceiptProvider("FLUTTERWAVE"), true);
  assert.equal(isSubscriptionReceiptProvider("STRIPE"), true);
  assert.equal(isSubscriptionReceiptProvider("paypal"), false);

  console.log("subscription receipt provider checks passed");
}

run();
