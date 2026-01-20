"use client";

import { useLanguage } from "@/components/providers/language-provider";

export default function Error({
  reset,
}: {
  reset?: () => void;
}) {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-100">
      <p className="font-semibold">
        {t("Something went wrong loading the dashboard.", "Erreur lors du chargement du tableau.")}
      </p>
      <p className="text-sm text-rose-700 dark:text-rose-200">{t("Please retry.", "Veuillez reessayer.")}</p>
      {reset && (
        <button
          onClick={reset}
          className="mt-3 rounded-lg border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-sm text-rose-800 hover:bg-rose-500/30 dark:text-rose-50"
        >
          {t("Retry", "Reessayer")}
        </button>
      )}
    </div>
  );
}
