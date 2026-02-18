"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

type Ticket = {
  id: string;
  title: string;
  message: string;
  status: string;
  priority?: string;
  createdAt: string;
};

const parseTicketTitle = (rawTitle: string) => {
  const title = String(rawTitle || "");
  const match = title.match(/^\[(.+?)\]\s*(.+)$/);
  if (match) {
    return { category: match[1], subject: match[2] };
  }
  return { category: "Other", subject: title };
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
};

export default function SupportTicketsPage() {
  const { language } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data: tickets, isLoading } = useSWR<Ticket[]>("/api/support", fetcher, {
    shouldRetryOnError: false,
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED">("ALL");
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST">("NEWEST");

  const getTicketStatusPill = (ticketStatus: string) => {
    const normalized = String(ticketStatus || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Resolue"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme"),
        className:
          "bg-slate-100 text-slate-700 border-slate-300 font-bold dark:bg-slate-600/20 dark:text-slate-200 dark:border-slate-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  const filteredItems = useMemo(() => {
    const items = Array.isArray(tickets) ? tickets : [];
    const normalizedQuery = query.trim().toLowerCase();
    const byStatus = (ticket: Ticket) => {
      const current = String(ticket.status || "").toUpperCase();
      if (statusFilter === "ALL") return true;
      if (statusFilter === "PENDING") return current === "IN_PROGRESS" || current === "PENDING";
      if (statusFilter === "RESOLVED") return current === "RESOLVED";
      if (statusFilter === "CLOSED") return current === "CLOSED";
      if (statusFilter === "OPEN") return current === "OPEN";
      return true;
    };
    const byQuery = (ticket: Ticket) => {
      if (!normalizedQuery) return true;
      const parsed = parseTicketTitle(ticket.title);
      const haystack = `${parsed.category} ${parsed.subject} ${ticket.message || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    };
    const list = items.filter((ticket) => byStatus(ticket) && byQuery(ticket));
    list.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortBy === "NEWEST" ? -diff : diff;
    });
    return list;
  }, [tickets, query, sortBy, statusFilter]);

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {t("Support", "Support")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {t("All tickets", "Tous les tickets")}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("Full history of your support requests.", "Historique complet de vos demandes support.")}
          </p>
        </div>
        <Link href="/dashboard/support" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
          {t("Back to support", "Retour au support")}
        </Link>
      </section>

      <Card
        className={`rounded-2xl border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-[#334155] dark:bg-[#1E293B] ${
          forceLight ? "!border-[#E5E7EB] !bg-white" : ""
        }`}
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Search", "Recherche")}
            <input
              placeholder={t("Search tickets", "Rechercher des tickets")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:normal-case dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-white !text-[#0F172A]" : ""
              }`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Status", "Statut")}
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED")}
              style={forceLight ? { colorScheme: "light" } : undefined}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-white !text-[#0F172A]" : ""
              }`}
            >
              <option value="ALL" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("All", "Tous")}</option>
              <option value="OPEN" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Open", "Ouvert")}</option>
              <option value="PENDING" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Pending", "En attente")}</option>
              <option value="RESOLVED" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Resolved", "Resolue")}</option>
              <option value="CLOSED" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Closed", "Ferme")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Sort by", "Trier par")}
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "NEWEST" | "OLDEST")}
              style={forceLight ? { colorScheme: "light" } : undefined}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-white !text-[#0F172A]" : ""
              }`}
            >
              <option value="NEWEST" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Newest", "Plus recent")}</option>
              <option value="OLDEST" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Oldest", "Plus ancien")}</option>
            </select>
          </label>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading tickets...", "Chargement des tickets...")}</p>
        ) : filteredItems.length === 0 ? (
          <div
            className={`mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center dark:border-[#334155] dark:bg-slate-800/50 ${
              forceLight ? "!border-[#E5E7EB] !bg-white" : ""
            }`}
          >
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 dark:border-[#334155]">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("No support tickets yet", "Aucun ticket support pour le moment")}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "You haven't submitted any support requests. When you create a ticket, it will appear here.",
                "Vous n avez pas encore soumis de demande support. Quand vous creez un ticket, il apparaitra ici."
              )}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <Link
                href="/dashboard/support#submit-ticket"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                {t("Create a Support Ticket", "Creer un ticket support")}
              </Link>
              <Link href="/dashboard/support" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
                {t("Back to Support", "Retour au support")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((ticket) => {
              const statusPill = getTicketStatusPill(ticket.status);
              const parsed = parseTicketTitle(ticket.title);
              return (
                <Link
                  key={ticket.id}
                  href={`/dashboard/support/tickets/${ticket.id}`}
                  className={`block rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:bg-slate-50 dark:border-[#334155] dark:bg-slate-800/50 dark:hover:bg-slate-800/80 ${
                    forceLight ? "!border-[#E5E7EB] !bg-white hover:!bg-slate-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        {parsed.category}
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {parsed.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                        {ticket.message}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusPill.className}`}>
                      {statusPill.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
