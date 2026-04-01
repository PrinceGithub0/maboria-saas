"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { GitBranch, PauseCircle, PlayCircle, Plus, TimerReset } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type WorkflowRecord = {
  id: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  triggers: Array<{ id?: string }>;
  actions: Array<{ id?: string }>;
  updatedAt: string;
};

const fetcher = async (url: string): Promise<WorkflowRecord[]> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.reason || payload?.error || "Unable to load workflows."));
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = payload;
    throw error;
  }
  return payload as WorkflowRecord[];
};

export default function WorkflowsPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const { data, error, isLoading } = useSWR<WorkflowRecord[]>("/api/workflows", fetcher, {
    revalidateOnFocus: false,
  });

  const workflows = useMemo(
    () =>
      (Array.isArray(data) ? data : [])
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [data]
  );

  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter((workflow) => workflow.status === "ACTIVE").length;
  const pausedWorkflows = workflows.filter((workflow) => workflow.status === "PAUSED").length;
  const totalActions = workflows.reduce((sum, workflow) => sum + workflow.actions.length, 0);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const statusLabel = (status: WorkflowStatus) => {
    if (status === "ACTIVE") return t("Active", "Actif", "Aktiv", "Activo", "Ativo");
    if (status === "PAUSED") return t("Paused", "En pause", "Pausiert", "En pausa", "Em pausa");
    if (status === "ARCHIVED") return t("Archived", "Archive", "Archiviert", "Archivado", "Arquivado");
    return t("Draft", "Brouillon", "Entwurf", "Borrador", "Rascunho");
  };

  const statusVariant = (status: WorkflowStatus): "success" | "warning" | undefined => {
    if (status === "ACTIVE") return "success";
    if (status === "PAUSED") return "warning";
    return undefined;
  };

  const errorStatus = typeof (error as Error & { status?: number } | undefined)?.status === "number"
    ? Number((error as Error & { status?: number }).status)
    : null;
  const errorData = (error as Error & { data?: { requiredPlan?: string; reason?: string } } | undefined)?.data;
  const showUpgradeState = errorStatus === 403 && String(errorData?.requiredPlan || "").toUpperCase() === "ENTERPRISE";

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {t("Workflows", "Workflows", "Workflows", "Workflows", "Workflows")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "Manage the dedicated workflow surface separately from your automation flows.",
              "Gerez la surface dediee aux workflows separement de vos flux d automatisation.",
              "Verwalte die dedizierte Workflow-Oberflaeche getrennt von deinen Automatisierungsablaeufen.",
              "Gestiona la superficie dedicada de workflows por separado de tus flujos de automatizacion.",
              "Gira a area dedicada de workflows separadamente dos seus fluxos de automatizacao."
            )}
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/workflows/new")}>
          <Plus className="h-4 w-4" />
          {t("New workflow", "Nouveau workflow", "Neuer Workflow", "Nuevo workflow", "Novo workflow")}
        </Button>
      </section>

      {showUpgradeState ? (
        <Alert variant="warning">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {errorData?.reason ||
                t(
                  "Workflow management is available on the Enterprise plan.",
                  "La gestion des workflows est disponible avec le plan Enterprise.",
                  "Die Workflow-Verwaltung ist im Enterprise-Plan verfuegbar.",
                  "La gestion de workflows esta disponible en el plan Enterprise.",
                  "A gestao de workflows esta disponivel no plano Enterprise."
                )}
            </span>
            <Button variant="secondary" onClick={() => router.push("/dashboard/subscription")}>
              {t("View plans", "Voir les offres", "Plane ansehen", "Ver planes", "Ver planos")}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!showUpgradeState && error ? (
        <Alert variant="error">
          {error instanceof Error
            ? error.message
            : t(
                "Unable to load workflows.",
                "Impossible de charger les workflows.",
                "Workflows konnten nicht geladen werden.",
                "No se pudieron cargar los workflows.",
                "Nao foi possivel carregar os workflows."
              )}
        </Alert>
      ) : null}

      {!showUpgradeState ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Total", "Total", "Gesamt", "Total", "Total")}</p>
              <GitBranch className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{totalWorkflows}</p>
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Active", "Actifs", "Aktiv", "Activos", "Ativos")}</p>
              <PlayCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{activeWorkflows}</p>
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Paused", "En pause", "Pausiert", "En pausa", "Em pausa")}</p>
              <PauseCircle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{pausedWorkflows}</p>
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Actions", "Actions", "Aktionen", "Acciones", "Acoes")}</p>
              <TimerReset className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{totalActions}</p>
          </Card>
        </section>
      ) : null}

      {!showUpgradeState && isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`workflow-skeleton-${index}`} className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : null}

      {!showUpgradeState && !isLoading && !error && workflows.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-slate-500">
            <GitBranch className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
            {t("No workflows yet", "Aucun workflow pour le moment", "Noch keine Workflows", "Todavia no hay workflows", "Ainda nao existem workflows")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
            {t(
              "Create your first workflow to start using the dedicated workflow API surface.",
              "Creez votre premier workflow pour commencer a utiliser la surface API dediee aux workflows.",
              "Erstelle deinen ersten Workflow, um die dedizierte Workflow-API zu nutzen.",
              "Crea tu primer workflow para empezar a usar la superficie API dedicada a workflows.",
              "Crie o seu primeiro workflow para comecar a usar a superficie API dedicada a workflows."
            )}
          </p>
          <div className="mt-6">
            <Button onClick={() => router.push("/dashboard/workflows/new")}>
              <Plus className="h-4 w-4" />
              {t("Create workflow", "Creer un workflow", "Workflow erstellen", "Crear workflow", "Criar workflow")}
            </Button>
          </div>
        </Card>
      ) : null}

      {!showUpgradeState && workflows.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {workflow.title}
                  </h2>
                  <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                    {workflow.description}
                  </p>
                </div>
                <Badge variant={statusVariant(workflow.status)}>
                  {statusLabel(workflow.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/70 bg-muted/40 p-3 text-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t("Triggers", "Declencheurs", "Ausloeser", "Disparadores", "Gatilhos")}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{workflow.triggers.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t("Actions", "Actions", "Aktionen", "Acciones", "Acoes")}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{workflow.actions.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{t("Updated", "Mis a jour", "Aktualisiert", "Actualizado", "Atualizado")}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-50">{formatDate(workflow.updatedAt)}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => router.push(`/dashboard/workflows/${encodeURIComponent(workflow.id)}`)}>
                  {t("Edit workflow", "Modifier le workflow", "Workflow bearbeiten", "Editar workflow", "Editar workflow")}
                </Button>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
