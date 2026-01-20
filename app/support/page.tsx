"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";

const faqs = [
  {
    q: { en: "How do I create automations?", fr: "Comment creer des automatisations ?" },
    a: {
      en: "Use the dashboard Automations tab or AI flow generator.",
      fr: "Utilisez l onglet Automatisations ou le generateur IA.",
    },
  },
  {
    q: { en: "How does billing work?", fr: "Comment fonctionne la facturation ?" },
    a: {
      en: "Choose local currency via Paystack in supported markets or multi-currency via Flutterwave; subscriptions renew monthly.",
      fr: "Choisissez la monnaie locale via Paystack ou multi-monnaie via Flutterwave; abonnement mensuel.",
    },
  },
  {
    q: { en: "Where can I see logs?", fr: "Ou voir les journaux ?" },
    a: {
      en: "Admins can view system logs in the Admin panel; users see run logs in dashboard.",
      fr: "Admins: journaux systeme. Utilisateurs: journaux d execution dans le tableau.",
    },
  },
];

export default function SupportPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});

  const submit = async () => {
    setStatus(null);
    const subject = form.subject.trim();
    const message = form.message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (subject.length < 5)
      nextErrors.subject = t("Subject must be at least 5 characters.", "Sujet: 5 caracteres minimum.");
    if (message.length < 10)
      nextErrors.message = t("Message must be at least 10 characters.", "Message: 10 caracteres minimum.");
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus(t("Please fix the highlighted fields.", "Corrigez les champs en surbrillance."));
      return;
    }
    setErrors({});
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: subject, message: `${message}\n\nFrom: ${form.email || "N/A"}` }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus(t("Please sign in to submit a support ticket.", "Veuillez vous connecter pour envoyer un ticket."));
      } else if (!res.ok) {
        setStatus(data.error || t(`Could not submit ticket (status ${res.status}).`, `Envoi impossible (statut ${res.status}).`));
      } else {
        if (data.emailError) {
          setStatus(
            t(
              `Ticket submitted, but email could not be sent: ${data.emailError}`,
              `Ticket envoye, mais email non envoye : ${data.emailError}`
            )
          );
        } else {
          setStatus(t("Ticket submitted. We'll respond to your email.", "Ticket envoye. Nous repondons par email."));
        }
        setForm({ email: "", subject: "", message: "" });
        setErrors({});
      }
    } catch {
      setStatus(t("Could not submit ticket. Please try again.", "Envoi impossible. Veuillez reessayer."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-12 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <h1 className="text-3xl font-semibold">{t("Support Center", "Centre de support")}</h1>
      <div className="grid gap-6 md:grid-cols-3">
        <Card title={t("FAQ", "FAQ")}>
          <div className="space-y-3 text-sm text-muted-foreground">
            {faqs.map((item) => (
              <div key={item.q.en}>
                <p className="font-semibold text-foreground">{t(item.q.en, item.q.fr)}</p>
                <p className="text-muted-foreground">{t(item.a.en, item.a.fr)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t("Troubleshooting", "Depannage")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Restart failed automations from Runs, verify webhook signatures, ensure billing details are valid, and check system status on /status.",
              "Relancez les automatisations en echec, verifiez les webhooks, validez la facturation, et verifiez /status."
            )}
          </p>
        </Card>
        <Card title={t("Documentation", "Documentation")}>
          <p className="text-sm text-muted-foreground">
            {t("See internal /docs for architecture, APIs, and deployment guides.", "Voir /docs pour architecture, API, deploiement.")}
          </p>
        </Card>
      </div>
      <Card title={t("Contact support", "Contacter support")}>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t("Email us directly at ", "Ecrivez-nous a ")}
            <a className="text-indigo-500 hover:text-indigo-400" href="mailto:info@maboria.com">
              info@maboria.com
            </a>{" "}
            {t("for urgent issues. You can also submit the form below.", "pour les urgences. Ou utilisez le formulaire.")}
          </p>
        </div>
        {status && <p className="mt-3 text-sm text-foreground">{status}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label={t("Email", "Email")}
            placeholder={t("you@company.com", "vous@entreprise.com")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
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
          <div className="md:col-span-2">
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
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={submit} loading={sending}>
              {t("Submit ticket", "Envoyer le ticket")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
