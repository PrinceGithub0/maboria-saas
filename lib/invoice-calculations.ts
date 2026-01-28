import { calculateVatFromAmount, VatSettings } from "./vat";

export type InvoiceItemInput = {
  name: string;
  quantity: number;
  price: number;
};

export function calculateTotalsFromAmounts(
  items: InvoiceItemInput[],
  vatSettings: VatSettings,
  discountAmount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const baseAmount = subtotal - discountAmount;
  const vatTotals = calculateVatFromAmount(baseAmount, vatSettings);
  return {
    subtotal: vatTotals.subtotal,
    taxAmount: vatTotals.vatAmount,
    discountAmount,
    total: vatTotals.total,
    vatRate: vatTotals.rate,
    vatMode: vatSettings.mode,
    vatEnabled: vatSettings.enabled,
  };
}
