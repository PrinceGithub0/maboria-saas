"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";

export default function NewAutomationPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    steps: [] as { type: string }[],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepType, setStepType] = useState("parseText");

  const stepOptions = [
    { value: "parseText", label: t("Prepare input", "Preparer l entree"), adminOnly: true },
    { value: "extractData", label: t("Extract key details", "Extraire les details"), adminOnly: true },
    { value: "callApi", label: t("Connect external service", "Connecter un service externe"), adminOnly: true },
    { value: "generateInvoice", label: t("Create invoice", "Creer une facture") },
    { value: "sendEmail", label: t("Send email", "Envoyer un email") },
    { value: "generateReport", label: t("Generate report", "Generer un rapport") },
    { value: "sendWhatsApp", label: t("Send WhatsApp message", "Envoyer WhatsApp"), plan: "Pro" },
    { value: "aiTransform", label: t("AI improve message", "IA ameliore message"), plan: "Pro" },
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
      case "enterprise":
        return t("Enterprise", "Entreprise");
      default:
        return value || t("Upgrade", "Mise a niveau");
    }
  };

  const resolveStatusVariant = (message?: string | null) => {
    if (!message) return "info";
    const lowered = message.toLowerCase();
    if (
      lowered.includes("could not") ||
      lowered.includes("missing") ||
      lowered.includes("upgrade") ||
      lowered.includes("limit") ||
      lowered.includes("error") ||
      lowered.includes("denied") ||
      lowered.includes("impossible") ||
      lowered.includes("manquant") ||
      lowered.includes("limite") ||
      lowered.includes("erreur") ||
      lowered.includes("refuse")
    ) {
      return "error";
    }
    if (
      lowered.includes("saved") ||
      lowered.includes("started") ||
      lowered.includes("updated") ||
      lowered.includes("enregistre") ||
      lowered.includes("demarre") ||
      lowered.includes("mis a jour")
    ) {
      return "success";
    }
    return "info";
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.steps.length) {
      setStatus(t("Add at least one step before saving.", "Ajoutez au moins une etape."));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "ACTIVE" }),
    });
    let json: any = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
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
        setStatus(json.reason || json.error || t("Could not save automation.", "Impossible d enregistrer."));
      }
    } else {
      const savedId = json?.id || json?.flow?.id;
      const safeId =
        typeof savedId === "string" && savedId && savedId !== "undefined" && savedId !== "null"
          ? savedId
          : "";
      if (!safeId) {
        setStatus(
          t(
            "Saved, but could not resolve the automation id. Returning to list.",
            "Enregistre, mais ID introuvable. Retour a la liste."
          )
        );
        router.push("/dashboard/automations");
        return;
      }
      setStatus(t("Saved. Opening details...", "Enregistre. Ouverture..."));
      router.push(`/dashboard/automations/${encodeURIComponent(safeId)}`);
    }
    setLoading(false);
  };

  const addStep = () => {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, { type: stepType }] }));
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, idx) => idx !== index),
    }));
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Automations", "Automatisations")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Create automation", "Creer une automation")}</h1>
        </div>
        {status && (
          <div className="mt-4 flex">
            <Alert
              variant={resolveStatusVariant(status)}
              className="inline-flex w-fit max-w-[520px]"
            >
              {status}
            </Alert>
          </div>
        )}
      </div>
      <Card>
        <form className="space-y-4" onSubmit={save}>
          <Input
            label={t("Title", "Titre")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("Daily onboarding emails", "Emails d accueil quotidiens")}
            autoFocus
          />
          <Input
            label={t("Category", "Categorie")}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder={t("Onboarding", "Onboarding")}
          />
          <label className="flex flex-col gap-2 text-sm text-foreground">
            {t("Description", "Description")}
            <textarea
              className="rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("Explain what this automation does...", "Expliquez ce que fait cette automation...")}
            />
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
            {form.steps.length > 0 ? (
              <div className="space-y-2">
                {form.steps.map((step, idx) => {
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
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(idx)}>
                        {t("Remove", "Retirer")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("No steps added yet.", "Aucune etape ajoutee.")}
              </p>
            )}
          </div>
          <Button type="submit" loading={loading} className="max-md:w-full">
            {t("Save automation", "Enregistrer l automation")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
