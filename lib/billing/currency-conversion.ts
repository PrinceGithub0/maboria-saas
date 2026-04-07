import "server-only";

type RecordMap = Record<string, unknown>;

type SourcePaymentLike = {
  amount?: unknown;
  currency?: unknown;
  originalAmount?: unknown;
  originalCurrency?: unknown;
  amountUsd?: unknown;
  amountNgn?: unknown;
  metadata?: unknown;
};

type ConversionResult = {
  amount: number;
  currency: string;
  fxRateUsed: number | null;
};

function asObject(value: unknown): RecordMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as RecordMap;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getNested(source: RecordMap, key: string): unknown {
  const direct = source[key];
  if (direct !== undefined) return direct;
  for (const value of Object.values(source)) {
    const obj = asObject(value);
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
}

function getConversionFromMetadata(metadata: unknown, defaultCurrency: string): ConversionResult | null {
  const map = asObject(metadata);
  if (!Object.keys(map).length) return null;

  const amountCandidates = [
    "amount_converted",
    "amountConverted",
    "convertedAmount",
    "defaultAmount",
    "amount_default",
  ];
  const currencyCandidates = [
    "currency_default",
    "defaultCurrency",
    "convertedCurrency",
    "currencyConverted",
  ];
  const fxCandidates = ["fx_rate_used", "fxRateUsed", "exchangeRate", "rate"];

  const amount = amountCandidates.map((key) => asNumber(getNested(map, key))).find((value) => value != null) ?? null;
  const currency =
    currencyCandidates
      .map((key) => String(getNested(map, key) ?? "").trim().toUpperCase())
      .find((value) => value.length > 0) ?? "";
  const fxRate = fxCandidates.map((key) => asNumber(getNested(map, key))).find((value) => value != null) ?? null;

  if (amount == null || !currency || currency !== defaultCurrency) return null;

  return {
    amount,
    currency,
    fxRateUsed: fxRate,
  };
}

export function convertToDefaultCurrency(input: {
  amountOriginal: number;
  currencyOriginal: string;
  defaultCurrency: string;
  invoicePaymentMetadata?: unknown;
  payment?: SourcePaymentLike | null;
}): ConversionResult {
  const amountOriginal = Number(input.amountOriginal || 0);
  const currencyOriginal = String(input.currencyOriginal || "").toUpperCase();
  const defaultCurrency = String(input.defaultCurrency || "USD").toUpperCase();

  if (currencyOriginal === defaultCurrency) {
    return {
      amount: amountOriginal,
      currency: defaultCurrency,
      fxRateUsed: 1,
    };
  }

  const invoiceMetaConversion = getConversionFromMetadata(input.invoicePaymentMetadata, defaultCurrency);
  if (invoiceMetaConversion) return invoiceMetaConversion;

  const payment = input.payment;
  if (payment) {
    const paymentMetaConversion = getConversionFromMetadata(payment.metadata, defaultCurrency);
    if (paymentMetaConversion) return paymentMetaConversion;

    const amountUsd = asNumber(payment.amountUsd);
    if (defaultCurrency === "USD" && amountUsd != null) {
      return {
        amount: amountUsd,
        currency: "USD",
        fxRateUsed: amountOriginal > 0 ? amountUsd / amountOriginal : null,
      };
    }

    const amountNgn = asNumber(payment.amountNgn);
    if (defaultCurrency === "NGN" && amountNgn != null) {
      return {
        amount: amountNgn,
        currency: "NGN",
        fxRateUsed: amountOriginal > 0 ? amountNgn / amountOriginal : null,
      };
    }

    const paymentCurrency = String(payment.currency || "").toUpperCase();
    const paymentAmount = asNumber(payment.amount);
    const originalCurrency = String(payment.originalCurrency || "").toUpperCase();
    const originalAmount = asNumber(payment.originalAmount);

    if (
      paymentAmount != null &&
      paymentCurrency === defaultCurrency &&
      originalCurrency === currencyOriginal &&
      (originalAmount == null || Math.abs(originalAmount - amountOriginal) < 0.01)
    ) {
      return {
        amount: paymentAmount,
        currency: defaultCurrency,
        fxRateUsed: amountOriginal > 0 ? paymentAmount / amountOriginal : null,
      };
    }
  }

  return {
    amount: amountOriginal,
    currency: defaultCurrency,
    fxRateUsed: null,
  };
}

