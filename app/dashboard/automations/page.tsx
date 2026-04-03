"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Copy, GitBranch, PencilLine } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
const AUTOMATION_STATUSES: AutomationStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

const normalizeAutomationStatus = (value: unknown, fallback: AutomationStatus = "DRAFT"): AutomationStatus => {
  const next = String(value || "").trim().toUpperCase() as AutomationStatus;
  return AUTOMATION_STATUSES.includes(next) ? next : fallback;
};

const isRawValidationError = (value: unknown) =>
  typeof value === "string" &&
  (value.includes("Invalid option: expected one of") || value.includes(`path: ["status"]`));

const resolveAutomationErrorMessage = (
  payload: any,
  fallback: string,
  devLabel: string
) => {
  const raw = payload?.reason ?? payload?.error;
  if (typeof raw === "string" && !isRawValidationError(raw)) {
    return raw;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(devLabel, payload);
  }
  return fallback;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load automations");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};

const templates = [
  {
    id: "overdue_reminder_3_days",
  },
  {
    id: "whatsapp_thank_you",
  },
  {
    id: "notify_invoice_paid",
  },
];

export default function AutomationsPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];

  const { data: flows, error: flowsError, mutate, isLoading } = useSWR("/api/automation", fetcher);
  const { data: runs } = useSWR("/api/automation/runs", fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const flowList = useMemo(() => (Array.isArray(flows) ? flows : []), [flows]);
  const runList = useMemo(() => (Array.isArray(runs) ? runs : []), [runs]);

  const runsByFlow = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const run of runList) {
      const flowId = String(run?.flowId || run?.flow?.id || "");
      if (!flowId) continue;
      const current = grouped.get(flowId) || [];
      current.push(run);
      grouped.set(flowId, current);
    }
    for (const [key, list] of grouped.entries()) {
      list.sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      grouped.set(key, list);
    }
    return grouped;
  }, [runList]);

  const sortedFlows = useMemo(() => {
    return [...flowList].sort((a: any, b: any) => {
      const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [flowList]);

  const activeAutomations = flowList.filter((flow: any) => normalizeAutomationStatus(flow?.status) === "ACTIVE").length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const monthlyRuns = runList.filter((run: any) => {
    const createdAt = run?.createdAt ? new Date(run.createdAt).getTime() : 0;
    return createdAt >= monthStart;
  });
  const executionsThisMonth = monthlyRuns.length;
  const successfulRuns = monthlyRuns.filter((run: any) => {
    const state = String(run?.runStatus || run?.status || "").toUpperCase();
    return state === "SUCCESS" || state === "COMPLETED";
  }).length;
  const successRate = executionsThisMonth > 0 ? Math.round((successfulRuns / executionsThisMonth) * 100) : 0;

  const isActive = (status?: string) => normalizeAutomationStatus(status) === "ACTIVE";

  const getStatusLabel = (status?: string) => {
    const normalized = normalizeAutomationStatus(status);
    if (normalized === "ACTIVE") return t("Active", "Actif", "Aktiv", "Activa", "Ativa");
    if (normalized === "PAUSED") return t("Paused", "En pause", "Pausiert", "Pausada", "Em pausa");
    if (normalized === "ARCHIVED") return t("Archived", "Archive", "Archiviert", "Archivada", "Arquivada");
    return t("Draft", "Brouillon", "Entwurf", "Borrador", "Rascunho");
  };

  const getStatusClass = (status?: string) => {
    const normalized = normalizeAutomationStatus(status);
    if (normalized === "ACTIVE") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300";
    if (normalized === "PAUSED") return "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  };

  const formatRelativeTime = (value?: string) => {
    if (!value) return t("Never", "Jamais", "Nie", "Nunca", "Nunca");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("Never", "Jamais", "Nie", "Nunca", "Nunca");
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60 * 1000) return t("just now", "a l instant", "gerade eben", "justo ahora", "agora mesmo");
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 1000 * 60 * 60 * 24 * 365],
      ["month", 1000 * 60 * 60 * 24 * 30],
      ["day", 1000 * 60 * 60 * 24],
      ["hour", 1000 * 60 * 60],
      ["minute", 1000 * 60],
    ];
    for (const [unit, ms] of units) {
      const count = Math.floor(diffMs / ms);
      if (count > 0) return formatter.format(-count, unit);
    }
    return t("just now", "a l instant", "gerade eben", "justo ahora", "agora mesmo");
  };

  const resolveSummary = (flow: any) => {
    const description = String(flow?.description || "").trim();
    if (description) return description;
    return t(
      "When invoice becomes overdue ? Send WhatsApp message",
      "Quand une facture devient en retard ? Envoyer un message WhatsApp",
      "Wenn eine Rechnung überfällig wird - WhatsApp-Nachricht senden",
      "Cuando una factura vence - enviar mensaje de WhatsApp",
      "Quando uma fatura entra em atraso - enviar mensagem WhatsApp"
    );
  };

  const setBusy = (action: string, id: string) => setBusyKey(`${action}:${id}`);
  const clearBusy = () => setBusyKey(null);
  const isBusy = (action: string, id: string) => busyKey === `${action}:${id}`;

  const duplicateFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatusMessage(t("Missing automation id.", "ID automation manquant.", "Automatisierungs-ID fehlt.", "Falta el ID de la automatización.", "Falta o ID da automação."));
      return;
    }

    setBusy("duplicate", flowId);
    setStatusMessage(null);

    try {
      const detailRes = await fetch(`/api/automation/${encodeURIComponent(flowId)}`, {
        cache: "no-store",
      });
      const detailJson = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) {
        setStatusMessage(
          resolveAutomationErrorMessage(
            detailJson,
            t("Could not duplicate automation.", "Impossible de dupliquer.", "Automatisierung konnte nicht dupliziert werden.", "No se pudo duplicar la automatización.", "Não foi possivel duplicar a automação."),
            "automation_duplicate_load_failed"
          )
        );
        return;
      }

      const sourceFlow = detailJson && typeof detailJson === "object" ? detailJson : flow;
      const copyTitle = `${flow.title || t("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação")} (${t("Copy", "Copie", "Kopie", "Copia", "Copia")})`;
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: copyTitle,
          description: sourceFlow?.description || "",
          steps: Array.isArray(sourceFlow?.steps) ? sourceFlow.steps : [],
          category: typeof sourceFlow?.category === "string" ? sourceFlow.category : undefined,
          aiParams:
            sourceFlow?.aiParams && typeof sourceFlow.aiParams === "object" && !Array.isArray(sourceFlow.aiParams)
              ? sourceFlow.aiParams
              : undefined,
          status: "DRAFT",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage(
          resolveAutomationErrorMessage(
            json,
            t("Could not duplicate automation.", "Impossible de dupliquer.", "Automatisierung konnte nicht dupliziert werden.", "No se pudo duplicar la automatización.", "Não foi possivel duplicar a automação."),
            "automation_duplicate_failed"
          )
        );
      } else {
        setStatusMessage(t("Automation duplicated.", "Automatisation dupliquee.", "Automatisierung dupliziert.", "Automatización duplicada.", "Automação duplicada."));
        mutate();
      }
    } catch {
      setStatusMessage(t("Could not duplicate automation.", "Impossible de dupliquer.", "Automatisierung konnte nicht dupliziert werden.", "No se pudo duplicar la automatización.", "Não foi possivel duplicar a automação."));
    } finally {
      clearBusy();
    }
  };

  const toggleFlow = async (flow: any) => {
    const flowId = String(flow?.id || "");
    if (!flowId) {
      setStatusMessage(t("Missing automation id.", "ID automation manquant.", "Automatisierungs-ID fehlt.", "Falta el ID de la automatización.", "Falta o ID da automação."));
      return;
    }

    const nextStatus = isActive(flow?.status) ? "PAUSED" : "ACTIVE";
    setBusy("toggle", flowId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/automation/${encodeURIComponent(flowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage(
          resolveAutomationErrorMessage(
            json,
            t("Unable to update automation. Please try again.", "Impossible de mettre a jour l automation. Reessayez.", "Automatisierung konnte nicht aktualisiert werden. Bitte versuche es erneut.", "No se pudo actualizar la automatización. Intentalo de nuevo.", "Não foi possivel atualizar a automação. Tente novamente."),
            "automation_toggle_failed"
          )
        );
      } else {
        setStatusMessage(t("Automation updated.", "Automatisation mise a jour.", "Automatisierung aktualisiert.", "Automatizacion actualizada.", "Automacao atualizada."));
        mutate();
      }
    } catch {
      setStatusMessage(t("Could not update automation.", "Impossible de mettre a jour.", "Automatisierung konnte nicht aktualisiert werden.", "No se pudo actualizar la automatización.", "Não foi possivel atualizar a automação."));
    } finally {
      clearBusy();
    }
  };

  const stats = [
    {
      label: t("Active Automations", "Automations actives", "Aktive Automatisierungen", "Automatizaciónes activas", "Automações ativas"),
      value: activeAutomations.toLocaleString(),
      subtext: t("Currently running", "Actuellement en cours", "Derzeit aktiv", "En ejecucion", "Em execucao"),
    },
    {
      label: t("Executions This Month", "Executions ce mois", "Ausfuhrungen diesen Monat", "Ejecuciones este mes", "Execucoes este mes"),
      value: executionsThisMonth.toLocaleString(),
      subtext: t("Across all automations", "Toutes automatisations confondues", "uber alle Automatisierungen hinweg", "En todas las automatizaciones", "Em todas as automacoes"),
    },
    {
      label: t("Successful Runs", "Runs reussis", "Erfolgreiche Ausfuhrungen", "Ejecuciones correctas", "Execucoes bem-sucedidas"),
      value: successfulRuns.toLocaleString(),
      subtext: t("Completed successfully", "Completes avec succes", "Erfolgreich abgeschlossen", "Completadas con exito", "Concluidas com sucesso"),
    },
    {
      label: t("Success Rate", "Taux de succes", "Erfolgsquote", "Tasa de exito", "Taxa de sucesso"),
      value: `${successRate.toLocaleString()}%`,
      subtext:
        executionsThisMonth > 0
          ? t("Based on this month's runs", "Base sur les runs de ce mois", "Basierend auf den Ausfuhrungen dieses Monats", "Basado en las ejecuciones de este mes", "Com base nas execucoes deste mes")
          : t("No runs recorded this month", "Aucun run enregistre ce mois", "Keine Ausfuhrungen in diesem Monat", "No se registraron ejecuciones este mes", "Não ha execucoes registadas este mes"),
    },
  ];

  const localizedTemplates = useMemo(
    () =>
      templates.map((template) => {
        if (template.id === "overdue_reminder_3_days") {
          return {
            ...template,
            title: t("Send payment reminder after 3 days", "Envoyer un rappel de paiement apres 3 jours", "Zahlungserinnerung nach 3 Tagen senden", "Enviar recordatorio de pago despues de 3 dias", "Enviar lembrete de pagamento após 3 dias"),
            description: t("Auto-send reminder if invoice unpaid.", "Envoyer automatiquement un rappel si la facture reste impayee.", "Erinnerung automatisch senden, wenn die Rechnung unbezahlt bleibt.", "Enviar recordatorio automatico si la factura sigue impagada.", "Enviar lembrete automaticamente se a fatura continuar por pagar."),
          };
        }
        if (template.id === "whatsapp_thank_you") {
          return {
            ...template,
            title: t("Send WhatsApp thank you message", "Envoyer un message WhatsApp de remerciement", "WhatsApp-Dankesnachricht senden", "Enviar mensaje de agradecimiento por WhatsApp", "Enviar mensagem de agradecimento por WhatsApp"),
            description: t("Automatically thank customers after payment.", "Remercier automatiquement les clients apres paiement.", "Kundinnen und Kunden nach der Zahlung automatisch danken.", "Agradecer automaticamente a los clientes tras el pago.", "Agradecer automaticamente aos clientes após o pagamento."),
          };
        }
        return {
          ...template,
          title: t("Notify when invoice is paid", "Notifier quand la facture est payee", "Benachrichtigen, wenn eine Rechnung bezahlt wird", "Notificar cuando se pague la factura", "Notificar quando a fatura for paga"),
          description: t("Send instant alerts when invoices are settled.", "Envoyer des alertes instantanees quand les factures sont reglees.", "Sofortige Hinweise senden, wenn Rechnungen beglichen sind.", "Enviar alertas instantaneas cuando se liquiden facturas.", "Enviar alertas imediatos quando as faturas forem liquidadas."),
        };
      }),
    [t]
  );

  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-8 bg-background px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Create automations that run your business automatically.",
              "Creez des automatisations qui executent votre entreprise automatiquement.",
              "Erstelle Automatisierungen, die dein Unternehmen automatisch ausfuhren.",
              "Crea automatizaciones que ejecuten tu negocio automaticamente.",
              "Crie automacoes que executem o seu negocio automaticamente."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/automations/new")}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
        >
          {t("New Automation", "Nouvelle automatisation", "Neue Automatisierung", "Nueva automatización", "Nova automação")}
        </button>
      </section>

      {statusMessage ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">{statusMessage}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.subtext}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-2xl border border-border bg-card shadow-sm" />
            ))}
          </div>
        ) : null}

        {flowsError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
            {resolveAutomationErrorMessage(
              (flowsError as any)?.data,
              t("Unable to load automations.", "Impossible de charger les automatisations.", "Automatisierungen konnten nicht geladen werden.", "No se pudieron cargar las automatizaciones.", "Não foi possivel carregar as automações."),
              "automation_list_load_failed"
            )}
          </div>
        ) : null}

        {!isLoading && !flowsError && sortedFlows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
              <GitBranch className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("No automations yet", "Aucune automatisation", "Noch keine Automatisierungen", "Aún no hay automatizaciones", "Ainda não ha automações")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {t(
                "Create your first automation to start automating your business.",
                "Creez votre premiere automatisation pour commencer a automatiser votre entreprise.",
                "Erstelle deine erste Automatisierung, um dein Unternehmen zu automatisieren.",
                "Crea tu primera automatizacion para empezar a automatizar tu negocio.",
                "Crie a sua primeira automacao para comecar a automatizar o negocio."
              )}
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard/automations/new")}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
            >
              {t("Create Automation", "Creer une automatisation", "Automatisierung erstellen", "Crear automatización", "Criar automação")}
            </button>
          </div>
        ) : null}

        {sortedFlows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedFlows.map((flow: any) => {
              const flowId = String(flow?.id || "");
              const flowRuns = runsByFlow.get(flowId) || [];
              const lastRun = flowRuns[0]?.createdAt;
              const executionsCount = flowRuns.length;
              const active = isActive(flow?.status);

              return (
                <article
                  key={flowId}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-border/80 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                        <GitBranch className="h-4 w-4" />
                      </span>
                      <h3 className="truncate text-lg font-semibold text-foreground">
                        {flow?.title || t("Untitled automation", "Automatisation sans titre", "Unbenannte Automatisierung", "Automatización sin título", "Automação sem título")}
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClass(flow?.status)}`}>
                      {getStatusLabel(flow?.status)}
                    </span>
                  </div>

                  <p className="mt-3 truncate text-sm text-muted-foreground">{resolveSummary(flow)}</p>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {t("Runs", "Executions", "Ausfuhrungen", "Ejecuciones", "Execucoes")}: <span className="font-semibold text-foreground">{executionsCount}</span>
                    </span>
                    <span className="text-right">
                      {t("Last run", "Derniere execution", "Letzte Ausfuhrung", "Ultima ejecucion", "Ultima execucao")}: <span className="font-semibold text-foreground">{formatRelativeTime(lastRun)}</span>
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/automations/${encodeURIComponent(flowId)}`)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-semibold text-foreground transition hover:bg-muted/80 sm:w-auto"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        {t("Edit", "Modifier", "Bearbeiten", "Editar", "Editar")}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy("duplicate", flowId)}
                        onClick={() => duplicateFlow(flow)}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-semibold text-foreground transition hover:bg-muted/80 disabled:opacity-60 sm:w-auto"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t("Duplicate", "Dupliquer", "Duplizieren", "Duplicar", "Duplicar")}
                      </button>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={t("Toggle automation", "Basculer l automatisation", "Automatisierung umschalten", "Cambiar automatización", "Alternar automação")}
                      disabled={isBusy("toggle", flowId)}
                      onClick={() => toggleFlow(flow)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                        active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          active ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t("Templates", "Modeles", "Vorlagen", "Plantillas", "Modelos")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {localizedTemplates.map((template) => (
            <article key={template.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-sm">
                  <GitBranch className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">{template.title}</h3>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/automations/new?template=${encodeURIComponent(template.id)}`)}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-muted px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted/80"
              >
                {t("Use Template", "Utiliser le modele", "Vorlage verwenden", "Usar plantilla", "Usar modelo")}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

