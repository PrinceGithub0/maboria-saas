"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load automation");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};

const resolveStatusVariant = (message?: string | null) => {
  if (!message) return "info";
  const lowered = message.toLowerCase();
  if (
    lowered.includes("saved") ||
    lowered.includes("updated") ||
    lowered.includes("created") ||
    lowered.includes("started") ||
    lowered.includes("success") ||
    lowered.includes("enregistre") ||
    lowered.includes("mis a jour") ||
    lowered.includes("cree") ||
    lowered.includes("demarre")
  ) {
    return "success";
  }
  if (
    lowered.includes("missing") ||
    lowered.includes("upgrade") ||
    lowered.includes("limit") ||
    lowered.includes("could not") ||
    lowered.includes("invalid") ||
    lowered.includes("error") ||
    lowered.includes("denied") ||
    lowered.includes("manquant") ||
    lowered.includes("limite") ||
    lowered.includes("impossible") ||
    lowered.includes("invalide") ||
    lowered.includes("erreur") ||
    lowered.includes("refuse")
  ) {
    return "error";
  }
  return "info";
};

export default function AutomationDetailsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const safeId =
    typeof id === "string" && id && id !== "undefined" && id !== "null" ? id : "";
  const { data: flow, error, isLoading } = useSWR(
    safeId ? `/api/automation/${encodeURIComponent(safeId)}` : null,
    fetcher
  );
  const [status, setStatus] = useState<string | null>(null);
  const [stepType, setStepType] = useState("parseText");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    status: "DRAFT",
    steps: [] as { type: string }[],
  });

  const stepOptions = [
    { value: "parseText", label: t("Prepare input", "Preparer l entree"), adminOnly: true },
    { value: "extractData", label: t("Extract key details", "Extraire les details"), adminOnly: true },
    { value: "callApi", label: t("Connect external service", "Connecter un service externe"), adminOnly: true },
    { value: "generateInvoice", label: t("Create invoice", "Creer une facture") },
    { value: "sendEmail", label: t("Send email", "Envoyer un email") },
    { value: "generateReport", label: t("Generate report", "Generer un rapport") },
    { value: "sendWhatsApp", label: t("Send WhatsApp message", "Envoyer WhatsApp"), plan: "Starter" },
    { value: "aiTransform", label: t("AI improve message", "IA ameliore message"), plan: "Starter" },
  ];
  const visibleStepOptions = stepOptions.filter((option) => isAdmin || !option.adminOnly);

  const getStepLabel = (type: string) => {
    const option = stepOptions.find((item) => item.value === type);
    if (option?.adminOnly && !isAdmin) return t("Internal step", "Etape interne");
    return option?.label || type;
  };

  const formatPlan = (value?: string) => {
    switch ((value || "").toLowerCase()) {
      case "starter":
        return t("Starter", "Starter");
      case "pro":
        return t("Pro", "Pro");
      case "growth":
        return t("Growth", "Growth");
      case "business":
        return t("Business", "Business");
      case "enterprise":
        return t("Enterprise", "Entreprise");
      default:
        return value || t("Upgrade", "Mise a niveau");
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const normalizeSteps = (value: any) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((step) => {
        if (typeof step === "string") return { type: step };
        if (step && typeof step.type === "string") return { type: step.type };
        return null;
      })
      .filter(Boolean) as { type: string }[];
  };

  useEffect(() => {
    setInitialized(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin) return;
    if (!visibleStepOptions.length) return;
    if (visibleStepOptions.some((option) => option.value === stepType)) return;
    setStepType(visibleStepOptions[0].value);
  }, [isAdmin, stepType, visibleStepOptions]);

  useEffect(() => {
    if (!flow || initialized) return;
    setEditForm({
      title: flow.title || "",
      description: flow.description || "",
      category: flow.category || "",
      status: flow.status || "DRAFT",
      steps: normalizeSteps(flow.steps),
    });
    setInitialized(true);
  }, [flow, initialized]);

  const runFlow = async () => {
    if (!safeId) {
      setStatus(t("Missing automation id.", "ID automation manquant."));
      return;
    }
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        body: JSON.stringify({ flowId: safeId, input: { text: "Run from details" } }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.type === "upgrade_required") {
          setStatus(
            `${json.reason || t("Upgrade required.", "Mise a niveau requise.")} ${t(
              "Required plan:",
              "Plan requis :"
            )} ${formatPlan(json.requiredPlan)}.`
          );
        } else if (json.type === "limit_reached") {
          setStatus(
            `${json.reason || t("Limit reached.", "Limite atteinte.")} ${t(
              "Required plan:",
              "Plan requis :"
            )} ${formatPlan(json.requiredPlan)}.`
          );
        } else {
          setStatus(json.reason || json.error || t("Could not run automation.", "Impossible de lancer l automation."));
        }
      } else {
        setStatus(t("Automation run started.", "Execution demarree."));
      }
    } catch {
      setStatus(t("Could not run automation. Please try again.", "Impossible de lancer l automation. Reessayez."));
    }
  };

  const deleteFlow = async () => {
    if (!safeId) {
      setStatus(t("Missing automation id.", "ID automation manquant."));
      return;
    }
    const res = await fetch(`/api/automation/${encodeURIComponent(safeId)}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/automations");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setStatus(json.error || t("Could not delete automation.", "Impossible de supprimer l automation."));
  };

  const addStep = () => {
    setEditForm((prev) => ({ ...prev, steps: [...prev.steps, { type: stepType }] }));
  };

  const removeStep = (index: number) => {
    setEditForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, idx) => idx !== index),
    }));
  };

  const saveChanges = async () => {
    if (!safeId) {
      setStatus(t("Missing automation id.", "ID automation manquant."));
      return;
    }
    if (!editForm.steps.length) {
      setStatus(t("Add at least one step before saving.", "Ajoutez au moins une etape."));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/automation/${encodeURIComponent(safeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.type === "upgrade_required") {
          setStatus(
            `${json.reason || t("Upgrade required.", "Mise a niveau requise.")} ${t(
              "Required plan:",
              "Plan requis :"
            )} ${formatPlan(json.requiredPlan)}.`
          );
        } else if (json.type === "limit_reached") {
          setStatus(
            `${json.reason || t("Limit reached.", "Limite atteinte.")} ${t(
              "Required plan:",
              "Plan requis :"
            )} ${formatPlan(json.requiredPlan)}.`
          );
        } else {
          setStatus(json.reason || json.error || t("Could not update automation.", "Impossible de modifier l automation."));
        }
      } else {
        setStatus(t("Automation updated.", "Automation mise a jour."));
      }
    } catch {
      setStatus(t("Could not update automation. Please try again.", "Impossible de modifier l automation. Reessayez."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!safeId) {
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">{t("Invalid automation link.", "Lien automation invalide.")}</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            {t("Back to automations", "Retour aux automatisations")}
          </Button>
        </Link>
      </div>
    );
  }

  if (error) {
    const statusCode = (error as any).status;
    const errorData = (error as any).data || {};
    const message =
      statusCode === 404
        ? t("Automation not found.", "Automation introuvable.")
        : errorData.reason || errorData.error || t("Unable to load automation.", "Impossible de charger l automation.");
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">{message}</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            {t("Back to automations", "Retour aux automatisations")}
          </Button>
        </Link>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">{t("Automation not found.", "Automation introuvable.")}</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            {t("Back to automations", "Retour aux automatisations")}
          </Button>
        </Link>
      </div>
    );
  }

  const statusLabel = flow?.status ? String(flow.status) : t("Draft", "Brouillon");

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {t("Automations", "Automatisations")}
            </p>
            <h1 className="text-3xl font-semibold text-foreground">{flow.title}</h1>
            <p className="text-sm text-muted-foreground">{flow.description}</p>
          </div>
          <div className="flex gap-2 max-md:flex-col max-md:items-stretch max-md:w-full">
            <Badge variant="default" className="max-md:w-fit">
              {statusLabel}
            </Badge>
            <Button variant="secondary" className="max-md:w-full" onClick={runFlow}>
              {t("Run now", "Lancer")}
            </Button>
            <Button variant="ghost" className="max-md:w-full" onClick={deleteFlow}>
              {t("Delete", "Supprimer")}
            </Button>
          </div>
        </div>
        {status && (
          <div className="mt-4 flex">
            <Alert variant={resolveStatusVariant(status)} className="inline-flex w-fit max-w-[520px]">
              {status}
            </Alert>
          </div>
        )}
      </div>
      <Card title={t("Details", "Details")}>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground">{t("Category", "Categorie")}:</span>{" "}
            {flow.category || t("General", "General")}
          </div>
          <div>
            <span className="text-foreground">{t("Created", "Cree")}:</span>{" "}
            {formatDateTime(flow.createdAt || flow.updatedAt)}
          </div>
        </div>
      </Card>
      <Card title={t("Steps", "Etapes")}>
        {normalizeSteps(flow.steps).length > 0 ? (
          <div className="space-y-2">
            {normalizeSteps(flow.steps).map((step, idx) => {
              const option = stepOptions.find((item) => item.value === step.type);
              return (
                <div
                  key={`${step.type}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="font-medium">{getStepLabel(step.type)}</span>
                    {option?.plan && (
                      <Badge variant="warning" className="text-[11px]">
                        {option.plan}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("No steps configured yet.", "Aucune etape configuree.")}
          </p>
        )}
      </Card>
      <Card title={t("Edit automation", "Modifier l automation")}>
        <div className="space-y-4 text-sm">
          <label className="flex flex-col gap-2 text-sm text-foreground">
            {t("Title", "Titre")}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            {t("Category", "Categorie")}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            {t("Description", "Description")}
            <textarea
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            {t("Status", "Statut")}
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              <option value="DRAFT">{t("Draft", "Brouillon")}</option>
              <option value="ACTIVE">{t("Active", "Actif")}</option>
              <option value="PAUSED">{t("Paused", "En pause")}</option>
              <option value="ARCHIVED">{t("Archived", "Archive")}</option>
            </select>
          </label>
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-2 text-sm text-foreground">
                {t("Step", "Etape")}
                <select
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={stepType}
                  onChange={(e) => setStepType(e.target.value)}
                >
                  {visibleStepOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="secondary" onClick={addStep}>
                {t("Add step", "Ajouter une etape")}
              </Button>
            </div>
            {editForm.steps.length > 0 ? (
              <div className="space-y-2">
                {editForm.steps.map((step, idx) => {
                  const option = stepOptions.find((item) => item.value === step.type);
                  return (
                    <div
                      key={`${step.type}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 text-foreground">
                        <span className="font-medium">{getStepLabel(step.type)}</span>
                        {option?.plan && (
                          <Badge variant="warning" className="text-[11px]">
                            {option.plan}
                          </Badge>
                        )}
                      </div>
                      {!option?.adminOnly || isAdmin ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(idx)}>
                          {t("Remove", "Retirer")}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("No steps configured yet.", "Aucune etape configuree.")}
              </p>
            )}
          </div>
          <Button type="button" loading={saving} onClick={saveChanges} className="max-md:w-full">
            {t("Save changes", "Enregistrer")}
          </Button>
        </div>
      </Card>
      <div>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            {t("Back to automations", "Retour aux automatisations")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
