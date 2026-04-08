import type { Metadata } from "next";
import "../globals.css";
import { cookies, headers } from "next/headers";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PricingCurrencyProvider } from "@/components/providers/pricing-currency-provider";
import { SessionProviderWrapper } from "@/components/providers/session-provider";
import { normalizeLanguage, type Language } from "@/lib/i18n";
import { getCountryFromRequestHeaders } from "@/lib/payments/payment-providers";
import {
  PRICING_CURRENCY_COOKIE,
  resolveInitialPricingCurrency,
} from "@/lib/pricing-currency";
import { buildPricingPriceBook } from "@/lib/pricing-live";
import { getPricingPriceBookCurrencies } from "@/lib/pricing-price-book";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

const marketingMetadataByLanguage: Record<Language, { title: string; description: string }> = {
  en: {
    title: "Maboria Automation Platform",
    description: "AI-powered workflows, billing, and operations for modern teams.",
  },
  fr: {
    title: "Plateforme d'automatisation Maboria",
    description: "Workflows, facturation et operations pilotes par IA pour les équipes modernes.",
  },
  de: {
    title: "Maboria Automatisierungsplattform",
    description: "KI-gestützte Workflows, Abrechnung und Betriebsabläufe für moderne Teams.",
  },
  es: {
    title: "Plataforma de automatización Maboria",
    description: "Flujos, facturación y operaciónes impulsados por IA para equipos modernos.",
  },
  pt: {
    title: "Plataforma de automação Maboria",
    description: "Fluxos, faturação e operações com IA para equipas modernas.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const languageCookie = cookieStore.get("maboria_language")?.value;
  const language = normalizeLanguage(languageCookie);
  const copy = marketingMetadataByLanguage[language];

  return {
    title: copy.title,
    description: copy.description,
    metadataBase: new URL(siteUrl),
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: "https://maboria.com",
      siteName: "Maboria",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Maboria",
        },
      ],
    },
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const themePref = cookieStore.get("maboria-theme")?.value;
  const resolvedPref = cookieStore.get("maboria-resolved-theme")?.value;
  const themeExplicit = cookieStore.get("maboria-theme-explicit")?.value === "1";

  const initialTheme =
    themeExplicit && (themePref === "light" || themePref === "dark" || themePref === "system")
      ? themePref
      : "light";
  const initialResolvedTheme =
    resolvedPref === "light" || resolvedPref === "dark"
      ? resolvedPref
      : initialTheme === "system"
        ? "light"
        : initialTheme;

  const languageCookie = cookieStore.get("maboria_language")?.value;
  const initialLanguage = normalizeLanguage(languageCookie);
  const pricingPriceBook = await buildPricingPriceBook();
  const initialPricingCurrency = resolveInitialPricingCurrency({
    cookieValue: cookieStore.get(PRICING_CURRENCY_COOKIE)?.value,
    countryCode: getCountryFromRequestHeaders(requestHeaders),
    acceptLanguage: requestHeaders.get("accept-language"),
    supportedCurrencies: getPricingPriceBookCurrencies(pricingPriceBook),
  });

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <SessionProviderWrapper>
        <ThemeProvider initialTheme={initialTheme} initialResolvedTheme={initialResolvedTheme}>
          <LanguageProvider initialLanguage={initialLanguage}>
            <PricingCurrencyProvider
              initialCurrency={initialPricingCurrency}
              priceBook={pricingPriceBook}
            >
              {children}
            </PricingCurrencyProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SessionProviderWrapper>
    </div>
  );
}
