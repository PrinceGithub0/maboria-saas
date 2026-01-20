import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LangText } from "@/components/ui/lang-text";

export default function AboutPage() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16 space-y-8 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <div>
          <Badge variant="success">{t("Built for operators", "Pour les operateurs")}</Badge>
          <h1 className="mt-3 text-4xl font-semibold text-foreground">{t("Why Maboria", "Pourquoi Maboria")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              "We unify automations, billing, and AI so your teams can execute faster without stitching tools together.",
              "Nous unifions automatisations, facturation et IA pour executer plus vite sans recoller des outils."
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card title={t("Automation engine", "Moteur d automatisation")}>
            <p className="text-sm text-muted-foreground">
              {t(
                "Drag-and-drop workflows with AI generated steps, restartable runs, and full logging.",
                "Workflows visuels, etapes IA, executions relancables, journaux complets."
              )}
            </p>
          </Card>
          <Card title={t("Financial ops", "Operations financieres")}>
            <p className="text-sm text-muted-foreground">
              {t(
                "Flutterwave multi-currency plus Paystack local rails in supported markets. Subscriptions, one-time, and audits.",
                "Flutterwave multi-monnaie plus Paystack local. Abonnements, paiements ponctuels, audits."
              )}
            </p>
          </Card>
          <Card title={t("AI copilots", "Copilotes IA")}>
            <p className="text-sm text-muted-foreground">
              {t(
                "Explain dashboards, generate flows, and draft invoices with OpenAI powered assistants.",
                "Expliquer les tableaux, generer des flows, et rediger des factures avec des assistants IA."
              )}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
