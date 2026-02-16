"use client";
import { Sidebar } from "@/components/ui/sidebar";
import { Navbar } from "@/components/ui/navbar";
import { Announcement } from "@/components/ui/announcement";
import { TourOverlay } from "@/components/ui/tour";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bot, CreditCard, LayoutDashboard, Settings } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { useEffect, useState } from "react";

export function AppShell({
  children,
  role,
  announcement,
}: {
  children: React.ReactNode;
  role?: string;
  announcement?: string;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const showMobileNav = pathname.startsWith("/dashboard");

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <Announcement message={announcement} />
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar role={role} />
        <div className="flex min-h-screen flex-1 flex-col bg-background">
          <Navbar />
          <main className="flex-1 overflow-y-auto px-6 py-6 max-md:px-4 max-md:pt-4 max-md:pb-28 max-md:space-y-6 max-md:overflow-x-hidden">
            <div className="relative max-md:space-y-8">
              <div className="max-md:rounded-[32px] max-md:border max-md:border-border max-md:p-4 max-md:shadow-[0_22px_50px_rgba(15,23,42,0.12)] dark:max-md:shadow-[0_26px_60px_rgba(0,0,0,0.45)]">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
      {showMobileNav ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-[420px] items-center justify-between rounded-3xl bg-card/80 px-3 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.15)] max-md:mx-0 max-md:w-full max-md:max-w-none max-md:border max-md:border-border">
            {[
              { href: "/dashboard", label: t("Home", "Accueil"), Icon: LayoutDashboard },
              { href: "/dashboard/automations", label: t("Flows", "Flux"), Icon: Bot },
              { href: "/dashboard/payments", label: t("Pay", "Payer"), Icon: CreditCard },
              { href: "/dashboard/settings", label: t("Settings", "Parametres"), Icon: Settings },
            ].map(({ href, label, Icon }) => {
              const active = mounted && (pathname === href || pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  suppressHydrationWarning
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${
                    active ? "bg-indigo-500/15 text-foreground" : "text-slate-800 dark:text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      <TourOverlay />
    </>
  );
}
