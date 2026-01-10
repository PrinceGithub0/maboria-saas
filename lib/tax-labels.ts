type TaxLabel = {
  short: string;
  long: string;
};

const VAT_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
  "ZA",
]);

export function getTaxIdLabel(country?: string | null): TaxLabel {
  const code = (country || "").trim().toUpperCase();
  if (code === "NG") return { short: "TIN", long: "TIN" };
  if (VAT_COUNTRIES.has(code)) return { short: "VAT", long: "VAT" };
  return { short: "Tax ID", long: "Tax ID" };
}
