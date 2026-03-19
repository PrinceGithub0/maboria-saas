"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PlanIntent = "starter" | "pro" | "growth" | "business";

const PLAN_OPTIONS: Array<{
  value: PlanIntent;
  title: string;
  description: string;
}> = [
  { value: "starter", title: "Starter", description: "Best for getting started." },
  { value: "pro", title: "Pro", description: "Built for professionals automating at scale." },
  { value: "growth", title: "Growth", description: "For growing teams with higher volume." },
  { value: "business", title: "Business", description: "For teams running high-volume operations." },
];

export default function StartWorkspacePage() {
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
        setError(payload?.error || "Unable to start workspace setup.");
        return;
      }

      window.location.href =
        typeof payload?.redirectTo === "string" && payload.redirectTo ? payload.redirectTo : "/checkout";
    } catch {
      setError("Unable to start workspace setup.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_-30px_rgba(15,23,42,0.28)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Workspace Access</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Start your own workspace
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
            You no longer have access to a workspace on this account. Choose a plan to start your own business workspace.
          </p>

          {error ? <Alert className="mt-5" variant="error">{error}</Alert> : null}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Choose your plan</p>
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
                        <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                        <p className="text-xs text-slate-500">{option.description}</p>
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
              Continue to checkout
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            <Link href="/logout" className="font-medium text-slate-600 transition hover:text-slate-900">
              Log out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
