import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Maboria Automation Platform",
  description: "AI-powered workflows, billing, and operations for modern teams.",
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
      {children}
    </div>
  );
}
