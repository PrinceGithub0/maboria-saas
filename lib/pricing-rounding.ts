export function roundPricingDisplayAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (value >= 50_000) {
    return Math.ceil(value / 1_000) * 1_000;
  }
  if (value >= 10_000) {
    return Math.ceil(value / 500) * 500;
  }
  if (value >= 1_000) {
    return Math.ceil(value / 100) * 100;
  }
  if (value >= 100) {
    return Math.ceil(value / 10) * 10;
  }

  return Math.ceil(value);
}
