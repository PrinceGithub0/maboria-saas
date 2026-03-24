import assert from "node:assert/strict";
import { deriveInvoiceDisplayStatus, getInvoiceSummaryCounts } from "@/lib/invoice-refund-status";

assert.equal(
  deriveInvoiceDisplayStatus({
    status: "PAID",
    invoicePayments: [
      { status: "SUCCEEDED", amount: 100 },
      { status: "REFUNDED", amount: 100 },
    ],
  }),
  "REFUNDED",
  "fully refunded invoices should render as refunded"
);

assert.equal(
  deriveInvoiceDisplayStatus({
    status: "PAID",
    invoicePayments: [
      { status: "SUCCEEDED", amount: 100 },
      { status: "REFUNDED", amount: 25 },
    ],
  }),
  "PARTIALLY_REFUNDED",
  "partially refunded invoices should render as partially refunded"
);

assert.deepEqual(
  getInvoiceSummaryCounts([
    { status: "DRAFT" },
    { status: "SENT" },
    { status: "OVERDUE" },
    { status: "PAID", invoicePayments: [{ status: "SUCCEEDED", amount: 100 }] },
    {
      status: "PAID",
      invoicePayments: [
        { status: "SUCCEEDED", amount: 100 },
        { status: "REFUNDED", amount: 100 },
      ],
    },
    {
      status: "PAID",
      invoicePayments: [
        { status: "SUCCEEDED", amount: 100 },
        { status: "REFUNDED", amount: 25 },
      ],
    },
  ]),
  {
    total: 6,
    drafts: 1,
    unpaid: 2,
    overdue: 1,
    paid: 1,
    refunded: 1,
    partiallyRefunded: 1,
  },
  "invoice summary counts should follow refund-aware display statuses"
);

console.log("invoice display rules passed");
