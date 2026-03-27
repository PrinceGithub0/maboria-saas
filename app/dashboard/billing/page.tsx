"use client";

import Link from "next/link";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES, type LocalizedText } from "@/lib/i18n";

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || "Unable to load billing history."));
  }
  return payload;
};

function formatMoney(amount: number, currency: "NGN" | "USD", locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BillingPage() {
  const { language, t } = useLanguage();
  const { data, error, isLoading } = useSWR("/api/billing/history", fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const plans = pricingTableDualCurrency();
  const locale = LANGUAGE_LOCALES[language];
  const featureMap: Record<string, LocalizedText> = {
    "Invoices: 50 / month": {
      en: "Invoices: 50 / month",
      fr: "Factures : 50 / mois",
      de: "Rechnungen: 50 / Monat",
      es: "Facturas: 50 / mes",
      pt: "Faturas: 50 / mes",
    },
    "Payments (cards & bank transfer)": {
      en: "Payments (cards & bank transfer)",
      fr: "Paiements (carte et virement)",
      de: "Zahlungen (Karten und Banküberweisung)",
      es: "Pagos (tarjetas y transferencia bancaria)",
      pt: "Pagamentos (cartoes e transferencia bancaria)",
    },
    "WhatsApp messages: 100 / month": { en: "WhatsApp messages: 100 / month", fr: "WhatsApp : 100 / mois", de: "WhatsApp-Nachrichten: 100 / Monat", es: "Mensajes de WhatsApp: 100 / mes", pt: "Mensagens WhatsApp: 100 / mes" },
    "AI usage: 50 / month": { en: "AI usage: 50 / month", fr: "IA : 50 / mois", de: "KI-Nutzung: 50 / Monat", es: "Uso de IA: 50 / mes", pt: "Uso de IA: 50 / mes" },
    "Automations: 3 total": { en: "Automations: 3 total", fr: "Automatisations : 3", de: "Automatisierungen: 3 gesamt", es: "Automatizaciónes: 3 en total", pt: "Automações: 3 no total" },
    "1 user": { en: "1 user", fr: "1 utilisateur", de: "1 Benutzer", es: "1 usuario", pt: "1 utilizador" },
    "Invoices: 300 / month": { en: "Invoices: 300 / month", fr: "Factures : 300 / mois", de: "Rechnungen: 300 / Monat", es: "Facturas: 300 / mes", pt: "Faturas: 300 / mes" },
    "WhatsApp messages: 1,000 / month": { en: "WhatsApp messages: 1,000 / month", fr: "WhatsApp : 1 000 / mois", de: "WhatsApp-Nachrichten: 1.000 / Monat", es: "Mensajes de WhatsApp: 1.000 / mes", pt: "Mensagens WhatsApp: 1.000 / mes" },
    "AI usage: 300 / month": { en: "AI usage: 300 / month", fr: "IA : 300 / mois", de: "KI-Nutzung: 300 / Monat", es: "Uso de IA: 300 / mes", pt: "Uso de IA: 300 / mes" },
    "Automations: 10 total": { en: "Automations: 10 total", fr: "Automatisations : 10", de: "Automatisierungen: 10 gesamt", es: "Automatizaciónes: 10 en total", pt: "Automações: 10 no total" },
    "Up to 3 team members": { en: "Up to 3 team members", fr: "Jusqu a 3 membres", de: "Bis zu 3 Teammitglieder", es: "Hasta 3 miembros del equipo", pt: "At? 3 membros da equipa" },
    "Invoices: 1,000 / month": { en: "Invoices: 1,000 / month", fr: "Factures : 1 000 / mois", de: "Rechnungen: 1.000 / Monat", es: "Facturas: 1.000 / mes", pt: "Faturas: 1.000 / mes" },
    "WhatsApp messages: 3,000 / month": { en: "WhatsApp messages: 3,000 / month", fr: "WhatsApp : 3 000 / mois", de: "WhatsApp-Nachrichten: 3.000 / Monat", es: "Mensajes de WhatsApp: 3.000 / mes", pt: "Mensagens WhatsApp: 3.000 / mes" },
    "AI usage: 1,000 / month": { en: "AI usage: 1,000 / month", fr: "IA : 1 000 / mois", de: "KI-Nutzung: 1.000 / Monat", es: "Uso de IA: 1.000 / mes", pt: "Uso de IA: 1.000 / mes" },
    "Automations: 25 total": { en: "Automations: 25 total", fr: "Automatisations : 25", de: "Automatisierungen: 25 gesamt", es: "Automatizaciónes: 25 en total", pt: "Automações: 25 no total" },
    "Up to 5 team members": { en: "Up to 5 team members", fr: "Jusqu a 5 membres", de: "Bis zu 5 Teammitglieder", es: "Hasta 5 miembros del equipo", pt: "At? 5 membros da equipa" },
    "Priority support": { en: "Priority support", fr: "Support prioritaire", de: "Priorisierter Support", es: "Soporte prioritario", pt: "Suporte prioritario" },
    "Invoices: 3,000 / month": { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois", de: "Rechnungen: 3.000 / Monat", es: "Facturas: 3.000 / mes", pt: "Faturas: 3.000 / mes" },
    "WhatsApp messages: 7,500 / month": { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois", de: "WhatsApp-Nachrichten: 7.500 / Monat", es: "Mensajes de WhatsApp: 7.500 / mes", pt: "Mensagens WhatsApp: 7.500 / mes" },
    "AI usage: 3,000 / month": { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois", de: "KI-Nutzung: 3.000 / Monat", es: "Uso de IA: 3.000 / mes", pt: "Uso de IA: 3.000 / mes" },
    "Automations: Unlimited": { en: "Automations: Unlimited", fr: "Automatisations illimitees", de: "Automatisierungen: Unbegrenzt", es: "Automatizaciónes: Ilimitadas", pt: "Automações: Ilimitadas" },
    "Up to 10 team members": { en: "Up to 10 team members", fr: "Jusqu a 10 membres", de: "Bis zu 10 Teammitglieder", es: "Hasta 10 miembros del equipo", pt: "At? 10 membros da equipa" },
    "Role-based access": { en: "Role-based access", fr: "Accès par roles", de: "Rollenbasierter Zugriff", es: "Acceso basado en roles", pt: "Acesso baseado em funções" },
    "Phone + priority support": { en: "Phone + priority support", fr: "Support telephone + prioritaire", de: "Telefon + priorisierter Support", es: "Telefono + soporte prioritario", pt: "Telefone + suporte prioritario" },
    "Unlimited invoices": { en: "Unlimited invoices", fr: "Factures illimitees", de: "Unbegrenzte Rechnungen", es: "Facturas ilimitadas", pt: "Faturas ilimitadas" },
    "Unlimited WhatsApp (fair-use)": { en: "Unlimited WhatsApp (fair-use)", fr: "WhatsApp illimite (fair-use)", de: "Unbegrenztes WhatsApp (Fair Use)", es: "WhatsApp ilimitado (uso justo)", pt: "WhatsApp ilimitado (uso justo)" },
    "Unlimited AI": { en: "Unlimited AI", fr: "IA illimitee", de: "Unbegrenzte KI", es: "IA ilimitada", pt: "IA ilimitada" },
    "Unlimited team members": { en: "Unlimited team members", fr: "Membres illimites", de: "Unbegrenzte Teammitglieder", es: "Miembros ilimitados del equipo", pt: "Membros de equipa ilimitados" },
    "Dedicated account manager": { en: "Dedicated account manager", fr: "Responsable dedie", de: "Dedizierter Account Manager", es: "Gestor de cuenta dedicado", pt: "Gestor de conta dedicado" },
    "SLA & custom integrations": { en: "SLA & custom integrations", fr: "SLA et integrations sur mesure", de: "SLA und individuelle Integrationen", es: "SLA e integraciónes personalizadas", pt: "SLA e integrações personalizadas" },
  };
  const translateFeature = (feature: string) => t(featureMap[feature] || { en: feature });
  const localizeBillingError = (message?: string) => {
    const normalized = String(message || "").trim();
    if (!normalized) return t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possivel carregar o histórico de faturação.");
    const mappings: Record<string, string> = {
      "Unable to load billing history.": t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possivel carregar o histórico de faturação."),
      Unauthorized: t("Please sign in and try again.", "Veuillez vous connecter puis réessayer.", "Bitte melde dich an und versuche es erneut.", "Inicia sesión y vuelve a intentarlo.", "Inicie sessão e tente novamente."),
      Forbidden: t("You do not have access to billing.", "Vous n'avez pas accès a la facturation.", "Du hast keinen Zugriff auf die Abrechnung.", "No tienes acceso a la facturación.", "Não tem acesso a faturação."),
      "Request failed": t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possivel carregar o histórico de faturação."),
    };
    return mappings[normalized] || normalized;
  };
  const localizePaymentStatus = (value: string) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "SUCCEEDED" || normalized === "PAID") return t("Paid", "Paye", "Bezahlt", "Pagado", "Pago");
    if (normalized === "PENDING") return t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente");
    if (normalized === "FAILED") return t("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhou");
    if (normalized === "REFUNDED") return t("Refunded", "Rembourse", "Erstattet", "Reembolsado", "Reembolsado");
    return value;
  };
  const localizeInvoiceStatus = (value: string) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "DRAFT") return t("Draft", "Brouillon", "Entwurf", "Borrador", "Rascunho");
    if (normalized === "SENT") return t("Sent", "Envoyee", "Gesendet", "Enviada", "Enviada");
    if (normalized === "OVERDUE") return t("Overdue", "En retard", "überfällig", "Vencida", "Em atraso");
    if (normalized === "PAID") return t("Paid", "Payee", "Bezahlt", "Pagada", "Paga");
    if (normalized === "PARTIALLY_REFUNDED") return t("Partially refunded", "Partiellement remboursee", "Teilweise erstattet", "Parcialmente reembolsada", "Parcialmente reembolsada");
    if (normalized === "REFUNDED") return t("Refunded", "Remboursee", "Erstattet", "Reembolsada", "Reembolsada");
    if (normalized === "VOID") return t("Void", "Annulee", "Storniert", "Anulada", "Anulada");
    return value;
  };
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Billing history", "Historique facturation", "Abrechnungsverlauf", "Historial de facturación", "Histórico de faturação")}</h1>
        </div>
      </div>

      <Card title={t("Plans", "Plans", "Plane", "Planes", "Planos")}>
        <div className="grid gap-4 md:grid-cols-3 max-md:grid-cols-1 max-md:gap-5">
          {plans.map((p) => {
            const isEnterprise = p.plan === "ENTERPRISE";
            const href = isEnterprise ? "/contact" : "/dashboard/subscription";
            const cta = isEnterprise ? t("Contact sales", "Contacter ventes", "Vertrieb kontaktieren", "Contactar ventas", "Contactar vendas") : t("Manage plan", "Gerer le plan", "Plan verwalten", "Gestionar plan", "Gerir plano");

            return (
              <Card key={p.plan} className="bg-card/60" title={p.label}>
                <div className="space-y-3">
                  <div className="text-2xl font-semibold text-foreground">
                    {p.usd == null ? (
                      t("Contact sales", "Contacter ventes", "Vertrieb kontaktieren", "Contactar ventas", "Contactar vendas")
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(p.usd, "USD", locale)}
                          <span className="text-sm text-muted-foreground">{t("/mo", "/mois", "/Monat", "/mes", "/mes")}</span>
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

      {error ? <Alert variant="error">{localizeBillingError((error as Error).message)}</Alert> : null}

      <Card title={t("Payments", "Paiements", "Zahlungen", "Pagos", "Pagamentos")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : error ? (
          <Alert variant="error">
            {t(
              "Billing history could not be loaded. Check billing permissions or try again.",
              "L'historique de facturation n'a pas pu être charge. Verifiez les permissions ou reessayez.",
              "Der Abrechnungsverlauf konnte nicht geladen werden. überprüfe die Berechtigungen oder versuche es erneut.",
              "No se pudo cargar el historial de facturación. Revisa los permisos o intentalo de nuevo.",
              "Não foi possivel carregar o histórico de faturação. Verifique as permissoes ou tente novamente."
            )}
          </Alert>
        ) : payments.length === 0 ? (
          <EmptyState
            title={t("No payments yet", "Aucun paiement pour le moment", "Noch keine Zahlungen", "Aún no hay pagos", "Ainda não ha pagamentos")}
            description={t(
              "Completed subscription and invoice payments will appear here.",
              "Les paiements d abonnement et de facture apparaitront ici.",
              "Abgeschlossene Abonnement- und Rechnungszahlungen werden hier angezeigt.",
              "Los pagos completados de suscripciones y facturas apareceran aqui.",
              "Os pagamentos concluidos de subscricoes e faturas aparecem aqui."
            )}
          />
        ) : (
          <Table
            data={payments}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "provider", label: t("Provider", "Prestataire", "Anbieter", "Proveedor", "Fornecedor") },
              {
                key: "status",
                label: t("Status", "Statut", "Status", "Estado", "Estado"),
                render: (row: any) => localizePaymentStatus(String(row.status || "")),
              },
              {
                key: "currency",
                label: t("Currency", "Devise", "Währung", "Moneda", "Moeda"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "amount",
                label: t("Amount", "Montant", "Betrag", "Importe", "Montante"),
                render: (row: any) => formatCurrency(Number(row.amount || 0), row.currency),
              },
            ]}
          />
        )}
      </Card>

      <Card title={t("Invoices", "Factures", "Rechnungen", "Facturas", "Faturas")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : error ? (
          <Alert variant="error">
            {t(
              "Invoices could not be loaded. Check billing permissions or try again.",
              "Les factures n'ont pas pu être chargees. Verifiez les permissions ou reessayez.",
              "Die Rechnungen konnten nicht geladen werden. überprüfe die Berechtigungen oder versuche es erneut.",
              "No se pudieron cargar las facturas. Revisa los permisos o intentalo de nuevo.",
              "Não foi possivel carregar as faturas. Verifique as permissoes ou tente novamente."
            )}
          </Alert>
        ) : invoices.length === 0 ? (
          <EmptyState
            title={t("No invoices yet", "Aucune facture pour le moment", "Noch keine Rechnungen", "Aún no hay facturas", "Ainda não existem faturas")}
            description={t(
              "Generated invoices will appear here once you start billing customers.",
              "Les factures generees apparaitront ici quand vous commencerez a facturer des clients.",
              "Erstellte Rechnungen erscheinen hier, sobald du Kunden in Rechnung stellst.",
              "Las facturas generadas apareceran aqui cuando empieces a facturar a tus clientes.",
              "As faturas geradas aparecem aqui quando comecar a faturar clientes."
            )}
          />
        ) : (
          <Table
            data={invoices}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "invoiceNumber", label: t("Invoice", "Facture", "Rechnung", "Factura", "Fatura") },
              {
                key: "status",
                label: t("Status", "Statut", "Status", "Estado", "Estado"),
                render: (row: any) => localizeInvoiceStatus(String(row.status || "")),
              },
              {
                key: "currency",
                label: t("Currency", "Devise", "Währung", "Moneda", "Moeda"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "total",
                label: t("Total", "Total", "Gesamt", "Total", "Total"),
                render: (row: any) => formatCurrency(Number(row.total || 0), row.currency),
              },
            ]}
          />
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("Billing questions? Email ", "Questions de facturation ? Ecrivez a ", "Fragen zur Abrechnung? Schreibe an ", "Preguntas de facturación? Escribe a ", "Questoes de faturação? Envie email para ")}
        <a href="mailto:billing@maboria.com" className="font-medium text-foreground hover:underline">
          billing@maboria.com
        </a>
        .
      </p>
    </div>
  );
}
