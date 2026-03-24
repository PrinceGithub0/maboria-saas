import assert from "node:assert/strict";

import { resolveFlutterwaveConfirmationTarget } from "../lib/payments/flutterwave-confirmation";

function run() {
  assert.deepEqual(
    resolveFlutterwaveConfirmationTarget({
      transactionId: " 12345 ",
      txRef: "tx_ref_1",
      fallbackReference: "fallback_ref",
    }),
    {
      mode: "transaction",
      value: "12345",
    }
  );

  assert.deepEqual(
    resolveFlutterwaveConfirmationTarget({
      transactionId: "",
      txRef: " tx_ref_2 ",
      fallbackReference: "fallback_ref",
    }),
    {
      mode: "reference",
      value: "tx_ref_2",
    }
  );

  assert.deepEqual(
    resolveFlutterwaveConfirmationTarget({
      transactionId: null,
      txRef: null,
      fallbackReference: " fallback_ref ",
    }),
    {
      mode: "reference",
      value: "fallback_ref",
    }
  );

  assert.equal(
    resolveFlutterwaveConfirmationTarget({
      transactionId: "",
      txRef: "",
      fallbackReference: "",
    }),
    null
  );

  console.log("flutterwave confirmation checks passed");
}

run();
