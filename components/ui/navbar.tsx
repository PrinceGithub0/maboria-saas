"use client";

import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardList,
  CreditCard,
  Flag,
  Globe2,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Receipt,
  Rocket,
  Search,
  Settings,
  Shield,
  Sparkles,
  UserRound,
  Users,
  Workflow,
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
import { translateNotificationMessage } from "@/lib/notifications/translate";
import { formatDateTimeDMY } from "@/lib/date";

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export function Navbar({ role }: { role?: string }) {
  const { data } = useSession();
  const pathname = usePathname();
  const resolvedRole = String(role || data?.user?.role || "").toUpperCase();
  const isAdminSession = pathname.startsWith("/admin") && ["OPS_ADMIN", "SUPER_ADMIN"].includes(resolvedRole);
  const isOpsAdmin = resolvedRole === "OPS_ADMIN";
  const { data: me } = useSWR(data ? "/api/user/me" : null, fetcher, {
    shouldRetryOnError: false,
  });
  const { data: subscriberNotifications, mutate: mutateSubscriberNotifications } = useSWR(
    !isAdminSession ? "/api/notifications" : null,
    fetcher,
    {
      shouldRetryOnError: false,
      fallbackData: [],
    }
  );
  const { data: adminNotifications, mutate: mutateAdminNotifications } = useSWR(
    isAdminSession ? "/api/admin/notifications?page=1&pageSize=15" : null,
    fetcher,
    {
      shouldRetryOnError: false,
    }
  );
  const { data: adminUnread } = useSWR(
    isAdminSession ? "/api/admin/notifications/unread-count" : null,
    fetcher,
    {
      shouldRetryOnError: false,
    }
  );
  const notifications = isAdminSession
    ? (Array.isArray((adminNotifications as any)?.items) ? (adminNotifications as any).items : [])
    : Array.isArray(subscriberNotifications)
      ? subscriberNotifications
      : [];
  const unread = isAdminSession
    ? Number((adminUnread as any)?.unreadCount || 0)
    : Array.isArray(subscriberNotifications)
      ? subscriberNotifications.filter((n: any) => !n.read).length
      : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const displayName = me?.name ?? data?.user?.name ?? "User";
  const displayEmail = me?.email ?? data?.user?.email ?? "";
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const labelMap = useMemo(
    () => ({
      Dashboard: t("Dashboard", "Tableau"),
      Website: t("Website", "Site"),
      Automations: t("Automations", "Automatisations"),
      AutomationOperations: t("Automation Operations", "Operations automatisation"),
      "AI Assistant": t("AI Assistant", "Assistant IA"),
      Inbox: t("Inbox", "Boîte de réception"),
      Team: t("Team", "équipe"),
      Invoices: t("Invoices", "Factures"),
      Customers: t("Customers", "Clients"),
      Subscription: t("Subscription", "Abonnement"),
      Reports: t("Reports", "Rapports"),
      Support: t("Support", "Support"),
      Settings: t("Settings", "Paramêtres"),
      Admin: t("Admin Dashboard", "Tableau admin"),
      AdminDashboard: t("Admin Dashboard", "Tableau admin"),
      "Admin Metrics": t("Admin Metrics", "Mesures admin"),
      "System Logs": t("System Logs", "Journaux système"),
      Users: t("Users", "Utilisateurs"),
      Notifications: t("Notifications", "Notifications"),
      "Automation Errors": t("Automation Errors", "Erreurs automatisation"),
      Prelaunch: "Prelaunch",
      "System Flags": t("System Flags", "Drapeaux système"),
      "Receipt Preview": t("Receipt Preview", "Aperçu recu"),
    }),
    [t]
  );
  const navItems = useMemo(
    () => [
      ...(!isOpsAdmin
        ? [
            { label: labelMap.Dashboard, href: "/dashboard", icon: LayoutDashboard },
            { label: labelMap.Website, href: "/", icon: Globe2 },
            { label: labelMap.Automations, href: "/dashboard/automations", icon: Workflow },
            { label: labelMap.AutomationOperations, href: "/dashboard/automation-operations", icon: ClipboardList },
            { label: labelMap["AI Assistant"], href: "/dashboard/assistant", icon: Sparkles },
            { label: labelMap.Inbox, href: "/dashboard/inbox", icon: Inbox },
            { label: labelMap.Team, href: "/dashboard/team", icon: Users },
            { label: labelMap.Invoices, href: "/dashboard/invoices", icon: Receipt },
            { label: labelMap.Customers, href: "/dashboard/customers", icon: UserRound },
            { label: labelMap.Subscription, href: "/dashboard/subscription", icon: CreditCard },
            { label: labelMap.Reports, href: "/dashboard/report", icon: BarChart3 },
            { label: labelMap.Support, href: "/dashboard/support", icon: LifeBuoy },
            { label: labelMap.Settings, href: "/dashboard/settings", icon: Settings },
          ]
        : []),
      ...(["OPS_ADMIN", "SUPER_ADMIN"].includes(resolvedRole)
        ? [
            { label: labelMap.AdminDashboard, href: "/admin", icon: Shield },
            { label: labelMap["Admin Metrics"], href: "/admin/metrics", icon: BarChart3 },
            { label: labelMap["System Logs"], href: "/admin/logs", icon: ClipboardList },
            { label: labelMap.Users, href: "/admin/users", icon: Shield },
            { label: labelMap.Support, href: "/admin/support", icon: LifeBuoy },
            { label: labelMap.Notifications, href: "/admin/notifications", icon: Bell },
            { label: labelMap["Automation Errors"], href: "/admin/automation/errors", icon: AlertTriangle },
            { label: labelMap.Prelaunch, href: "/admin/prelaunch", icon: Rocket },
            { label: labelMap["System Flags"], href: "/admin/system-flags", icon: Flag },
            { label: labelMap["Receipt Preview"], href: "/admin/receipt-preview", icon: Receipt },
          ]
        : []),
    ],
    [isOpsAdmin, resolvedRole, labelMap]
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
      ...(!isOpsAdmin
        ? [
            {
              id: "create-automation",
              label: t("Create automation", "Créer une automatisation"),
              description: t("Build a new flow", "Créer un nouveau flux"),
              href: "/dashboard/automations/new",
              icon: Workflow,
              group: t("Create", "Créer"),
              keywords: ["automation", "flow", "new"],
            },
            {
              id: "create-invoice",
              label: t("Create invoice", "Créer une facture"),
              description: t("Generate a new invoice", "Generer une nouvelle facture"),
              href: "/dashboard/invoices",
              icon: Receipt,
              group: t("Create", "Créer"),
              keywords: ["invoice", "billing"],
            },
            {
              id: "open-customers",
              label: t("Open customers", "Ouvrir les clients"),
              description: t("Manage business clients", "Gerer les clients"),
              href: "/dashboard/customers",
              icon: Users,
              group: t("Navigate", "Naviguer"),
              keywords: ["customer", "clients", "crm"],
            },
            {
              id: "open-ai",
              label: t("Open AI assistant", "Ouvrir l assistant IA"),
              description: t("Ask Maboria AI", "Demander a Maboria IA"),
              href: "/dashboard/assistant",
              icon: Sparkles,
              group: t("Create", "Créer"),
              keywords: ["ai", "assistant", "copilot"],
            },
            {
              id: "support",
              label: t("Contact support", "Contacter le support"),
              description: t("Submit a ticket", "Soumettre un ticket"),
              href: "/dashboard/support",
              icon: LifeBuoy,
              group: t("Help", "Aide"),
              keywords: ["support", "help", "ticket"],
            },
          ]
        : []),
    ];
  }, [isOpsAdmin, navItems, t]);
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
    if (isAdminSession) {
      await fetch(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_READ" }),
      });
      mutateAdminNotifications();
      return;
    }
    await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mutateSubscriberNotifications();
  };

  const handleCommandOpenChange = (open: boolean) => {
    setCommandOpen(open);
    if (!open) setCommandQuery("");
  };

  const markAllRead = async () => {
    const items = Array.isArray(notifications) ? notifications : [];
    const unreadItems = isAdminSession ? items.filter((item: any) => item.status === "UNREAD") : items.filter((item: any) => !item.read);
    if (!unreadItems.length) return;
    if (isAdminSession) {
      await fetch("/api/admin/notifications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MARK_READ",
          ids: unreadItems.map((item: any) => item.id),
        }),
      });
      mutateAdminNotifications();
      return;
    }
    await Promise.all(unreadItems.map((item: any) => markNotificationRead(item.id)));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        handleCommandOpenChange(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (commandQuery && !commandOpen) {
      setCommandOpen(true);
    }
  }, [commandQuery, commandOpen]);

  return (
    <>
      <header className="relative z-40 flex items-center justify-between border-b border-border bg-background px-3 py-2.5 backdrop-blur lg:px-5 overflow-visible max-md:mx-3 max-md:mt-2.5 max-md:rounded-[20px] max-md:border max-md:bg-background max-md:shadow-[0_10px_24px_rgba(15,23,42,0.1)]">
        <div className="flex flex-1 items-center gap-2.5">
          <button
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label={t("Toggle navigation", "Afficher la navigation", "Navigation umschalten", "Alternar navegacion", "Alternar navegacao")}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <div className="relative hidden w-72 lg:block">
            <div
              className="flex w-full items-center gap-2 rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-muted/80"
              onClick={() => handleCommandOpenChange(true)}
            >
              <Search className="h-4 w-4" />
              <input
                type="text"
                value={commandQuery}
                onFocus={() => setCommandOpen(true)}
                onChange={(e) => {
                  setCommandQuery(e.target.value);
                  setCommandOpen(true);
                }}
                placeholder={t(
                  "Search automations, invoices, payments",
                  "Rechercher automatisations, factures, paiements",
                  "Automatisierungen, Rechnungen, Zahlungen durchsuchen",
                  "Buscar automatizaciones, facturas, pagos",
                  "Pesquisar automações, faturas, pagamentos"
                )}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                aria-label={t("Search", "Rechercher", "Suchen", "Buscar", "Pesquisar")}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCommandOpenChange(true)}
            className="rounded-full border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label={t("Open command palette", "Ouvrir la palette de commandes", "Befehlspalette öffnen", "Abrir la paleta de comandos", "Abrir a paleta de comandos")}
          >
            <Search className="h-4 w-4" />
          </button>
          <LanguageSwitcher value={language} onChange={setLanguage} />
          <ThemeSwitcher />
          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative rounded-full border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("Notifications", "Notifications", "Benachrichtigungen", "Notificaciónes", "Notificações")}
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
              <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-border bg-background shadow-2xl">
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
                          "flex w-full flex-col gap-1 px-4 py-2.5 text-left text-sm transition",
                          isAdminSession ? (item.status === "UNREAD" ? "bg-indigo-500/10" : "bg-background") : item.read ? "bg-background" : "bg-indigo-500/10"
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">
                          {isAdminSession
                            ? String(item.title || item.message || "Notification")
                            : translateNotificationMessage({ message: item.message, language })}
                        </span>
                        {isAdminSession ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">{String(item.message || "")}</span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeDMY(new Date(item.lastSeenAt || item.createdAt))}
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
            <p className="text-sm font-semibold leading-tight text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{displayEmail}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">{t("Logout", "Se deconnecter")}</span>
          </Button>
        </div>
      </header>
      <CommandPalette
        open={commandOpen}
        onOpenChange={handleCommandOpenChange}
        items={commandItems}
        initialQuery={commandQuery}
        onQueryChange={setCommandQuery}
      />
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
              aria-label={t("Close navigation", "Fermer la navigation", "Navigation schließen", "Cerrar navegación", "Fechar navegação")}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="relative z-10 h-full w-full max-w-full overflow-y-auto border-r border-border bg-background px-3 py-3.5 shadow-2xl sm:w-72 sm:max-w-[85%]"
            >
              <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-border bg-card">
                      <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
                    </div>
                    <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Maboria</p>
                    <p className="text-base font-semibold text-foreground">{t("Control", "Controle")}</p>
                  </div>
                </div>
                <button
                  className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={t("Close menu", "Fermer le menu", "Menü schließen", "Cerrar menú", "Fechar menu")}
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex flex-col gap-1.5 text-[13px]">
                {navItems.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-200 ${
                        active ? "bg-indigo-500/15 text-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
                          active
                            ? "border-indigo-300/60 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                            : "border-border bg-card text-slate-600 group-hover:text-slate-900 dark:text-slate-300"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
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
