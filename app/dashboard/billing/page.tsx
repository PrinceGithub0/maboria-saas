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
  if (currency === "USD") {
    return `$${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(amount)}`;
  }

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
    "1 workspace": { en: "1 workspace", fr: "1 espace de travail", de: "1 Workspace", es: "1 espacio de trabajo", pt: "1 workspace" },
    "2 connections total": { en: "2 connections total", fr: "2 connexions au total", de: "2 Verbindungen insgesamt", es: "2 conexiónes en total", pt: "2 ligacoes no total" },
    "Unified inbox": { en: "Unified inbox", fr: "Boite de reception unifiee", de: "Einheitlicher Posteingang", es: "Bandeja unificada", pt: "Caixa de entrada unificada" },
    "Send invoices and track payments": { en: "Send invoices and track payments", fr: "Envoyer des factures et suivre les paiements", de: "Rechnungen senden und Zahlungen verfolgen", es: "Enviar facturas y seguir pagos", pt: "Enviar faturas e acompanhar pagamentos" },
    "Automated follow-ups": { en: "Automated follow-ups", fr: "Relances automatisees", de: "Automatisierte Nachfassaktionen", es: "Seguimientos automatizados", pt: "Follow-ups automatizados" },
    "Basic workflows": { en: "Basic workflows", fr: "Workflows de base", de: "Grundlegende Workflows", es: "Flujos basicos", pt: "Workflows basicos" },
    "AI assistant": { en: "AI assistant", fr: "Assistant IA", de: "KI-Assistent", es: "Asistente de IA", pt: "Assistente de IA" },
    "1 seat": { en: "1 seat", fr: "1 siege", de: "1 Platz", es: "1 asiento", pt: "1 lugar" },
    "Up to 8 connections": { en: "Up to 8 connections", fr: "Jusqu a 8 connexions", de: "Bis zu 8 Verbindungen", es: "Hasta 8 conexiónes", pt: "Até 8 ligacoes" },
    "Shared inbox": { en: "Shared inbox", fr: "Boite de reception partagee", de: "Geteilter Posteingang", es: "Bandeja compartida", pt: "Caixa de entrada partilhada" },
    "Smart automation workflows": { en: "Smart automation workflows", fr: "Workflows d'automatisation intelligents", de: "Intelligente Automatisierungs-Workflows", es: "Flujos de automatización inteligentes", pt: "Workflows de automação inteligentes" },
    "AI-powered replies": { en: "AI-powered replies", fr: "Réponses assistees par IA", de: "KI-gestützte Antworten", es: "Respuestas con IA", pt: "Respostas com IA" },
    "Payment tracking": { en: "Payment tracking", fr: "Suivi des paiements", de: "Zahlungsverfolgung", es: "Seguimiento de pagos", pt: "Acompanhamento de pagamentos" },
    "Exports": { en: "Exports", fr: "Exports", de: "Exporte", es: "Exportaciones", pt: "Exportacoes" },
    "Role-based access": { en: "Role-based access", fr: "Accès base sur les rôles", de: "Rollenbasierter Zugriff", es: "Acceso basado en roles", pt: "Acesso baseado em funções" },
    "3 seats": { en: "3 seats", fr: "3 sieges", de: "3 Platze", es: "3 asientos", pt: "3 lugares" },
    "Up to 20 connections": { en: "Up to 20 connections", fr: "Jusqu a 20 connexions", de: "Bis zu 20 Verbindungen", es: "Hasta 20 conexiónes", pt: "Até 20 ligacoes" },
    "Multiple connected inboxes": { en: "Multiple connected inboxes", fr: "Plusieurs boites connectees", de: "Mehrere verbundene Posteingänge", es: "Multiples bandejas conectadas", pt: "Varias caixas de entrada ligadas" },
    "Advanced routing and assignment": { en: "Advanced routing and assignment", fr: "Routage et attribution avances", de: "Erweitertes Routing und Zuweisung", es: "Enrutamiento y asignacion avanzados", pt: "Encaminhamento e atribuicao avancados" },
    "Reporting and team visibility": { en: "Reporting and team visibility", fr: "Rapports et visibilite équipe", de: "Reporting und Team-Transparenz", es: "Informes y visibilidad del equipo", pt: "Relatórios e visibilidade da equipa" },
    "Longer history retention": { en: "Longer history retention", fr: "Rétention d'historique plus longue", de: "Langere Verlaufsspeicherung", es: "Retención de historial más larga", pt: "Retenção de histórico mais longa" },
    "Priority support": { en: "Priority support", fr: "Support prioritaire", de: "Priorisierter Support", es: "Soporte prioritario", pt: "Suporte prioritario" },
    "Up to 8 seats": { en: "Up to 8 seats", fr: "Jusqu a 8 sieges", de: "Bis zu 8 Platze", es: "Hasta 8 asientos", pt: "Até 8 lugares" },
    "Unlimited connections": { en: "Unlimited connections", fr: "Connexions illimitees", de: "Unbegrenzte Verbindungen", es: "Conexiónes ilimitadas", pt: "Ligacoes ilimitadas" },
    "Advanced inbox operations": { en: "Advanced inbox operations", fr: "Operations de boite avancees", de: "Erweiterte Posteingangsoperationen", es: "Operaciones avanzadas de bandeja", pt: "Operações avancadas da caixa de entrada" },
    "Roles and permissions": { en: "Roles and permissions", fr: "Roles et permissions", de: "Rollen und Berechtigungen", es: "Roles y permisos", pt: "Funções e permissoes" },
    "Audit logs": { en: "Audit logs", fr: "Journaux d'audit", de: "Audit-Protokolle", es: "Registros de auditoria", pt: "Registos de auditoria" },
    "Admin controls": { en: "Admin controls", fr: "Controles administrateur", de: "Admin-Steuerung", es: "Controles de administración", pt: "Controlos de administração" },
    "Advanced reporting": { en: "Advanced reporting", fr: "Rapports avances", de: "Erweitertes Reporting", es: "Informes avanzados", pt: "Relatórios avancados" },
    "Compliance and e-invoicing support": { en: "Compliance and e-invoicing support", fr: "Support conformité et e-facturation", de: "Compliance- und E-Rechnungs-Support", es: "Soporte de cumplimiento y facturación electronica", pt: "Suporte de conformidade e faturação eletronica" },
    "Onboarding assistance": { en: "Onboarding assistance", fr: "Aide à l'onboarding", de: "Onboarding-Unterstützung", es: "Ayuda de onboarding", pt: "Ajuda de onboarding" },
    "Up to 15 seats": { en: "Up to 15 seats", fr: "Jusqu a 15 sieges", de: "Bis zu 15 Platze", es: "Hasta 15 asientos", pt: "Até 15 lugares" },
    "Custom throughput": { en: "Custom throughput", fr: "Debit personnalise", de: "Individueller Durchsatz", es: "Capacidad personalizada", pt: "Capacidade personalizada" },
    "SLA guarantee": { en: "SLA guarantee", fr: "Garantie SLA", de: "SLA-Garantie", es: "Garantia SLA", pt: "Garantia SLA" },
    "Custom integrations": { en: "Custom integrations", fr: "Integrations personnalisees", de: "Individuelle Integrationen", es: "Integraciónes personalizadas", pt: "Integrações personalizadas" },
    "Dedicated support": { en: "Dedicated support", fr: "Support dedie", de: "Dedizierter Support", es: "Soporte dedicado", pt: "Suporte dedicado" },
    "Compliance rollout assistance": { en: "Compliance rollout assistance", fr: "Aide au deploiement conformité", de: "Unterstützung beim Compliance-Rollout", es: "Ayuda para despliegue de cumplimiento", pt: "Ajuda no rollout de conformidade" },
    "Negotiated limits and controls": { en: "Negotiated limits and controls", fr: "Limites et controles negocies", de: "Verhandelte Limits und Steuerungen", es: "Limites y controles negociados", pt: "Limites e controlos negociados" },
    "Custom seat volume": { en: "Custom seat volume", fr: "Volume de sieges personnalise", de: "Individuelles Sitzvolumen", es: "Volumen de asientos personalizado", pt: "Volume de lugares personalizado" },
  };
  const translateFeature = (feature: string) =>
    t(
      featureMap[feature] || { en: feature, fr: feature, de: feature, es: feature, pt: feature }
    );
  const localizeBillingError = (message?: string) => {
    const normalized = String(message || "").trim();
    if (!normalized) return t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possível carregar o histórico de faturação.");
    const mappings: Record<string, string> = {
      "Unable to load billing history.": t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possível carregar o histórico de faturação."),
      Unauthorized: t("Please sign in and try again.", "Veuillez vous connecter puis réessayer.", "Bitte melde dich an und versuche es erneut.", "Inicia sesión y vuelve a intentarlo.", "Inicie sessão e tente novamente."),
      Forbidden: t("You do not have access to billing.", "Vous n'avez pas accès a la facturation.", "Du hast keinen Zugriff auf die Abrechnung.", "No tienes acceso a la facturación.", "Não tem acesso a faturação."),
      "Request failed": t("Unable to load billing history.", "Impossible de charger l'historique de facturation.", "Der Abrechnungsverlauf konnte nicht geladen werden.", "No se pudo cargar el historial de facturación.", "Não foi possível carregar o histórico de faturação."),
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 max-md:grid-cols-1 max-md:gap-5">
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
              "L'historique de facturation n'a pas pu être charge. Vérifiez les permissions ou réessayez.",
              "Der Abrechnungsverlauf konnte nicht geladen werden. überprüfe die Berechtigungen oder versuche es erneut.",
              "No se pudo cargar el historial de facturación. Revisa los permisos o intentalo de nuevo.",
              "Não foi possível carregar o histórico de faturação. Verifique as permissões ou tente novamente."
            )}
          </Alert>
        ) : payments.length === 0 ? (
          <EmptyState
            title={t("No payments yet", "Aucun paiement pour le moment", "Noch keine Zahlungen", "Aún no hay pagos", "Ainda não ha pagamentos")}
            description={t(
              "Completed subscription and invoice payments will appear here.",
              "Les paiements d abonnement et de facture apparaitront ici.",
              "Abgeschlossene Abonnement- und Rechnungszahlungen werden hier angezeigt.",
              "Los pagos completados de suscripciones y facturas apareceran aquí.",
              "Os pagamentos concluidos de subscricoes e faturas aparecem aquí."
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
              "Les factures n'ont pas pu être chargees. Vérifiez les permissions ou réessayez.",
              "Die Rechnungen konnten nicht geladen werden. überprüfe die Berechtigungen oder versuche es erneut.",
              "No se pudieron cargar las facturas. Revisa los permisos o intentalo de nuevo.",
              "Não foi possível carregar as faturas. Verifique as permissões ou tente novamente."
            )}
          </Alert>
        ) : invoices.length === 0 ? (
          <EmptyState
            title={t("No invoices yet", "Aucune facture pour le moment", "Noch keine Rechnungen", "Aún no hay facturas", "Ainda não existem faturas")}
            description={t(
              "Generated invoices will appear here once you start billing customers.",
              "Les factures generees apparaitront ici quand vous commencerez a facturer des clients.",
              "Erstellte Rechnungen erscheinen hier, sobald du Kunden in Rechnung stellst.",
              "Las facturas generadas apareceran aquí cuando empieces a facturar a tus clientes.",
              "As faturas geradas aparecem aquí quando começar a faturar clientes."
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
        {t("Billing questions? Email us at ", "Questions de facturation ? Ecrivez a ", "Fragen zur Abrechnung? Schreibe an ", "Preguntas de facturación? Escribe a ", "Questoes de faturação? Envie email para ")}
        <a href="mailto:billing@maboria.com" className="font-medium text-foreground hover:underline">
          billing@maboria.com
        </a>
      </p>
    </div>
  );
}
