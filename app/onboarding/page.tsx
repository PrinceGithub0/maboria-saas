"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function OnboardingPage() {
  const [form, setForm] = useState({ name: "", domain: "" });
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/business", { method: "POST", body: JSON.stringify(form) });
    const data = await res.json();
    setStatus(data.error || "Business created. Redirecting to dashboard...");
    if (res.ok) {
      setTimeout(() => (window.location.href = "/dashboard"), 800);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm max-md:max-w-none">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Onboarding</p>
        <h1 className="text-3xl font-semibold text-foreground">Create your business</h1>
        <p className="text-sm text-muted-foreground">
          Set up your workspace to start building automations and billing.
        </p>
        {status && <Alert variant="info">{status}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <Input
            label="Business name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Domain"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
            placeholder="example.com"
          />
          <Button type="submit">Create workspace</Button>
        </form>
      </div>
    </div>
  );
}
