"use client";

import { AssistantChat } from "@/components/assistant/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const suggestions = [
  "Generate invoice reminder workflow",
  "Improve follow-up automation accuracy",
  "Diagnose why my last run failed",
  "Summarize this week's revenue",
];

export default function AssistantPage() {
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
      </div>
      <Card title="Smart suggestions">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="ghost" size="sm" onClick={() => (document.getElementById("assistant-input") as HTMLInputElement | null)?.focus()}>
              {s}
            </Button>
          ))}
        </div>
      </Card>
      <AssistantChat />
    </div>
  );
}
