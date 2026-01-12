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
  Plus,
} from "lucide-react";
import { useSession } from "next-auth/react";
import useSWR from "swr";

type Props = { role?: string };

type NavItem = { href: string; label: string; icon: any; badge?: string };

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const { data } = useSession();
  const userRole = role || data?.user?.role;
  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const { data: notifications } = useSWR("/api/notifications", fetcher);
  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((item: any) => !item.read).length
    : 0;
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const unreadBadge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : undefined;
  const coreItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/", label: "Website", icon: Home },
    { href: "/dashboard/automations", label: "Automations", icon: Bot },
    { href: "/dashboard/runs", label: "Runs", icon: Activity },
    { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles },
    {
      href: "/dashboard/inbox",
      label: "Inbox",
      icon: MessageSquare,
      badge: unreadBadge,
    },
  ];
  const billingItems: NavItem[] = [
    { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
    { href: "/dashboard/subscription", label: "Subscription", icon: CreditCard },
    { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
    { href: "/dashboard/usage", label: "Reports", icon: Gauge },
  ];
  const supportItems: NavItem[] = [
    { href: "/dashboard/support", label: "Support", icon: Activity },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  const adminItems =
    userRole === "ADMIN"
      ? [
          { href: "/admin", label: "Admin", icon: Users },
          { href: "/admin/metrics", label: "Admin Metrics", icon: Activity },
          { href: "/admin/logs", label: "System Logs", icon: LayoutDashboard },
          { href: "/admin/users", label: "Users", icon: Shield },
        ]
      : [];

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
        Billing
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
          Support & Settings
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
    <aside className="sticky top-0 hidden h-screen w-64 border-r border-border bg-background p-4 backdrop-blur lg:block">
      <div className="mb-6 flex items-center gap-2">
        <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border bg-card">
          <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
        </div>
        <div>
          <p className="text-sm text-slate-700 dark:text-muted-foreground">Maboria</p>
          <p className="text-lg font-semibold text-foreground">Control</p>
        </div>
      </div>
      <nav className="flex flex-col gap-4">
        {renderSection("Core", coreItems)}
        <div className="h-px bg-border/70" />
        {renderBillingSection()}
        {adminItems.length ? (
          <>
            <div className="h-px bg-border/70" />
            {renderSection("Admin", adminItems)}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
