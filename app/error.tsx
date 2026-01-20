"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-8 py-10 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-rose-800 dark:text-rose-200">500</p>
        <h1 className="text-3xl font-semibold text-foreground">
          {t("Unexpected error", "Erreur inattendue")}
        </h1>
        <p className="text-muted-foreground">
          {t("Something went wrong. Please retry.", "Un probleme est survenu. Veuillez reessayer.")}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Button onClick={reset}>{t("Retry", "Reessayer")}</Button>
          <Link href="/support">
            <Button variant="secondary">{t("Contact support", "Contacter support")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
