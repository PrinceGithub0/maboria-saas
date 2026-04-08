"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getPricingCurrencyOptions,
  isPricingDisplayCurrency,
  PRICING_CURRENCY_COOKIE,
} from "@/lib/pricing-currency";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import {
  getPricingPriceBookCurrencies,
  type PricingPriceBook,
} from "@/lib/pricing-price-book";
import { useLanguage } from "@/components/providers/language-provider";

const PRICING_CURRENCY_STORAGE_KEY = "maboria_pricing_currency";

type PricingCurrencyContextValue = {
  currency: string;
  currencyOptions: Array<{ code: string; label: string }>;
  priceBook: PricingPriceBook;
  setCurrency: (nextCurrency: string) => void;
};

const PricingCurrencyContext = createContext<PricingCurrencyContextValue | null>(null);

function normalizePricingCurrency(
  value: string | null | undefined,
  supportedCurrencies: readonly string[]
) {
  const normalized = normalizeCurrency(value || "");
  return isPricingDisplayCurrency(normalized, supportedCurrencies) ? normalized : null;
}

export function PricingCurrencyProvider({
  children,
  initialCurrency,
  priceBook,
}: {
  children: ReactNode;
  initialCurrency: string;
  priceBook: PricingPriceBook;
}) {
  const { language } = useLanguage();
  const supportedCurrencies = useMemo(
    () => getPricingPriceBookCurrencies(priceBook),
    [priceBook]
  );
  const [currency, setCurrencyState] = useState(
    normalizePricingCurrency(initialCurrency, supportedCurrencies) ||
      supportedCurrencies[0] ||
      "USD"
  );

  useEffect(() => {
    const normalized = normalizePricingCurrency(currency, supportedCurrencies);
    if (normalized) return;
    setCurrencyState(supportedCurrencies[0] || "USD");
  }, [currency, supportedCurrencies]);

  useEffect(() => {
    window.localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, currency);
    document.cookie = `${PRICING_CURRENCY_COOKIE}=${currency}; path=/; max-age=31536000; SameSite=Lax`;
  }, [currency]);

  const setCurrency = useCallback((nextCurrency: string) => {
    const normalized = normalizePricingCurrency(nextCurrency, supportedCurrencies);
    if (!normalized) return;
    setCurrencyState(normalized);
  }, [supportedCurrencies]);

  const value = useMemo<PricingCurrencyContextValue>(
    () => ({
      currency,
      currencyOptions: getPricingCurrencyOptions(
        currency,
        supportedCurrencies,
        language
      ),
      priceBook,
      setCurrency,
    }),
    [currency, language, priceBook, setCurrency, supportedCurrencies]
  );

  return (
    <PricingCurrencyContext.Provider value={value}>
      {children}
    </PricingCurrencyContext.Provider>
  );
}

export function usePricingCurrency() {
  const context = useContext(PricingCurrencyContext);
  if (!context) {
    throw new Error("usePricingCurrency must be used within PricingCurrencyProvider");
  }
  return context;
}
