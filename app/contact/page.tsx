"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";

export default function ContactPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setLoading(true);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || t("Could not send message.", "Envoi impossible."));
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }
    setStatus(t("Message sent. We will respond shortly.", "Message envoye. Reponse rapide."));
    setForm({ name: "", email: "", company: "", message: "" });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Talk to us", "Parlons")}
          </p>
          <h1 className="text-4xl font-semibold text-foreground">{t("Contact Maboria", "Contacter Maboria")}</h1>
          <p className="text-muted-foreground">
            {t("Fast responses from our team. You can also email us at ", "Reponse rapide de notre equipe. Email : ")}
            <a className="text-indigo-500 hover:text-indigo-400" href="mailto:info@maboria.com">
              info@maboria.com
            </a>
            .
          </p>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {status ? (
              <TransientAlert variant="success" onDismiss={() => setStatus(null)}>
                {status}
              </TransientAlert>
            ) : null}
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label={t("Name", "Nom")}
                placeholder={t("Your name", "Votre nom")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label={t("Email", "Email")}
                placeholder={t("you@company.com", "vous@entreprise.com")}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <Input
              label={t("Company", "Entreprise")}
              placeholder={t("Company", "Entreprise")}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <Textarea
              label={t("Message", "Message")}
              placeholder={t("Tell us about your needs...", "Parlez-nous de vos besoins...")}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
              rows={6}
            />
            <Button loading={loading} type="submit">
              {t("Send message", "Envoyer")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
