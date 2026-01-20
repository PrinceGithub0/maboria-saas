import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { LangText } from "@/components/ui/lang-text";

const plans = pricingTableDualCurrency();
const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
const planLabels: Record<string, { en: string; fr: string }> = {
  Starter: { en: "Starter", fr: "Starter" },
  Pro: { en: "Pro", fr: "Pro" },
  Enterprise: { en: "Enterprise", fr: "Entreprise" },
};
const featureMap: Record<string, { en: string; fr: string }> = {
  "Core automations": { en: "Core automations", fr: "Automatisations de base" },
  Invoices: { en: "Invoices", fr: "Factures" },
  "Email notifications": { en: "Email notifications", fr: "Notifications email" },
  "Team-ready basics": { en: "Team-ready basics", fr: "Bases equipe" },
  "AI assistant": { en: "AI assistant", fr: "Assistant IA" },
  "WhatsApp automation": { en: "WhatsApp automation", fr: "Automatisation WhatsApp" },
  "Higher usage limits": { en: "Higher usage limits", fr: "Limites plus elevees" },
  "Priority support": { en: "Priority support", fr: "Support prioritaire" },
  "Custom limits": { en: "Custom limits", fr: "Limites personnalisees" },
  "Advanced controls": { en: "Advanced controls", fr: "Controles avances" },
  "SLA options": { en: "SLA options", fr: "Options SLA" },
  "Dedicated support": { en: "Dedicated support", fr: "Support dedie" },
};

const translateFeature = (value: string) => {
  const entry = featureMap[value];
  return entry ? t(entry.en, entry.fr) : t(value, value);
};

function formatMoney(amount: number, currency: "NGN" | "USD") {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-10 px-6 py-16 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <div className="space-y-3 text-center">
          <Badge variant="success">{t("Flutterwave + Paystack", "Flutterwave + Paystack")}</Badge>
          <h1 className="text-4xl font-semibold text-foreground">{t("Pricing", "Tarifs")}</h1>
          <p className="text-muted-foreground">
            {t(
              "Prices are shown in NGN and USD and include 7.5% VAT. Free trial is available only from the top CTA; subscribe directly below.",
              "Prix en NGN et USD, TVA 7.5% incluse. Essai disponible via le CTA du haut; abonnez-vous ci-dessous."
            )}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const featured = plan.plan === "GROWTH";
            const href =
              plan.plan === "ENTERPRISE"
                ? "/contact"
                : plan.plan === "GROWTH"
                  ? "/dashboard/subscription?plan=pro"
                  : "/dashboard/subscription?plan=starter";
            const cta = plan.plan === "ENTERPRISE" ? t("Contact sales", "Contacter ventes") : t("Subscribe", "Souscrire");
            const labelEntry = planLabels[plan.label];
            const label = labelEntry ? t(labelEntry.en, labelEntry.fr) : t(plan.label, plan.label);

            return (
              <Card
                key={plan.plan}
                className={`h-full border-border bg-card/60 ${
                  featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : ""
                }`}
                title={label}
                actions={
                  featured ? (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                      style={{
                        color: "#000000",
                        backgroundColor: "#d1fae5",
                        border: "1px solid #6ee7b7",
                      }}
                    >
                      {t("Popular", "Populaire")}
                    </span>
                  ) : undefined
                }
              >
                <div className="space-y-4">
                  <div className="text-3xl font-semibold text-foreground">
                    {plan.ngn == null ? (
                      t("Contact sales", "Contacter ventes")
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(plan.ngn, "NGN")}
                          <span className="text-sm text-muted-foreground">{t("/mo", "/mois")}</span>
                        </div>
                        {plan.usd != null && (
                          <div className="text-sm font-medium text-muted-foreground">
                            {formatMoney(plan.usd, "USD")}
                            {t("/mo", "/mois")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2 text-sm text-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {translateFeature(feature)}
                      </li>
                    ))}
                  </ul>

                  <Link href={href}>
                    <Button variant="primary" className="w-full">
                      {cta}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
