import { LangText } from "@/components/ui/lang-text";
import { resolveLocalizedText } from "@/lib/i18n";

export default function DocsPage() {
  const t = (en: string, fr: string) => <LangText {...resolveLocalizedText({ en, fr })} />;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <h1 className="text-3xl font-semibold">{t("Maboria Internal Docs", "Docs internes Maboria")}</h1>
      <section>
        <h2 className="text-xl font-semibold">{t("Architecture overview", "Vue d ensemble architecture")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Next.js App Router, Prisma/Postgres, NextAuth, Flutterwave/Paystack, OpenAI. Clean architecture with lib/ services, app/ routes, and shared UI components. Automation engine executes JSON-defined steps with AI augmentation.",
            "Next.js App Router, Prisma/Postgres, NextAuth, Flutterwave/Paystack, OpenAI. Architecture propre avec lib/, routes app/ et UI partagee. Le moteur execute des etapes JSON avec IA."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("Folder structure", "Structure des dossiers")}</h2>
        <ul className="text-sm text-muted-foreground list-disc pl-4">
          <li>{t("app/ - routes (marketing, dashboard, admin, api)", "app/ - routes (marketing, dashboard, admin, api)")}</li>
          <li>{t("lib/ - auth, prisma, ai router, billing, pricing, validators", "lib/ - auth, prisma, IA, facturation, pricing, validateurs")}</li>
          <li>{t("components/ - UI + builders + assistant", "components/ - UI + builders + assistant")}</li>
          <li>{t("prisma/ - schema, migrations, seed", "prisma/ - schema, migrations, seed")}</li>
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("API reference", "Reference API")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "See docs/API.md for endpoints (auth, automations, payments, invoices, AI, admin).",
            "Voir docs/API.md pour les endpoints (auth, automatisations, paiements, factures, IA, admin)."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("Database schema", "Schema base de données")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Users, subscriptions, payments, invoices, automations, runs, AI memory, logs, settings.",
            "Users, abonnements, paiements, factures, automatisations, runs, memoire IA, logs, paramêtres."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("AI system", "Systeme IA")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Router supports flow generation, improvement, step generation, insights, diagnosis. Memory stored in AiMemory, usage logs in AiUsageLog.",
            "Le routeur supporte generation de flows, amelioration, etapes, insights, diagnostic. Memoire dans AiMemory, usage dans AiUsageLog."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("Automation engine", "Moteur d automatisation")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Executes steps: parse, condition, extract, API call, DB write, webhook, invoice, email, AI transform, usage metering, recovery.",
            "Execute: parse, condition, extract, API, DB write, webhook, facture, email, IA, metering, recovery."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("Payment system", "Systeme de paiement")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Flutterwave for multi-currency and Paystack for local rails in supported markets. Webhooks with idempotency, dual-currency storage, subscriptions table, billing history API.",
            "Flutterwave pour multi-monnaie et Paystack pour local. Webhooks idempotents, stockage bi-monnaie, abonnements, API historique."
          )}
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t("Deployment steps", "Etapes de d?ploiement")}</h2>
        <ol className="text-sm text-muted-foreground list-decimal pl-4">
          <li>{t("Set env vars from .env.production.example", "Definir les variables .env.production.example")}</li>
          <li>{t("Provision Postgres + run prisma migrate deploy", "Provisionner Postgres + prisma migrate deploy")}</li>
          <li>{t("Configure Flutterwave/Paystack webhooks", "Configurer webhooks Flutterwave/Paystack")}</li>
          <li>{t("Deploy Next.js (Vercel) and verify /api/health", "Deployer Next.js (Vercel) et verifier /api/health")}</li>
          <li>{t("Run pre-launch checklist UI/API", "Executer checklist pre-lancement UI/API")}</li>
        </ol>
      </section>
    </div>
  );
}
