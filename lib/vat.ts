export const STANDARD_VAT_RATE = 7.5;

export type VatPricingMode = "exclusive" | "inclusive";

export type VatSettings = {
  enabled: boolean;
  rate: number;
  mode: VatPricingMode;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const clampVatRate = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 30) return 30;
  return value;
};

export function normalizeVatSettings(input?: Partial<VatSettings> | null): VatSettings {
  const enabled = Boolean(input?.enabled);
  const rate = clampVatRate(Number(input?.rate ?? 0));
  const mode = input?.mode === "inclusive" ? "inclusive" : "exclusive";
  return { enabled, rate, mode };
}

export function calculateVatFromAmount(
  baseAmount: number,
  settings: VatSettings
) {
  const normalized = normalizeVatSettings(settings);
  const amount = Number.isFinite(baseAmount) ? baseAmount : 0;
  if (!normalized.enabled || normalized.rate <= 0 || amount <= 0) {
    const total = roundMoney(amount);
    return { subtotal: total, vatAmount: 0, total, rate: normalized.rate };
  }

  if (normalized.mode === "inclusive") {
    const total = roundMoney(amount);
    const vatRaw = amount * (normalized.rate / (100 + normalized.rate));
    const vatAmount = roundMoney(vatRaw);
    const subtotal = roundMoney(total - vatAmount);
    return { subtotal, vatAmount, total, rate: normalized.rate };
  }

  const subtotalRaw = amount;
  const vatRaw = subtotalRaw * (normalized.rate / 100);
  const vatAmount = roundMoney(vatRaw);
  const total = roundMoney(subtotalRaw + vatAmount);
  const subtotal = roundMoney(total - vatAmount);
  return { subtotal, vatAmount, total, rate: normalized.rate };
}

export function applyVatToSubtotal(subtotal: number, rate = STANDARD_VAT_RATE) {
  const normalized = normalizeVatSettings({ enabled: true, rate, mode: "exclusive" });
  return calculateVatFromAmount(subtotal, normalized);
}

export function splitVatInclusive(total: number, rate = STANDARD_VAT_RATE) {
  const normalized = normalizeVatSettings({ enabled: true, rate, mode: "inclusive" });
  return calculateVatFromAmount(total, normalized);
}
