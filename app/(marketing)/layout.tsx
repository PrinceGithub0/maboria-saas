import type { Metadata } from "next";
import "../globals.css";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider, type Language } from "@/components/providers/language-provider";
import { SessionProviderWrapper } from "@/components/providers/session-provider";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

export const metadata: Metadata = {
  title: "Maboria Automation Platform",
  description: "AI-powered workflows, billing, and operations for modern teams.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Maboria Automation Platform",
    description: "AI-powered workflows, billing, and operations for modern teams.",
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

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
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
  const initialLanguage: Language = languageCookie === "fr" ? "fr" : "en";

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <SessionProviderWrapper>
        <ThemeProvider initialTheme={initialTheme} initialResolvedTheme={initialResolvedTheme}>
          <LanguageProvider initialLanguage={initialLanguage}>{children}</LanguageProvider>
        </ThemeProvider>
      </SessionProviderWrapper>
    </div>
  );
}
