"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { useUser } from "@/lib/hooks/use-user";
import { usePathname, useRouter } from "next/navigation";

const steps = [
  { title: "Dashboard", desc: "See metrics, cards, and quick actions.", href: "/dashboard" },
  { title: "Automations", desc: "Build or AI-generate workflows with triggers and actions.", href: "/dashboard/automations" },
  { title: "AI Assistant", desc: "Chat, create flows, and diagnose errors with AI.", href: "/dashboard/assistant" },
  { title: "Billing", desc: "Manage plans, invoices, and payment methods.", href: "/dashboard/subscription" },
  { title: "Analytics", desc: "Review usage, automation runs, and quotas.", href: "/dashboard/usage" },
  { title: "Settings", desc: "Profile, security, 2FA, API keys, webhooks.", href: "/dashboard/settings" },
];

export function TourOverlay() {
  const { user, mutate } = useUser();
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const step = useMemo(() => steps[active], [active]);
  const isAuthedUser = !!(user && typeof (user as any).id === "string");
  const isInDashboard = pathname.startsWith("/dashboard");

  useEffect(() => {
    // Never show the tour for logged-out users or on public pages.
    if (!isAuthedUser || !isInDashboard) {
      setVisible(false);
      return;
    }
    setVisible(!(user as any).tourComplete);
  }, [isAuthedUser, isInDashboard, user]);

  const goToStep = (index: number) => {
    const next = Math.min(Math.max(index, 0), steps.length - 1);
    setActive(next);
    const href = steps[next]?.href;
    if (href && pathname !== href) router.push(href);
  };

  const complete = async () => {
    await fetch("/api/tour", { method: "POST", body: JSON.stringify({ complete: true }) });
    setVisible(false);
    mutate();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border border-indigo-500/40 bg-card p-4 shadow-xl">
      <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Product tour</p>
      <h4 className="mt-1 text-lg font-semibold text-foreground">{step.title}</h4>
      <p className="text-sm text-muted-foreground">{step.desc}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 w-6 rounded-full ${idx === active ? "bg-indigo-500" : "bg-border"}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => step?.href && router.push(step.href)}
            aria-label={`Go to ${step.title}`}
          >
            Go
          </Button>
          {active > 0 && (
            <Button size="sm" variant="ghost" onClick={() => goToStep(active - 1)}>
              Back
            </Button>
          )}
          {active < steps.length - 1 ? (
            <Button size="sm" variant="secondary" onClick={() => goToStep(active + 1)}>
              Next
            </Button>
          ) : (
            <Button size="sm" onClick={complete}>
              Finish
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>
            Skip
          </Button>
        </div>
      </div>
      <button
        className="mt-2 text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
        onClick={() => {
          setVisible(true);
          goToStep(0);
        }}
      >
        Restart tour
      </button>
    </div>
  );
}
