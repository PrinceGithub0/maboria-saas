"use client";

import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { useParams } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";

type Ticket = {
  id: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
};

const parseTicketTitle = (rawTitle: string) => {
  const title = String(rawTitle || "");
  const match = title.match(/^\[(.+?)\]\s*(.+)$/);
  if (match) {
    return { category: match[1], subject: match[2] };
  }
  return { category: "Other", subject: title };
};

export default function SupportTicketDetailsPage() {
  const { language } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const params = useParams<{ id: string }>();
  const ticketId = String(params?.id || "");
  const { data: tickets, isLoading } = useSWR<Ticket[]>("/api/support", fetcher, {
    shouldRetryOnError: false,
  });

  const ticket = Array.isArray(tickets) ? tickets.find((item) => item.id === ticketId) : null;
  const parsed = parseTicketTitle(ticket?.title || "");

  const getStatusPill = (status: string) => {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Resolue"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme"),
        className:
          "bg-slate-100 text-slate-700 border-slate-300 font-bold dark:bg-slate-600/20 dark:text-slate-200 dark:border-slate-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {t("Support", "Support")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {t("Ticket details", "Details du ticket")}
          </h1>
        </div>
        <Link href="/dashboard/support/tickets" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
          {t("Back to all tickets", "Retour a tous les tickets")}
        </Link>
      </section>

      <Card
        className={`rounded-2xl border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-[#334155] dark:bg-[#1E293B] ${
          forceLight ? "!border-[#E5E7EB] !bg-white" : ""
        }`}
      >
        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading ticket...", "Chargement du ticket...")}</p>
        ) : !ticket ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Ticket not found.", "Ticket introuvable.")}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {parsed.category}
              </p>
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${getStatusPill(ticket.status).className}`}>
                {getStatusPill(ticket.status).label}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{parsed.subject}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
            </p>
            <div
              className={`rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-[#334155] dark:bg-slate-800/50 ${
                forceLight ? "!border-slate-200 !bg-white" : ""
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {ticket.message}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
