import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProviderWrapper } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Navbar } from "@/components/ui/navbar";
import { Sidebar } from "@/components/ui/sidebar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Announcement } from "@/components/ui/announcement";
import { TourOverlay } from "@/components/ui/tour";
import { cookies } from "next/headers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      : "dark";
  const initialResolvedTheme =
    resolvedPref === "light" || resolvedPref === "dark"
      ? resolvedPref
      : initialTheme === "system"
        ? "dark"
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased`}
        suppressHydrationWarning
      >
        <SessionProviderWrapper>
          <ThemeProvider initialTheme={initialTheme} initialResolvedTheme={initialResolvedTheme}>
            <Announcement message={process.env.NEXT_PUBLIC_ANNOUNCEMENT} />
            <div className="flex min-h-screen">
              <Sidebar role={session?.user?.role} />
              <div className="flex min-h-screen flex-1 flex-col bg-background">
                <Navbar />
                <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
              </div>
            </div>
            <TourOverlay />
          </ThemeProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
