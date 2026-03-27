"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";

type PlanIntent = "starter" | "pro" | "growth" | "business";

const PLAN_OPTIONS: Array<{
  value: PlanIntent;
}> = [
  { value: "starter" },
  { value: "pro" },
  { value: "growth" },
  { value: "business" },
];

export default function StartWorkspacePage() {
  const { language, t } = useLanguage();
  const [planIntent, setPlanIntent] = useState<PlanIntent>("starter");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/account/start-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planIntent }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(localizeServerMessage(payload?.error, language, t("Unable to start workspace setup.", "Impossible de demarrer la configuration de l'espace de travail.", "Workspace-Einrichtung kann nicht gestartet werden.", "No se pudo iniciar la configuraciÃ³n del espacio de trabajo.", "NÃ£o foi possivel iniciar a configuraÃ§Ã£o do espaco de trabalho.")));
        return;
      }

      window.location.href =
        typeof payload?.redirectTo === "string" && payload.redirectTo ? payload.redirectTo : "/checkout";
    } catch {
      setError(t("Unable to start workspace setup.", "Impossible de demarrer la configuration de l'espace de travail.", "Workspace-Einrichtung kann nicht gestartet werden.", "No se pudo iniciar la configuración del espacio de trabajo.", "Não foi possivel iniciar a configuração do espaco de trabalho."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_-30px_rgba(15,23,42,0.28)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">{t("Workspace Access", "Accès ? l'espace de travail", "Workspace-Zugriff", "Acceso al espacio de trabajo", "Acesso ao espaco de trabalho")}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {t("Start your own workspace", "Demarrez votre propre espace de travail", "Starte deinen eigenen Workspace", "Inicia tu propio espacio de trabajo", "Inicie o seu proprio espaco de trabalho")}
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
            {t("You no longer have access to a workspace on this account. Choose a plan to start your own business workspace.", "Vous n'avez plus accès a un espace de travail sur ce compte. Choisissez un plan pour lancer votre propre espace de travail professionnel.", "Du hast keinen Zugriff mehr auf einen Workspace in diesem Konto. Wähle einen Plan, um deinen eigenen Business-Workspace zu starten.", "Ya no tienes acceso a un espacio de trabajo en esta cuenta. Elige un plan para iniciar tu propio espacio de trabajo empresarial.", "Ja não tem acesso a um espaco de trabalho nesta conta. Escolha um plano para iniciar o seu proprio espaco de trabalho empresarial.")}
          </p>

          {error ? (
            <Alert className="mt-5" variant="error">
              {localizeServerMessage(error, language, t("Unable to start workspace setup.", "Impossible de demarrer la configuration de l'espace de travail.", "Workspace-Einrichtung kann nicht gestartet werden.", "No se pudo iniciar la configuraciÃ³n del espacio de trabajo.", "NÃ£o foi possivel iniciar a configuraÃ§Ã£o do espaco de trabalho."))}
            </Alert>
          ) : null}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">{t("Choose your plan", "Choisissez votre plan", "Wähle deinen Plan", "Elige tu plan", "Escolha o seu plano")}</p>
              <div className="grid gap-3">
                {PLAN_OPTIONS.map((option) => {
                  const selected = planIntent === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                        selected
                          ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                          : "border-slate-200 bg-white hover:border-indigo-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="planIntent"
                        value={option.value}
                        checked={selected}
                        onChange={() => setPlanIntent(option.value)}
                        className="mt-1 accent-indigo-600"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {option.value === "starter"
                            ? t("Starter", "Starter", "Starter", "Starter", "Starter")
                            : option.value === "pro"
                              ? t("Pro", "Pro", "Pro", "Pro", "Pro")
                              : option.value === "growth"
                                ? t("Growth", "Croissance", "Wachstum", "Crecimiento", "Crescimento")
                                : t("Business", "Business", "Business", "Business", "Business")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {option.value === "starter"
                            ? t("Best for getting started.", "Ideal pour commencer.", "Ideal für den Start.", "Ideal para empezar.", "Ideal para comecar.")
                            : option.value === "pro"
                              ? t("Built for professionals automating at scale.", "Concu pour les professionnels qui automatisent a grande echelle.", "Für Profis, die in grossem Massstab automatisieren.", "Creado para profesionales que automatizan a escala.", "Criado para profissionais que automatizam em escala.")
                              : option.value === "growth"
                                ? t("For growing teams with higher volume.", "Pour les équipes en croissance avec un volume plus élevé.", "Für wachsende Teams mit hoherem Volumen.", "Para equipos en crecimiento con mayor volumen.", "Para equipas em crescimento com maior volume.")
                                : t("For teams running high-volume operations.", "Pour les équipes qui gèrent des operations a fort volume.", "Für Teams mit umfangreichen Ablaufen.", "Para equipos que gestionan operaciónes de alto volumen.", "Para equipas que gerem operações de grande volume.")}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              loading={loading}
              className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
            >
              {t("Continue to checkout", "Continuer vers le paiement", "Weiter zum Checkout", "Continuar al checkout", "Continuar para o checkout")}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            <Link href="/logout" className="font-medium text-slate-600 transition hover:text-slate-900">
              {t("Log out", "Se deconnecter", "Abmelden", "Cerrar sesión", "Terminar sessão")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
