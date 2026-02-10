"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { Phone } from "lucide-react";

export default function DashboardSupportPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [form, setForm] = useState({ subject: "", message: "" });
  const [status, setStatus] = useState<{ message: string; variant: "info" | "success" | "warning" | "error" } | null>(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});

  const submit = async () => {
    setStatus(null);
    if (sending) return;
    const subject = form.subject.trim();
    const message = form.message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (subject.length < 5) nextErrors.subject = t("Subject must be at least 5 characters.", "Le sujet doit comporter au moins 5 caracteres.");
    if (message.length < 10) nextErrors.message = t("Message must be at least 10 characters.", "Le message doit comporter au moins 10 caracteres.");
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus({ message: t("Please fix the highlighted fields.", "Corrigez les champs en surbrillance."), variant: "warning" });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: subject, message }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus({ message: t("Please sign in to submit a support ticket.", "Connectez-vous pour soumettre un ticket."), variant: "error" });
      } else if (!res.ok) {
        setStatus({
          message: data.error || t(`Could not submit ticket (status ${res.status}).`, `Impossible de soumettre le ticket (statut ${res.status}).`),
          variant: "error",
        });
      } else {
        if (data.emailError) {
          setStatus({
            message: t(
              `Ticket submitted, but email could not be sent: ${data.emailError}`,
              `Ticket envoye, mais l'email n'a pas pu etre envoye: ${data.emailError}`
            ),
            variant: "error",
          });
        } else {
          setStatus({
            message: t("Ticket submitted. We'll respond to your email.", "Ticket envoye. Nous repondrons par email."),
            variant: "success",
          });
        }
        setForm({ subject: "", message: "" });
        setErrors({});
      }
    } catch (err: any) {
      setStatus({
        message: t(
          `Could not submit ticket. ${err?.message || "Please try again."}`,
          `Impossible de soumettre le ticket. ${err?.message || "Veuillez reessayer."}`
        ),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <section className="rounded-[28px] border border-border bg-white px-6 py-7 shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:bg-card max-md:px-5 max-md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
              {t("Support", "Support")}
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-[32px] font-semibold leading-tight text-foreground">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50/60 text-indigo-700 shadow-none dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                <Phone className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>{t("Contact support", "Contacter le support")}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t(
                "Send a ticket directly from your dashboard. Share what you were trying to do and what you saw.",
                "Envoyez un ticket depuis votre tableau de bord. Indiquez ce que vous faisiez et ce que vous avez vu."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              {t("Fast response from our team", "Reponse rapide de notre equipe")}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground">
              {t("Priority support", "Support prioritaire")}
            </span>
          </div>
        </div>
        {status && (
          <div className="mt-4">
            <Alert variant={status.variant}>{status.message}</Alert>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1.4fr]">
        <Card
          title={t("Support overview", "Apercu support")}
          className="bg-[var(--support-card-bg)] text-slate-900 dark:text-slate-100 [--support-card-bg:#ffffff] dark:[--support-card-bg:#020617]"
        >
            <div className="space-y-6 text-[15px] text-slate-700 dark:text-slate-200">
              <div>
              <p className="text-sm uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-200">
                {t("Channels", "Canaux")}
              </p>
              <p className="mt-2 text-base font-medium leading-relaxed text-foreground">
                {t("Email-first support", "Support prioritaire par email")}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("We reply from info@maboria.com", "Reponse depuis info@maboria.com")}
              </p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-200">
                {t("What to include", "A inclure")}
              </p>
              <ul className="mt-3 space-y-3">
                {[
                  t("What you were trying to do", "Ce que vous tentiez de faire"),
                  t("The exact error message", "Le message d erreur exact"),
                  t("Steps you took and expected outcome", "Etapes suivies et resultat attendu"),
                ].map((item) => (
                  <li
                    key={item}
                    className="text-base leading-relaxed text-slate-700 dark:rounded-xl dark:border dark:border-slate-800 dark:bg-slate-900/70 dark:px-3 dark:py-2 dark:text-sm dark:text-slate-100 dark:shadow-[0_8px_16px_rgba(15,23,42,0.06)]"
                    style={{ backgroundColor: "transparent", border: "none", boxShadow: "none", padding: 0 }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="text-base leading-relaxed text-slate-700 dark:rounded-xl dark:border dark:border-slate-800 dark:bg-slate-900/70 dark:px-3 dark:py-2 dark:text-sm dark:text-slate-100 dark:shadow-[0_8px_16px_rgba(15,23,42,0.06)]"
              style={{ backgroundColor: "transparent", border: "none", boxShadow: "none", padding: 0 }}
            >
              {t("Urgent billing issues are routed to senior support.", "Les urgences de facturation sont priorisees.")}
            </div>
          </div>
        </Card>

        <Card title={t("Submit a ticket", "Soumettre un ticket")}>
          <div className="space-y-4">
            <Input
              label={t("Subject", "Sujet")}
              placeholder={t("Billing, automation, AI...", "Facturation, automatisation, IA...")}
              value={form.subject}
              onChange={(e) => {
                setForm((f) => ({ ...f, subject: e.target.value }));
                if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
              }}
              minLength={5}
              required
              error={errors.subject}
            />
            <Textarea
              placeholder={t("Describe the issue", "Decrivez le probleme")}
              value={form.message}
              onChange={(e) => {
                setForm((f) => ({ ...f, message: e.target.value }));
                if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
              }}
              minLength={10}
              required
              error={errors.message}
              rows={8}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
                {t("Submit ticket", "Envoyer le ticket")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
