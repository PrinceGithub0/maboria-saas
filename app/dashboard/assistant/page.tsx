"use client";

import { AssistantChat } from "@/components/assistant/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUser } from "@/lib/hooks/use-user";
import { useState } from "react";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { Badge } from "@/components/ui/badge";

const suggestions = [
  "Generate invoice reminder workflow",
  "Improve follow-up automation accuracy",
  "Diagnose why my last run failed",
  "Summarize this week's revenue",
];

export default function AssistantPage() {
  const { user } = useUser();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const canUseAI = user?.plan === "pro" || user?.plan === "enterprise";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">AI Copilot</p>
          <h1 className="text-3xl font-semibold text-white">Assistant</h1>
          <p className="text-sm text-slate-400">
            Ask for automation flows, improvements, diagnoses, and business insights.
          </p>
        </div>
        {!canUseAI && (
          <Badge variant="default" className="w-fit border border-amber-500/30 bg-amber-500/10 text-amber-200">
            Pro feature
          </Badge>
        )}
      </div>
      <Card title="Smart suggestions">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              disabled={!canUseAI}
              onClick={() =>
                canUseAI
                  ? (document.getElementById("assistant-input") as HTMLInputElement | null)?.focus()
                  : setUpgradeOpen(true)
              }
            >
              {s}
            </Button>
          ))}
        </div>
      </Card>
      <div className="relative">
        {!canUseAI && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
            <div className="max-w-sm space-y-2 text-center">
              <p className="text-sm font-semibold text-white">Upgrade to Pro to use the AI Assistant</p>
              <p className="text-xs text-slate-400">
                AI features are available on Pro and Enterprise plans.
              </p>
              <Button onClick={() => setUpgradeOpen(true)}>Upgrade</Button>
            </div>
          </div>
        )}
        <div className={!canUseAI ? "pointer-events-none opacity-50" : undefined}>
          <AssistantChat />
        </div>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} requiredPlan="pro" />
    </div>
  );
}
