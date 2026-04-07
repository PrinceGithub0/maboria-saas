"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { CheckCircle2 } from "lucide-react";
import { AdminNotificationSeverity, AdminNotificationStatus, AdminNotificationType } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { useLanguage } from "@/components/providers/language-provider";
import {
  formatAdminRelativeTime,
  localizeAdminLogMessage,
  localizeAdminServerMessage,
  localizeAdminSeverity,
  localizeAdminStatus,
} from "@/lib/admin/localization";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  status: AdminNotificationStatus;
  severity: AdminNotificationSeverity;
  type: AdminNotificationType;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  snoozedUntil: string | null;
  metadata: Record<string, unknown> | null;
};

type ListResponse = {
  items: NotificationRow[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
  stats: { total7d: number; unread: number; critical24h: number; snoozed: number };
};

type DetailResponse = NotificationRow & {
  audits: Array<{ id: string; action: string; createdAt: string; actorAdmin: { name: string | null; email: string } }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as { error?: string }).error || `Request failed (${res.status})`));
  return json as T;
};

const statuses = ["ALL", "UNREAD", "READ", "ACKNOWLEDGED", "RESOLVED", "SNOOZED"] as const;
const severities = ["ALL", "CRITICAL", "WARNING", "INFO"] as const;
const types = ["ALL", "SYSTEM", "AUTOMATION", "SLA", "SUPPORT", "SECURITY", "BILLING", "INCIDENT"] as const;
const ranges = ["24h", "7d", "30d"] as const;
const STATUS_LABELS = {
  ALL: { en: "All statuses", fr: "Tous les statuts", de: "Alle Status", es: "Todos los estados", pt: "Todos os estados" },
  UNREAD: { en: "Unread", fr: "Non lu", de: "Ungelesen", es: "No leido", pt: "N?o lida" },
  READ: { en: "Read", fr: "Lu", de: "Gelesen", es: "Leida", pt: "Lida" },
  ACKNOWLEDGED: { en: "Acknowledged", fr: "Pris en compte", de: "Bestatigt", es: "Reconocida", pt: "Confirmada" },
  RESOLVED: { en: "Resolved", fr: "Resolue", de: "Gelost", es: "Resuelta", pt: "Resolvida" },
  SNOOZED: { en: "Snoozed", fr: "Reporte", de: "Zuruckgestellt", es: "Pospuesta", pt: "Adiada" },
} as const;
const SEVERITY_LABELS = {
  ALL: { en: "All severities", fr: "Toutes les severites", de: "Alle Schweregrade", es: "Todas las severidades", pt: "Todas as severidades" },
  CRITICAL: { en: "Critical", fr: "Critique", de: "Kritisch", es: "Critico", pt: "Critico" },
  WARNING: { en: "Warning", fr: "Alerte", de: "Warnung", es: "Advertencia", pt: "Aviso" },
  INFO: { en: "Info", fr: "Info", de: "Info", es: "Info", pt: "Info" },
} as const;
const TYPE_LABELS = {
  ALL: { en: "All types", fr: "Tous les types", de: "Alle Typen", es: "Todos los tipos", pt: "Todos os tipos" },
  SYSTEM: { en: "System", fr: "Systeme", de: "System", es: "Sistema", pt: "Sistema" },
  AUTOMATION: { en: "Automation", fr: "Automatisation", de: "Automatisierung", es: "Automatizaci?n", pt: "Automa??o" },
  SLA: { en: "SLA", fr: "SLA", de: "SLA", es: "SLA", pt: "SLA" },
  SUPPORT: { en: "Support", fr: "Support", de: "Support", es: "Soporte", pt: "Suporte" },
  SECURITY: { en: "Security", fr: "Securite", de: "Sicherheit", es: "Seguridad", pt: "Seguran?a" },
  BILLING: { en: "Billing", fr: "Facturation", de: "Abrechnung", es: "Facturaci?n", pt: "Fatura??o" },
  INCIDENT: { en: "Incident", fr: "Incident", de: "Vorfall", es: "Incidente", pt: "Incidente" },
} as const;

function severityClass(s: AdminNotificationSeverity) {
  if (s === "CRITICAL") return "bg-rose-100 text-rose-800 ring-rose-200";
  if (s === "WARNING") return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function AdminNotificationsPage() {
  const { language, t } = useLanguage();
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [severity, setSeverity] = useState<(typeof severities)[number]>("ALL");
  const [type, setType] = useState<(typeof types)[number]>("ALL");
  const [timeRange, setTimeRange] = useState<(typeof ranges)[number]>("7d");
  const [mineOnly, setMineOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "25", timeRange });
    if (status !== "ALL") p.set("status", status);
    if (severity !== "ALL") p.set("severity", severity);
    if (type !== "ALL") p.set("type", type);
    if (mineOnly) p.set("mineOnly", "true");
    if (search) p.set("q", search);
    return p.toString();
  }, [mineOnly, page, search, severity, status, timeRange, type]);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(`/api/admin/notifications?${qs}`, fetcher);
  const list = useMemo(() => data?.items ?? [], [data?.items]);
  const stats = data?.stats ?? { total7d: 0, unread: 0, critical24h: 0, snoozed: 0 };
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 25));

  useEffect(() => {
    if (!list.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((i) => i.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const { data: detail, mutate: mutateDetail } = useSWR<DetailResponse>(
    selectedId ? `/api/admin/notifications/${selectedId}` : null,
    fetcher
  );

  const setCard = (card: "total" | "unread" | "critical" | "snoozed") => {
    setPage(1);
    if (card === "total") {
      setStatus("ALL");
      setSeverity("ALL");
      setType("ALL");
      setTimeRange("7d");
      setMineOnly(false);
      setSearchInput("");
      setSearch("");
      return;
    }
    if (card === "unread") setStatus("UNREAD");
    if (card === "critical") {
      setSeverity("CRITICAL");
      setTimeRange("24h");
    }
    if (card === "snoozed") setStatus("SNOOZED");
  };

  const patchOne = async (action: "MARK_READ" | "ACK" | "RESOLVE" | "SNOOZE" | "UNSNOOZE", snoozedUntil?: string) => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/notifications/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "SNOOZE" ? { action, snoozedUntil } : { action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((json as { error?: string }).error || "Action failed"));
      await mutate();
      await mutateDetail();
      setToast(action === "ACK" ? t("Notification acknowledged", "Notification accusee", "Benachrichtigung bestätigt", "Notificacion reconocida", "Notificacao confirmada") : action === "RESOLVE" ? t("Resolved", "Résolu", "Geloest", "Resuelto", "Resolvido") : t("Updated", "Mis ? jour", "Aktualisiert", "Actualizado", "Atualizado"));
      setTimeout(() => setToast(""), 3000);
    } catch (e) {
      setToast(
        e instanceof Error
          ? localizeAdminServerMessage(
              e.message,
              language,
              t("Action failed", "?chec de l'action", "Aktion fehlgeschlagen", "La acción fallo", "A ação falhou")
            )
          : t("Action failed", "?chec de l'action", "Aktion fehlgeschlagen", "La acción fallo", "A ação falhou")
      );
      setTimeout(() => setToast(""), 3000);
    } finally {
      setBusy(false);
    }
  };

  const metaRows = useMemo(() => Object.entries(detail?.metadata || {}), [detail?.metadata]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-6 py-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
        <h1 className="text-3xl font-semibold text-foreground">{t("Notifications", "Notifications", "Benachrichtigungen", "Notificaciones", "Notificacoes")}</h1>
        <p className="text-sm text-muted-foreground">{t("Platform alerts and admin activity.", "Alertes de plateforme et activité admin.", "Plattformwarnungen und Admin-Aktivitaet.", "Alertas de plataforma y actividad admin.", "Alertas da plataforma e atividade admin.")}</p>
      </header>

      {error ? (
        <Alert variant="error">
          {localizeAdminServerMessage(
            error.message,
            language,
            t(
              "Unable to load notifications right now.",
              "Impossible de charger les notifications pour le moment.",
              "Benachrichtigungen koennen derzeit nicht geladen werden.",
              "No se pueden cargar las notificaciones en este momento.",
              "N?o foi poss?vel carregar as notificacoes neste momento."
            )
          )}
        </Alert>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {[
          { id: "total", label: t("Total (7d)", "Total (7j)", "Gesamt (7 T.)", "Total (7d)", "Total (7d)"), value: stats.total7d },
          { id: "unread", label: t("Unread", "Non lues", "Ungelesen", "No leidas", "Não lidas"), value: stats.unread },
          { id: "critical", label: t("Critical (24h)", "Critiques (24h)", "Kritisch (24h)", "Criticas (24h)", "Criticas (24h)"), value: stats.critical24h },
          { id: "snoozed", label: localizeAdminStatus("SNOOZED", language), value: stats.snoozed },
        ].map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setCard(card.id as "total" | "unread" | "critical" | "snoozed")}
            className={clsx(
              "rounded-lg border px-4 py-3 text-left transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/8",
              (card.id === "unread" && status === "UNREAD") ||
                (card.id === "snoozed" && status === "SNOOZED") ||
                (card.id === "critical" && severity === "CRITICAL" && timeRange === "24h") ||
                (card.id === "total" && status === "ALL" && severity === "ALL" && timeRange === "7d")
                ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200 dark:border-indigo-500/60 dark:bg-indigo-500/12 dark:ring-indigo-500/35"
                : "border-border/70 bg-card"
            )}
          >
            <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{card.value}</p>
          </button>
        ))}
      </section>

      <section className="rounded-xl border border-border/70 bg-card p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_150px_auto]">
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("Search title or message", "Rechercher un titre ou message", "Titel oder Nachricht suchen", "Buscar título o mensaje", "Pesquisar título ou mensagem")} />
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{statuses.map((s) => <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>)}</select>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value as typeof severity); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{severities.map((s) => <option key={s} value={s}>{t(SEVERITY_LABELS[s])}</option>)}</select>
          <select value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{types.map((s) => <option key={s} value={s}>{t(TYPE_LABELS[s])}</option>)}</select>
          <div className="flex items-center gap-2">
            <select value={timeRange} onChange={(e) => { setTimeRange(e.target.value as typeof timeRange); setPage(1); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">{ranges.map((r) => <option key={r} value={r}>{r === "24h" ? t("Last 24 hours", "Dernieres 24 heures", "Letzte 24 Stunden", "?ltimas 24 horas", "Ultimas 24 horas") : r === "7d" ? t("Last 7 days", "Derniers 7 jours", "Letzte 7 Tage", "?ltimos 7 d?as", "?ltimos 7 dias") : t("Last 30 days", "Derniers 30 jours", "Letzte 30 Tage", "?ltimos 30 d?as", "?ltimos 30 dias")}</option>)}</select>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
              {t("Mine only", "Les miennes uniquement", "Nur meine", "Solo mias", "Apenas minhas")}
            </label>
          </div>
        </div>
      </section>

      <section className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
        <div className="rounded-xl border border-border/70 bg-card">
          <div className="grid grid-cols-[96px_minmax(0,1fr)_56px_84px_92px] gap-2 border-b border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <span>{t("Severity", "Severite", "Schweregrad", "Severidad", "Severidade")}</span><span>{t("Title", "Titre", "Titel", "Titulo", "Titulo")}</span><span>{t("Count", "Nb.", "Anz.", "Num.", "N.o")}</span><span>{t("Status", "Statut", "Status", "Estado", "Estado")}</span><span>{t("Last seen", "Derni?re vue", "Zuletzt", "?ltima vez", "?ltima vez")}</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : list.length === 0 ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-base font-semibold text-foreground">{t("All clear", "Tout est clair", "Alles klar", "Todo en orden", "Tudo limpo")}</p>
                <p className="text-sm text-muted-foreground">{t("No platform alerts or admin notifications.", "Aucune alerte de plateforme ni notification admin.", "Keine Plattformwarnungen oder Admin-Benachrichtigungen.", "No hay alertas de plataforma ni notificaciones admin.", "Não ha alertas da plataforma nem notificacoes admin.")}</p>
              </div>
            ) : list.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={clsx("grid w-full grid-cols-[96px_minmax(0,1fr)_56px_84px_92px] gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40", row.severity === "CRITICAL" && "border-l-2 border-l-rose-500", selectedId === row.id && "bg-indigo-50/70 dark:bg-indigo-500/10")}>
                <span className={clsx("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(row.severity))} aria-label={`${t("Severity", "Severite", "Schweregrad", "Severidad", "Severidade")} ${localizeAdminSeverity(row.severity, language)}`}>
                  <span className={row.severity === "CRITICAL" ? "h-2 w-2 rounded-full bg-rose-600" : row.severity === "WARNING" ? "h-2 w-2 rounded-full bg-amber-500" : "h-2 w-2 rounded-full bg-slate-400"} />
                  {localizeAdminSeverity(row.severity, language)}
                </span>
                <span className="min-w-0"><span className={clsx("block truncate text-sm text-foreground", row.status === "UNREAD" && "font-semibold")}>{row.title}</span><span className="block truncate text-xs text-muted-foreground">{localizeAdminLogMessage(row.message, language, row.message)}</span></span>
                <span className="text-xs tabular-nums text-foreground">{row.occurrences > 1 ? `x${row.occurrences}` : "-"}</span>
                <span className="truncate text-[11px] font-semibold text-muted-foreground">{localizeAdminStatus(row.status, language)}</span>
                <span className="text-xs text-muted-foreground"><span className="block">{formatAdminRelativeTime(row.lastSeenAt, language)}</span><span className="block text-[10px]">{formatDateTimeDMY(new Date(row.lastSeenAt), LANGUAGE_LOCALES[language])}</span></span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
            <span>{t("Page", "Page", "Seite", "P?gina", "P?gina")} {page} {t("of", "sur", "von", "de", "de")} {pageCount}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</Button>
              <Button size="sm" variant="secondary">{page}</Button>
              <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{">"}</Button>
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-border/70 bg-card p-4">
          {!detail ? (
            <div className="space-y-3"><Skeleton className="h-6 w-2/3 rounded" /><Skeleton className="h-16 rounded" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(detail.severity))}>{localizeAdminSeverity(detail.severity, language)}</span>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{detail.title}</h2>
                <p className="text-sm text-muted-foreground">{localizeAdminLogMessage(detail.message, language, detail.message)}</p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                {(detail.status === "UNREAD" || detail.status === "READ" || detail.status === "SNOOZED") ? <Button onClick={() => patchOne("ACK")} disabled={busy} className="shadow-none">{t("Acknowledge", "Accuser reception", "Bestaetigen", "Reconocer", "Confirmar")}</Button> : null}
                {detail.status !== "RESOLVED" ? <Button variant="secondary" onClick={() => patchOne("RESOLVE")} disabled={busy}>{t("Resolve", "Resoudre", "Loesen", "Resolver", "Resolver")}</Button> : null}
                {detail.status === "UNREAD" ? <Button variant="ghost" onClick={() => patchOne("MARK_READ")} disabled={busy}>{t("Mark read", "Marquer comme lu", "Als gelesen markieren", "Marcar como leido", "Marcar como lida")}</Button> : null}
                {detail.status === "SNOOZED" ? (
                  <Button variant="ghost" onClick={() => patchOne("UNSNOOZE")} disabled={busy}>{t("Unsnooze", "Retirer le report", "Schlummern beenden", "Quitar pausa", "Retomar")}</Button>
                ) : detail.status !== "RESOLVED" ? (
                  <select defaultValue="" onChange={(e) => { const h = Number(e.target.value); if (!h) return; patchOne("SNOOZE", new Date(Date.now() + h * 60 * 60 * 1000).toISOString()); e.target.value = ""; }} className="h-9 rounded-md border border-border/70 bg-background px-2 text-xs">
                    <option value="">{t("Snooze...", "Reporter...", "Schlummern...", "Posponer...", "Adiar...")}</option><option value="1">{t("1 hour", "1 heure", "1 Stunde", "1 hora", "1 hora")}</option><option value="4">{t("4 hours", "4 heures", "4 Stunden", "4 horas", "4 horas")}</option><option value="24">{t("24 hours", "24 heures", "24 Stunden", "24 horas", "24 horas")}</option>
                  </select>
                ) : null}
              </div>
              {metaRows.length ? (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Metadata", "Metadonnees", "Metadaten", "Metadatos", "Metadados")}</p>
                  <dl className="space-y-1 rounded-md border border-border/60 bg-background p-2">
                    {metaRows.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-xs">
                        <dt className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                        <dd className={clsx("break-all text-foreground", key.toLowerCase().endsWith("id") && "font-mono")}>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <div className="space-y-2 border-t border-border/70 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Audit trail", "Journal d'audit", "Audit-Verlauf", "Rastro de auditoria", "Trilho de auditoria")}</p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {detail.audits?.length ? detail.audits.map((a) => (
                    <div key={a.id} className="rounded-md border border-border/60 bg-background px-2 py-2 text-xs">
                      <p className="font-semibold text-foreground">{a.action}</p>
                      <p className="text-muted-foreground">{a.actorAdmin?.name || a.actorAdmin?.email || t("Unknown admin", "Admin inconnu", "Unbekannter Admin", "Admin desconocido", "Admin desconhecido")} - {formatDateTimeDMY(new Date(a.createdAt), LANGUAGE_LOCALES[language])}</p>
                    </div>
                  )) : <p className="text-xs text-muted-foreground">{t("No audit events for this notification yet.", "Aucun evenement d'audit pour cette notification pour le moment.", "Noch keine Audit-Ereignisse fuer diese Benachrichtigung.", "Aún no hay eventos de auditoria para esta notificacion.", "Ainda não ha eventos de auditoria para esta notificacao.")}</p>}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>

      <Toast message={toast} show={Boolean(toast)} />
    </div>
  );
}
