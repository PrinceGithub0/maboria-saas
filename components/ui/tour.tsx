"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { useUser } from "@/lib/hooks/use-user";
import { usePathname, useRouter } from "next/navigation";

const steps = [
  { title: "Dashboard", desc: "See metrics, cards, and quick actions.", href: "/dashboard" },
  { title: "Automations", desc: "Build or AI-generate workflows with triggers and actions.", href: "/dashboard/automations" },
  { title: "Runs", desc: "Track automation outcomes and view logs.", href: "/dashboard/runs" },
  { title: "AI Assistant", desc: "Chat, create flows, and diagnose errors with AI.", href: "/dashboard/assistant" },
  { title: "Inbox", desc: "Review customer messages and replies in one place.", href: "/dashboard/inbox" },
  { title: "Billing", desc: "Manage plans, invoices, and payment methods.", href: "/dashboard/subscription" },
  { title: "Analytics", desc: "Review usage, automation runs, and quotas.", href: "/dashboard/usage" },
  { title: "Settings", desc: "Profile, security, and 2FA preferences.", href: "/dashboard/settings" },
];

export function TourOverlay() {
  const { user, mutate } = useUser();
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const step = useMemo(() => steps[active], [active]);
  const progress = Math.round(((active + 1) / steps.length) * 100);
  const [isDark, setIsDark] = useState(false);
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

  useEffect(() => {
    const root = document.documentElement;
    const getResolved = () => {
      const resolved = root.dataset.resolvedTheme;
      if (resolved === "light" || resolved === "dark") return resolved;
      return root.classList.contains("dark") ? "dark" : "light";
    };
    const apply = () => setIsDark(getResolved() === "dark");
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-resolved-theme"] });
    return () => observer.disconnect();
  }, []);

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

  const containerClass =
    "fixed bottom-5 right-5 z-40 w-[360px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-3xl border p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur";
  const pillClass = isDark
    ? "border-white/10 bg-white/10 text-slate-100"
    : "border-slate-200 bg-slate-100 text-slate-700";
  const descClass = isDark ? "text-slate-300" : "text-slate-600";
  const trackClass = isDark ? "bg-white/10" : "bg-slate-200/80";
  const dotClass = isDark ? "bg-white/10" : "bg-slate-200";

  return (
    <div
      className={containerClass}
      style={{
        backgroundColor: isDark ? "rgba(15,23,42,0.9)" : "#ffffff",
        color: isDark ? "#e2e8f0" : "#0f172a",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.8)",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400" />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-indigo-700 dark:text-indigo-300">
          Product tour
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pillClass}`}>
          Step {active + 1} of {steps.length}
        </span>
      </div>
      <h4 className="mt-3 text-xl font-semibold">{step.title}</h4>
      <p className={`mt-1 text-sm ${descClass}`}>{step.desc}</p>
      <div className="mt-4">
        <div className={`h-1.5 w-full rounded-full ${trackClass}`}>
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-5 rounded-full ${idx === active ? "bg-indigo-500" : dotClass}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
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
      </div>
      <button
        className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
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

export function RestartTourButton({
  className,
  variant = "secondary",
  size = "sm",
}: {
  className?: string;
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  const { mutate } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const restart = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: false }),
      });
      await mutate();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button className={className} variant={variant} size={size} onClick={restart} disabled={loading}>
      {loading ? "Starting..." : "Product tour"}
    </Button>
  );
}
