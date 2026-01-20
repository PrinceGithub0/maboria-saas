"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const normalizeValue = (value: unknown) => {
  if (value === true || value === false) return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export default function SystemFlagsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const FLAG_DEFS = [
    {
      key: "maintenance_mode",
      label: t("Maintenance mode", "Mode maintenance"),
      description: t("Restrict access and show a maintenance notice.", "Limiter l'acces et afficher un avis de maintenance."),
    },
    {
      key: "allow_signup",
      label: t("New signups", "Nouvelles inscriptions"),
      description: t("Allow new users to create accounts.", "Autoriser les nouvelles inscriptions."),
    },
    {
      key: "payments_enabled",
      label: t("Payments", "Paiements"),
      description: t("Enable checkout and payment flows.", "Activer le checkout et les paiements."),
    },
    {
      key: "automation_enabled",
      label: t("Automation engine", "Moteur d'automatisation"),
      description: t("Allow automations to run and trigger.", "Autoriser l'execution des automatisations."),
    },
    {
      key: "ai_enabled",
      label: t("AI assistant", "Assistant IA"),
      description: t("Enable AI assistant features.", "Activer les fonctions de l'assistant IA."),
    },
  ];
  const { data, isLoading, mutate } = useSWR("/api/admin/system-flags", fetcher);
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const flags = Array.isArray(data) ? data : [];
  const flagsByKey = new Map(flags.map((flag: any) => [flag.key, flag.value]));

  const updateFlag = async (key: string, value: boolean) => {
    setActionLoading(key);
    setActionStatus(null);
    await mutate(
      (current: any[] = []) =>
        current.map((flag) => (flag.key === key ? { ...flag, value } : flag)),
      { revalidate: false }
    );
    const res = await fetch("/api/admin/system-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({
        message: payload.error || t("Unable to update system flag.", "Impossible de mettre a jour le drapeau systeme."),
        variant: "error",
      });
      await mutate();
    } else {
      setActionStatus({
        message: t(
          `${FLAG_DEFS.find((flag) => flag.key === key)?.label ?? "Flag"} updated.`,
          `${FLAG_DEFS.find((flag) => flag.key === key)?.label ?? "Drapeau"} mis a jour.`
        ),
        variant: "success",
      });
      await mutate();
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("System flags", "Drapeaux systeme")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Toggle platform-wide controls without deployments.", "Basculez des controles globaux sans deploiement.")}
          </p>
        </div>
      </div>
      <Card title={t("Platform controls", "Controles plateforme")}>
        {actionStatus && (
          <div className="mb-3">
            <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
          </div>
        )}
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="space-y-3">
            {FLAG_DEFS.map((flag) => {
              const currentValue = normalizeValue(flagsByKey.get(flag.key));
              return (
                <div
                  key={flag.key}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{flag.label}</p>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateFlag(flag.key, !currentValue)}
                    disabled={actionLoading === flag.key}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                      currentValue
                        ? "border-emerald-500/40 bg-emerald-500/80"
                        : "border-border bg-muted"
                    }`}
                    aria-pressed={currentValue}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition ${
                        currentValue ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
