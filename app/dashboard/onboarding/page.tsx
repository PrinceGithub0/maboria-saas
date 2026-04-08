"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { BUSINESS_CURRENCIES, formatBusinessCurrencyOption } from "@/lib/business-currencies";
import { useLanguage } from "@/components/providers/language-provider";
import {
  isSupportedBusinessCurrency,
  isSupportedCountry,
  normalizeCountryCode,
  normalizeCurrencyCode,
} from "@/lib/business-profile";
import type { AutomationTemplateId } from "@/lib/automation-templates";

type OnboardingFormState = {
  businessName: string;
  businessType: string;
  goals: string;
  country: string;
  currency: string;
  businessPhone: string;
};

type OnboardingFieldErrors = Partial<Record<keyof OnboardingFormState, string>>;

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

type Translate = (en: string, fr?: string, de?: string, es?: string, pt?: string) => string;

function localizeOnboardingError(error: unknown, t: Translate) {
  const message = String(error || "").trim();
  if (!message) {
    return t(
      "Unable to complete onboarding.",
      "Impossible de terminer l onboarding.",
      "Onboarding konnte nicht abgeschlossen werden.",
      "No se pudo completar la incorporación.",
      "Não foi possível concluir a configuração inicial."
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
    "Active subscription required before onboarding.": t(
      "An active subscription is required before onboarding.",
      "Un abonnement actif est requis avant l onboarding.",
      "Vor dem Onboarding ist ein aktives Abonnement erforderlich.",
      "Se requiere una suscripción activa antes de la incorporación.",
      "E necessária uma subscrição ativa antes da configuração inicial."
    ),
    "Unsupported currency": t(
      "Select a supported currency.",
      "Sélectionnez une devise prise en charge.",
      "Wähle eine unterstützte Währung aus.",
      "Selecciona una moneda compatible.",
      "Selecione uma moeda suportada."
    ),
    "Invalid country code": t(
      "Select a supported country.",
      "Sélectionnez un pays pris en charge.",
      "Wähle ein unterstütztes Land aus.",
      "Selecciona un país compatible.",
      "Selecione um país suportado."
    ),
    "Invalid phone number": t(
      "Enter a valid business phone in international format, for example +14155550123.",
      "Saisissez un num?ro professionnel valide au format international, par exemple +14155550123.",
      "Gib eine gültige internationale Geschäftstelefonnummer ein, zum Beispiel +14155550123.",
      "Introduce un teléfono comercial valido en formato internacional, por ejemplo +14155550123.",
      "Introduza um telefone comercial valido em formato internacional, por exemplo +14155550123."
    ),
    "Business name too short": t(
      "Enter a business name with at least 2 characters.",
      "Saisissez un nom d entreprise d au moins 2 caracteres.",
      "Gib einen Unternehmensnamen mit mindestens 2 Zeichen ein.",
      "Introduce un nombre de empresa con al menos 2 caracteres.",
      "Introduza um nome de empresa com pelo menos 2 caracteres."
    ),
    "Invalid onboarding data": t(
      "Please review your onboarding details and try again.",
      "Veuillez verifier vos informations d onboarding puis réessayer.",
      "Bitte überprüfe deine Onboarding-Daten und versuche es erneut.",
      "Revisa los datos de incorporación y vuelve a intentarlo.",
      "Verifique os dados da configuração inicial e tente novamente."
    ),
  };

  return known[message] || message;
}

function validateBusinessProfileStep(
  form: OnboardingFormState,
  t: Translate
): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {};

  if (form.businessName.trim().length < 2) {
    errors.businessName = t(
      "Enter a business name with at least 2 characters.",
      "Saisissez un nom d entreprise d au moins 2 caracteres."
    );
  }

  if (!PHONE_PATTERN.test(form.businessPhone.trim())) {
    errors.businessPhone = t(
      "Enter a valid business phone in international format, for example +14155550123.",
      "Saisissez un num?ro professionnel valide au format international, par exemple +14155550123."
    );
  }

  if (!isSupportedCountry(normalizeCountryCode(form.country))) {
    errors.country = t("Select a supported country.", "Sélectionnez un pays pris en charge.");
  }

  if (!isSupportedBusinessCurrency(normalizeCurrencyCode(form.currency))) {
    errors.currency = t("Select a supported currency.", "Sélectionnez une devise prise en charge.");
  }

  return errors;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const currencyOptions = BUSINESS_CURRENCIES.map((code) => ({
    code,
    label: formatBusinessCurrencyOption(code),
  }));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    goals: "",
    country: "US",
    currency: "USD",
    businessPhone: "",
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<AutomationTemplateId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});

  const suggestions: Array<{
    id: AutomationTemplateId;
    title: string;
    description: string;
  }> = [
    {
      id: "overdue_reminder_3_days",
      title: t("Invoice reminder sequence", "Sequence de rappel de facture"),
      description: t(
        "Open a ready-made overdue reminder in the automation builder.",
        "Ouvrez un rappel de retard pr?t a l emploi dans le builder."
      ),
    },
    {
      id: "whatsapp_thank_you",
      title: t("Customer thank-you automation", "Automatisation de remerciement client"),
      description: t(
        "Start from a WhatsApp thank-you template after payment.",
        "Commencez avec un modele WhatsApp de remerciement après paiement."
      ),
    },
    {
      id: "notify_invoice_paid",
      title: t("Invoice paid notification", "Notification de facture payee"),
      description: t(
        "Prepare an owner notification flow when invoices are paid.",
        "Preparez un flux de notification proprietaire quand une facture est payee."
      ),
    },
  ];

  const stepOneErrors = validateBusinessProfileStep(form, t);
  const canContinueBusinessProfile = Object.keys(stepOneErrors).length === 0;

  function setFormValue<K extends keyof OnboardingFormState>(key: K, value: OnboardingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const next = () => {
    if (step !== 1) {
      setStep((s) => s + 1);
      return;
    }

    const nextErrors = validateBusinessProfileStep(form, t);
    setFieldErrors(nextErrors);
    setError(null);
    if (Object.keys(nextErrors).length > 0) return;
    setStep(2);
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(localizeOnboardingError(payload?.error, t));
        return;
      }

      if (selectedTemplateId) {
        router.replace(`/dashboard/automations/new?template=${encodeURIComponent(selectedTemplateId)}`);
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError(
        t(
          "Unable to complete onboarding.",
          "Impossible de terminer l onboarding.",
          "Onboarding konnte nicht abgeschlossen werden.",
          "No se pudo completar la incorporación.",
          "Não foi possível concluir a configuração inicial."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Onboarding", "Onboarding")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Let's set up your workspace", "Configurons votre espace")}</h1>
        </div>
      </div>

      {step === 1 && (
        <Card title={t("Business profile", "Profil entreprise")}>
          <div className="grid gap-4 md:grid-cols-2 max-md:grid-cols-1 max-md:gap-3">
            <div className="space-y-1">
              <Input
                label={t("Business name", "Nom de l'entreprise")}
                placeholder={t("Your company name", "Nom de votre entreprise")}
                value={form.businessName}
                onChange={(e) => setFormValue("businessName", e.target.value)}
              />
              {fieldErrors.businessName ? <p className="text-sm text-rose-600">{fieldErrors.businessName}</p> : null}
            </div>
            <Input
              label={t("Business type", "Type d'entreprise")}
              placeholder={t("SaaS, agency, ecommerce...", "SaaS, agence, ecommerce...")}
              value={form.businessType}
              onChange={(e) => setFormValue("businessType", e.target.value)}
            />
            <Input
              label={t("Goals", "Objectifs")}
              placeholder={t("Collect payments faster", "Encaisser plus vite")}
              value={form.goals}
              onChange={(e) => setFormValue("goals", e.target.value)}
            />
            <div className="space-y-1">
              <PhoneInput
                label={t("Business phone", "T?l?phone entreprise")}
                value={form.businessPhone}
                required
                locale={language}
                onChange={(value) => setFormValue("businessPhone", value)}
              />
              {fieldErrors.businessPhone ? <p className="text-sm text-rose-600">{fieldErrors.businessPhone}</p> : null}
            </div>
            <div className="space-y-1">
              <CountrySelect
                label={t("Country", "Pays")}
                value={form.country}
                locale={language}
                required
                onChange={(value) => setFormValue("country", value)}
              />
              {fieldErrors.country ? <p className="text-sm text-rose-600">{fieldErrors.country}</p> : null}
            </div>
            <div className="space-y-1">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {t("Default business currency", "Devise entreprise par defaut")}
                <select
                  value={form.currency}
                  onChange={(e) => setFormValue("currency", e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
                >
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {fieldErrors.currency ? <p className="text-sm text-rose-600">{fieldErrors.currency}</p> : null}
            </div>
          </div>
          <Button className="mt-4 max-md:w-full" onClick={next} disabled={!canContinueBusinessProfile}>
            {t("Next", "Suivant")}
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card title={t("Suggested automations", "Automatisations suggerees")}>
          <div className="grid gap-3 md:grid-cols-3 max-md:grid-cols-1">
            {suggestions.map((suggestion) => (
              <EmptyState
                key={suggestion.id}
                title={suggestion.title}
                description={suggestion.description}
                actionLabel={
                  selectedTemplateId === suggestion.id
                    ? t("Selected", "Selectionne")
                    : t("Start with this", "Commencer avec ceci")
                }
                onAction={() => setSelectedTemplateId(suggestion.id)}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selectedTemplateId
                ? t(
                    "After onboarding, we will open your selected template in the automation builder.",
                    "Après l onboarding, nous ouvrirons votre modele selectionne dans le builder."
                  )
                : t(
                    "You can skip this step and choose a template later.",
                    "Vous pouvez ignorer cette etape et choisir un modele plus tard."
                  )}
            </p>
            <Button className="max-md:w-full" onClick={next}>
              {t("Continue", "Continuer")}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title={t("Tutorial", "Tutoriel")}>
          <p className="text-sm text-muted-foreground">{t("Explore dashboard, AI assistant, and billing.", "Explorez le tableau, l'assistant IA et la facturation.")}</p>
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          <Button className="mt-4 max-md:w-full" onClick={finish} loading={submitting}>
            {t("Finish", "Terminer")}
          </Button>
        </Card>
      )}
    </div>
  );
}
