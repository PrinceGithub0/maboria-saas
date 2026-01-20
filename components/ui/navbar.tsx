"use client";

import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";
import {
  Activity,
  Bell,
  Bot,
  CreditCard,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button } from "./button";
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useLanguage } from "@/components/providers/language-provider";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { CommandPalette, CommandItem } from "@/components/ui/command-palette";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Navbar() {
  const { data } = useSession();
  const { data: me } = useSWR(data ? "/api/user/me" : null, fetcher, {
    shouldRetryOnError: false,
  });
  const { data: notifications, mutate: mutateNotifications } = useSWR("/api/notifications", fetcher, {
    shouldRetryOnError: false,
    fallbackData: [],
  });
  const unread = Array.isArray(notifications)
    ? notifications.filter((n: any) => !n.read).length
    : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const displayName = me?.name ?? data?.user?.name ?? "User";
  const displayEmail = me?.email ?? data?.user?.email ?? "";
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const labelMap = useMemo(
    () => ({
      Dashboard: language === "fr" ? "Tableau" : "Dashboard",
      Website: language === "fr" ? "Site" : "Website",
      Automations: language === "fr" ? "Automatisations" : "Automations",
      Runs: language === "fr" ? "Executions" : "Runs",
      "AI Assistant": language === "fr" ? "Assistant IA" : "AI Assistant",
      Inbox: language === "fr" ? "Boite de reception" : "Inbox",
      Invoices: language === "fr" ? "Factures" : "Invoices",
      Subscription: language === "fr" ? "Abonnement" : "Subscription",
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
    }),
    [language]
  );
  const navItems = useMemo(
    () => [
      { label: labelMap.Dashboard, href: "/dashboard", icon: LayoutDashboard },
      { label: labelMap.Website, href: "/", icon: Home },
      { label: labelMap.Automations, href: "/dashboard/automations", icon: Bot },
      { label: labelMap.Runs, href: "/dashboard/runs", icon: Activity },
      { label: labelMap["AI Assistant"], href: "/dashboard/assistant", icon: Sparkles },
      { label: labelMap.Inbox, href: "/dashboard/inbox", icon: MessageSquare },
      { label: labelMap.Invoices, href: "/dashboard/invoices", icon: FileText },
      { label: labelMap.Subscription, href: "/dashboard/subscription", icon: CreditCard },
      { label: labelMap.Reports, href: "/dashboard/usage", icon: Gauge },
      { label: labelMap.Support, href: "/dashboard/support", icon: Activity },
      { label: labelMap.Settings, href: "/dashboard/settings", icon: Settings },
      ...(data?.user?.role === "ADMIN"
        ? [
            { label: labelMap.Admin, href: "/admin", icon: Users },
            { label: labelMap["Admin Metrics"], href: "/admin/metrics", icon: Activity },
            { label: labelMap["System Logs"], href: "/admin/logs", icon: LayoutDashboard },
            { label: labelMap.Users, href: "/admin/users", icon: Shield },
            { label: labelMap.Support, href: "/admin/support", icon: MessageSquare },
            { label: labelMap.Notifications, href: "/admin/notifications", icon: Bell },
            { label: labelMap["Automation Errors"], href: "/admin/automation/errors", icon: Bot },
            { label: labelMap.Prelaunch, href: "/admin/prelaunch", icon: Gauge },
            { label: labelMap["System Flags"], href: "/admin/system-flags", icon: Settings },
          ]
        : []),
    ],
    [data?.user?.role, labelMap]
  );
  const commandItems: CommandItem[] = useMemo(() => {
    const nav = navItems.map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      description: t("Navigate", "Naviguer"),
      href: item.href,
      icon: item.icon,
      group: t("Navigate", "Naviguer"),
      keywords: [item.label, item.href],
    }));
    return [
      ...nav,
      {
        id: "create-automation",
        label: t("Create automation", "Creer une automatisation"),
        description: t("Build a new flow", "Creer un nouveau flux"),
        href: "/dashboard/automations/new",
        icon: Bot,
        group: t("Create", "Creer"),
        keywords: ["automation", "flow", "new"],
      },
      {
        id: "create-invoice",
        label: t("Create invoice", "Creer une facture"),
        description: t("Generate a new invoice", "Generer une nouvelle facture"),
        href: "/dashboard/invoices",
        icon: FileText,
        group: t("Create", "Creer"),
        keywords: ["invoice", "billing"],
      },
      {
        id: "open-ai",
        label: t("Open AI assistant", "Ouvrir l assistant IA"),
        description: t("Ask Maboria AI", "Demander a Maboria IA"),
        href: "/dashboard/assistant",
        icon: Sparkles,
        group: t("Create", "Creer"),
        keywords: ["ai", "assistant", "copilot"],
      },
      {
        id: "support",
        label: t("Contact support", "Contacter le support"),
        description: t("Submit a ticket", "Soumettre un ticket"),
        href: "/dashboard/support",
        icon: Activity,
        group: t("Help", "Aide"),
        keywords: ["support", "help", "ticket"],
      },
    ];
  }, [navItems, t]);
  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };

  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return;
    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!notificationsOpen || typeof document === "undefined") return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notificationsOpen]);

  const markNotificationRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mutateNotifications();
  };

  const markAllRead = async () => {
    const items = Array.isArray(notifications) ? notifications : [];
    const unreadItems = items.filter((item: any) => !item.read);
    if (!unreadItems.length) return;
    await Promise.all(unreadItems.map((item: any) => markNotificationRead(item.id)));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header className="relative z-40 flex items-center justify-between border-b border-border bg-background px-4 py-3 backdrop-blur lg:px-6 overflow-visible max-md:mx-4 max-md:mt-3 max-md:rounded-[28px] max-md:border max-md:bg-background max-md:shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
        <div className="flex flex-1 items-center gap-3">
          <button
            className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden w-80 lg:block">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-muted/80"
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left text-sm">
                {language === "fr"
                  ? "Rechercher automatisations, factures, paiements"
                  : "Search automations, invoices, payments"}
              </span>
              <span className="hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground md:flex">
                Ctrl K
              </span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4" />
          </button>
          <LanguageSwitcher value={language} onChange={setLanguage} />
          <ThemeSwitcher />
          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                  {unread}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{t("Notifications", "Notifications")}</p>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    {t("Mark all read", "Tout marquer comme lu")}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {Array.isArray(notifications) && notifications.length > 0 ? (
                    notifications.map((item: any) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => markNotificationRead(item.id)}
                        className={clsx(
                          "flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition",
                          item.read ? "bg-background" : "bg-indigo-500/10"
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">{item.message}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      {t("No notifications yet.", "Aucune notification pour le moment.")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="hidden text-right lg:block">
            <p className="text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{displayEmail}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">{t("Logout", "Se deconnecter")}</span>
          </Button>
        </div>
      </header>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} items={commandItems} />
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              className="absolute inset-0 z-0 bg-slate-950/60 backdrop-blur-sm"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="relative z-10 h-full w-full max-w-full overflow-y-auto border-r border-border bg-background p-4 shadow-2xl sm:w-72 sm:max-w-[85%]"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border bg-card">
                    <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Maboria</p>
                    <p className="text-lg font-semibold text-foreground">{t("Control", "Controle")}</p>
                  </div>
                </div>
                <button
                  className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex flex-col gap-2 text-sm">
                {navItems.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${
                        active ? "bg-indigo-500/15 text-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
