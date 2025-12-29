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
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">AI Copilot</p>
            <h1 className="text-3xl font-semibold text-foreground">Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask for automation flows, improvements, diagnoses, and business insights.
            </p>
          </div>
          {!canUseAI && (
            <Badge
              variant="default"
              className="badge-pro-feature w-fit dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
            >
              Pro feature
            </Badge>
          )}
        </div>
      </div>
      <Card title="Smart suggestions">
        <div className="flex flex-wrap gap-2 max-md:flex-col max-md:items-stretch">
          {suggestions.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              disabled={!canUseAI}
              className="max-md:w-full"
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
          <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl border border-border bg-background/70 backdrop-blur">
            <div className="max-w-sm space-y-2 text-center">
              <p className="text-sm font-semibold text-foreground">Upgrade to Pro to use the AI Assistant</p>
              <p className="text-xs text-muted-foreground">
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
