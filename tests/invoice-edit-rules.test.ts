import assert from "node:assert/strict";

import { getIssuedInvoiceEditBlockingReason, hasMaterialInvoiceContentChanges } from "@/lib/invoice-editing";

const existingMetadata = {
  note: "Original note",
  dueDate: "2026-04-30T00:00:00.000Z",
  customer: {
    type: "BUSINESS",
    companyName: "Acme Ltd",
  },
  compliance: {
    buyerType: "B2B",
    supplyType: "SERVICES",
  },
};

assert.equal(
  hasMaterialInvoiceContentChanges({
    existingStatus: "SENT",
    existingInvoiceNumber: "INV-001",
    existingCustomerId: "cust_1",
    existingCurrency: "USD",
    existingItems: [{ name: "Retainer", quantity: 1, price: 100 }],
    existingDiscount: 0,
    existingPoNumber: "PO-1",
    existingGeneratedAt: new Date("2026-04-01T00:00:00.000Z"),
    existingMetadata,
    parsed: { status: "OVERDUE" },
  }),
  false,
  "status-only changes should not count as material content edits"
);

assert.equal(
  getIssuedInvoiceEditBlockingReason({
    existingStatus: "SENT",
    existingInvoiceNumber: "INV-001",
    existingCustomerId: "cust_1",
    existingCurrency: "USD",
    existingItems: [{ name: "Retainer", quantity: 1, price: 100 }],
    existingDiscount: 0,
    existingPoNumber: "PO-1",
    existingGeneratedAt: new Date("2026-04-01T00:00:00.000Z"),
    existingMetadata,
    parsed: {
      items: [{ name: "Retainer", quantity: 1, price: 120 }],
    },
  }),
  "Issued invoices can no longer be edited. Create a replacement invoice instead.",
  "sent invoices should reject material content changes"
);

assert.equal(
  getIssuedInvoiceEditBlockingReason({
    existingStatus: "FAILED",
    existingInvoiceNumber: "INV-001",
    existingCustomerId: "cust_1",
    existingCurrency: "USD",
    existingItems: [{ name: "Retainer", quantity: 1, price: 100 }],
    existingDiscount: 0,
    existingPoNumber: "PO-1",
    existingGeneratedAt: new Date("2026-04-01T00:00:00.000Z"),
    existingMetadata,
    parsed: {
      status: "SENT",
      invoiceNumber: "INV-001",
      customerId: "cust_1",
    },
  }),
  null,
  "failed invoices should allow a status-only resend attempt"
);

console.log("invoice edit rules passed");
