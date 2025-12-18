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
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-slate-950 text-slate-50 antialiased`}
      >
        <SessionProviderWrapper>
          <ThemeProvider>
            <Announcement message={process.env.NEXT_PUBLIC_ANNOUNCEMENT} />
            <div className="flex min-h-screen">
              <Sidebar role={session?.user?.role} />
              <div className="flex min-h-screen flex-1 flex-col bg-slate-950">
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
