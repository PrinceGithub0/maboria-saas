"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatMoney(amount: number, currency: "NGN" | "USD") {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BillingPage() {
  const { data, isLoading } = useSWR("/api/billing/history", fetcher);
  const plans = pricingTableDualCurrency();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const featureMap: Record<string, { en: string; fr: string }> = {
    "Invoices: 50 / month": { en: "Invoices: 50 / month", fr: "Factures : 50 / mois" },
    "Payments (cards & bank transfer)": {
      en: "Payments (cards & bank transfer)",
      fr: "Paiements (carte et virement)",
    },
    "WhatsApp messages: 100 / month": { en: "WhatsApp messages: 100 / month", fr: "WhatsApp : 100 / mois" },
    "AI usage: 50 / month": { en: "AI usage: 50 / month", fr: "IA : 50 / mois" },
    "Automations: 3 total": { en: "Automations: 3 total", fr: "Automatisations : 3" },
    "1 user": { en: "1 user", fr: "1 utilisateur" },
    "Invoices: 300 / month": { en: "Invoices: 300 / month", fr: "Factures : 300 / mois" },
    "WhatsApp messages: 1,000 / month": { en: "WhatsApp messages: 1,000 / month", fr: "WhatsApp : 1 000 / mois" },
    "AI usage: 300 / month": { en: "AI usage: 300 / month", fr: "IA : 300 / mois" },
    "Automations: 10 total": { en: "Automations: 10 total", fr: "Automatisations : 10" },
    "Up to 3 team members": { en: "Up to 3 team members", fr: "Jusqu a 3 membres" },
    "Invoices: 1,000 / month": { en: "Invoices: 1,000 / month", fr: "Factures : 1 000 / mois" },
    "WhatsApp messages: 3,000 / month": { en: "WhatsApp messages: 3,000 / month", fr: "WhatsApp : 3 000 / mois" },
    "AI usage: 1,000 / month": { en: "AI usage: 1,000 / month", fr: "IA : 1 000 / mois" },
    "Automations: 25 total": { en: "Automations: 25 total", fr: "Automatisations : 25" },
    "Up to 5 team members": { en: "Up to 5 team members", fr: "Jusqu a 5 membres" },
    "Priority support": { en: "Priority support", fr: "Support prioritaire" },
    "Invoices: 3,000 / month": { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois" },
    "WhatsApp messages: 7,500 / month": { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois" },
    "AI usage: 3,000 / month": { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois" },
    "Automations: Unlimited": { en: "Automations: Unlimited", fr: "Automatisations illimitees" },
    "Up to 10 team members": { en: "Up to 10 team members", fr: "Jusqu a 10 membres" },
    "Role-based access": { en: "Role-based access", fr: "Acces par roles" },
    "Phone + priority support": { en: "Phone + priority support", fr: "Support telephone + prioritaire" },
    "Unlimited invoices": { en: "Unlimited invoices", fr: "Factures illimitees" },
    "Unlimited WhatsApp (fair-use)": { en: "Unlimited WhatsApp (fair-use)", fr: "WhatsApp illimite (fair-use)" },
    "Unlimited AI": { en: "Unlimited AI", fr: "IA illimitee" },
    "Unlimited team members": { en: "Unlimited team members", fr: "Membres illimites" },
    "Dedicated account manager": { en: "Dedicated account manager", fr: "Responsable dedie" },
    "SLA & custom integrations": { en: "SLA & custom integrations", fr: "SLA et integrations sur mesure" },
  };
  const translateFeature = (feature: string) =>
    language === "fr" ? featureMap[feature]?.fr || feature : featureMap[feature]?.en || feature;

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Billing", "Facturation")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Billing history", "Historique facturation")}</h1>
        </div>
      </div>

      <Card title={t("Plans", "Plans")}>
        <div className="grid gap-4 md:grid-cols-3 max-md:grid-cols-1 max-md:gap-5">
          {plans.map((p) => {
            const isEnterprise = p.plan === "ENTERPRISE";
            const href = isEnterprise ? "/contact" : "/dashboard/subscription";
            const cta = isEnterprise ? t("Contact sales", "Contacter ventes") : t("Manage plan", "Gerer le plan");

            return (
              <Card key={p.plan} className="bg-card/60" title={p.label}>
                <div className="space-y-3">
                  <div className="text-2xl font-semibold text-foreground">
                    {p.usd == null ? (
                      t("Contact sales", "Contacter ventes")
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(p.usd, "USD")}
                          <span className="text-sm text-muted-foreground">{t("/mo", "/mois")}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                        <span>{translateFeature(f)}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={href}>
                    <Button className="w-full" variant="secondary">
                      {cta}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      <Card title={t("Payments", "Paiements")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data?.payments || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "provider", label: t("Provider", "Prestataire") },
              { key: "status", label: t("Status", "Statut") },
              {
                key: "currency",
                label: t("Currency", "Devise"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "amount",
                label: t("Amount", "Montant"),
                render: (row: any) => formatCurrency(Number(row.amount || 0), row.currency),
              },
            ]}
          />
        )}
      </Card>

      <Card title={t("Invoices", "Factures")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data?.invoices || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "invoiceNumber", label: t("Invoice", "Facture") },
              { key: "status", label: t("Status", "Statut") },
              {
                key: "currency",
                label: t("Currency", "Devise"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "total",
                label: t("Total", "Total"),
                render: (row: any) => formatCurrency(Number(row.total || 0), row.currency),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
