import type { Metadata } from "next";
import "../globals.css";
import { MarketingLanguageToggle } from "@/components/ui/marketing-language-toggle";

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

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <MarketingLanguageToggle />
      {children}
    </div>
  );
}
