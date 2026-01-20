"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

export default function ForgotPasswordPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus(
        t(
          "If the email exists, a reset link has been sent.",
          "Si l'email existe, un lien de reinitialisation a ete envoye."
        )
      );
    } else {
      const data = await res.json();
      setStatus(data.error || t("Request failed", "Echec de la demande"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl max-md:max-w-none">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("Forgot password", "Mot de passe oublie")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Enter your email and we will send a secure reset link.",
            "Entrez votre email et nous enverrons un lien de reinitialisation securise."
          )}
        </p>
        {status && <Alert variant="info">{status}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <Input
            label={t("Email", "Email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button className="w-full" loading={loading} type="submit">
            {t("Send reset link", "Envoyer le lien")}
          </Button>
        </form>
      </div>
    </div>
  );
}
