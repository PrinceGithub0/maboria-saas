"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useLanguage } from "@/components/providers/language-provider";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Activity,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  Crown,
  Eye,
  Flag,
  Globe,
  Headset,
  Inbox,
  LayoutGrid,
  LineChart,
  Lock,
  Repeat,
  Receipt,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  UsersRound,
  Users,
  Workflow,
} from "lucide-react";

type Props = { role?: string };

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string; zone?: "admin" };

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { data } = useSession();
  const { language } = useLanguage();
  const userRole = role || data?.user?.role;
  const normalizedRole = String(userRole || "").trim().toUpperCase();
  const isPlatformStaff = normalizedRole === "OPS_ADMIN" || normalizedRole === "SUPER_ADMIN";
  const isSuperAdmin = normalizedRole === "SUPER_ADMIN";
  const fetcher = async (url: string) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };
  const { data: inboxUnread } = useSWR("/api/inbox/unified/unread-count", fetcher);
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const inboxUnreadCount = Number((inboxUnread as any)?.unreadCount || 0);
  const unreadBadge =
    inboxUnreadCount > 99 ? "99+" : inboxUnreadCount > 0 ? String(inboxUnreadCount) : undefined;
  const labelMap = {
    Dashboard: language === "fr" ? "Tableau" : "Dashboard",
    Website: language === "fr" ? "Site" : "Website",
    Automations: language === "fr" ? "Automatisations" : "Automations",
    AutomationOperations: language === "fr" ? "Operations automatisation" : "Automation Operations",
    "AI Assistant": language === "fr" ? "Assistant IA" : "AI Assistant",
    Inbox: language === "fr" ? "Boite de reception" : "Inbox",
    Team: language === "fr" ? "Equipe" : "Team",
    Invoices: language === "fr" ? "Factures" : "Invoices",
    Customers: language === "fr" ? "Clients" : "Customers",
    Subscription: language === "fr" ? "Abonnement" : "Subscription",
    Payments: language === "fr" ? "Paiements" : "Payments",
    Reports: language === "fr" ? "Rapports" : "Reports",
    Support: language === "fr" ? "Support" : "Support",
    Settings: language === "fr" ? "Parametres" : "Settings",
    Admin: language === "fr" ? "Administration" : "Admin",
    AdminDashboard: language === "fr" ? "Tableau admin" : "Admin Dashboard",
    "Admin Metrics": language === "fr" ? "Mesures admin" : "Admin Metrics",
    "System Logs": language === "fr" ? "Journaux systeme" : "System Logs",
    "Audit Explorer": language === "fr" ? "Explorateur d'audit" : "Audit Explorer",
    "Events Explorer": language === "fr" ? "Explorateur d'evenements" : "Events Explorer",
    Users: language === "fr" ? "Utilisateurs" : "Users",
    Tenants: language === "fr" ? "Tenants" : "Tenants",
    Notifications: language === "fr" ? "Notifications" : "Notifications",
    "Automation Errors": language === "fr" ? "Erreurs automatisation" : "Automation Errors",
    Prelaunch: language === "fr" ? "Prelaunch" : "Prelaunch",
    "System Flags": language === "fr" ? "Drapeaux systeme" : "System Flags",
    "Receipt Preview": language === "fr" ? "Apercu recu" : "Receipt Preview",
    Core: language === "fr" ? "Principal" : "Core",
    Billing: language === "fr" ? "Facturation" : "Billing",
    SupportSettings: language === "fr" ? "Support et parametres" : "Support & Settings",
    Overview: language === "fr" ? "Vue d'ensemble" : "Overview",
    Operations: language === "fr" ? "Operations" : "Operations",
    SystemMonitoring: language === "fr" ? "Surveillance systeme" : "System Monitoring",
    Controls: language === "fr" ? "Controles" : "Controls",
    FinancialTools: language === "fr" ? "Outils financiers" : "Financial Tools",
  };
  const coreItems: NavItem[] = [
    { href: "/dashboard", label: labelMap.Dashboard, icon: LayoutGrid },
    { href: "/", label: labelMap.Website, icon: Globe },
    { href: "/dashboard/automations", label: labelMap.Automations, icon: Workflow },
    { href: "/dashboard/automation-operations", label: labelMap.AutomationOperations, icon: Activity },
    { href: "/dashboard/assistant", label: labelMap["AI Assistant"], icon: Sparkles },
    {
      href: "/dashboard/inbox",
      label: labelMap.Inbox,
      icon: Inbox,
      badge: unreadBadge,
    },
    { href: "/dashboard/team", label: labelMap.Team, icon: Users },
  ];
  const billingItems: NavItem[] = [
    { href: "/dashboard/invoices", label: labelMap.Invoices, icon: Receipt },
    { href: "/dashboard/customers", label: labelMap.Customers, icon: UsersRound },
    { href: "/dashboard/subscription", label: labelMap.Subscription, icon: Repeat },
    { href: "/billing/payments", label: labelMap.Payments, icon: CreditCard },
    { href: "/dashboard/report", label: labelMap.Reports, icon: BarChart3 },
  ];
  const supportItems: NavItem[] = [
    { href: "/dashboard/support", label: labelMap.Support, icon: Headset },
    { href: "/dashboard/settings", label: labelMap.Settings, icon: Settings },
  ];
  const adminGroups =
    isPlatformStaff
      ? [
          {
            title: labelMap.Overview,
            items: [
              { href: "/admin", label: labelMap.AdminDashboard, icon: Shield, zone: "admin" },
              { href: "/admin/metrics", label: labelMap["Admin Metrics"], icon: LineChart, zone: "admin" },
            ] as NavItem[],
          },
          {
            title: labelMap.Operations,
            items: [
              { href: "/admin/users", label: labelMap.Users, icon: Users, zone: "admin" },
              { href: "/admin/tenants", label: labelMap.Tenants, icon: Building2, zone: "admin" },
              { href: "/admin/support", label: labelMap.Support, icon: Headset, zone: "admin" },
              { href: "/admin/notifications", label: labelMap.Notifications, icon: Bell, zone: "admin" },
            ] as NavItem[],
          },
          {
            title: labelMap.SystemMonitoring,
            items: [
              { href: "/admin/logs", label: labelMap["System Logs"], icon: ScrollText, zone: "admin" },
              { href: "/admin/events", label: labelMap["Events Explorer"], icon: Activity, zone: "admin" },
              ...(isSuperAdmin
                ? ([{ href: "/admin/audit-explorer", label: labelMap["Audit Explorer"], icon: Crown, zone: "admin" }] as NavItem[])
                : []),
              { href: "/admin/automation/errors", label: labelMap["Automation Errors"], icon: AlertTriangle, zone: "admin" },
            ] as NavItem[],
          },
          ...(isSuperAdmin
            ? ([
                {
                  title: labelMap.Controls,
                  items: [
                    { href: "/admin/system-flags", label: labelMap["System Flags"], icon: Flag, zone: "admin" },
                    { href: "/admin/prelaunch", label: labelMap.Prelaunch, icon: Rocket, zone: "admin" },
                  ] as NavItem[],
                },
                {
                  title: labelMap.FinancialTools,
                  items: [{ href: "/admin/receipt-preview", label: labelMap["Receipt Preview"], icon: Eye, zone: "admin" }] as NavItem[],
                },
              ] as Array<{ title: string; items: NavItem[] }>)
            : []),
        ]
      : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = mounted && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
        suppressHydrationWarning
        className={clsx(
          "group relative flex h-[46px] items-center gap-3 rounded-xl px-3 text-sm font-medium tracking-[0.01em] transition-all duration-[180ms] ease-out",
          active
            ? "bg-slate-900/[0.05] text-slate-900 dark:bg-white/[0.08] dark:text-slate-100"
            : "text-slate-900 hover:bg-muted dark:text-muted-foreground"
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "absolute left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-all duration-[180ms] ease-out",
            active ? "bg-blue-500/85 opacity-100" : "opacity-0"
          )}
        />
        <span
          className={clsx(
            "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[rgba(17,24,39,0.04)] transition-colors duration-[180ms] ease-out",
            active
              ? "text-blue-600 dark:text-blue-300"
              : clsx(
                  "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200",
                  item.zone === "admin" && "opacity-80"
                )
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={item.zone === "admin" ? 2.25 : 2.1} />
        </span>
        <span
          className={clsx(
            "flex-1",
            active ? "font-semibold text-slate-900 dark:text-slate-100" : undefined,
            item.href === "/admin/prelaunch" ? "inline-flex items-center gap-1.5" : undefined
          )}
        >
          {item.href === "/admin/prelaunch" ? (
            <Lock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" strokeWidth={2.4} />
          ) : null}
          {item.label}
        </span>
        {item.badge ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const renderSection = (title: string, items: NavItem[]) => (
    <div>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        {title}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item) => renderNavLink(item))}
      </div>
    </div>
  );

  const renderBillingSection = () => (
    <div>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        {labelMap.Billing}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {billingItems.map((item) => renderNavLink(item))}
        <div className="my-1 h-px bg-border/50" />
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          {labelMap.SupportSettings}
        </p>
        {supportItems.map((item) => renderNavLink(item))}
      </div>
    </div>
  );

  const renderAdminSection = () => (
    <div>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        {labelMap.Admin}
      </p>
      <div className="mt-2 flex flex-col gap-3">
        {adminGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {group.title}
            </p>
            <div className="mt-1.5 flex flex-col gap-2">
              {group.items.map((item) => renderNavLink(item))}
            </div>
          </div>
        ))}
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
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1">
        {renderSection(labelMap.Core, coreItems)}
        <div className="h-px bg-border/70" />
        {renderBillingSection()}
        {adminGroups.length ? (
          <>
            <div className="h-px bg-border/70" />
            {renderAdminSection()}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
