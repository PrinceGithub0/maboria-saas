"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const suggestions = [
  "Invoice reminder sequence",
  "Customer onboarding automation",
  "Weekly summary report",
];

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ businessType: "", goals: "", currency: "USD" });

  const next = () => setStep((s) => s + 1);

  const finish = async () => {
    await fetch("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(form),
    });
    window.location.href = "/dashboard";
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Onboarding</p>
        <h1 className="text-3xl font-semibold text-white">Let’s set up your workspace</h1>
      </div>
      {step === 1 && (
        <Card title="Business profile">
          <div className="grid gap-4 md:grid-cols-2">
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
            <Input
              label="Preferred currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
          <Button className="mt-4" onClick={next}>
            Next
          </Button>
        </Card>
      )}
      {step === 2 && (
        <Card title="Suggested automations">
          <div className="grid gap-3 md:grid-cols-3">
            {suggestions.map((s) => (
              <EmptyState key={s} title={s} description="Add to your workspace" actionLabel="Add" onAction={next} />
            ))}
          </div>
        </Card>
      )}
      {step === 3 && (
        <Card title="Tutorial">
          <p className="text-sm text-slate-300">Explore dashboard, AI assistant, and billing.</p>
          <Button className="mt-4" onClick={finish}>
            Finish
          </Button>
        </Card>
      )}
    </div>
  );
}
