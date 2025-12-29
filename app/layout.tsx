import type { Metadata } from "next";
import "./globals.css";
import { SessionProviderWrapper } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layouts/app-shell";

export const metadata: Metadata = {
  title: "Maboria SaaS Platform",
  description:
    "Automation-first SaaS for invoices, payments, and AI-driven workflows",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

  const htmlClass = initialResolvedTheme === "dark" ? "dark" : "";

  const session = await getServerSession(authOptions);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={htmlClass}
      data-theme={initialTheme}
      data-resolved-theme={initialResolvedTheme}
    >
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <SessionProviderWrapper>
          <ThemeProvider initialTheme={initialTheme} initialResolvedTheme={initialResolvedTheme}>
            <AppShell
              role={session?.user?.role}
              announcement={process.env.NEXT_PUBLIC_ANNOUNCEMENT}
            >
              {children}
            </AppShell>
          </ThemeProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
