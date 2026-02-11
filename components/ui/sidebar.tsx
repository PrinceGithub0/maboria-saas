"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";
import {
  Bot,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  Users,
  Gauge,
  Sparkles,
  Activity,
  Shield,
  MessageSquare,
  Bell,
} from "lucide-react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useLanguage } from "@/components/providers/language-provider";
import { useEffect, useRef } from "react";

type Props = { role?: string };

type NavItem = { href: string; label: string; icon: any; badge?: string };

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement | null>(null);
  const { data } = useSession();
  const { language } = useLanguage();
  const userRole = role || data?.user?.role;
  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const { data: notifications } = useSWR("/api/notifications", fetcher);
  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((item: any) => !item.read).length
    : 0;
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const unreadBadge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : undefined;
  const labelMap = {
    Dashboard: language === "fr" ? "Tableau" : "Dashboard",
    Website: language === "fr" ? "Site" : "Website",
    Automations: language === "fr" ? "Automatisations" : "Automations",
    Runs: language === "fr" ? "Executions" : "Runs",
    "AI Assistant": language === "fr" ? "Assistant IA" : "AI Assistant",
    Inbox: language === "fr" ? "Boite de reception" : "Inbox",
    Team: language === "fr" ? "Equipe" : "Team",
    Invoices: language === "fr" ? "Factures" : "Invoices",
    Subscription: language === "fr" ? "Abonnement" : "Subscription",
    Payments: language === "fr" ? "Paiements" : "Payments",
    Reports: language === "fr" ? "Rapports" : "Reports",
    Support: language === "fr" ? "Support" : "Support",
    Settings: language === "fr" ? "Parametres" : "Settings",
    Admin: language === "fr" ? "Administration" : "Admin",
    "Admin Metrics": language === "fr" ? "Mesures admin" : "Admin Metrics",
    "System Logs": language === "fr" ? "Journaux systeme" : "System Logs",
    Users: language === "fr" ? "Utilisateurs" : "Users",
    Notifications: language === "fr" ? "Notifications" : "Notifications",
    "Automation Errors": language === "fr" ? "Erreurs automatisation" : "Automation Errors",
    Prelaunch: language === "fr" ? "Prelaunch" : "Prelaunch",
    "System Flags": language === "fr" ? "Drapeaux systeme" : "System Flags",
    "Receipt Preview": language === "fr" ? "Apercu recu" : "Receipt Preview",
    Core: language === "fr" ? "Principal" : "Core",
    Billing: language === "fr" ? "Facturation" : "Billing",
    SupportSettings: language === "fr" ? "Support et parametres" : "Support & Settings",
  };
  const coreItems: NavItem[] = [
    { href: "/dashboard", label: labelMap.Dashboard, icon: LayoutDashboard },
    { href: "/", label: labelMap.Website, icon: Home },
    { href: "/dashboard/automations", label: labelMap.Automations, icon: Bot },
    { href: "/dashboard/runs", label: labelMap.Runs, icon: Activity },
    { href: "/dashboard/assistant", label: labelMap["AI Assistant"], icon: Sparkles },
    {
      href: "/dashboard/inbox",
      label: labelMap.Inbox,
      icon: MessageSquare,
      badge: unreadBadge,
    },
    { href: "/dashboard/team", label: labelMap.Team, icon: Users },
  ];
  const billingItems: NavItem[] = [
    { href: "/dashboard/invoices", label: labelMap.Invoices, icon: FileText },
    { href: "/dashboard/subscription", label: labelMap.Subscription, icon: CreditCard },
    { href: "/dashboard/payments", label: labelMap.Payments, icon: CreditCard },
    { href: "/dashboard/usage", label: labelMap.Reports, icon: Gauge },
  ];
  const supportItems: NavItem[] = [
    { href: "/dashboard/support", label: labelMap.Support, icon: Activity },
    { href: "/dashboard/settings", label: labelMap.Settings, icon: Settings },
  ];
  const adminItems =
    userRole === "ADMIN"
      ? [
          { href: "/admin", label: labelMap.Admin, icon: Users },
          { href: "/admin/metrics", label: labelMap["Admin Metrics"], icon: Activity },
          { href: "/admin/logs", label: labelMap["System Logs"], icon: LayoutDashboard },
          { href: "/admin/users", label: labelMap.Users, icon: Shield },
          { href: "/admin/support", label: labelMap.Support, icon: MessageSquare },
          { href: "/admin/notifications", label: labelMap.Notifications, icon: Bell },
          { href: "/admin/automation/errors", label: labelMap["Automation Errors"], icon: Bot },
          { href: "/admin/prelaunch", label: labelMap.Prelaunch, icon: Gauge },
          { href: "/admin/system-flags", label: labelMap["System Flags"], icon: Settings },
          { href: "/admin/receipt-preview", label: labelMap["Receipt Preview"], icon: FileText },
        ]
      : [];

  useEffect(() => {
    if (navRef.current) {
      navRef.current.scrollTop = 0;
    }
  }, [pathname]);

  const renderSection = (title: string, items: NavItem[]) => (
    <div>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-indigo-500/15 text-foreground"
                  : "text-slate-900 hover:bg-muted dark:text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );

  const renderBillingSection = () => (
    <div>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
        {labelMap.Billing}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {billingItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-indigo-500/15 text-foreground"
                  : "text-slate-900 hover:bg-muted dark:text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <div className="my-1 h-px bg-border/50" />
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
          {labelMap.SupportSettings}
        </p>
        {supportItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-indigo-500/15 text-foreground"
                  : "text-slate-900 hover:bg-muted dark:text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border bg-background p-4 backdrop-blur lg:flex">
        <div className="mb-6 flex items-center gap-2">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
          </div>
          <div>
          <p className="text-sm text-slate-700 dark:text-muted-foreground">Maboria</p>
          <p className="text-lg font-semibold text-foreground">
            {language === "fr" ? "Controle" : "Control"}
          </p>
        </div>
      </div>
      <nav ref={navRef} className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1">
        {renderSection(labelMap.Core, coreItems)}
        <div className="h-px bg-border/70" />
        {renderBillingSection()}
        {adminItems.length ? (
          <>
            <div className="h-px bg-border/70" />
            {renderSection(labelMap.Admin, adminItems)}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
