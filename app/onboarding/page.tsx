"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";

type Translate = (en: string, fr?: string, de?: string, es?: string, pt?: string) => string;

function localizeBusinessError(error: unknown, t: Translate) {
  const message = String(error || "").trim();
  if (!message) {
    return t(
      "Could not create business.",
      "Cr?ation impossible.",
      "Unternehmen konnte nicht erstellt werden.",
      "No se pudo crear la empresa.",
      "Não foi poss?vel criar a empresa."
    );
  }

  const known: Record<string, string> = {
    Unauthorized: t(
      "Please sign in and try again.",
      "Veuillez vous connecter puis réessayer.",
      "Bitte melde dich an und versuche es erneut.",
      "Inicia sesión y vuelve a intentarlo.",
      "Inicie sessão e tente novamente."
    ),
    "String must contain at least 2 character(s)": t(
      "Enter a business name with at least 2 characters.",
      "Saisissez un nom d entreprise d au moins 2 caracteres.",
      "Gib einen Unternehmensnamen mit mindestens 2 Zeichen ein.",
      "Introduce un nombre de empresa con al menos 2 caracteres.",
      "Introduza um nome de empresa com pelo menos 2 caracteres."
    ),
    "Business name too short": t(
      "Enter a business name with at least 2 characters.",
      "Saisissez un nom d entreprise d au moins 2 caracteres.",
      "Gib einen Unternehmensnamen mit mindestens 2 Zeichen ein.",
      "Introduce un nombre de empresa con al menos 2 caracteres.",
      "Introduza um nome de empresa com pelo menos 2 caracteres."
    ),
    "Invalid business data": t(
      "Please review your business details and try again.",
      "Veuillez verifier les informations de votre entreprise puis réessayer.",
      "Bitte überprüfe deine Unternehmensdaten und versuche es erneut.",
      "Revisa los datos de tu empresa y vuelve a intentarlo.",
      "Verifique os dados da sua empresa e tente novamente."
    ),
  };

  return known[message] || message;
}

export default function OnboardingPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: "", domain: "" });
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/business", { method: "POST", body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok || data.error) {
      setStatus({
        message: localizeBusinessError(data.error, t),
        variant: "error",
      });
      return;
    }
    setStatus({
      message: t(
        "Business created. Redirecting to dashboard...",
        "Entreprise creee. Redirection vers le tableau..."
      ),
      variant: "success",
    });
    if (res.ok) {
      setTimeout(() => (window.location.href = "/dashboard"), 800);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm max-md:max-w-none">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
          {t("Onboarding", "Onboarding")}
        </p>
        <h1 className="text-3xl font-semibold text-foreground">
          {t("Create your business", "Cr?ez votre entreprise")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Set up your workspace to start building automations and billing.",
            "Configurez votre espace pour demarrer les automatisations et la facturation."
          )}
        </p>
        {status ? (
          status.variant === "success" ? (
            <TransientAlert variant="success" onDismiss={() => setStatus(null)}>
              {status.message}
            </TransientAlert>
          ) : (
            <Alert variant="error">{status.message}</Alert>
          )
        ) : null}
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <Input
            label={t("Business name", "Nom de l'entreprise")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t("Domain", "Domaine")}
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
            placeholder={t("example.com", "exemple.com")}
          />
          <Button type="submit">{t("Create workspace", "Creer l'espace")}</Button>
        </form>
      </div>
    </div>
  );
}
