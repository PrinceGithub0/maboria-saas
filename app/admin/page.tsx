import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { OrgSubscriptionStatus, PaymentStatus, SupportThreadStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { formatDateTimeDMY } from "@/lib/date";
import { localizeAdminActionLabel } from "@/lib/admin/localization";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import { getLocalizedText, LANGUAGE_LOCALES, normalizeLanguage } from "@/lib/i18n";

type AdminSearchParams = {
  tenant?: string;
  range?: string;
};

type RevenuePoint = { name: string; value: number };

type RiskItem = {
  id: string;
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  context: string;
  href: string;
};

type RenewalJobMetadata = {
  processed?: number;
  succeeded?: number;
  pending?: number;
  skipped?: number;
  failed?: number;
};

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const dayMs = 24 * 60 * 60 * 1000;

function withDaysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * dayMs);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toShortDay(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date);
}

function parseRange(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized in RANGE_DAYS) return normalized;
  return "30d";
}

function toPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function formatResponseTime(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return "--";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function metricText(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function readRenewalJobMetadata(value: unknown): RenewalJobMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = value as Record<string, unknown>;
  return {
    processed: typeof metadata.processed === "number" ? metadata.processed : 0,
    succeeded: typeof metadata.succeeded === "number" ? metadata.succeeded : 0,
    pending: typeof metadata.pending === "number" ? metadata.pending : 0,
    skipped: typeof metadata.skipped === "number" ? metadata.skipped : 0,
    failed: typeof metadata.failed === "number" ? metadata.failed : 0,
  };
}

function buildRevenueSeries(payments: Array<{ createdAt: Date; amount: number }>, days: number, locale: string): RevenuePoint[] {
  const today = startOfUtcDay(new Date());
  const firstDay = withDaysAgo(today, days - 1);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(firstDay.getTime() + i * dayMs);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const payment of payments) {
    const key = startOfUtcDay(payment.createdAt).toISOString().slice(0, 10);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) || 0) + payment.amount);
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    name: toShortDay(new Date(`${key}T00:00:00.000Z`), locale),
    value: Number(value.toFixed(2)),
  }));
}

function systemHealthStatus(
  input: {
  webhookFailures24h: number;
  automationErrors24h: number;
  failedPayments30d: number;
  slaBreaches: number;
  },
  t: (en: string, fr?: string, de?: string, es?: string, pt?: string) => string
) {
  const incident =
    input.webhookFailures24h >= 20 ||
    input.automationErrors24h >= 20 ||
    input.failedPayments30d >= 30 ||
    input.slaBreaches >= 10;
  if (incident) {
    return {
      label: t("Incident", "Incident", "Stoerfall", "Incidente", "Incidente"),
      tone: "border-rose-200 bg-rose-50/85 dark:border-rose-500/40 dark:bg-rose-500/10",
      statusTextClass: "text-rose-700 dark:text-rose-300",
      statusDotClass: "bg-rose-500",
    };
  }
  const degraded =
    input.webhookFailures24h >= 5 ||
    input.automationErrors24h >= 8 ||
    input.failedPayments30d >= 10 ||
    input.slaBreaches >= 3;
  if (degraded) {
    return {
      label: t("Degraded", "Degrade", "Beeintraechtigt", "Degradado", "Degradado"),
      tone: "border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
      statusTextClass: "text-amber-700 dark:text-amber-300",
      statusDotClass: "bg-amber-600",
    };
  }
  return {
    label: t("Healthy", "Sain", "Gesund", "Saludable", "Saudavel"),
    tone: "border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    statusTextClass: "text-emerald-700 dark:text-emerald-300",
    statusDotClass: "bg-emerald-600",
  };
}

function buildRiskItems(
  input: {
  webhookFailures24h: number;
  automationErrors24h: number;
  failedPayments30d: number;
  supportBreaches: number;
  openSupportTickets: number;
  },
  t: (en: string, fr?: string, de?: string, es?: string, pt?: string) => string
): RiskItem[] {
  const items: RiskItem[] = [];
  if (input.webhookFailures24h >= 3) {
    items.push({
      id: "webhook",
      title: t("Webhook retry spike detected", "Pic de nouvelles tentatives webhook detecte", "Anstieg bei Webhook-Wiederholungen erkannt", "Pico de reintentos de webhook detectado", "Pico de repeticoes de webhook detetado"),
      severity: input.webhookFailures24h >= 10 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.webhookFailures24h)} ${t("failures in the last 24 hours.", "échecs au cours des dernieres 24 heures.", "Fehler in den letzten 24 Stunden.", "fallos en las Últimas 24 horas.", "falhas nas ultimas 24 horas.")}`,
      href: "/admin/logs",
    });
  }
  if (input.automationErrors24h >= 5) {
    items.push({
      id: "automation",
      title: t("Automation failures increasing", "Les échecs d'automatisation augmentent", "Automatisierungsfehler nehmen zu", "Los fallos de automatización aumentan", "As falhas de automação estão a aumentar"),
      severity: input.automationErrors24h >= 15 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.automationErrors24h)} ${t("failed runs in 24 hours.", "executions échouées en 24 heures.", "fehlgeschlagene Laeufe in 24 Stunden.", "ejecuciones fallidas en 24 horas.", "execucoes falhadas em 24 horas.")}`,
      href: "/admin/automation/errors",
    });
  }
  if (input.failedPayments30d >= 5) {
    items.push({
      id: "payments",
      title: t("Failed subscription payments rising", "Les paiements d'abonnement échoués augmentent", "Fehlgeschlagene Abo-Zahlungen nehmen zu", "Los pagos fallidos de suscripciones aumentan", "Os pagamentos falhados de subscricoes estão a aumentar"),
      severity: input.failedPayments30d >= 20 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.failedPayments30d)} ${t("failed subscription charges in 30 days.", "paiements d'abonnement échoués en 30 jours.", "fehlgeschlagene Abo-Belastungen in 30 Tagen.", "cobros fallidos de suscripciones en 30 días.", "cobrancas falhadas de subscricoes em 30 dias.")}`,
      href: "/admin/users",
    });
  }
  if (input.supportBreaches >= 1) {
    items.push({
      id: "sla",
      title: t("Support SLA breaches detected", "Violations du SLA de support detectees", "Support-SLA-Verstoesse erkannt", "Se detectaron incumplimientos del SLA de soporte", "Foram detetadas violacoes de SLA de suporte"),
      severity: input.supportBreaches >= 8 ? "HIGH" : "MEDIUM",
      context: `${metricText(input.supportBreaches)} ${t("tickets breached first-response SLA.", "tickets ont depasse le SLA de premiere réponse.", "Tickets haben das SLA für die erste Antwort verletzt.", "tickets incumplieron el SLA de primera respuesta.", "tickets violaram o SLA da primeira resposta.")}`,
      href: "/admin/support",
    });
  }
  if (input.openSupportTickets >= 20) {
    items.push({
      id: "support-volume",
      title: t("Open support volume elevated", "Volume de support ouvert élevé", "Offenes Support-Volumen erhoeht", "Volumen abierto de soporte elevado", "Volume aberto de suporte elevado"),
      severity: "LOW",
      context: `${metricText(input.openSupportTickets)} ${t("open tickets currently in queue.", "tickets ouverts actuellement en file d'attente.", "offene Tickets derzeit in der Warteschlange.", "tickets abiertos actualmente en cola.", "tickets abertos atualmente na fila.")}`,
      href: "/admin/support",
    });
  }

  const severityRank: Record<RiskItem["severity"], number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return items
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 5);
}

function hrefWithParams(params: { tenantId?: string | null; range: string; nextRange?: string }) {
  const query = new URLSearchParams();
  if (params.tenantId) query.set("tenant", params.tenantId);
  query.set("range", params.nextRange || params.range);
  return `/admin?${query.toString()}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSearchParams>;
}) {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const t = (en: string, fr?: string, de?: string, es?: string, pt?: string) =>
    getLocalizedText({ en, fr, de, es, pt }, language);
  const session = await getServerSession(authOptions);
  const actorRole = session?.user?.id ? await getActorSystemFlagRole(session.user.id) : "USER";
  if (!session?.user || (actorRole !== "OPS_ADMIN" && actorRole !== "SUPER_ADMIN")) {
    redirect("/dashboard");
  }

  const resolved = searchParams ? await searchParams : undefined;
  const selectedRange = parseRange(resolved?.range);
  const rangeDays = RANGE_DAYS[selectedRange];
  const requestedTenant = String(resolved?.tenant || "").trim();

  const tenants = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
    orderBy: { name: "asc" },
  });

  const selectedTenant = tenants.find((tenant) => tenant.id === requestedTenant) || null;
  const scopedTenantIds = selectedTenant ? [selectedTenant.id] : tenants.map((tenant) => tenant.id);
  const scopedOwnerIds = selectedTenant
    ? [selectedTenant.ownerId]
    : Array.from(new Set(tenants.map((tenant) => tenant.ownerId)));
  const hasTenantScope = scopedTenantIds.length > 0;
  const hasOwnerScope = scopedOwnerIds.length > 0;

  const now = new Date();
  const last24h = withDaysAgo(now, 1);
  const last30d = withDaysAgo(now, 30);
  const last60d = withDaysAgo(now, 60);
  const last90d = withDaysAgo(now, 90);
  const rangeStart = withDaysAgo(now, rangeDays);
  const slaCutoff = withDaysAgo(now, 1);

  const [
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    activeSubscribers,
    openSupportTickets,
    rateLimitSpikes24h,
    supportBreaches,
    respondedTickets,
    successfulPayments90d,
    canceledEvents30d,
    timelineEvents,
    dueRenewalsNow,
    pendingRenewalsNow,
    successfulRenewals24h,
    failedRenewals24h,
    latestRenewalProcessorRun,
  ] = await Promise.all([
    hasTenantScope
      ? prisma.unifiedAuditEvent.count({
          where: {
            tenantId: { in: scopedTenantIds },
            actionType: { startsWith: "webhook.failure" },
            createdAt: { gte: last24h },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.automationRun.count({
          where: {
            runStatus: "FAILED",
            createdAt: { gte: last24h },
            flow: { businessId: { in: scopedTenantIds } },
          },
        })
      : 0,
    hasOwnerScope
      ? prisma.payment.count({
          where: {
            userId: { in: scopedOwnerIds },
            status: PaymentStatus.FAILED,
            createdAt: { gte: last30d },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.orgSubscription.count({
          where: {
            orgId: { in: scopedTenantIds },
            status: OrgSubscriptionStatus.ACTIVE,
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.count({
          where: {
            workspaceId: { in: scopedTenantIds },
            status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.auditLog.count({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: "USAGE_LIMIT_EXCEEDED",
            createdAt: { gte: last24h },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.count({
          where: {
            workspaceId: { in: scopedTenantIds },
            status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
            firstResponseAt: null,
            createdAt: { lte: slaCutoff },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.supportThreadTicket.findMany({
          where: {
            workspaceId: { in: scopedTenantIds },
            firstResponseAt: { not: null },
            createdAt: { gte: last30d },
          },
          select: {
            createdAt: true,
            firstResponseAt: true,
          },
          take: 500,
        })
      : [],
    hasOwnerScope
      ? prisma.payment.findMany({
          where: {
            userId: { in: scopedOwnerIds },
            status: PaymentStatus.SUCCEEDED,
            createdAt: { gte: last90d },
          },
          select: {
            createdAt: true,
            amount: true,
            amountUsd: true,
            currency: true,
          },
        })
      : [],
    hasTenantScope
      ? prisma.auditLog.count({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: "SUBSCRIPTION_CANCELED",
            createdAt: { gte: last30d },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.auditLog.findMany({
          where: {
            orgId: { in: scopedTenantIds },
            actionType: {
              in: [
                "SUBSCRIPTION_UPGRADED",
                "SUBSCRIPTION_DOWNGRADED",
                "SUBSCRIPTION_CANCELED",
                "tenant.suspended",
                "tenant.reactivated",
                "ADMIN_FLAG_UPDATE",
                "BUSINESS_SETTINGS_UPDATED",
                "PAYOUT_SETTINGS_UPDATED",
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orgId: true,
            actionType: true,
            createdAt: true,
            metadata: true,
          },
        })
      : [],
    hasTenantScope
      ? prisma.orgSubscription.count({
          where: {
            orgId: { in: scopedTenantIds },
            provider: "FLUTTERWAVE",
            OR: [{ paidThroughAt: { lte: now } }, { currentCycleEndAt: { lte: now } }],
          },
        })
      : 0,
    hasOwnerScope
      ? prisma.checkoutSession.count({
          where: {
            userId: { in: scopedOwnerIds },
            provider: "FLUTTERWAVE",
            status: { in: ["CREATED", "REDIRECTED"] },
            providerPayload: { path: ["checkoutContext", "action"], equals: "renewal" },
          },
        })
      : 0,
    hasOwnerScope
      ? prisma.payment.count({
          where: {
            userId: { in: scopedOwnerIds },
            status: PaymentStatus.SUCCEEDED,
            createdAt: { gte: last24h },
            metadata: { path: ["action"], equals: "renewal" },
          },
        })
      : 0,
    hasOwnerScope
      ? prisma.checkoutSession.count({
          where: {
            userId: { in: scopedOwnerIds },
            provider: "FLUTTERWAVE",
            status: "FAILED",
            createdAt: { gte: last24h },
            providerPayload: { path: ["checkoutContext", "action"], equals: "renewal" },
          },
        })
      : 0,
    hasTenantScope
      ? prisma.activityLog.findFirst({
          where: {
            action: "SUBSCRIPTION_RENEWALS_PROCESSED",
          },
          orderBy: { timestamp: "desc" },
          select: {
            timestamp: true,
            metadata: true,
          },
        })
      : null,
  ]);

  const revenuePoints = successfulPayments90d.map((payment) => ({
    createdAt: payment.createdAt,
    amount: Number(payment.amountUsd ?? payment.amount ?? 0),
  }));

  const currentRangeRevenue = revenuePoints
    .filter((point) => point.createdAt >= rangeStart)
    .reduce((sum, point) => sum + point.amount, 0);
  const currentMrrRevenue = revenuePoints
    .filter((point) => point.createdAt >= last30d)
    .reduce((sum, point) => sum + point.amount, 0);
  const previousMrrRevenue = revenuePoints
    .filter((point) => point.createdAt >= last60d && point.createdAt < last30d)
    .reduce((sum, point) => sum + point.amount, 0);
  const growth30d = previousMrrRevenue > 0 ? ((currentMrrRevenue - previousMrrRevenue) / previousMrrRevenue) * 100 : currentMrrRevenue > 0 ? 100 : 0;
  const churnRate = (canceledEvents30d / Math.max(activeSubscribers + canceledEvents30d, 1)) * 100;
  const revenueSeries = buildRevenueSeries(
    revenuePoints.filter((point) => point.createdAt >= rangeStart),
    rangeDays,
    LANGUAGE_LOCALES[language]
  );

  const avgResponseMinutes = respondedTickets.length
    ? respondedTickets.reduce((sum, ticket) => {
        const firstResponseAt = ticket.firstResponseAt ? ticket.firstResponseAt.getTime() : ticket.createdAt.getTime();
        return sum + Math.max(0, firstResponseAt - ticket.createdAt.getTime()) / (1000 * 60);
      }, 0) / respondedTickets.length
    : null;

  const risks = buildRiskItems({
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    supportBreaches,
    openSupportTickets,
  }, t);
  const hasHighRisk = risks.some((risk) => risk.severity === "HIGH");

  const status = systemHealthStatus({
    webhookFailures24h,
    automationErrors24h,
    failedPayments30d,
    slaBreaches: supportBreaches,
  }, t);

  const metrics = [
    {
      label: t("Webhook failures (24h)", "Échecs webhook (24h)", "Webhook-Fehler (24h)", "Fallos de webhook (24h)", "Falhas de webhook (24h)"),
      value: metricText(webhookFailures24h),
      href: "/admin/logs",
    },
    {
      label: t("Automation errors (24h)", "Erreurs d'automatisation (24h)", "Automatisierungsfehler (24h)", "Errores de automatización (24h)", "Erros de automação (24h)"),
      value: metricText(automationErrors24h),
      href: "/admin/automation/errors",
    },
    {
      label: t("Failed subscription payments (30d)", "Paiements d'abonnement échoués (30j)", "Fehlgeschlagene Abo-Zahlungen (30 T.)", "Pagos fallidos de suscripciones (30d)", "Pagamentos falhados de subscricoes (30d)"),
      value: metricText(failedPayments30d),
      href: "/admin/users",
    },
    {
      label: t("Active subscribers", "Abonnés actifs", "Aktive Abonnenten", "Suscriptores activos", "Subscritores ativos"),
      value: metricText(activeSubscribers),
      href: "/admin/users",
    },
    {
      label: t("Open support tickets", "Tickets de support ouverts", "Offene Support-Tickets", "Tickets de soporte abiertos", "Tickets de suporte abertos"),
      value: metricText(openSupportTickets),
      href: "/admin/support",
    },
    {
      label: t("Rate limit spikes (24h)", "Pics de limite de debit (24h)", "Rate-Limit-Spitzen (24h)", "Picos de limite de tasa (24h)", "Picos de limite de taxa (24h)"),
      value: metricText(rateLimitSpikes24h),
      href: "/admin/logs",
    },
  ];
  const latestRenewalJob = readRenewalJobMetadata(latestRenewalProcessorRun?.metadata);

  const riskSection = (
    <section className="rounded-2xl border border-border/70 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t("Risks & alerts", "Risques et alertes", "Risiken und Warnungen", "Riesgos y alertas", "Riscos e alertas")}</h2>
        <Link href="/admin/logs">
          <Button size="sm" variant="secondary">
            {t("View Logs", "Voir les journaux", "Protokolle ansehen", "Ver registros", "Ver registos")}
          </Button>
        </Link>
      </div>
      {risks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Platform stable, no active risks.", "Plateforme stable, aucun risque actif.", "Plattform stabil, keine aktiven Risiken.", "Plataforma estable, sin riesgos activos.", "Plataforma estavel, sem riscos ativos.")}</p>
      ) : (
        <div className="space-y-3">
          {risks.map((risk) => (
            <Link
              key={risk.id}
              href={risk.href}
              className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-4 py-3 transition hover:bg-muted/35"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{risk.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{risk.context}</p>
              </div>
              <Badge
                variant={
                  risk.severity === "HIGH" ? "danger" : risk.severity === "MEDIUM" ? "warning" : "default"
                }
              >
                {risk.severity === "HIGH" ? t("High", "Eleve", "Hoch", "Alto", "Alto") : risk.severity === "MEDIUM" ? t("Medium", "Moyen", "Mittel", "Medio", "Medio") : t("Low", "Faible", "Niedrig", "Bajo", "Baixo")}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  const tenantOptions = tenants.map((tenant) => (
    <option key={tenant.id} value={tenant.id}>
      {tenant.name}
    </option>
  ));

  return (
    <div className="space-y-6 px-6 py-6 max-md:px-4 max-md:py-4">
      <section className={`rounded-2xl border p-6 ${status.tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{t("Admin Dashboard", "Tableau de bord admin", "Admin-Dashboard", "Panel de administración", "Painel de administração")}</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">{t("Command Center", "Centre de commande", "Leitstand", "Centro de mando", "Centro de comando")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("Executive platform signal for stability, risk, and subscriber health.", "Vue executive de la plateforme pour la stabilite, le risque et la santé des abonnés.", "Management-Überblick zu Stabilitaet, Risiko und Abonnentenstatus.", "Vista ejecutiva de la plataforma para estabilidad, riesgo y salud de suscriptores.", "Visao executiva da plataforma para estabilidade, risco e saude dos subscritores.")}</p>
          </div>
          <form method="GET" className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("Tenant scope", "Portee locataire", "Mandantenbereich", "Alcance del tenant", "Escopo do tenant")}</label>
              <select
                name="tenant"
                defaultValue={selectedTenant?.id || "all"}
                className="h-10 min-w-[220px] rounded-lg border border-border/70 bg-background px-3 text-sm text-foreground"
              >
                <option value="all">{t("All tenants", "Tous les locataires", "Alle Mandanten", "Todos los tenants", "Todos os tenants")}</option>
                {tenantOptions}
              </select>
            </div>
            <input type="hidden" name="range" value={selectedRange} />
            <Button size="sm" type="submit">
              {t("Apply", "Appliquer", "Anwenden", "Aplicar", "Aplicar")}
            </Button>
          </form>
        </div>

        <div className={`mt-5 flex items-center gap-3 text-2xl font-semibold ${status.statusTextClass}`}>
          <span className={`h-3 w-3 rounded-full ${status.statusDotClass}`} aria-hidden="true" />
          <span>{status.label}</span>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="min-w-0 rounded-lg border border-transparent px-3 py-2 transition hover:border-border/50 hover:bg-background/50"
            >
              <p className="text-xs leading-5 text-muted-foreground break-words">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{metric.value}</p>
            </Link>
          ))}
        </div>
      </section>

      {hasHighRisk ? riskSection : null}

      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("Invoicing readiness", "Preparation facturation", "Rechnungsbereitschaft", "Preparacion de facturación", "Prontidao de faturação")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Review laúnch state, legal evidence coverage, and e-invoicing blockers by country.",
                "Examinez l etat de lancement, la couverture des sources juridiques et les blocages e-facturation par pays.",
                "Prüfe Laúnch-Status, juristische Quellenabdeckung und E-Rechnungsblocker pro Land.",
                "Revisa el estado de lanzamiento, la cobertura legal y los bloqueos de facturación electronica por pais.",
                "Reveja o estado de lancamento, a cobertura juridica e os bloqueios de faturação eletronica por pais."
              )}
            </p>
          </div>
          <Link href="/admin/invoicing-readiness">
            <Button size="sm" variant="secondary">
              {t("Open Readiness Matrix", "Ouvrir la matrice", "Matrix öffnen", "Abrir matriz", "Abrir matriz")}
            </Button>
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("Revenue snapshot", "Aperçu des revenus", "Umsatzüberblick", "Resumen de ingresos", "Resumo da receita")}</h2>
            <p className="text-sm text-muted-foreground">{t("Subscriber revenue only (Paystack + Flutterwave).", "Revenus des abonnés uniquement (Paystack + Flutterwave).", "Nur Abo-Umsaetze (Paystack + Flutterwave).", "Solo ingresos de suscriptores (Paystack + Flutterwave).", "Apenas receita de subscritores (Paystack + Flutterwave).")}</p>
          </div>
          <div className="inline-flex rounded-lg border border-border/70 bg-muted/20 p-1">
            {(["7d", "30d", "90d"] as const).map((rangeOption) => (
              <Link key={rangeOption} href={hrefWithParams({ tenantId: selectedTenant?.id, range: selectedRange, nextRange: rangeOption })}>
                <span
                  className={`inline-flex rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    selectedRange === rangeOption
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  {rangeOption.toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 border-b border-border/60 pb-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("MRR", "MRR", "MRR", "MRR", "MRR")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(currentMrrRevenue, "USD")}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("30-day growth", "Croissance sur 30 jours", "30-Tage-Wachstum", "Crecimiento de 30 días", "Crescimento de 30 dias")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{toPercent(growth30d)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Active subscribers", "Abonnés actifs", "Aktive Abonnenten", "Suscriptores actifs", "Subscritores ativos")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{metricText(activeSubscribers)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Churn rate", "Taux de churn", "Abwänderungsrate", "Tasa de cancelación", "Taxa de churn")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{toPercent(churnRate)}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("Revenue in selected range:", "Revenus sur la periode selectionnee :", "Umsatz im ausgewählten Zeitraum:", "Ingresos en el rango seleccionado:", "Receita no intervalo selecionado:")} <span className="font-semibold text-foreground">{formatCurrency(currentRangeRevenue, "USD")}</span>
          </p>
          <MiniAreaChart data={revenueSeries} />
        </div>
      </section>

      {!hasHighRisk ? riskSection : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1.4fr]">
        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("Support snapshot", "Aperçu du support", "Support-Überblick", "Resumen de soporte", "Resumo do suporte")}</h2>
            <Link href="/admin/support">
              <Button size="sm" variant="secondary">
                {t("View Support", "Voir le support", "Support ansehen", "Ver soporte", "Ver suporte")}
              </Button>
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Open tickets", "Tickets ouverts", "Offene Tickets", "Tickets abiertos", "Tickets abertos")}</span>
              <span className="font-semibold text-foreground">{metricText(openSupportTickets)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Tickets breaching SLA", "Tickets depassant le SLA", "Tickets mit SLA-Verletzung", "Tickets que incumplen el SLA", "Tickets que violam o SLA")}</span>
              <span className="font-semibold text-foreground">{metricText(supportBreaches)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("Average response time", "Temps de réponse moyen", "Durchschnittliche Antwortzeit", "Tiempo medio de respuesta", "Tempo medio de resposta")}</span>
              <span className="font-semibold text-foreground">{formatResponseTime(avgResponseMinutes)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("Recurring renewals", "Renouvellements recurrents", "Wiederkehrende Verlaengerungen", "Renovaciones recurrentes", "Renovacoes recorrentes")}</h2>
            <Link href="/admin/users">
              <Button size="sm" variant="secondary">
                {t("View Billing", "Voir la facturation", "Abrechnung ansehen", "Ver facturación", "Ver faturação")}
              </Button>
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Due now", "Echeance immediate", "Jetzt faellig", "Vence ahora", "Vence agora")}</span>
              <span className="font-semibold text-foreground">{metricText(dueRenewalsNow)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Pending customer action", "Action client en attente", "Ausstehende Kundenaktion", "Acción de cliente pendiente", "Ação do cliente pendente")}</span>
              <span className="font-semibold text-foreground">{metricText(pendingRenewalsNow)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Succeeded (24h)", "R?ussi (24h)", "Erfolgreich (24h)", "Exitosos (24h)", "Concluidos (24h)")}</span>
              <span className="font-semibold text-foreground">{metricText(successfulRenewals24h)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">{t("Failed attempts (24h)", "Tentatives échouées (24h)", "Fehlgeschlagene Versuche (24h)", "Intentos fallidos (24h)", "Tentativas falhadas (24h)")}</span>
              <span className="font-semibold text-foreground">{metricText(failedRenewals24h)}</span>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Last processor run", "Derni?re ex?cution du processeur", "Letzter Prozesslauf", "Última ejecución del procesador", "Última execução do processador")}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {latestRenewalProcessorRun?.timestamp
                  ? formatDateTimeDMY(latestRenewalProcessorRun.timestamp, LANGUAGE_LOCALES[language])
                  : t("No renewal job run recorded yet", "Aucune ex?cution du job de renouvellement enregistree pour l'instant", "Noch kein Lauf des Verlaengerungsjobs aufgezeichnet", "Aún no hay ejecuciones registradas del proceso de renovacion", "Ainda não ha execucoes registadas do processo de renovacao")}
              </p>
              {latestRenewalProcessorRun?.timestamp ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("Processed", "Traites", "Verarbeitet", "Procesados", "Processados")} {metricText(latestRenewalJob.processed || 0)} | {t("Succeeded", "Reussis", "Erfolgreich", "Exitosos", "Concluidos")}{" "}
                  {metricText(latestRenewalJob.succeeded || 0)} | {t("Pending", "En attente", "Ausstehend", "Pendientes", "Pendentes")} {metricText(latestRenewalJob.pending || 0)} | {t("Failed", "Echoues", "Fehlgeschlagen", "Fallidos", "Falhados")}{" "}
                  {metricText(latestRenewalJob.failed || 0)}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("This card tracks the Flutterwave renewal processor and pending customer-auth renewals.", "Cette carte suit le processeur de renouvellement Flutterwave et les renouvellements clients en attente d'authentification.", "Diese Karte verfolgt den Flutterwave-Verlaengerungsprozess und ausstehende kundenautorisierte Verlaengerungen.", "Esta tarjeta sigue el procesador de renovacion de Flutterwave y las renovaciones pendientes de autenticacion del cliente.", "Este cartao acompanha o processador de renovacao da Flutterwave e as renovacoes pendentes de autenticação do cliente.")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("Critical activity", "Activité critique", "Kritische Aktivitaet", "Actividad critica", "Atividade critica")}</h2>
            <Link href="/admin/logs">
              <Button size="sm" variant="secondary">
                {t("View Audit Logs", "Voir les journaux d'audit", "Audit-Protokolle ansehen", "Ver registros de auditoria", "Ver registos de auditoria")}
              </Button>
            </Link>
          </div>
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No critical events in the selected scope.", "Aucun evenement critique dans la portee selectionnee.", "Keine kritischen Ereignisse im ausgewählten Bereich.", "No hay eventos criticos en el alcance seleccionado.", "Não há eventos criticos no escopo selecionado.")}</p>
          ) : (
            <div className="space-y-3">
              {timelineEvents.map((event) => (
                <div key={event.id} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold text-foreground">{localizeAdminActionLabel(event.actionType || event.id, language, event.actionType || event.id)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTimeDMY(event.createdAt, LANGUAGE_LOCALES[language])}
                    {event.orgId ? ` - tenant ${event.orgId}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
