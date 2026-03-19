"use client";
import { Sidebar } from "@/components/ui/sidebar";
import { Navbar } from "@/components/ui/navbar";
import { Announcement } from "@/components/ui/announcement";
import { TourOverlay } from "@/components/ui/tour";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HandCoins, LayoutDashboard, Settings, Workflow } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { useEffect, useState } from "react";

type AppShellImpersonation = {
  targetEmail?: string | null;
  targetName?: string | null;
  tenantName?: string | null;
};

export function AppShell({
  children,
  role,
  announcement,
  impersonation,
}: {
  children: React.ReactNode;
  role?: string;
  announcement?: string;
  impersonation?: AppShellImpersonation | null;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [stoppingImpersonation, setStoppingImpersonation] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(null);
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const showMobileNav = pathname.startsWith("/dashboard") || pathname.startsWith("/billing");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleExitImpersonation = async () => {
    if (stoppingImpersonation) return;
    setStoppingImpersonation(true);
    setImpersonationError(null);
    try {
      const response = await fetch("/api/admin/impersonation/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Unable to stop impersonation.");
      }
      window.location.reload();
    } catch (error) {
      setImpersonationError(error instanceof Error ? error.message : "Unable to stop impersonation.");
      setStoppingImpersonation(false);
    }
  };

  return (
    <>
      <Announcement message={announcement} />
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar role={role} />
        <div className="flex min-h-screen flex-1 flex-col bg-background">
          <Navbar role={role} />
          {impersonation ? (
            <div className="impersonation-banner border-b px-6 py-3 text-[13px] font-semibold">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {`Impersonating: ${impersonation.targetEmail || impersonation.targetName || "Tenant user"} (Tenant: ${impersonation.tenantName || "Unknown tenant"})`}
                </p>
                <button
                  type="button"
                  onClick={handleExitImpersonation}
                  disabled={stoppingImpersonation}
                  className="impersonation-banner-action rounded-md border px-3 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {stoppingImpersonation ? "Exiting..." : "Exit impersonation"}
                </button>
              </div>
              {impersonationError ? (
                <p className="mt-2 text-[12px] !text-rose-700 dark:!text-rose-300">{impersonationError}</p>
              ) : null}
            </div>
          ) : null}
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
              { href: "/dashboard/automations", label: t("Flows", "Flux"), Icon: Workflow },
              { href: "/billing/payments", label: t("Payments", "Paiements"), Icon: HandCoins },
              { href: "/dashboard/settings", label: t("Settings", "Parametres"), Icon: Settings },
            ].map(({ href, label, Icon }) => {
              const active = mounted && (pathname === href || pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  suppressHydrationWarning
                  className={`group flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] transition-all duration-200 ${
                    active ? "bg-indigo-500/15 text-foreground" : "text-slate-800 dark:text-muted-foreground"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
                      active
                        ? "border-indigo-300/60 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                        : "border-border bg-card text-slate-600 group-hover:text-slate-900 dark:text-slate-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
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
