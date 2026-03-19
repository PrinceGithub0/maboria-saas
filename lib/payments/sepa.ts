export const SEPA_COUNTRIES = [
  "AD",
  "AL",
  "AT",
  "BE",
  "BG",
  "CH",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GG",
  "GR",
  "HU",
  "IM",
  "IS",
  "IE",
  "IT",
  "JE",
  "LI",
  "LV",
  "LT",
  "LU",
  "MC",
  "MD",
  "ME",
  "MK",
  "MT",
  "NL",
  "NO",
  "PM",
  "PL",
  "PT",
  "RO",
  "RS",
  "SM",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
  "VA",
  "YT",
];

export function isSepaCountry(countryCode: string | undefined) {
  if (!countryCode) return false;
  return SEPA_COUNTRIES.includes(countryCode.toUpperCase());
}

export function normalizeIban(value: string) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(value: string) {
  const iban = normalizeIban(value);
  if (!/^[A-Z0-9]+$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (const char of rearranged) {
    if (char >= "A" && char <= "Z") {
      expanded += String(char.charCodeAt(0) - 55);
    } else {
      expanded += char;
    }
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const chunk = String(remainder) + expanded.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }
  return remainder === 1;
}
