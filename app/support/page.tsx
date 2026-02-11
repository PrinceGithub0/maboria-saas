"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/components/providers/language-provider";

const quickQuestions = [
  {
    q: { en: "How do I create automations?", fr: "Comment creer des automatisations ?" },
    a: {
      en: "Use the Automations area in your dashboard or the AI flow generator to set up workflows.",
      fr: "Utilisez l espace Automatisations ou le generateur IA pour configurer les workflows.",
    },
  },
  {
    q: { en: "How does billing work?", fr: "Comment fonctionne la facturation ?" },
    a: {
      en: "Plans renew based on your billing cycle. You can view invoices and subscription details in Billing.",
      fr: "Les plans se renouvellent selon votre cycle de facturation. Consultez Facturation pour les details.",
    },
  },
  {
    q: { en: "Where can I see logs?", fr: "Ou puis-je voir les journaux ?" },
    a: {
      en: "Activity logs live in your dashboard, and admins can access deeper system logs from Admin tools.",
      fr: "Les journaux d activite sont dans le tableau de bord, et les admins voient les journaux systeme.",
    },
  },
];

const commonIssues = [
  {
    en: "Create your first invoice and share the payment link with a customer.",
    fr: "Creez votre premiere facture et partagez le lien de paiement.",
  },
  {
    en: "Connect Paystack or Flutterwave to receive funds directly to your account.",
    fr: "Connectez Paystack ou Flutterwave pour recevoir les fonds sur votre compte.",
  },
  {
    en: "Enable WhatsApp messaging and send a test reminder to verify delivery.",
    fr: "Activez WhatsApp et envoyez un rappel test pour verifier l envoi.",
  },
  {
    en: "Set up one automation to confirm payments and issue receipts.",
    fr: "Configurez une automatisation pour confirmer les paiements et emettre des recus.",
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
      nextErrors.subject = t("Subject must be at least 5 characters.", "Sujet : 5 caracteres minimum.");
    if (message.length < 10)
      nextErrors.message = t("Message must be at least 10 characters.", "Message : 10 caracteres minimum.");
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
    <div className="mx-auto max-w-5xl space-y-14 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
          {t("Support", "Support")}
        </p>
        <h1 className="text-3xl font-semibold md:text-4xl">{t("Support", "Support")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Get help, ask questions, or reach the Maboria team directly.", "Obtenez de l aide, posez des questions ou contactez l equipe Maboria.")}
        </p>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("Quick questions", "Questions rapides")}</p>
            <p className="text-sm text-muted-foreground">
              {t("Answers to the most common questions about Maboria.", "Reponses aux questions les plus courantes sur Maboria.")}
            </p>
          </div>
          <div className="space-y-4">
            {quickQuestions.map((item) => (
              <div key={item.q.en} className="space-y-1">
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                  {t(item.q.en, item.q.fr)}
                </p>
                <p className="text-sm text-foreground">{t(item.a.en, item.a.fr)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 md:border-l md:border-border/40 md:pl-8">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("Getting started", "Bien demarrer")}</p>
            <p className="text-sm text-muted-foreground">
              {t("A quick checklist to get value on day one.", "Une liste rapide pour obtenir de la valeur des le premier jour.")}
            </p>
          </div>
          <div className="space-y-3">
            {commonIssues.map((item) => (
              <p key={item.en} className="text-sm text-foreground">
                {t(item.en, item.fr)}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-4 md:border-l md:border-border/40 md:pl-8">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("Account access", "Acces au compte")}</p>
            <p className="text-sm text-muted-foreground">
              {t(
                "Guidance on sign-in, roles, and account permissions.",
                "Conseils sur la connexion, les roles et les permissions."
              )}
            </p>
          </div>
          <div className="space-y-3 text-sm text-foreground">
            <p>{t("Update password or enable 2FA from Settings > Security.", "Mettez a jour le mot de passe ou activez la 2FA dans Parametres > Securite.")}</p>
            <p>{t("Manage team roles and access levels in Team settings.", "Gerez les roles et niveaux d acces dans Equipe.")}</p>
            <p>{t("Check authorized devices and active sessions.", "Verifiez les appareils autorises et les sessions actives.")}</p>
            <p>{t("For sensitive changes, contact support and we will assist directly.", "Pour les changements sensibles, contactez le support et nous vous aiderons directement.")}</p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t("Contact the Maboria team", "Contacter l equipe Maboria")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Have a question or need help? Send us a message - we read every request.",
              "Une question ou besoin d aide ? Envoyez-nous un message - nous lisons chaque demande."
            )}
          </p>
        </div>

        {status && <p className="text-sm text-foreground">{status}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={t("Email", "Email")}
            placeholder={t("you@company.com", "vous@entreprise.com")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label={t("Subject", "Sujet")}
            placeholder={t("Billing, automation, WhatsApp, account access...", "Facturation, automatisation, WhatsApp, acces compte...")}
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
              placeholder={t("Tell us what is going on. Include any relevant details.", "Expliquez la situation et ajoutez les details utiles.")}
              value={form.message}
              onChange={(e) => {
                setForm((f) => ({ ...f, message: e.target.value }));
                if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
              }}
              minLength={10}
              required
              error={errors.message}
              className="min-h-[200px] resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
              {t("Send message", "Envoyer le message")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}


