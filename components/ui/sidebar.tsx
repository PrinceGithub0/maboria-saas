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
  GitBranch,
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
  const { t } = useLanguage();
  const userRole = role || data?.user?.role;
  const normalizedRole = String(userRole || "").trim().toUpperCase();
  const isPlatformStaff = normalizedRole === "OPS_ADMIN" || normalizedRole === "SUPER_ADMIN";
  const isSuperAdmin = normalizedRole === "SUPER_ADMIN";
  const isOpsAdmin = normalizedRole === "OPS_ADMIN";
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
  const { data: me } = useSWR(data ? "/api/user/me" : null, fetcher, {
    revalidateOnFocus: false,
  });
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const inboxUnreadCount = Number((inboxUnread as any)?.unreadCount || 0);
  const unreadBadge =
    inboxUnreadCount > 99 ? "99+" : inboxUnreadCount > 0 ? String(inboxUnreadCount) : undefined;
  const orgRole = String((me as any)?.orgRole || "").toLowerCase();
  const canManageWorkspaceSubscription = orgRole === "owner" || orgRole === "billing_admin";
  const canAccessBillingWorkspacePages =
    orgRole === "owner" || orgRole === "admin" || orgRole === "billing_admin";
  const labelMap = {
    Dashboard: t("Dashboard", "Tableau"),
    Website: t("Website", "Site"),
    Automations: t("Automations", "Automatisations"),
    Workflows: t("Workflows", "Workflows"),
    AutomationOperations: t("Automation Operations", "Operations automatisation"),
    "AI Assistant": t("AI Assistant", "Assistant IA"),
    Inbox: t("Inbox", "Boite de reception"),
    Team: t("Team", "équipe"),
    Invoices: t("Invoices", "Factures"),
    Customers: t("Customers", "Clients"),
    Subscription: t("Subscription", "Abonnement"),
    Payments: t("Payments", "Paiements"),
    Reports: t("Reports", "Rapports"),
    Support: t("Support", "Support"),
    Settings: t("Settings", "Paramêtres"),
    Admin: t("Admin", "Administration"),
    AdminDashboard: t("Admin Dashboard", "Tableau admin"),
    "Admin Metrics": t("Admin Metrics", "Mesures admin"),
    "System Logs": t("System Logs", "Journaux systeme"),
    "Audit Explorer": t("Audit Explorer", "Explorateur d audit"),
    "Events Explorer": t("Events Explorer", "Explorateur d evenements"),
    Users: t("Users", "Utilisateurs"),
    Tenants: t("Tenants", "Tenants"),
    Notifications: t("Notifications", "Notifications"),
    "Automation Errors": t("Automation Errors", "Erreurs automatisation"),
    Prelaunch: "Prelaunch",
    "System Flags": t("System Flags", "Drapeaux systeme"),
    "Receipt Preview": t("Receipt Preview", "Aperçu recu"),
    Core: t("Core", "Principal"),
    Billing: t("Billing", "Facturation"),
    SupportSettings: t("Support & Settings", "Support et paramêtres"),
    Overview: t("Overview", "Vue d ensemble"),
    Operations: t("Operations", "Operations"),
    SystemMonitoring: t("System Monitoring", "Surveillance systeme"),
    Controls: t("Controls", "Controles"),
    FinancialTools: t("Financial Tools", "Outils financiers"),
  };
  const coreItems: NavItem[] = isOpsAdmin
    ? []
    : [
        { href: "/dashboard", label: labelMap.Dashboard, icon: LayoutGrid },
        { href: "/", label: labelMap.Website, icon: Globe },
        { href: "/dashboard/automations", label: labelMap.Automations, icon: Workflow },
        { href: "/dashboard/workflows", label: labelMap.Workflows, icon: GitBranch },
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
  const billingItems: NavItem[] = isOpsAdmin
    ? []
    : [
        ...(canAccessBillingWorkspacePages ? [{ href: "/dashboard/invoices", label: labelMap.Invoices, icon: Receipt } as NavItem] : []),
        ...(canAccessBillingWorkspacePages ? [{ href: "/dashboard/customers", label: labelMap.Customers, icon: UsersRound } as NavItem] : []),
        ...(canManageWorkspaceSubscription ? [{ href: "/dashboard/subscription", label: labelMap.Subscription, icon: Repeat } as NavItem] : []),
        ...(canAccessBillingWorkspacePages ? [{ href: "/billing/payments", label: labelMap.Payments, icon: CreditCard } as NavItem] : []),
        { href: "/dashboard/report", label: labelMap.Reports, icon: BarChart3 },
      ];
  const supportItems: NavItem[] = isOpsAdmin
    ? []
    : [
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
          "group relative flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium tracking-[0.01em] transition-all duration-[180ms] ease-out",
          active
            ? "bg-slate-900/[0.05] text-slate-900 dark:bg-white/[0.08] dark:text-slate-100"
            : "text-slate-900 hover:bg-muted dark:text-muted-foreground"
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-all duration-[180ms] ease-out",
            active ? "bg-blue-500/85 opacity-100" : "opacity-0"
          )}
        />
        <span
          className={clsx(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgba(17,24,39,0.04)] transition-colors duration-[180ms] ease-out",
            active
              ? "text-blue-600 dark:text-blue-300"
              : clsx(
                  "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200",
                  item.zone === "admin" && "opacity-80"
                )
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={item.zone === "admin" ? 2.25 : 2.1} />
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
      <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        {title}
      </p>
      <div className="mt-1.5 flex flex-col gap-1">
        {items.map((item) => renderNavLink(item))}
      </div>
    </div>
  );

  const renderBillingSection = () => (
    <div>
      <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        {labelMap.Billing}
      </p>
      <div className="mt-1.5 flex flex-col gap-1">
        {billingItems.map((item) => renderNavLink(item))}
        <div className="my-1 h-px bg-border/50" />
        <p className="px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
          {labelMap.SupportSettings}
        </p>
        {supportItems.map((item) => renderNavLink(item))}
      </div>
    </div>
  );

  const renderAdminSection = () => (
    <div>
      <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        {labelMap.Admin}
      </p>
      <div className="mt-1.5 flex flex-col gap-2.5">
        {adminGroups.map((group) => (
          <div key={group.title}>
            <p className="px-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {group.title}
            </p>
            <div className="mt-1.5 flex flex-col gap-1">
              {group.items.map((item) => renderNavLink(item))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-col border-r border-border bg-background px-3 py-3.5 backdrop-blur lg:flex">
        <div className="mb-5 flex items-center gap-2">
          <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
          </div>
          <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-muted-foreground">Maboria</p>
          <p className="text-base font-semibold text-foreground">
            {t("Control", "Controle", "Kontrolle", "Control", "Controlo")}
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1">
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

