"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { useUser } from "@/lib/hooks/use-user";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";

const steps = [
  {
    title: { en: "Dashboard", fr: "Tableau de bord" },
    desc: { en: "See metrics, cards, and quick actions.", fr: "Voir les metriques, cartes et actions rapides." },
    href: "/dashboard",
  },
  {
    title: { en: "Automations", fr: "Automatisations" },
    desc: { en: "Build or AI-generate workflows with triggers and actions.", fr: "Creer ou generer des workflows IA avec declencheurs et actions." },
    href: "/dashboard/automations",
  },
  {
    title: { en: "Automation Operations", fr: "Operations automatisation" },
    desc: {
      en: "Monitor automation health and investigate failed steps.",
      fr: "Surveiller la sante des automatisations et investiguer les echecs.",
    },
    href: "/dashboard/automation-operations",
  },
  {
    title: { en: "AI Assistant", fr: "Assistant IA" },
    desc: { en: "Chat, create flows, and diagnose errors with AI.", fr: "Discuter, creer des flux, diagnostiquer avec l IA." },
    href: "/dashboard/assistant",
  },
  {
    title: { en: "Inbox", fr: "Boite de reception" },
    desc: { en: "Review customer messages and replies in one place.", fr: "Voir messages clients et reponses au meme endroit." },
    href: "/dashboard/inbox",
  },
  {
    title: { en: "Billing", fr: "Facturation" },
    desc: { en: "Manage plans, invoices, and payment methods.", fr: "Gerer plans, factures et moyens de paiement." },
    href: "/dashboard/subscription",
  },
  {
    title: { en: "Analytics", fr: "Analyses" },
    desc: { en: "Review usage, automation runs, and quotas.", fr: "Voir l usage, executions et quotas." },
    href: "/dashboard/report",
  },
  {
    title: { en: "Settings", fr: "Parametres" },
    desc: { en: "Profile, security, and 2FA preferences.", fr: "Profil, securite et preferences 2FA." },
    href: "/dashboard/settings",
  },
];

export function TourOverlay() {
  const { user, mutate } = useUser();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
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

  const skip = async () => {
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
          {t("Product tour", "Parcours produit")}
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pillClass}`}>
          {t("Step", "Etape")} {active + 1} {t("of", "sur")} {steps.length}
        </span>
      </div>
      <h4 className="mt-3 text-xl font-semibold">{step.title[language]}</h4>
      <p className={`mt-1 text-sm ${descClass}`}>{step.desc[language]}</p>
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
              aria-label={
                language === "fr"
                  ? `Aller a ${step.title[language]}`
                  : `Go to ${step.title[language]}`
              }
            >
              {t("Go", "Aller")}
            </Button>
            {active > 0 && (
              <Button size="sm" variant="ghost" onClick={() => goToStep(active - 1)}>
                {t("Back", "Retour")}
              </Button>
            )}
            {active < steps.length - 1 ? (
              <Button size="sm" variant="secondary" onClick={() => goToStep(active + 1)}>
                {t("Next", "Suivant")}
              </Button>
            ) : (
              <Button size="sm" onClick={complete}>
                {t("Finish", "Terminer")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={skip}>
              {t("Skip", "Ignorer")}
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
        {t("Restart tour", "Recommencer")}
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
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const { mutate } = useUser();
  const router = useRouter();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
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
      {loading ? t("Starting...", "Demarrage...") : t("Product tour", "Parcours produit")}
    </Button>
  );
}
