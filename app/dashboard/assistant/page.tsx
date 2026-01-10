"use client";

import { AssistantChat } from "@/components/assistant/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUser } from "@/lib/hooks/use-user";
import { useState } from "react";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { useSession } from "next-auth/react";

const suggestions = [
  "Generate invoice reminder workflow",
  "Improve follow-up automation accuracy",
  "Diagnose why my last run failed",
  "Summarize this week's revenue",
];

export default function AssistantPage() {
  const { user, isLoading } = useUser();
  const { data: session } = useSession();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const isAdmin = user?.role === "ADMIN" || session?.user?.role === "ADMIN";
  const canUseAI = isAdmin || user?.plan === "pro" || user?.plan === "enterprise";
  const showGate = !isLoading && !canUseAI;

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-indigo-600 dark:text-indigo-300">AI Copilot</p>
            <h1 className="text-3xl font-semibold text-foreground">Assistant</h1>
            <p className="text-sm text-muted-foreground sm:max-w-xl">
              Ask for automation flows, improvements, diagnoses, and business insights.
            </p>
          </div>
          {showGate && (
            <Badge
              variant="default"
              className="badge-pro-feature w-fit dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
            >
              Pro feature
            </Badge>
          )}
        </div>
      </div>
      <Card
        title="Smart suggestions"
        className="border-border/70 bg-card shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
      >
        <p className="text-sm text-muted-foreground">
          Tap a prompt to start a focused conversation.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <Button
              key={s}
              variant="secondary"
              size="sm"
              disabled={showGate}
              className="justify-start rounded-xl text-left"
              onClick={() =>
                !showGate
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
        {showGate && (
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
        <div className={showGate ? "pointer-events-none opacity-50" : undefined}>
          <AssistantChat />
        </div>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} requiredPlan="pro" />
    </div>
  );
}
