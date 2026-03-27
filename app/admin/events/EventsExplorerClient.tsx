"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/providers/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAdminIdentifierLabel,
  localizeAdminLogMessage,
  localizeAdminServerMessage,
  localizeAdminSeverity,
  localizeAdminSource,
} from "@/lib/admin/localization";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type ActorRole = "SUPER_ADMIN" | "OPS_ADMIN";
type EventSeverity = "INFO" | "WARNING" | "CRITICAL";
type EventSource = "BILLING" | "AUTH" | "AUTOMATION" | "INBOX" | "SUPPORT" | "SYSTEM";
type TimePreset = "24h" | "7d" | "30d" | "custom";

type EventItem = {
  id: string;
  createdAt: string;
  severity: EventSeverity;
  source: EventSource;
  eventType: string;
  tenant: { id: string; name: string } | null;
  user: { id: string; email: string; name: string | null } | null;
  actor: { id: string; email: string; name: string | null } | null;
  entityType: string | null;
  entityId: string | null;
  message: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

type EventsResponse = {
  actorRole: ActorRole;
  items: EventItem[];
  nextCursor: string | null;
  totalCount: number | null;
};

type TenantsResponse = {
  items: Array<{ id: string; name: string }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  }
  return payload as T;
};

const suggestionChips = ["payment_failed", "invoice_1023", "user@email.com", "tenant:workspace_1023"];

function rangeForPreset(preset: Exclude<TimePreset, "custom">) {
  const now = new Date();
  const hours = preset === "24h" ? 24 : preset === "7d" ? 24 * 7 : 24 * 30;
  return {
    from: new Date(now.getTime() - hours * 60 * 60 * 1000),
    to: now,
  };
}

function toInputValue(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseInputDate(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatStamp(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function severityClasses(value: EventSeverity) {
  if (value === "CRITICAL") return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30";
  if (value === "WARNING") return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30";
  return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-200 dark:ring-slate-500/30";
}

function metadataJson(value: Record<string, unknown>) {
  return JSON.stringify(value || {}, null, 2);
}

export default function EventsExplorerClient({ actorRole }: { actorRole: ActorRole }) {
  const { language, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [eventType, setEventType] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [preset, setPreset] = useState<TimePreset>("7d");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const initialQ = searchParams.get("q") || "";
    const initialSeverity = searchParams.get("severity") || "";
    const initialSource = searchParams.get("source") || "";
    const initialEventType = searchParams.get("eventType") || "";
    const initialTenantId = searchParams.get("tenantId") || "";
    const initialUserId = searchParams.get("userId") || "";
    const initialEntityId = searchParams.get("entityId") || "";
    const initialPreset = (searchParams.get("range") || "7d") as TimePreset;
    setQInput(initialQ);
    setQ(initialQ);
    setSeverity(initialSeverity);
    setSource(initialSource);
    setEventType(initialEventType);
    setTenantId(initialTenantId);
    setUserId(initialUserId);
    setEntityId(initialEntityId);
    if (["24h", "7d", "30d", "custom"].includes(initialPreset)) {
      setPreset(initialPreset);
    }
    const parsedFrom = parseInputDate(searchParams.get("from") || "");
    const parsedTo = parseInputDate(searchParams.get("to") || "");
    if (initialPreset === "custom") {
      setFrom(parsedFrom);
      setTo(parsedTo);
    } else if (parsedFrom || parsedTo) {
      setFrom(parsedFrom);
      setTo(parsedTo);
    } else {
      const presetRange = rangeForPreset((["24h", "7d", "30d"].includes(initialPreset) ? initialPreset : "7d") as Exclude<TimePreset, "custom">);
      setFrom(presetRange.from);
      setTo(presetRange.to);
    }
  }, [initialized, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
      setCursorStack([""]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (!initialized) return;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    if (eventType) params.set("eventType", eventType);
    if (tenantId) params.set("tenantId", tenantId);
    if (userId) params.set("userId", userId);
    if (entityId) params.set("entityId", entityId);
    params.set("range", preset);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [initialized, pathname, router, q, severity, source, eventType, tenantId, userId, entityId, preset, from, to]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const currentCursor = page > 1 ? cursorStack[page - 1] || "" : "";

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (q) params.set("q", q);
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    if (eventType) params.set("eventType", eventType);
    if (tenantId && actorRole === "SUPER_ADMIN") params.set("tenantId", tenantId);
    if (userId) params.set("userId", userId);
    if (entityId) params.set("entityId", entityId);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    if (currentCursor) params.set("cursor", currentCursor);
    return params.toString();
  }, [actorRole, currentCursor, entityId, eventType, from, q, severity, source, tenantId, to, userId]);

  const { data, error, isLoading, mutate, isValidating } = useSWR<EventsResponse>(
    `/api/admin/events?${apiQuery}`,
    fetcher,
    { keepPreviousData: true }
  );

  const { data: tenantOptions } = useSWR<TenantsResponse>(
    actorRole === "SUPER_ADMIN" ? "/api/admin/tenants?page=1&pageSize=100" : null,
    fetcher
  );

  const groupedTenantOptions = useMemo(() => {
    const items = tenantOptions?.items || [];
    const groups = new Map<string, { id: string; name: string; tenantIds: string[] }>();
    for (const tenant of items) {
      const normalizedName = String(tenant?.name || "")
        .trim()
        .toLocaleLowerCase();
      if (!tenant?.id || !normalizedName) continue;
      const existing = groups.get(normalizedName);
      if (existing) {
        existing.tenantIds.push(tenant.id);
      } else {
        groups.set(normalizedName, {
          id: tenant.id,
          name: tenant.name,
          tenantIds: [tenant.id],
        });
      }
    }
    return Array.from(groups.values()).map((group) => ({
      id: group.id,
      name: group.name,
      value: group.tenantIds.join(","),
    }));
  }, [tenantOptions?.items]);

  const rows = useMemo(() => data?.items || [], [data?.items]);
  const selected = rows.find((item) => item.id === selectedId) || rows[0] || null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    if (!rows.length) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (typing) return;
      const currentIndex = rows.findIndex((item) => item.id === (selectedId || rows[0]?.id));
      if (event.key === "Enter") {
        if (!selectedId && rows[0]) setSelectedId(rows[0].id);
        return;
      }
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(rows.length - 1, Math.max(0, currentIndex) + 1)
          : Math.max(0, Math.max(0, currentIndex) - 1);
      setSelectedId(rows[nextIndex]?.id || null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows, selectedId]);

  const hasActiveFilters = Boolean(q || severity || source || eventType || tenantId || userId || entityId || from || to);
  const activeFilters = [
    severity ? { label: localizeAdminSeverity(severity, language), clear: () => setSeverity("") } : null,
    source ? { label: localizeAdminSource(source, language), clear: () => setSource("") } : null,
    eventType ? { label: localizeAdminLogMessage(eventType.replace(/_/g, " "), language, formatAdminIdentifierLabel(eventType)) , clear: () => setEventType("") } : null,
    tenantId ? { label: `${t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")} ${tenantId}`, clear: () => setTenantId("") } : null,
    userId ? { label: `${t("User", "Utilisateur", "Benutzer", "Usuario", "Utilizador")} ${userId}`, clear: () => setUserId("") } : null,
    entityId ? { label: `${t("Entity", "Entite", "Entitaet", "Entidad", "Entidade")} ${entityId}`, clear: () => setEntityId("") } : null,
    q ? { label: `${t("Search", "Recherche", "Suche", "Buscar", "Pesquisar")} ${q}`, clear: () => { setQ(""); setQInput(""); } } : null,
    preset !== "custom" ? { label: preset === "24h" ? t("Last 24h", "Dernieres 24h", "Letzte 24h", "Ultimas 24h", "Ultimas 24h") : preset === "7d" ? t("Last 7d", "Derniers 7j", "Letzte 7T", "Ultimos 7d", "Ultimos 7d") : t("Last 30d", "Derniers 30j", "Letzte 30T", "Ultimos 30d", "Ultimos 30d"), clear: () => applyPreset("7d") } : null,
    preset === "custom" && (from || to)
      ? {
          label: t("Custom range", "Plage personnalisee", "Benutzerdefinierter Bereich", "Rango personalizado", "Intervalo personalizado"),
          clear: () => {
            const nextRange = rangeForPreset("7d");
            setPreset("7d");
            setFrom(nextRange.from);
            setTo(nextRange.to);
            setPage(1);
            setCursorStack([""]);
          },
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const resetFilters = () => {
    setQ("");
    setQInput("");
    setSeverity("");
    setSource("");
    setEventType("");
    setTenantId("");
    setUserId("");
    setEntityId("");
    const nextRange = rangeForPreset("7d");
    setPreset("7d");
    setFrom(nextRange.from);
    setTo(nextRange.to);
    setPage(1);
    setCursorStack([""]);
  };

  const applyPreset = (nextPreset: TimePreset) => {
    setPreset(nextPreset);
    setPage(1);
    setCursorStack([""]);
    if (nextPreset === "custom") {
      setFrom(null);
      setTo(null);
      return;
    }
    const nextRange = rangeForPreset(nextPreset);
    setFrom(nextRange.from);
    setTo(nextRange.to);
  };

  const metadataText = selected ? metadataJson(selected.metadata) : "{}";

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 px-6 py-5">
      <header className="space-y-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("Events Explorer", "Explorateur d'evenements", "Ereignis-Explorer", "Explorador de eventos", "Explorador de eventos")}</h1>
          <p className="text-sm text-muted-foreground">{t("Search system activity across tenants and users", "Rechercher l'activité systeme sur tous les locataires et utilisateurs", "Systemaktivitaet ueber Mandanten und Benutzer hinweg durchsuchen", "Buscar actividad del sistema entre tenants y usuarios", "Pesquisar atividade do sistema entre tenants e utilizadores")}</p>
        </div>
      </header>

      <section className="sticky top-0 z-20 space-y-3 border-b border-border/60 bg-background/95 pb-4 pt-1 backdrop-blur">
        <div className="space-y-3">
          <input
            ref={searchRef}
            value={qInput}
            onChange={(event) => {
              setQInput(event.target.value);
              setPage(1);
              setCursorStack([""]);
            }}
            placeholder={t("Search: invoice_1023, payment_failed, user@email.com, tenant:workspace_1023", "Recherche : invoice_1023, payment_failed, user@email.com, tenant:workspace_1023", "Suche: invoice_1023, payment_failed, user@email.com, tenant:workspace_1023", "Buscar: invoice_1023, payment_failed, user@email.com, tenant:workspace_1023", "Pesquisar: invoice_1023, payment_failed, user@email.com, tenant:workspace_1023")}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setQInput(chip);
                  setPage(1);
                  setCursorStack([""]);
                }}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="">{t("All severities", "Toutes les severites", "Alle Schweregrade", "Todas las severidades", "Todas as severidades")}</option>
            <option value="INFO">{t("Info", "Info", "Info", "Info", "Info")}</option>
            <option value="WARNING">{t("Warning", "Alerte", "Warnung", "Advertencia", "Aviso")}</option>
            <option value="CRITICAL">{t("Critical", "Critique", "Kritisch", "Critico", "Critico")}</option>
          </select>
          <select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="">{t("All sources", "Toutes les sources", "Alle Quellen", "Todas las fuentes", "Todas as origens")}</option>
            <option value="AUTH">{t("Auth", "Auth", "Auth", "Auth", "Auth")}</option>
            <option value="BILLING">{t("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação")}</option>
            <option value="AUTOMATION">{t("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação")}</option>
            <option value="INBOX">{t("Inbox", "Boite de reception", "Posteingang", "Bandeja de entrada", "Caixa de entrada")}</option>
            <option value="SUPPORT">{t("Support", "Support", "Support", "Soporte", "Suporte")}</option>
            <option value="SYSTEM">{t("System", "Systeme", "System", "Sistema", "Sistema")}</option>
          </select>
          <select value={preset} onChange={(event) => applyPreset(event.target.value as TimePreset)} className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm">
            <option value="24h">{t("Last 24h", "Dernieres 24h", "Letzte 24h", "Ultimas 24h", "Ultimas 24h")}</option>
            <option value="7d">{t("Last 7d", "Derniers 7j", "Letzte 7T", "Ultimos 7d", "Ultimos 7d")}</option>
            <option value="30d">{t("Last 30d", "Derniers 30j", "Letzte 30T", "Ultimos 30d", "Ultimos 30d")}</option>
            <option value="custom">{t("Custom", "Personnalise", "Benutzerdefiniert", "Personalizado", "Personalizado")}</option>
          </select>
          {actorRole === "SUPER_ADMIN" ? (
            <select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setPage(1); setCursorStack([""]); }} className="h-10 min-w-[220px] rounded-md border border-border/70 bg-background px-3 text-sm">
              <option value="">{t("All tenants", "Tous les locataires", "Alle Mandanten", "Todos los tenants", "Todos os tenants")}</option>
              {groupedTenantOptions.map((tenant) => (
                <option key={tenant.value} value={tenant.value}>
                  {tenant.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>
            {t("Clear filters", "Effacer les filtres", "Filter loeschen", "Limpiar filtros", "Limpar filtros")}
          </Button>
        </div>

        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" value={toInputValue(from)} onChange={(event) => { setFrom(parseInputDate(event.target.value)); setPage(1); setCursorStack([""]); }} className="h-10 w-[220px]" />
            <Input type="datetime-local" value={toInputValue(to)} onChange={(event) => { setTo(parseInputDate(event.target.value)); setPage(1); setCursorStack([""]); }} className="h-10 w-[220px]" />
          </div>
        ) : null}

        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.clear}
                className="rounded-full border border-border/70 bg-muted/25 px-3 py-1 text-xs text-foreground transition hover:bg-muted/40"
              >
                {filter.label} x
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">{t("Unable to load events. Try again.", "Impossible de charger les evenements. Reessayez.", "Ereignisse konnten nicht geladen werden. Erneut versuchen.", "No se pudieron cargar los eventos. Intenta de nuevo.", "Não foi possivel carregar os eventos. Tente novamente.")}</Alert>
          <p className="text-sm text-muted-foreground">
            {localizeAdminServerMessage(
              error.message,
              language,
              t(
                "The events request did not complete.",
                "La requete des evenements n'a pas abouti.",
                "Die Ereignisanfrage konnte nicht abgeschlossen werden.",
                "La solicitud de eventos no se pudo completar.",
                "O pedido de eventos nao foi concluido."
              )
            )}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>
            {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <div className="min-h-[640px] overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("Results", "Resultats", "Ergebnisse", "Resultados", "Resultados")}
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-foreground">{t("No results found.", "Aucun resultat trouve.", "Keine Ergebnisse gefunden.", "No se encontraron resultados.", "Não foram encontrados resultados.")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("Try `payment_failed`, `invoice_1023`, or a user email.", "Essayez `payment_failed`, `invoice_1023` ou un e-mail utilisateur.", "Versuchen Sie `payment_failed`, `invoice_1023` oder eine Benutzer-E-Mail.", "Prueba `payment_failed`, `invoice_1023` o un correo de usuario.", "Tente `payment_failed`, `invoice_1023` ou um e-mail de utilizador.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={clsx(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/20",
                    selected?.id === row.id && "bg-muted/20"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      row.severity === "CRITICAL" ? "bg-rose-500" : row.severity === "WARNING" ? "bg-amber-500" : "bg-slate-400"
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-foreground">{localizeAdminLogMessage(row.message, language, row.message)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatStamp(row.createdAt, LANGUAGE_LOCALES[language])} / {localizeAdminSource(row.source, language)} / {localizeAdminLogMessage(row.eventType.replace(/_/g, " "), language, formatAdminIdentifierLabel(row.eventType))} / {row.tenant?.name || t("Platform", "Plateforme", "Plattform", "Plataforma", "Plataforma")} / {row.user?.email || t("system", "systeme", "system", "sistema", "sistema")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t("Page", "Page", "Seite", "Pagina", "Pagina")} {page}{isValidating ? ` / ${t("refreshing...", "actualisation...", "aktualisiert...", "actualizando...", "a atualizar...")}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  if (page <= 1) return;
                  setPage((prev) => Math.max(1, prev - 1));
                }}
              >
                {t("Previous", "Precedent", "Zurueck", "Anterior", "Anterior")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!data?.nextCursor}
                onClick={() => {
                  if (!data?.nextCursor) return;
                  setCursorStack((prev) => {
                    const next = [...prev];
                    next[page] = data.nextCursor!;
                    return next;
                  });
                  setPage((prev) => prev + 1);
                }}
              >
                {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
              </Button>
            </div>
          </div>
        </div>

        <aside className="min-h-[640px] rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("Event details", "Details de l'evenement", "Ereignisdetails", "Detalles del evento", "Detalhes do evento")}
          </div>
          {!selected ? (
            <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {t("Select an event to inspect context and metadata.", "Sélectionnez un evenement pour inspecter le contexte et les metadonnees.", "Waehlen Sie ein Ereignis aus, um Kontext und Metadaten zu pruefen.", "Selecciona un evento para inspeccionar contexto y metadatos.", "Selecione um evento para inspecionar contexto e metadados.")}
            </div>
          ) : (
            <div className="space-y-5 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    severityClasses(selected.severity)
                  )}
                >
                  {localizeAdminSeverity(selected.severity, language)}
                </span>
                <Badge variant="warning" className="bg-transparent text-foreground">
                  {localizeAdminLogMessage(selected.eventType.replace(/_/g, " "), language, formatAdminIdentifierLabel(selected.eventType))}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatStamp(selected.createdAt, LANGUAGE_LOCALES[language])}</span>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Context", "Contexte", "Kontext", "Contexto", "Contexto")}</h2>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {t("Tenant:", "Locataire :", "Mandant:", "Tenant:", "Tenant:")}{" "}
                    {selected.tenant ? (
                      <Link className="text-indigo-600 hover:underline dark:text-indigo-300" href={`/admin/tenants/${selected.tenant.id}`}>
                        {selected.tenant.name}
                      </Link>
                    ) : (
                        t("Platform", "Plateforme", "Plattform", "Plataforma", "Plataforma")
                    )}
                  </p>
                  <p>
                    {t("User:", "Utilisateur :", "Benutzer:", "Usuario:", "Utilizador:")}{" "}
                    {selected.user ? (
                      <Link className="text-indigo-600 hover:underline dark:text-indigo-300" href={`/admin/users/${selected.user.id}/activity`}>
                        {selected.user.name || selected.user.email}
                      </Link>
                    ) : (
                        t("System", "Systeme", "System", "Sistema", "Sistema")
                    )}
                  </p>
                  {selected.actor ? <p>{t("Actor:", "Acteur :", "Akteur:", "Actor:", "Ator:")} {selected.actor.name || selected.actor.email}</p> : null}
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Event", "Evenement", "Ereignis", "Evento", "Evento")}</h2>
                <p className="text-sm text-foreground">{localizeAdminLogMessage(selected.message, language, selected.message)}</p>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Entity", "Entite", "Entitaet", "Entidad", "Entidade")}</h2>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>{t("Type:", "Type :", "Typ:", "Tipo:", "Tipo:")} <span className="text-foreground">{selected.entityType || "-"}</span></p>
                  <div className="flex items-center gap-2">
                    <span>{t("Entity ID:", "ID entite :", "Entitaets-ID:", "ID de entidad:", "ID da entidade:")}</span>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">{selected.entityId || "-"}</code>
                    {selected.entityId ? (
                      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(selected.entityId || "")}>
                        {t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Request", "Requête", "Anfrage", "Solicitud", "Pedido")}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">{selected.requestId || "-"}</code>
                  {selected.requestId ? (
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(selected.requestId || "")}>
                      {t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{t("Metadata", "Metadonnees", "Metadaten", "Metadatos", "Metadados")}</h2>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowMetadata((prev) => !prev)}>
                      {showMetadata ? t("Collapse", "Reduire", "Einklappen", "Contraer", "Recolher") : t("Expand", "Developper", "Erweitern", "Expandir", "Expandir")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(metadataText)}>
                      {t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                    </Button>
                  </div>
                </div>
                {showMetadata ? (
                  <pre className="max-h-[260px] overflow-auto rounded-lg border border-border/60 bg-muted/15 p-3 text-xs text-foreground">
                    {metadataText}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("Metadata is collapsed by default. Sensitive fields are redacted.", "Les metadonnees sont reduites par defaut. Les champs sensibles sont masques.", "Metadaten sind standardmaessig eingeklappt. Sensible Felder sind geschwaerzt.", "Los metadatos estan contraidos por defecto. Los campos sensibles estan ocultos.", "Os metadados estão recolhidos por defeito. Os campos sensíveis estão ocultos.")}</p>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Related links", "Liens associes", "Verwandte Links", "Enlaces relacionados", "Links relacionados")}</h2>
                <div className="flex flex-wrap gap-2">
                  {selected.user ? (
                    <Link href={`/admin/users/${selected.user.id}/activity`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      {t("View user timeline", "Voir la chronologie utilisateur", "Benutzerverlauf ansehen", "Ver cronologia del usuario", "Ver linha temporal do utilizador")}
                    </Link>
                  ) : null}
                  {selected.tenant ? (
                    <Link href={`/admin/tenants/${selected.tenant.id}`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      {t("View tenant", "Voir le locataire", "Mandant ansehen", "Ver tenant", "Ver tenant")}
                    </Link>
                  ) : null}
                  {selected.requestId ? (
                    <Link href={`/admin/audit-explorer?q=${encodeURIComponent(selected.requestId)}`} className="text-sm text-indigo-600 hover:underline dark:text-indigo-300">
                      {t("View audit logs", "Voir les journaux d'audit", "Audit-Protokolle ansehen", "Ver registros de auditoria", "Ver registos de auditoria")}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

