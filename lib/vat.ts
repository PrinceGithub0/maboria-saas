export const STANDARD_VAT_RATE = 7.5;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function applyVatToSubtotal(subtotal: number, rate = STANDARD_VAT_RATE) {
  const vat = roundMoney((subtotal * rate) / 100);
  const total = roundMoney(subtotal + vat);
  return { subtotal: roundMoney(subtotal), vat, total };
}

export function splitVatInclusive(total: number, rate = STANDARD_VAT_RATE) {
  if (!Number.isFinite(total) || total <= 0) {
    return { subtotal: 0, vat: 0, total: 0 };
  }
  const divisor = 1 + rate / 100;
  const subtotal = roundMoney(total / divisor);
  const vat = roundMoney(total - subtotal);
  return { subtotal, vat, total: roundMoney(total) };
}
