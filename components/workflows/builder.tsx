"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useLanguage } from "@/components/providers/language-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
type WorkflowTrigger = { type: string; config: Record<string, unknown> };
type WorkflowAction = { type: string; config: Record<string, unknown>; order: number };
type WorkflowRecord = {
  id: string;
  title: string;
  description: string;
  status: WorkflowStatus;
  triggers: WorkflowTrigger[];
  actions: WorkflowAction[];
};

const WORKFLOW_STATUSES: WorkflowStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];
const TRIGGER_TYPES = [
  { value: "invoice_status", label: "Invoice status" },
  { value: "webhook", label: "Webhook" },
  { value: "event", label: "Event" },
];
const ACTION_TYPES = [
  { value: "sendEmail", label: "Send email" },
  { value: "sendWhatsApp", label: "Send WhatsApp" },
  { value: "callApi", label: "Call API" },
  { value: "generateInvoice", label: "Generate invoice" },
  { value: "generateReport", label: "Generate report" },
];
const INVOICE_STATUSES = ["UNPAID", "SENT", "OVERDUE", "PAID"];

const fetcher = async (url: string): Promise<WorkflowRecord> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.reason || payload?.error || "Unable to load workflow."));
  }
  return payload as WorkflowRecord;
};

function createDefaultTrigger(): WorkflowTrigger {
  return { type: "invoice_status", config: { status: "UNPAID" } };
}

function createDefaultAction(order: number): WorkflowAction {
  return { type: "sendEmail", config: { to: "user@example.com", subject: "Payment reminder" }, order };
}

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function parseJson(value: string) {
  const parsed = JSON.parse(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Action config must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeTriggerType(type: string): WorkflowTrigger {
  if (type === "webhook") return { type, config: { path: "/events" } };
  if (type === "event") return { type, config: { event: "custom_event" } };
  return { type: "invoice_status", config: { status: "UNPAID" } };
}

export function WorkflowBuilder({
  mode,
  workflowId,
}: {
  mode: "create" | "edit";
  workflowId?: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const isEdit = mode === "edit";
  const { data, error, mutate, isLoading } = useSWR(
    isEdit && workflowId ? `/api/workflows/${encodeURIComponent(workflowId)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [title, setTitle] = useState("New Workflow");
  const [description, setDescription] = useState("Describe what this workflow should do.");
  const [status, setStatus] = useState<WorkflowStatus>("DRAFT");
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([createDefaultTrigger()]);
  const [actions, setActions] = useState<WorkflowAction[]>([createDefaultAction(1)]);
  const [actionDrafts, setActionDrafts] = useState<string[]>([formatJson(createDefaultAction(1).config)]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data || hydrated) return;
    setTitle(data.title);
    setDescription(data.description);
    setStatus(data.status);
    setTriggers(data.triggers.length ? data.triggers : [createDefaultTrigger()]);
    const nextActions = (data.actions.length ? data.actions : [createDefaultAction(1)])
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((action, index) => ({ ...action, order: index + 1 }));
    setActions(nextActions);
    setActionDrafts(nextActions.map((action) => formatJson(action.config)));
    setHydrated(true);
  }, [data, hydrated]);

  const parsedActions = useMemo(() => {
    return actionDrafts.map((draft, index) => {
      try {
        return { valid: true, value: parseJson(draft) };
      } catch {
        return { valid: false, value: actions[index]?.config || {} };
      }
    });
  }, [actionDrafts, actions]);

  const previewPayload = useMemo(
    () => ({
      title,
      description,
      status,
      triggers,
      actions: actions.map((action, index) => ({
        ...action,
        order: index + 1,
        config: parsedActions[index]?.value || action.config,
      })),
    }),
    [actions, description, parsedActions, status, title, triggers]
  );

  const addTrigger = () => setTriggers((current) => [...current, createDefaultTrigger()]);

  const removeTrigger = (index: number) => {
    if (triggers.length === 1) return;
    setTriggers((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateTriggerType = (index: number, type: string) => {
    setTriggers((current) =>
      current.map((trigger, currentIndex) => (currentIndex === index ? normalizeTriggerType(type) : trigger))
    );
  };

  const updateTriggerConfig = (index: number, nextConfig: Record<string, unknown>) => {
    setTriggers((current) =>
      current.map((trigger, currentIndex) =>
        currentIndex === index ? { ...trigger, config: nextConfig } : trigger
      )
    );
  };

  const addAction = () => {
    const nextAction = createDefaultAction(actions.length + 1);
    setActions((current) => [...current, nextAction]);
    setActionDrafts((current) => [...current, formatJson(nextAction.config)]);
  };

  const removeAction = (index: number) => {
    if (actions.length === 1) return;
    const nextActions = actions
      .filter((_, currentIndex) => currentIndex !== index)
      .map((action, currentIndex) => ({ ...action, order: currentIndex + 1 }));
    setActions(nextActions);
    setActionDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateActionType = (index: number, type: string) => {
    const nextConfig = createDefaultAction(index + 1).config;
    setActions((current) =>
      current.map((action, currentIndex) =>
        currentIndex === index ? { ...action, type, config: nextConfig } : action
      )
    );
    setActionDrafts((current) =>
      current.map((draft, currentIndex) => (currentIndex === index ? formatJson(nextConfig) : draft))
    );
  };

  const updateActionDraft = (index: number, draft: string) => {
    setActionDrafts((current) =>
      current.map((value, currentIndex) => (currentIndex === index ? draft : value))
    );
    try {
      const parsed = parseJson(draft);
      setActions((current) =>
        current.map((action, currentIndex) =>
          currentIndex === index ? { ...action, config: parsed } : action
        )
      );
    } catch {
      // Preserve the last valid config while the user edits.
    }
  };

  const save = async () => {
    if (saving) return;
    if (title.trim().length < 3) {
      setMessage({ type: "error", text: t("Workflow title must be at least 3 characters.", "Le titre du workflow doit contenir au moins 3 caracteres.") });
      return;
    }
    if (description.trim().length < 5) {
      setMessage({ type: "error", text: t("Workflow description must be at least 5 characters.", "La description du workflow doit contenir au moins 5 caracteres.") });
      return;
    }

    let normalizedActions: WorkflowAction[];
    try {
      normalizedActions = actions.map((action, index) => ({
        ...action,
        order: index + 1,
        config: parseJson(actionDrafts[index] || "{}"),
      }));
    } catch (saveError) {
      setMessage({
        type: "error",
        text: saveError instanceof Error ? saveError.message : t("One action config is invalid.", "Une configuration d action est invalide."),
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        isEdit && workflowId ? `/api/workflows/${encodeURIComponent(workflowId)}` : "/api/workflows",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            status,
            triggers,
            actions: normalizedActions,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.reason || payload?.error || "Unable to save workflow."));
      }

      setMessage({
        type: "success",
        text: isEdit ? t("Workflow updated.", "Workflow mis a jour.") : t("Workflow created.", "Workflow cree."),
      });

      if (!isEdit && typeof payload?.id === "string") {
        router.replace(`/dashboard/workflows/${encodeURIComponent(payload.id)}`);
        return;
      }

      mutate(payload, { revalidate: false });
    } catch (saveError) {
      setMessage({
        type: "error",
        text: saveError instanceof Error ? saveError.message : t("Unable to save workflow.", "Impossible d enregistrer le workflow."),
      });
    } finally {
      setSaving(false);
    }
  };

  const removeWorkflow = async () => {
    if (!workflowId || deleting) return;
    if (typeof window !== "undefined" && !window.confirm(t("Delete this workflow?", "Supprimer ce workflow ?"))) {
      return;
    }

    setDeleting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.reason || payload?.error || "Unable to delete workflow."));
      }
      router.push("/dashboard/workflows");
    } catch (deleteError) {
      setMessage({
        type: "error",
        text: deleteError instanceof Error ? deleteError.message : t("Unable to delete workflow.", "Impossible de supprimer le workflow."),
      });
      setDeleting(false);
    }
  };

  if (isEdit && isLoading && !data) {
    return (
      <div className="mx-auto w-full max-w-[1080px] space-y-4">
        <div className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (isEdit && error) {
    return (
      <div className="mx-auto w-full max-w-[1080px] space-y-4">
        <Alert variant="error">
          {error instanceof Error ? error.message : t("Unable to load workflow.", "Impossible de charger le workflow.")}
        </Alert>
        <Button variant="secondary" onClick={() => router.push("/dashboard/workflows")}>
          {t("Back to workflows", "Retour aux workflows")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {isEdit ? t("Edit workflow", "Modifier le workflow") : t("New workflow", "Nouveau workflow")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              "Design trigger-based workflows and save them to your workspace.",
              "Concevez des workflows bases sur des declencheurs et enregistrez-les dans votre espace."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => router.push("/dashboard/workflows")}>
            {t("Back to workflows", "Retour aux workflows")}
          </Button>
          {isEdit ? (
            <Button variant="danger" onClick={removeWorkflow} loading={deleting}>
              {t("Delete workflow", "Supprimer le workflow")}
            </Button>
          ) : null}
        </div>
      </section>

      {message ? <Alert variant={message.type === "success" ? "success" : "error"}>{message.text}</Alert> : null}

      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={t("Title", "Titre")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("Revenue recovery workflow", "Workflow de recouvrement")}
          />
          <label className="flex flex-col gap-1 text-sm text-foreground dark:text-slate-200">
            {t("Status", "Statut")}
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
              value={status}
              onChange={(event) => setStatus(event.target.value as WorkflowStatus)}
            >
              {WORKFLOW_STATUSES.map((workflowStatus) => (
                <option key={workflowStatus} value={workflowStatus}>
                  {workflowStatus}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Textarea
          label={t("Description", "Description")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-24"
        />
      </Card>

      <Tabs
        tabs={[
          {
            id: "design",
            label: t("Design", "Conception"),
            content: (
              <div className="space-y-4">
                <Card title={t("Triggers", "Declencheurs")} actions={<Button onClick={addTrigger}>{t("Add trigger", "Ajouter un declencheur")}</Button>}>
                  <div className="space-y-3">
                    {triggers.map((trigger, index) => (
                      <div key={`${trigger.type}-${index}`} className="space-y-4 rounded-xl border border-border bg-muted/40 px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge>{t("Trigger", "Declencheur")} {index + 1}</Badge>
                            {trigger.type === "invoice_status" ? <Badge variant="success">{t("Recommended", "Recommande")}</Badge> : null}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeTrigger(index)} disabled={triggers.length === 1}>
                            {t("Remove", "Supprimer")}
                          </Button>
                        </div>

                        <label className="block text-xs text-muted-foreground">
                          {t("Trigger type", "Type de declencheur")}
                          <select
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                            value={trigger.type}
                            onChange={(event) => updateTriggerType(index, event.target.value)}
                          >
                            {TRIGGER_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {trigger.type === "invoice_status" ? (
                          <label className="block text-xs text-muted-foreground">
                            {t("Run when invoice status becomes", "Executer quand le statut de la facture devient")}
                            <select
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                              value={String(trigger.config?.status || "UNPAID")}
                              onChange={(event) => updateTriggerConfig(index, { status: event.target.value })}
                            >
                              {INVOICE_STATUSES.map((invoiceStatus) => (
                                <option key={invoiceStatus} value={invoiceStatus}>
                                  {invoiceStatus}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {trigger.type === "webhook" ? (
                          <Input
                            label={t("Webhook path", "Chemin du webhook")}
                            value={String(trigger.config?.path || "")}
                            onChange={(event) => updateTriggerConfig(index, { path: event.target.value })}
                            placeholder="/events"
                          />
                        ) : null}

                        {trigger.type === "event" ? (
                          <Input
                            label={t("Event name", "Nom de l evenement")}
                            value={String(trigger.config?.event || "")}
                            onChange={(event) => updateTriggerConfig(index, { event: event.target.value })}
                            placeholder="custom_event"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title={t("Actions", "Actions")} actions={<Button variant="secondary" onClick={addAction}>{t("Add action", "Ajouter une action")}</Button>}>
                  <div className="space-y-3">
                    {actions.map((action, index) => (
                      <div key={`${action.type}-${index}`} className="space-y-4 rounded-xl border border-border bg-muted/40 px-4 py-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="success">{t("Action", "Action")} {index + 1}</Badge>
                            <span className="text-xs text-muted-foreground">{t("Order", "Ordre")} {index + 1}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeAction(index)} disabled={actions.length === 1}>
                            {t("Remove", "Supprimer")}
                          </Button>
                        </div>

                        <label className="block text-xs text-muted-foreground">
                          {t("Action type", "Type d action")}
                          <select
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-indigo-400 focus:outline-none"
                            value={action.type}
                            onChange={(event) => updateActionType(index, event.target.value)}
                          >
                            {ACTION_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <Textarea
                          label={t("Action config (JSON)", "Configuration de l action (JSON)")}
                          value={actionDrafts[index] || "{}"}
                          onChange={(event) => updateActionDraft(index, event.target.value)}
                          className="min-h-32 font-mono text-xs"
                        />

                        {!parsedActions[index]?.valid ? (
                          <Alert variant="warning">
                            {t("This action config is invalid JSON.", "Cette configuration d action contient un JSON invalide.")}
                          </Alert>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "preview",
            label: t("Preview JSON", "Apercu JSON"),
            content: (
              <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4 text-xs text-foreground">
                {JSON.stringify(previewPayload, null, 2)}
              </pre>
            ),
          },
        ]}
      />

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          {isEdit ? t("Save changes", "Enregistrer les modifications") : t("Save workflow", "Enregistrer le workflow")}
        </Button>
      </div>
    </div>
  );
}
