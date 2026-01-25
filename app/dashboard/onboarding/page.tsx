"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { allowedCurrencies, formatCurrencyOption } from "@/lib/payments/currency-allowlist";
import { useLanguage } from "@/components/providers/language-provider";

const currencyOptions = allowedCurrencies.map((code) => ({ code, label: formatCurrencyOption(code) }));

export default function OnboardingWizard() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    goals: "",
    country: "US",
    currency: "USD",
    businessPhone: "",
  });
  const suggestions = [
    t("Invoice reminder sequence", "Sequence de rappel de facture"),
    t("Customer onboarding automation", "Automatisation d'onboarding client"),
    t("Weekly summary report", "Rapport hebdomadaire"),
  ];

  const next = () => setStep((s) => s + 1);

  const finish = async () => {
    await fetch("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(form),
    });
    window.location.href = "/dashboard";
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
            <Input
              label={t("Business name", "Nom de l'entreprise")}
              placeholder={t("Your company name", "Nom de votre entreprise")}
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
            <Input
              label={t("Business type", "Type d'entreprise")}
              placeholder={t("SaaS, agency, ecommerce...", "SaaS, agence, ecommerce...")}
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            />
            <Input
              label={t("Goals", "Objectifs")}
              placeholder={t("Collect payments faster", "Encaisser plus vite")}
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
            />
            <PhoneInput
              label={t("Business phone", "Telephone entreprise")}
              value={form.businessPhone}
              required
              locale={language === "fr" ? "fr" : "en"}
              onChange={(value) => setForm({ ...form, businessPhone: value })}
            />
            <CountrySelect
              label={t("Country", "Pays")}
              value={form.country}
              locale={language === "fr" ? "fr" : "en"}
              required
              onChange={(value) => setForm({ ...form, country: value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Preferred currency", "Devise preferee")}
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button className="mt-4 max-md:w-full" onClick={next}>
            {t("Next", "Suivant")}
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card title={t("Suggested automations", "Automatisations suggerees")}>
          <div className="grid gap-3 md:grid-cols-3 max-md:grid-cols-1">
            {suggestions.map((s) => (
              <EmptyState
                key={s}
                title={s}
                description={t("Add to your workspace", "Ajouter a votre espace")}
                actionLabel={t("Add", "Ajouter")}
                onAction={next}
              />
            ))}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title={t("Tutorial", "Tutoriel")}>
          <p className="text-sm text-muted-foreground">{t("Explore dashboard, AI assistant, and billing.", "Explorez le tableau, l'assistant IA et la facturation.")}</p>
          <Button className="mt-4 max-md:w-full" onClick={finish}>
            {t("Finish", "Terminer")}
          </Button>
        </Card>
      )}
    </div>
  );
}
