"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

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
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Support", "Support")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Contact support", "Contacter le support")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Send a ticket directly from your dashboard.", "Envoyez un ticket directement depuis votre tableau.")}
          </p>
        </div>

        {status && (
          <div className="mt-4">
            <Alert variant={status.variant}>{status.message}</Alert>
          </div>
        )}
      </div>

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
          />
          <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
            {t("Submit ticket", "Envoyer le ticket")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
