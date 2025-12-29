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
} from "lucide-react";
import { useSession } from "next-auth/react";

type Props = { role?: string };

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const { data } = useSession();
  const userRole = role || data?.user?.role;
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/", label: "Website", icon: Home },
    { href: "/dashboard/automations", label: "Automations", icon: Bot },
    { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles },
    { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
    { href: "/dashboard/subscription", label: "Subscription", icon: CreditCard },
    { href: "/dashboard/usage", label: "Usage", icon: Gauge },
    { href: "/dashboard/support", label: "Support", icon: Activity },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ...(userRole === "ADMIN"
      ? [
          { href: "/admin", label: "Admin", icon: Users },
          { href: "/admin/metrics", label: "Admin Metrics", icon: Activity },
          { href: "/admin/logs", label: "System Logs", icon: LayoutDashboard },
          { href: "/admin/users", label: "Users", icon: Shield },
        ]
      : []),
  ];

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
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => {
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
      </nav>
    </aside>
  );
}
