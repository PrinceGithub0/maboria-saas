"use client";

import { signOut, useSession } from "next-auth/react";
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
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button } from "./button";
import useSWR from "swr";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { usePathname } from "next/navigation";
import Image from "next/image";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Navbar() {
  const { data } = useSession();
  const { data: me } = useSWR(data ? "/api/user/me" : null, fetcher, {
    shouldRetryOnError: false,
  });
  const { data: notifications } = useSWR("/api/notifications", fetcher, {
    shouldRetryOnError: false,
    fallbackData: [],
  });
  const unread = Array.isArray(notifications)
    ? notifications.filter((n: any) => !n.read).length
    : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const displayName = me?.name ?? data?.user?.name ?? "User";
  const displayEmail = me?.email ?? data?.user?.email ?? "";
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Website", href: "/", icon: Home },
    { label: "Automations", href: "/dashboard/automations", icon: Bot },
    { label: "AI Assistant", href: "/dashboard/assistant", icon: Sparkles },
    { label: "Invoices", href: "/dashboard/invoices", icon: FileText },
    { label: "Subscription", href: "/dashboard/subscription", icon: CreditCard },
    { label: "Usage", href: "/dashboard/usage", icon: Gauge },
    { label: "Support", href: "/dashboard/support", icon: Activity },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ...(data?.user?.role === "ADMIN"
      ? [
          { label: "Admin", href: "/admin", icon: Users },
          { label: "Admin Metrics", href: "/admin/metrics", icon: Activity },
          { label: "System Logs", href: "/admin/logs", icon: LayoutDashboard },
          { label: "Users", href: "/admin/users", icon: Shield },
        ]
      : []),
  ];
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

  return (
    <>
      <header className="relative z-40 flex items-center justify-between border-b border-border bg-background px-4 py-3 backdrop-blur lg:px-6 overflow-visible max-md:mx-4 max-md:mt-3 max-md:rounded-[28px] max-md:border max-md:bg-card max-md:shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
        <div className="flex flex-1 items-center gap-3">
          <button
            className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden w-80 lg:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search automations, invoices, payments..."
              className="w-full rounded-lg border border-input bg-muted px-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <button
            className="relative rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                {unread}
              </span>
            )}
          </button>
          <div className="hidden text-right lg:block">
            <p className="text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{displayEmail}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </header>
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
                    <p className="text-lg font-semibold text-foreground">Control</p>
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
