"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { supportEmail, supportMailto } from "@/lib/support/contact";
import { getSubscriberSupportLastActivityAt } from "@/lib/support/subscriber-display";
import { getSupportDateLocale, localizeSupportCategory } from "@/lib/support/localization";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";

type Ticket = {
  id: string;
  title: string;
  message: string;
  status: string;
  priority?: string;
  createdAt: string;
  metadata?: {
    lastActivityAt?: string | null;
    [key: string]: unknown;
  } | null;
};

type TicketPage = {
  items: Ticket[];
  nextCursor: string | null;
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
  const { language, t } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "PENDING" | "CLOSED">("ALL");
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST">("NEWEST");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setCursor(null);
    setCursorStack([]);
  }, [debouncedQuery, statusFilter, sortBy]);

  const supportUrl = useMemo(() => {
    const params = new URLSearchParams({
      paged: "1",
      limit: "20",
      status: statusFilter,
      sort: sortBy,
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (cursor) params.set("cursor", cursor);
    return `/api/support?${params.toString()}`;
  }, [cursor, debouncedQuery, sortBy, statusFilter]);

  const { data: ticketPage, isLoading, error } = useSWR<TicketPage>(supportUrl, fetcher, {
    shouldRetryOnError: false,
  });

  const getTicketStatusPill = (ticketStatus: string) => {
    const normalized = String(ticketStatus || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme", "Geschlossen", "Cerrado", "Fechado"),
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 font-bold dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert", "Offen", "Abierto", "Aberto"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  const filteredItems = Array.isArray(ticketPage?.items) ? ticketPage.items : [];
  const ticketsCardClass = forceLight
    ? "rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
    : "rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(17,24,39,0.95))] p-6 shadow-[0_20px_46px_rgba(2,6,23,0.38)]";
  const ticketItemClass = forceLight
    ? "!border-[#E2E8F0] !bg-white hover:!bg-[#F8FAFC]"
    : "dark:border-slate-800 dark:bg-slate-950/45 dark:hover:bg-slate-900/70";
  const emptyStateClass = forceLight
    ? "!border-[#E2E8F0] !bg-white"
    : "dark:border-slate-800 dark:bg-slate-950/50";
  const paginationButtonClass =
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all";
  const paginationEnabledClass = forceLight
    ? "border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.06)] hover:border-indigo-200 hover:bg-[linear-gradient(180deg,#FFFFFF,#F8FAFC)] hover:text-indigo-700"
    : "border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500 hover:bg-slate-900";
  const paginationDisabledClass = forceLight
    ? "cursor-not-allowed border-slate-200 bg-white/75 text-slate-300 shadow-none"
    : "cursor-not-allowed border-slate-800 bg-slate-900/60 text-slate-500 shadow-none";

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {t("Support", "Support", "Support", "Soporte", "Suporte")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {t("All tickets", "Tous les tickets", "Alle Tickets", "Todos los tickets", "Todos os tickets")}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("Full history of your support requests.", "Historique complet de vos demandes support.", "Vollständiger Verlauf deiner Support-Anfragen.", "Historial completo de tus solicitudes de soporte.", "Histórico completo dos seus pedidos de suporte.")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("Our team replies from ", "Notre équipe repond depuis ", "Unser Team antwortet von ", "Nuestro equipo responde desde ", "A nossa equipa responde a partir de ")}
            <a href={supportMailto} className="font-medium hover:text-slate-800 dark:hover:text-slate-200">
              {supportEmail}
            </a>
          </p>
        </div>
        <Link href="/dashboard/support" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
          {t("Back to support", "Retour au support", "Zurück zum Support", "Volver al soporte", "Voltar ao suporte")}
        </Link>
      </section>

      <Card className={ticketsCardClass}>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Search", "Recherche", "Suche", "Buscar", "Pesquisar")}
            <input
              placeholder={t("Search tickets", "Rechercher des tickets", "Tickets suchen", "Buscar tickets", "Pesquisar tickets")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:normal-case dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-[#FFFFFF] !text-[#0F172A]" : ""
              }`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Status", "Statut", "Status", "Estado", "Estado")}
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | "OPEN" | "PENDING" | "CLOSED")}
              style={forceLight ? { colorScheme: "light" } : undefined}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-[#FFFFFF] !text-[#0F172A]" : ""
              }`}
            >
              <option value="ALL" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("All", "Tous", "Alle", "Todos", "Todos")}</option>
              <option value="OPEN" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Open", "Ouvert", "Offen", "Abierto", "Aberto")}</option>
              <option value="PENDING" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}</option>
              <option value="CLOSED" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Closed", "Ferme", "Geschlossen", "Cerrado", "Fechado")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {t("Sort by", "Trier par", "Sortieren nach", "Ordenar por", "Ordenar por")}
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "NEWEST" | "OLDEST")}
              style={forceLight ? { colorScheme: "light" } : undefined}
              className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 ${
                forceLight ? "!border-[#CBD5E1] !bg-[#FFFFFF] !text-[#0F172A]" : ""
              }`}
            >
              <option value="NEWEST" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Newest", "Plus recent", "Neueste", "Mas recientes", "Mais recentes")}</option>
              <option value="OLDEST" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Oldest", "Plus ancien", "Aelteste", "Mas antiguos", "Mais antigos")}</option>
            </select>
          </label>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading tickets...", "Chargement des tickets...", "Tickets werden geladen...", "Cargando tickets...", "A carregar tickets...")}</p>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {t(
              "We could not load your support tickets right now. Please refresh and try again.",
              "Nous n'avons pas pu charger vos tickets support pour le moment. Veuillez actualiser et réessayer.",
              "Deine Support-Tickets konnten derzeit nicht geladen werden. Bitte aktualisiere die Seite und versuche es erneut.",
              "No pudimos cargar tus tickets de soporte en este momento. Actualiza e intentalo de nuevo.",
              "Não foi poss?vel carregar os seus tickets de suporte neste momento. Atualize e tente novamente."
            )}
          </div>
        ) : filteredItems.length === 0 ? (
          <div
            className={`mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center ${emptyStateClass}`}
          >
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {debouncedQuery || statusFilter !== "ALL"
                ? t("No tickets match your filters", "Aucun ticket ne correspond a vos filtres", "Keine Tickets entsprechen deinen Filtern", "Ningun ticket coincide con tus filtros", "Nenhum ticket corresponde aos seus filtros")
                : t("No support tickets yet", "Aucun ticket support pour le moment", "Noch keine Support-Tickets", "Aún no hay tickets de soporte", "Ainda não ha tickets de suporte")}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {debouncedQuery || statusFilter !== "ALL"
                ? t(
                    "Try clearing your search or changing the selected status.",
                    "Essayez d effacer votre recherche ou de changer le statut selectionne.",
                    "Versuche, deine Suche zu leeren oder den gewahlten Status zu ?ndern.",
                    "Prueba a borrar tu busqueda o cambiar el estado seleccionado.",
                    "Tente limpar a pesquisa ou alterar o estado selecionado."
                  )
                : t(
                    "You haven't submitted any support requests. When you create a ticket, it will appear here.",
                    "Vous n'avez pas encore soumis de demande support. Quand vous creez un ticket, il apparaitra ici.",
                    "Du hast noch keine Support-Anfragen eingereicht. Wenn du ein Ticket erstellst, erscheint es hier.",
                    "Aún no has enviado solicitudes de soporte. Cuando crees un ticket, aparecera aqui.",
                    "Ainda não submeteu pedidos de suporte. Quando criar um ticket, ele aparecera aqui."
                  )}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {debouncedQuery || statusFilter !== "ALL" ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("ALL");
                    setSortBy("NEWEST");
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  {t("Clear filters", "Effacer les filtres", "Filter zurücksetzen", "Borrar filtros", "Limpar filtros")}
                </button>
              ) : (
                <Link
                  href="/dashboard/support#submit-ticket"
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  {t("Create a Support Ticket", "Creer un ticket support", "Support-Ticket erstellen", "Crear un ticket de soporte", "Criar um ticket de suporte")}
                </Link>
              )}
              <Link href="/dashboard/support" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
                {t("Back to Support", "Retour au support", "Zurück zum Support", "Volver al soporte", "Voltar ao suporte")}
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
                  className={`block rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:bg-slate-50 ${ticketItemClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        {localizeSupportCategory(parsed.category, language)}
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {parsed.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                        {ticket.message}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDistanceToNow(new Date(getSubscriberSupportLastActivityAt(ticket)), {
                          addSuffix: true,
                          locale: getSupportDateLocale(language),
                        })}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusPill.className}`}>
                      {statusPill.label}
                    </span>
                  </div>
                </Link>
              );
            })}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("Showing 20 tickets per page.", "Affichage de 20 tickets par page.", "Es werden 20 Tickets pro Seite angezeigt.", "Se muestran 20 tickets por p?gina.", "A mostrar 20 tickets por p?gina.")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
                    setCursorStack((prev) => prev.slice(0, -1));
                    setCursor(previousCursor);
                  }}
                  disabled={cursorStack.length === 0}
                  className={`${paginationButtonClass} ${
                    cursorStack.length === 0 ? paginationDisabledClass : paginationEnabledClass
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("Previous", "Precedent", "Vorherige", "Anterior", "Anterior")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!ticketPage?.nextCursor) return;
                    setCursorStack((prev) => [...prev, cursor ?? ""]);
                    setCursor(ticketPage.nextCursor);
                  }}
                  disabled={!ticketPage?.nextCursor}
                  className={`${paginationButtonClass} ${
                    !ticketPage?.nextCursor ? paginationDisabledClass : paginationEnabledClass
                  }`}
                >
                  {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
