import assert from "node:assert/strict";

import { buildCustomerMetricsMap } from "@/lib/customers/intelligence";

const { metricsMap, netPaymentsByInvoice } = buildCustomerMetricsMap({
  displayCurrency: "EUR",
  invoices: [
    {
      id: "inv-open",
      customerId: "cust-1",
      total: 100,
      currency: "EUR",
      status: "SENT",
      generatedAt: new Date("2026-03-20T00:00:00.000Z"),
    },
    {
      id: "inv-failed",
      customerId: "cust-1",
      total: 60,
      currency: "EUR",
      status: "FAILED",
      generatedAt: new Date("2026-03-21T00:00:00.000Z"),
    },
  ],
  payments: [
    {
      invoiceId: "inv-open",
      amount: 40,
      amountOriginal: 40,
      currency: "EUR",
      currencyOriginal: "EUR",
      amountConverted: 40,
      currencyDefault: "EUR",
      status: "SUCCEEDED",
      metadata: null,
    },
    {
      invoiceId: "inv-open",
      amount: -10,
      amountOriginal: -10,
      currency: "EUR",
      currencyOriginal: "EUR",
      amountConverted: -10,
      currencyDefault: "EUR",
      status: "REFUNDED",
      metadata: null,
    },
  ],
});

const customerMetrics = metricsMap.get("cust-1");

assert.ok(customerMetrics, "metrics should exist for the customer");
assert.equal(customerMetrics?.invoiced, 160, "invoiced total should include all invoices");
assert.equal(customerMetrics?.paid, 30, "paid total should net refunds against successful payments");
assert.equal(
  customerMetrics?.outstanding,
  130,
  "outstanding total should subtract net payments and include failed invoices"
);
assert.equal(
  netPaymentsByInvoice.get("inv-open"),
  30,
  "invoice payment net should reflect partial refunds"
);
assert.equal(
  netPaymentsByInvoice.get("inv-failed") || 0,
  0,
  "failed invoices without payments should keep a zero payment net"
);

console.log("customer intelligence metrics passed");
