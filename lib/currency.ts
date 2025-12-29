const localeMap: Record<string, string> = {
  USD: "en-US",
  NGN: "en-NG",
  GHS: "en-GH",
  KES: "en-KE",
  ZAR: "en-ZA",
  XOF: "fr-SN",
  UGX: "en-UG",
  TZS: "sw-TZ",
  RWF: "rw-RW",
  ZMW: "en-ZM",
  MZN: "pt-MZ",
  EGP: "ar-EG",
  GBP: "en-GB",
  EUR: "en-IE",
};

export function formatCurrency(
  amount: number,
  currency: string,
  options: Intl.NumberFormatOptions & { locale?: string } = {}
) {
  const iso = (currency || "USD").toUpperCase();
  const { locale, ...fmtOptions } = options;
  const resolvedLocale = locale || localeMap[iso] || "en-US";
  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency: iso,
      ...fmtOptions,
    }).format(Number(amount) || 0);
  } catch {
    return `${iso} ${Number(amount || 0).toFixed(2)}`;
  }
}

export function formatCurrencyWithCode(
  amount: number,
  currency: string,
  options: Intl.NumberFormatOptions & { locale?: string } = {}
) {
  const iso = (currency || "USD").toUpperCase();
  const formatted = formatCurrency(amount, iso, options);
  return `${iso} ${formatted.replace(iso, "").trim()}`;
}
