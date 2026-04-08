"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/providers/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAdminIdentifierLabel,
  localizeAdminActionLabel,
  localizeAdminLogMessage,
  localizeAdminServerMessage,
  localizeAdminSource,
} from "@/lib/admin/localization";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

type AuditCategory = "all" | "impersonation" | "role" | "system_flags" | "tenant";
type AuditSource = "all" | "audit" | "system_flag";

type AuditExplorerItem = {
  id: string;
  timestamp: string;
  category: Exclude<AuditCategory, "all">;
  source: Exclude<AuditSource, "all">;
  action: string;
  message: string;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  metadata: Record<string, unknown>;
};

type AuditExplorerResponse = {
  items: AuditExplorerItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const fetcher = async (url: string): Promise<AuditExplorerResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as any).error === "string"
        ? (payload as any).error
        : null) || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as AuditExplorerResponse;
};

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const CATEGORY_OPTIONS: Array<{ value: AuditCategory; label: CompleteLocalizedText }> = [
  { value: "all", label: text("All categories", "Toutes les categories", "Alle Kategorien", "Todas las categorias", "Todas as categorias") },
  { value: "impersonation", label: text("Impersonation", "Usurpation", "Identitätswechsel", "Suplantacion", "Representacao") },
  { value: "role", label: text("Role changes", "Changements de role", "Rollenänderungen", "Cambios de rol", "Alteracoes de função") },
  { value: "system_flags", label: text("System flags", "Drapeaux système", "System-Flags", "Indicadores del sistema", "Indicadores do sistema") },
  { value: "tenant", label: text("Tenant actions", "Actions du locataire", "Mandantenaktionen", "Acciones del tenant", "Ações do tenant") },
];

const SOURCE_OPTIONS: Array<{ value: AuditSource; label: CompleteLocalizedText }> = [
  { value: "all", label: text("All sources", "Toutes les sources", "Alle Quellen", "Todas las fuentes", "Todas as origens") },
  { value: "audit", label: text("Audit logs", "Journaux d'audit", "Audit-Protokolle", "Registros de auditoria", "Registos de auditoria") },
  {
    value: "system_flag",
    label: text(
      "System flag audits",
      "Audits des drapeaux système",
      "System-Flag-Audits",
      "Auditorias de indicadores del sistema",
      "Auditorias de indicadores do sistema"
    ),
  },
];

const METADATA_PREVIEW_LIMIT = 1800;

function categoryLabel(category: AuditExplorerItem["category"]) {
  if (category === "impersonation") return text("Impersonation", "Usurpation", "Identitätswechsel", "Suplantacion", "Representacao");
  if (category === "role") return text("Role change", "Changement de role", "Rollenänderung", "Cambio de rol", "Alteração de função");
  if (category === "system_flags") return text("System flag", "Drapeau système", "System-Flag", "Indicador del sistema", "Indicador do sistema");
  return text("Tenant action", "Action du locataire", "Mandantenaktion", "Acción del tenant", "Ação do tenant");
}

function categoryBadgeVariant(category: AuditExplorerItem["category"]) {
  if (category === "impersonation") return "warning";
  if (category === "role") return "roleAdmin";
  if (category === "system_flags") return "roleSuperAdmin";
  return "roleUser";
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseCategory(value: string | null): AuditCategory {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "impersonation" || normalized === "role" || normalized === "system_flags" || normalized === "tenant") {
    return normalized;
  }
  return "all";
}

function parseSource(value: string | null): AuditSource {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "audit" || normalized === "system_flag") {
    return normalized;
  }
  return "all";
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export default function AuditExplorerClient() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(
    () => ({
      query: String(searchParams.get("q") || "").trim(),
      category: parseCategory(searchParams.get("category")),
      source: parseSource(searchParams.get("source")),
      page: parsePage(searchParams.get("page")),
      raw: searchParams.toString(),
    }),
    [searchParams]
  );

  const [queryDraft, setQueryDraft] = useState(urlState.query);
  const [query, setQuery] = useState(urlState.query);
  const [category, setCategory] = useState<AuditCategory>(urlState.category);
  const [source, setSource] = useState<AuditSource>(urlState.source);
  const [page, setPage] = useState(urlState.page);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMetadataId, setExpandedMetadataId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  useEffect(() => {
    setQueryDraft((prev) => (prev === urlState.query ? prev : urlState.query));
    setQuery((prev) => (prev === urlState.query ? prev : urlState.query));
    setCategory((prev) => (prev === urlState.category ? prev : urlState.category));
    setSource((prev) => (prev === urlState.source ? prev : urlState.source));
    setPage((prev) => (prev === urlState.page ? prev : urlState.page));
  }, [urlState.category, urlState.page, urlState.query, urlState.source]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => {
        const next = queryDraft.trim();
        if (current === next) return current;
        setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (query) nextParams.set("q", query);
    if (category !== "all") nextParams.set("category", category);
    if (source !== "all") nextParams.set("source", source);
    if (page > 1) nextParams.set("page", String(page));
    const next = nextParams.toString();
    if (next !== urlState.raw) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [category, page, pathname, query, router, source, urlState.raw]);

  useEffect(() => {
    if (!copiedRowId) return;
    const timer = window.setTimeout(() => setCopiedRowId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedRowId]);

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "30");
    if (query) params.set("q", query);
    if (category !== "all") params.set("category", category);
    if (source !== "all") params.set("source", source);
    return `/api/admin/audit-explorer?${params.toString()}`;
  }, [category, page, query, source]);

  const { data, error, isLoading, isValidating, mutate } = useSWR<AuditExplorerResponse>(requestKey, fetcher);
  const rows = data?.items ?? [];
  const hasMore = Boolean(data?.hasMore);
  const sourceLabel = (value: AuditExplorerItem["source"]) => localizeAdminSource(value, language);

  return (
    <div className="max-w-full space-y-4 overflow-x-hidden px-6 py-6 max-md:px-4 max-md:py-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
        <h1 className="text-3xl font-semibold text-foreground">
          {t(text("Audit Explorer", "Explorateur d'audit", "Audit-Explorer", "Explorador de auditoria", "Explorador de auditoria"))}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            text(
              "Unified audit timeline for impersonation, role changes, system flags, and tenant actions.",
              "Chronologie d'audit unifiee pour l'usurpation, les changements de role, les drapeaux système et les actions des locataires.",
              "Einheitliche Audit-Zeitleiste für Identitätswechsel, Rollenänderungen, System-Flags und Mandantenaktionen.",
              "Cronologia de auditoria unificada para suplantacion, cambios de rol, indicadores del sistema y acciones del tenant.",
              "Cronologia de auditoria unificada para representação, alteracoes de função, indicadores do sistema e ações do tenant."
            )
          )}
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <Input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder={t(
              text(
                "Search action, actor, tenant, or metadata",
                "Rechercher une action, un acteur, un locataire ou des métadonnées",
                "Aktion, Akteur, Mandant oder Metadaten suchen",
                "Buscar acción, actor, tenant o metadatos",
                "Pesquisar ação, ator, tenant ou metadados"
              )
            )}
          />
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as AuditCategory);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value as AuditSource);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void mutate()} disabled={isValidating}>
            {t("Refresh", "Rafraichir", "Aktualisieren", "Actualizar", "Atualizar")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {data
            ? t(
                text(
                  `Showing ${rows.length} of ${data.total} events`,
                  `Affichage de ${rows.length} sur ${data.total} evenements`,
                  `${rows.length} von ${data.total} Ereignissen werden angezeigt`,
                  `Mostrando ${rows.length} de ${data.total} eventos`,
                  `A mostrar ${rows.length} de ${data.total} eventos`
                )
              )
            : t("Loading events...", "Chargement des événements...", "Ereignisse werden geladen...", "Cargando eventos...", "A carregar eventos...")}
        </p>
      </Card>

      {error ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {localizeAdminServerMessage(
                error.message,
                language,
                t(
                  "Unable to load audit events right now.",
                  "Impossible de charger les événements d'audit pour le moment.",
                  "Audit-Ereignisse koennen derzeit nicht geladen werden.",
                  "No se pueden cargar los eventos de auditoria en este momento.",
                  "Não foi possível carregar os eventos de auditoria neste momento."
                )
              )}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void mutate()}>
              {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card className="max-w-full overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,14%)_minmax(0,12%)_minmax(0,1fr)_minmax(0,18%)_minmax(0,18%)_minmax(0,10%)] gap-3 border-b border-border/70 bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground xl:grid">
          <span>{t("Time", "Heure", "Zeit", "Hora", "Hora")}</span>
          <span>{t("Category", "Categorie", "Kategorie", "Categoria", "Categoria")}</span>
          <span>{t("Action", "Action", "Aktion", "Acción", "Ação")}</span>
          <span>{t("Actor", "Acteur", "Akteur", "Actor", "Ator")}</span>
          <span>{t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")}</span>
          <span>{t("Source", "Source", "Quelle", "Fuente", "Origem")}</span>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {t(
              text(
                "No audit events matched your filters.",
                "Aucun evenement d'audit ne correspond a vos filtres.",
                "Keine Audit-Ereignisse entsprechen deinen Filtern.",
                "Ningun evento de auditoria coincide con tus filtros.",
                "Nenhum evento de auditoria corresponde aos seus filtros."
              )
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((row) => {
              const expanded = expandedId === row.id;
              const metadata = safeJson(row.metadata);
              const metadataExpanded = expandedMetadataId === row.id;
              const metadataVisible =
                metadataExpanded || metadata.length <= METADATA_PREVIEW_LIMIT
                  ? metadata
                  : `${metadata.slice(0, METADATA_PREVIEW_LIMIT)}\n…`;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm hover:bg-muted/20"
                    onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                  >
                    <div className="space-y-2 xl:hidden">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{formatDateTimeDMY(new Date(row.timestamp), LANGUAGE_LOCALES[language])}</span>
                        <Badge variant={categoryBadgeVariant(row.category)}>{t(categoryLabel(row.category))}</Badge>
                      </div>
                      <p className="truncate font-semibold text-foreground">{localizeAdminActionLabel(row.action, language, formatAdminIdentifierLabel(row.action))}</p>
                      <p className="truncate text-xs text-muted-foreground">{localizeAdminLogMessage(row.message, language, row.message)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.actorName || t("System", "Systeme", "System", "Sistema", "Sistema")} /{" "}
                        {row.tenantName || t("Global", "Global", "Global", "Global", "Global")} / {sourceLabel(row.source)}
                      </p>
                    </div>

                    <div className="hidden grid-cols-[minmax(0,14%)_minmax(0,12%)_minmax(0,1fr)_minmax(0,18%)_minmax(0,18%)_minmax(0,10%)] gap-3 xl:grid">
                      <span className="truncate text-muted-foreground">{formatDateTimeDMY(new Date(row.timestamp), LANGUAGE_LOCALES[language])}</span>
                      <span>
                        <Badge variant={categoryBadgeVariant(row.category)}>{t(categoryLabel(row.category))}</Badge>
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-semibold text-foreground">{localizeAdminActionLabel(row.action, language, formatAdminIdentifierLabel(row.action))}</span>
                        <span className="block truncate text-xs text-muted-foreground">{localizeAdminLogMessage(row.message, language, row.message)}</span>
                      </span>
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-semibold text-foreground">{row.actorName || t("System", "Systeme", "System", "Sistema", "Sistema")}</span>
                        <span className="block truncate text-muted-foreground">{row.actorEmail || "—"}</span>
                      </span>
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-semibold text-foreground">{row.tenantName || t("Global", "Global", "Global", "Global", "Global")}</span>
                        <span className="block truncate text-muted-foreground">{row.tenantId || "—"}</span>
                      </span>
                      <span className="truncate text-xs uppercase tracking-wide text-muted-foreground">{sourceLabel(row.source)}</span>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="bg-muted/20 px-4 pb-4 pt-1">
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {t("Metadata", "Métadonnées", "Metadaten", "Metadatos", "Metadados")}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {metadata.length > METADATA_PREVIEW_LIMIT ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setExpandedMetadataId((current) => (current === row.id ? null : row.id))
                                }
                              >
                                {metadataExpanded
                                  ? t("Collapse JSON", "Reduire JSON", "JSON einklappen", "Contraer JSON", "Recolher JSON")
                                  : t(
                                      "Expand full JSON",
                                      "Afficher le JSON complet",
                                      "Vollständiges JSON ausklappen",
                                      "Expandir JSON completo",
                                      "Expandir JSON completo"
                                    )}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                await navigator.clipboard.writeText(metadata);
                                setCopiedRowId(row.id);
                              }}
                            >
                              {copiedRowId === row.id
                                ? t("Copied", "Copie", "Kopiert", "Copiado", "Copiado")
                                : t("Copy JSON", "Copier le JSON", "JSON kopieren", "Copiar JSON", "Copiar JSON")}
                            </Button>
                          </div>
                        </div>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                          {metadataVisible}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={page <= 1 || isValidating} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          {t("Previous", "Precedent", "Zurück", "Anterior", "Anterior")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t(text(`Page ${page}`, `Page ${page}`, `Seite ${page}`, `Pagina ${page}`, `Pagina ${page}`))}
        </span>
        <Button variant="secondary" disabled={!hasMore || isValidating} onClick={() => setPage((current) => current + 1)}>
          {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
        </Button>
      </div>
    </div>
  );
}
