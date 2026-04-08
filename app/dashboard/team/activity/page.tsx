"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { formatDistanceToNow, format } from "date-fns";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import {
  getTeamActivityActionLabel,
  getTeamDateLocale,
  localizeTeamActivityMessage,
  localizeTeamServerMessage,
} from "@/lib/team/localization";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(json?.error || "Failed to load team activity") as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json;
};

type ActivityItem = {
  id: string;
  actionType: string;
  createdAt: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  actor?: { name?: string | null; email?: string | null } | null;
  target?: { name?: string | null; email?: string | null } | null;
};

export default function TeamActivityPage() {
  const { language, t } = useLanguage();
  const dateLocale = getTeamDateLocale(language);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1] || "";
  const { data, error, isLoading } = useSWR<{ items: ActivityItem[]; nextCursor?: string | null }>(
    `/api/team/activity?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    fetcher,
    { shouldRetryOnError: false }
  );

  const items = Array.isArray(data?.items) ? data.items : [];
  const nextCursor = data?.nextCursor || null;
  const pageNumber = cursorStack.length + 1;
  const hasItems = items.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("Team", "équipe", "Team", "Equipo", "Equipa")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">
            {t("Team Activity", "Activit? de l équipe", "Teamaktivität", "Actividad del equipo", "Atividade da equipa")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Full history of workspace invités, role changes, and member updates.",
              "Historique complet des invitations, changements de role et mises a jour des membres.",
              "Vollständiger Verlauf von Workspace-Einladungen, Rollenänderungen und Mitgliederaktualisierungen.",
              "Historial completo de invitaciónes, cambios de rol y actualizaciones de miembros del espacio de trabajo.",
              "Histórico completo de convites, alteracoes de papel e atualizacoes de membros do espa?o de trabalho."
            )}
          </p>
        </div>
        <Link href="/dashboard/team" className="text-sm font-medium text-blue-600 hover:text-blue-500">
          {t("Back to team", "Retour a l équipe", "Zurück zum Team", "Volver al equipo", "Voltar a equipa")}
        </Link>
      </div>

      {error ? (
        <Alert variant="error">
          {localizeTeamServerMessage(
            error.message,
            language,
            t(
              "Activity history unavailable.",
              "Historique indisponible.",
              "Aktivitätsverlauf nicht verfügbar.",
              "Historial de actividad no disponible.",
              "Histórico de atividade indisponível."
            )
          )}
        </Alert>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {hasItems
                ? t("Latest team events", "Derniers événements d équipe", "Neueste Teamereignisse", "Últimos eventos del equipo", "Últimos eventos da equipa")
                : t("Team event history", "Historique des événements d équipe", "Verlauf der Teamereignisse", "Historial de eventos del equipo", "Histórico de eventos da equipa")}
            </p>
            {hasItems ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Showing 20 events per page.", "Affiche 20 événements par page.", "20 Ereignisse pro Seite.", "Mostrando 20 eventos por página.", "A mostrar 20 eventos por página.")}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Recent workspace activity will appear here when invités, role changes, or access updates are recorded.",
                  "Les activités recentes apparaitront ici a mesure que votre équipe grandit.",
                  "Neuere Workspace-Aktivitäten erscheinen hier, wenn dein Team wachst.",
                  "La actividad reciente del espacio aparecera aquí a medida que crezca tu equipo.",
                  "A atividade recente do espa?o aparecera aquí a medida que a tua equipa crescer."
                )}
              </p>
            )}
          </div>
          {hasItems ? (
            <div className="inline-flex items-center rounded-full border border-slate-400 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-800 dark:border-border/60 dark:bg-muted/30 dark:text-muted-foreground">
              {t(`Page ${pageNumber}`, `Page ${pageNumber}`, `Seite ${pageNumber}`, `Pagina ${pageNumber}`, `Pagina ${pageNumber}`)}
            </div>
          ) : null}
        </div>

        <div className={`rounded-[28px] border border-slate-300 bg-gradient-to-b from-white via-white to-slate-50 px-5 dark:border-border/60 dark:from-background dark:via-background dark:to-muted/10 ${hasItems ? "py-2" : "py-3"}`}>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse py-5">
                <div className="flex gap-4">
                  <div className="mt-1 h-3 w-3 rounded-full bg-muted/80" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="mt-3 h-3 w-1/3 rounded bg-muted/80" />
                  </div>
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="mx-auto max-w-xl py-6 text-center">
              <p className="text-lg font-semibold text-foreground">
                {t("No team activity yet.", "Aucune activité d équipe pour le moment.", "Noch keine Teamaktivität.", "Todavia no hay actividad del equipo.", "Ainda não ha atividade da equipa.")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  "Invités, role changes, and member updates will appear here.",
                  "Les invitations, changements de role et mises a jour des membres apparaitront ici.",
                  "Einladungen, Rollenänderungen und Mitgliederaktualisierungen erscheinen hier.",
                  "Las invitaciónes, cambios de rol y actualizaciones de miembros apareceran aquí.",
                  "Os convites, alteracoes de papel e atualizacoes de membros aparecerao aquí."
                )}
              </p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute bottom-3 left-[5px] top-3 w-px bg-slate-400 dark:bg-border/60" aria-hidden="true" />
              <div className="space-y-1">
                {items.map((entry) => (
                  <div key={entry.id} className="relative py-5">
                    <span
                      className="absolute left-[-24px] top-7 h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.22)] dark:border-background dark:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
                      aria-hidden="true"
                    />
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-start">
                      <div className="min-w-0">
                        <div className="inline-flex items-center rounded-full bg-blue-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-900 dark:bg-blue-500/10 dark:text-blue-300">
                          {getTeamActivityActionLabel(entry.actionType, language)}
                        </div>
                        <p className="mt-3 text-sm font-medium leading-6 text-foreground">{localizeTeamActivityMessage(entry, language)}</p>
                      </div>
                      <div className="text-left text-xs text-muted-foreground md:text-right">
                        <p>{format(new Date(entry.createdAt), "PPP", { locale: dateLocale })}</p>
                        <p className="mt-1">{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: dateLocale })}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasItems ? (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setCursorStack((current) => current.slice(0, -1))}
              disabled={cursorStack.length === 0}
              className="h-10 rounded-xl border border-border/70 bg-background px-4 font-medium shadow-sm"
            >
              {t("Previous", "Precedent", "Zurück", "Anterior", "Anterior")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (nextCursor) setCursorStack((current) => [...current, nextCursor]);
              }}
              disabled={!nextCursor}
              className="h-10 rounded-xl border border-border/70 bg-background px-4 font-medium shadow-sm"
            >
              {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
