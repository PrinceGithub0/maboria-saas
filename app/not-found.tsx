import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LangText } from "@/components/ui/lang-text";

export default function NotFound() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-300">404</p>
        <h1 className="text-3xl font-semibold">{t("Page not found", "Page introuvable")}</h1>
        <p className="text-muted-foreground">
          {t("The page you are looking for does not exist.", "La page que vous cherchez n existe pas.")}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/dashboard">
            <Button>{t("Go to dashboard", "Aller au tableau")}</Button>
          </Link>
          <Link href="/support">
            <Button variant="secondary">{t("Contact support", "Contacter support")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
