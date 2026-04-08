"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";
import type { AdminTenantListResponse } from "@/lib/admin/tenants-types";

type TenantAction = {
  type: "suspend" | "reactivate";
  tenantId: string;
  tenantName: string;
};

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const STATUS_LABELS: Record<string, CompleteLocalizedText> = {
  ACTIVE: text("Active", "Actif", "Aktiv", "Activo", "Ativo"),
  SUSPENDED: text("Suspended", "Suspendu", "Gesperrt", "Suspendido", "Suspenso"),
  DISABLED: text("Disabled", "D?sactiv?", "Deaktiviert", "Deshabilitado", "Desativado"),
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function badgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

function normalizeSort(value: string) {
  if (value === "created_asc") return "created_asc";
  if (value === "activity_desc") return "activity_desc";
  if (value === "activity_asc") return "activity_asc";
  return "created_desc";
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [action, setAction] = useState<TenantAction | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string } | null>(
    null
  );

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status !== "all") params.set("status", status);
    if (plan !== "all") params.set("plan", plan);
    params.set("sort", normalizeSort(sort));
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/admin/tenants?${params.toString()}`;
  }, [page, pageSize, plan, query, sort, status]);

  const { data, error, isLoading, mutate } = useSWR<AdminTenantListResponse>(requestKey, fetcher);

  useEffect(() => {
    setPage(1);
  }, [query, status, plan, sort]);

  const items = data?.items || [];
  const pagination = data?.pagination;
  const isSuperAdmin = data?.actorRole === "SUPER_ADMIN";

  const runAction = async () => {
    if (!action) return;
    setSaving(true);
    setFeedback(null);
    try {
      const endpoint =
        action.type === "suspend"
          ? `/api/admin/tenants/${action.tenantId}/suspend`
          : `/api/admin/tenants/${action.tenantId}/reactivate`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action.type === "suspend" ? JSON.stringify({ reason: reason.trim() || undefined }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || t("Action failed.", "?chec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")));
      }
      setFeedback({
        variant: "success",
        message:
          action.type === "suspend"
            ? `${t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")} "${action.tenantName}" ${t("suspended.", "suspendu.", "gesperrt.", "suspendido.", "suspenso.")}`
            : `${t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")} "${action.tenantName}" ${t("reactivated.", "réactivé.", "reaktiviert.", "reactivado.", "reativado.")}`,
      });
      setAction(null);
      setReason("");
      await mutate();
    } catch (actionError) {
      setFeedback({
        variant: "error",
        message:
          actionError instanceof Error
            ? localizeAdminServerMessage(
                actionError.message,
                language,
                t("Action failed.", "?chec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")
              )
            : t("Action failed.", "?chec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSuspendClick = (tenantId: string, tenantName: string) => {
    if (!isSuperAdmin) {
      setFeedback({
        variant: "error",
        message: t("Only Super Admin accounts can suspend tenants.", "Seuls les comptes Super Admin peuvent suspendre des locataires.", "Nur Super-Admin-Konten koennen Mandanten sperren.", "Solo las cuentas Super Admin pueden suspender tenants.", "Apenas contas Super Admin podem suspender tenants."),
      });
      return;
    }
    setAction({ type: "suspend", tenantId, tenantName });
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
        <h1 className="text-3xl font-semibold text-foreground">{t("Tenants", "Locataires", "Mandanten", "Tenants", "Tenants")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Monitor workspace health, lifecycle status, and high-risk tenant signals.", "Surveillez la santé des espaces de travail, leur cycle de vie et les signaux de risque élevé.", "Überwachen Sie den Zustand der Arbeitsbereiche, den Lebenszyklusstatus und Hochrisiko-Signale von Mandanten.", "Supervisa la salud del espacio de trabajo, el estado del ciclo de vida y las senales de alto riesgo del tenant.", "Monitorize a saude da area de trabalho, o estado do ciclo de vida e os sinais de alto risco do tenant.")}
        </p>
      </div>

      {feedback ? (
        <Alert variant={feedback.variant}>
          {feedback.variant === "error"
            ? localizeAdminServerMessage(
                feedback.message,
                language,
                t("Action failed.", "?chec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")
              )
            : feedback.message}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error">
          {localizeAdminServerMessage(
            error.message,
            language,
            t(
              "Unable to load tenants right now.",
              "Impossible de charger les locataires pour le moment.",
              "Mandanten koennen derzeit nicht geladen werden.",
              "No se pueden cargar los tenants en este momento.",
              "Não foi possível carregar os tenants neste momento."
            )
          )}
        </Alert>
      ) : null}

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search by workspace, owner email, or tenant ID", "Rechercher par espace de travail, e-mail du proprietaire ou ID locataire", "Nach Arbeitsbereich, Inhaber-E-Mail oder Mandanten-ID suchen", "Buscar por espacio de trabajo, correo del propietario o ID del tenant", "Pesquisar por area de trabalho, e-mail do proprietário ou ID do tenant")}
            className="md:col-span-2"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">{t("All statuses", "Tous les statuts", "Alle Status", "Todos los estados", "Todos os estados")}</option>
            <option value="ACTIVE">{t(STATUS_LABELS.ACTIVE)}</option>
            <option value="SUSPENDED">{t(STATUS_LABELS.SUSPENDED)}</option>
            <option value="DISABLED">{t(STATUS_LABELS.DISABLED)}</option>
          </select>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">{t("All plans", "Tous les forfaits", "Alle Plaene", "Todos los planes", "Todos os planos")}</option>
            <option value="STARTER">{t("Starter", "Starter", "Starter", "Starter", "Starter")}</option>
            <option value="PRO">{t("Pro", "Pro", "Pro", "Pro", "Pro")}</option>
            <option value="GROWTH">{t("Growth", "Croissance", "Growth", "Growth", "Growth")}</option>
            <option value="BUSINESS">{t("Business", "Business", "Business", "Business", "Business")}</option>
            <option value="ENTERPRISE">{t("Enterprise", "Enterprise", "Enterprise", "Enterprise", "Enterprise")}</option>
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="created_desc">{t("Newest first", "Plus recents d'abord", "Neueste zuerst", "Más recientes primero", "Mais recentes primeiro")}</option>
            <option value="created_asc">{t("Oldest first", "Plus anciens d'abord", "Aelteste zuerst", "Más antiguos primero", "Mais antigos primeiro")}</option>
            <option value="activity_desc">{t("Latest activity", "Activit? la plus recente", "Neueste Aktivitaet", "Actividad más reciente", "Atividade mais recente")}</option>
            <option value="activity_asc">{t("Earliest activity", "Activit? la plus ancienne", "Aelteste Aktivitaet", "Actividad más antigua", "Atividade mais antiga")}</option>
          </select>
        </div>
      </Card>

      <Card title={t("Tenant workspaces", "Espaces de travail locataires", "Mandanten-Arbeitsbereiche", "Espacios de trabajo del tenant", "Areas de trabalho do tenant")}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("No tenants found for the current filters.", "Aucun locataire trouvé pour les filtres actuels.", "Keine Mandanten für die aktuellen Filter gefunden.", "No se encontraron tenants para los filtros actuales.", "Não foram encontrados tenants para os filtros atuais.")}
          </p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border/60 md:block">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-muted/30 text-left text-xs tracking-[0.08em] text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">{t("Workspace", "Espace de travail", "Arbeitsbereich", "Espacio de trabajo", "Area de trabalho")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Tenant ID", "ID locataire", "Mandanten-ID", "ID del tenant", "ID do tenant")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Owner", "Proprietaire", "Inhaber", "Propietario", "Proprietário")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Plan", "Forfait", "Plan", "Plan", "Plano")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Status", "Statut", "Status", "Estado", "Estado")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Created", "Cr??", "Erstellt", "Creado", "Criado")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Last activity", "Derni?re activité", "Aktivität", "Última actividad", "Última atividade")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Risk", "Risque", "Risiko", "Riesgo", "Risco")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Actions", "Actions", "Aktionen", "Acciones", "Ações")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="cursor-pointer border-t border-border/50 transition-colors hover:bg-muted/35"
                      onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                    >
                      <td className="px-3 py-3 font-semibold text-foreground">{tenant.name}</td>
                      <td className="break-all px-3 py-3 font-mono text-xs text-muted-foreground">{tenant.id}</td>
                      <td className="px-3 py-3">
                        <p className="text-foreground">{tenant.owner.name || tenant.owner.email}</p>
                        <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {tenant.owner.email}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-foreground">{tenant.plan || "-"}</td>
                      <td className="px-3 py-3">
                        <Badge variant={badgeVariant(tenant.status)}>{t(STATUS_LABELS[tenant.status] || text(tenant.status, tenant.status, tenant.status, tenant.status, tenant.status))}</Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDateDMY(new Date(tenant.createdAt), LANGUAGE_LOCALES[language])}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {tenant.lastActivityAt ? formatDateTimeDMY(new Date(tenant.lastActivityAt), LANGUAGE_LOCALES[language]) : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={tenant.riskFlags > 0 ? "warning" : "success"}>{tenant.riskFlags}</Badge>
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <div className="grid min-w-0 gap-2" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/admin/tenants/${tenant.id}`} className="block">
                            <Button size="sm" variant="secondary" className="w-full">
                              {t("View", "Voir", "Ansehen", "Ver", "Ver")}
                            </Button>
                          </Link>
                          {tenant.status === "SUSPENDED" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() =>
                                setAction({ type: "reactivate", tenantId: tenant.id, tenantName: tenant.name })
                              }
                            >
                              {t("Reactivate", "Reactiver", "Reaktivieren", "Reactivar", "Reativar")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-rose-600 hover:text-rose-700"
                              onClick={() => handleSuspendClick(tenant.id, tenant.name)}
                            >
                              {t("Suspend", "Suspendre", "Sperren", "Suspender", "Suspender")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                  className="w-full rounded-2xl border border-border/60 bg-card p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{tenant.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{tenant.owner.email}</p>
                    </div>
                    <Badge variant={badgeVariant(tenant.status)}>{t(STATUS_LABELS[tenant.status] || text(tenant.status, tenant.status, tenant.status, tenant.status, tenant.status))}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">{tenant.id}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>{t("Plan:", "Forfait :", "Plan:", "Plan:", "Plano:")} {tenant.plan || "-"}</span>
                    <span>{t("Risk:", "Risque :", "Risiko:", "Riesgo:", "Risco:")} {tenant.riskFlags}</span>
                    <span>{t("Created:", "Cr?? :", "Erstellt:", "Creado:", "Criado:")} {formatDateDMY(new Date(tenant.createdAt), LANGUAGE_LOCALES[language])}</span>
                    <span>
                      {t("Last:", "Dernier :", "Letzte:", "Último:", "Última:")} {tenant.lastActivityAt ? formatDateDMY(new Date(tenant.lastActivityAt), LANGUAGE_LOCALES[language]) : "-"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t("Page", "Page", "Seite", "Página", "Página")} {pagination?.page || page} {t("of", "sur", "von", "de", "de")} {pagination?.totalPages || 1} | {pagination?.totalItems || 0} {t("tenants", "locataires", "Mandanten", "tenants", "tenants")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={(pagination?.page || page) <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {t("Previous", "Precedent", "Zurueck", "Anterior", "Anterior")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={(pagination?.page || page) >= (pagination?.totalPages || 1)}
              onClick={() => setPage((prev) => prev + 1)}
            >
              {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(action)}
        onClose={() => {
          if (saving) return;
          setAction(null);
          setReason("");
        }}
        title={action?.type === "suspend" ? t("Suspend tenant", "Suspendre le locataire", "Mandanten sperren", "Suspender tenant", "Suspender tenant") : t("Reactivate tenant", "Reactiver le locataire", "Mandanten reaktivieren", "Reactivar tenant", "Reativar tenant")}
      >
        {action ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {action.type === "suspend"
                ? `${t("Suspend", "Suspendre", "Sperren", "Suspender", "Suspender")} "${action.tenantName}"? ${t("This blocks subscriber login and API access without deleting data.", "Cela bloque la connexion des abonnés et l'accès API sans supprimer les données.", "Dies blockiert die Anmeldung von Abonnenten und den API-Zugriff, ohne Daten zu loeschen.", "Esto bloquea el inicio de sesión de suscriptores y el acceso a la API sin eliminar datos.", "Isto bloqueia o inicio de sessão dos subscritores e o acesso a API sem eliminar dados.")}`
                : `${t("Reactivate", "Reactiver", "Reaktivieren", "Reactivar", "Reativar")} "${action.tenantName}"? ${t("Login and API access will be restored.", "La connexion et l'accès API seront retablis.", "Login und API-Zugriff werden wiederhergestellt.", "Se restauraran el inicio de sesión y el acceso a la API.", "O inicio de sessão e o acesso a API serao restaurados.")}`}
            </p>
            {action.type === "suspend" ? (
              <Input
                label={t("Reason (optional)", "Raison (optionnelle)", "Grund (optional)", "Motivo (opcional)", "Motivo (opcional)")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("Policy, abuse, billing escalation...", "Politique, abus, escalation de facturation...", "Richtlinie, Missbrauch, Eskalation bei Abrechnung...", "Política, abuso, escalacion de facturación...", "Política, abuso, escalacao de faturação...")}
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (saving) return;
                  setAction(null);
                  setReason("");
                }}
              >
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </Button>
              <Button onClick={runAction} loading={saving}>
                {action.type === "suspend" ? t("Suspend tenant", "Suspendre le locataire", "Mandanten sperren", "Suspender tenant", "Suspender tenant") : t("Reactivate tenant", "Reactiver le locataire", "Mandanten reaktivieren", "Reactivar tenant", "Reativar tenant")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

