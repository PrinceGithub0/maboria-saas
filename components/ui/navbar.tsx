"use client";

import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut, Menu, Search, User2 } from "lucide-react";
import { Button } from "./button";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Navbar() {
  const { data } = useSession();
  const { data: notifications } = useSWR("/api/notifications", fetcher, {
    shouldRetryOnError: false,
    fallbackData: [],
  });
  const unread = Array.isArray(notifications)
    ? notifications.filter((n: any) => !n.read).length
    : 0;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-slate-900 bg-slate-950/80 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex flex-1 items-center gap-3">
        <button
          className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:bg-slate-900 lg:hidden"
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative hidden w-80 lg:block">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            placeholder="Search automations, invoices, payments..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-10 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="relative rounded-full border border-slate-800 p-2 text-slate-400 hover:text-white"
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
          <p className="text-sm font-semibold text-white">{data?.user?.name ?? "User"}</p>
          <p className="text-xs text-slate-400">{data?.user?.email}</p>
        </div>
        <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">Logout</span>
        </Button>
      </div>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute left-0 right-0 top-14 z-40 border-b border-slate-900 bg-slate-950/95 px-4 py-3 shadow-xl lg:hidden"
          >
            <div className="mb-3 flex items-center gap-2 text-slate-200">
              <User2 className="h-4 w-4" />
              <div>
                <p className="text-sm font-semibold">{data?.user?.name ?? "User"}</p>
                <p className="text-xs text-slate-400">{data?.user?.email}</p>
              </div>
            </div>
            <nav className="flex flex-col gap-2 text-sm">
              {[
                { label: "Dashboard", href: "/dashboard" },
                { label: "Automations", href: "/dashboard/automations" },
                { label: "AI Assistant", href: "/dashboard/assistant" },
                { label: "Invoices", href: "/dashboard/invoices" },
                { label: "Subscription", href: "/dashboard/subscription" },
                { label: "Usage", href: "/dashboard/usage" },
                { label: "Settings", href: "/dashboard/settings" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-900"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
