import assert from "node:assert/strict";
import { pickReminderInvoice } from "@/lib/customer-reminders";

const makeInvoice = (input: {
  id: string;
  status: "SENT" | "OVERDUE" | "FAILED";
  generatedAt: string;
  dueDate: string;
}) => ({
  id: input.id,
  invoiceNumber: `INV-${input.id}`,
  total: 100,
  lateFeeAmount: 0,
  lateFeeTotalAccumulated: 0,
  lateFeeAppliedAt: null,
  lastLateFeeAppliedAt: null,
  lateFeeCount: 0,
  lateFeeLocked: false,
  status: input.status,
  generatedAt: new Date(input.generatedAt),
  currency: "USD",
  metadata: { dueDate: input.dueDate },
});

assert.equal(
  pickReminderInvoice([
    makeInvoice({
      id: "failed-attempt",
      status: "FAILED",
      generatedAt: "2026-03-10T00:00:00.000Z",
      dueDate: "2026-03-12T00:00:00.000Z",
    }),
    makeInvoice({
      id: "new-sent",
      status: "SENT",
      generatedAt: "2026-03-20T00:00:00.000Z",
      dueDate: "2026-03-25T00:00:00.000Z",
    }),
    makeInvoice({
      id: "old-overdue",
      status: "OVERDUE",
      generatedAt: "2026-03-01T00:00:00.000Z",
      dueDate: "2026-03-05T00:00:00.000Z",
    }),
  ])?.id,
  "old-overdue",
  "overdue invoices should outrank newer sent invoices for reminders"
);

assert.equal(
  pickReminderInvoice([
    makeInvoice({
      id: "new-sent",
      status: "SENT",
      generatedAt: "2026-03-15T00:00:00.000Z",
      dueDate: "2026-03-18T00:00:00.000Z",
    }),
    makeInvoice({
      id: "failed-attempt",
      status: "FAILED",
      generatedAt: "2026-03-14T00:00:00.000Z",
      dueDate: "2026-03-17T00:00:00.000Z",
    }),
  ])?.id,
  "failed-attempt",
  "failed invoices should outrank sent invoices when no overdue invoice exists"
);

assert.equal(
  pickReminderInvoice([
    makeInvoice({
      id: "later-due",
      status: "OVERDUE",
      generatedAt: "2026-03-01T00:00:00.000Z",
      dueDate: "2026-03-10T00:00:00.000Z",
    }),
    makeInvoice({
      id: "earlier-due",
      status: "OVERDUE",
      generatedAt: "2026-03-02T00:00:00.000Z",
      dueDate: "2026-03-07T00:00:00.000Z",
    }),
  ])?.id,
  "earlier-due",
  "among same-status invoices, the earliest due date should win"
);

console.log("customer reminder selection passed");
