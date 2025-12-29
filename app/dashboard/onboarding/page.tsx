"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { allowedCurrencies } from "@/lib/payments/currency-allowlist";

const suggestions = ["Invoice reminder sequence", "Customer onboarding automation", "Weekly summary report"];
const currencyOptions = allowedCurrencies.map((code) => ({ code, label: code }));
const countryOptions = [
  { code: "NG", label: "Nigeria (NG)" },
  { code: "GH", label: "Ghana (GH)" },
  { code: "KE", label: "Kenya (KE)" },
  { code: "ZA", label: "South Africa (ZA)" },
  { code: "CI", label: "Cote d'Ivoire (CI)" },
  { code: "EG", label: "Egypt (EG)" },
  { code: "RW", label: "Rwanda (RW)" },
  { code: "UG", label: "Uganda (UG)" },
  { code: "TZ", label: "Tanzania (TZ)" },
  { code: "ZM", label: "Zambia (ZM)" },
  { code: "MZ", label: "Mozambique (MZ)" },
];

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    goals: "",
    country: "NG",
    currency: "USD",
  });

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
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Onboarding</p>
          <h1 className="text-3xl font-semibold text-foreground">Let&#39;s set up your workspace</h1>
        </div>
      </div>

      {step === 1 && (
        <Card title="Business profile">
          <div className="grid gap-4 md:grid-cols-2 max-md:grid-cols-1 max-md:gap-3">
            <Input
              label="Business name"
              placeholder="Your company name"
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
            <Input
              label="Business type"
              placeholder="SaaS, agency, ecommerce..."
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            />
            <Input
              label="Goals"
              placeholder="Collect payments faster"
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Country
              <select
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Preferred currency
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
            Next
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card title="Suggested automations">
          <div className="grid gap-3 md:grid-cols-3 max-md:grid-cols-1">
            {suggestions.map((s) => (
              <EmptyState key={s} title={s} description="Add to your workspace" actionLabel="Add" onAction={next} />
            ))}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Tutorial">
          <p className="text-sm text-muted-foreground">Explore dashboard, AI assistant, and billing.</p>
          <Button className="mt-4 max-md:w-full" onClick={finish}>
            Finish
          </Button>
        </Card>
      )}
    </div>
  );
}
