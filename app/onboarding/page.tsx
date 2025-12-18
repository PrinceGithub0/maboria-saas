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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-xl rounded-2xl border border-slate-900 bg-slate-900/70 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Onboarding</p>
        <h1 className="text-3xl font-semibold text-white">Create your business</h1>
        <p className="text-sm text-slate-400">
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
