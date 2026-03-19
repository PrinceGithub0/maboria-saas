type InvoiceTotalsSource = {
  total?: unknown;
  tax?: unknown;
  discount?: unknown;
  lateFeeAmount?: unknown;
  lateFeeTotalAccumulated?: unknown;
  currency?: unknown;
};

export type InvoiceTotalsPayload = {
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  lateFee: number;
  baseTotal: number;
  totalDue: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function formatInvoiceTotals(source: InvoiceTotalsSource): InvoiceTotalsPayload {
  const totalDue = roundMoney(Math.max(0, toNumber(source.total)));
  const tax = roundMoney(Math.max(0, toNumber(source.tax)));
  const discount = roundMoney(Math.max(0, toNumber(source.discount)));
  const lateFee = roundMoney(
    Math.max(0, toNumber(source.lateFeeTotalAccumulated ?? source.lateFeeAmount))
  );
  const baseTotal = roundMoney(Math.max(0, totalDue - lateFee));
  const subtotal = roundMoney(Math.max(0, totalDue - tax - lateFee + discount));

  return {
    currency: String(source.currency || "USD").toUpperCase(),
    subtotal,
    tax,
    discount,
    lateFee,
    baseTotal,
    totalDue,
  };
}

export function withFormattedInvoiceTotals<T extends InvoiceTotalsSource>(
  invoice: T
): T & { totals: InvoiceTotalsPayload } {
  return {
    ...invoice,
    totals: formatInvoiceTotals(invoice),
  };
}
