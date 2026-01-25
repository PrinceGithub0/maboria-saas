import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ensureUserPublicId } from "@/lib/public-id";
import { PaystackNotice } from "@/components/ui/paystack-notice";
import { RestartTourButton } from "@/components/ui/tour";
import { formatCurrency } from "@/lib/currency";
import { PaymentSuccessToast } from "@/components/ui/payment-success-toast";
import { format } from "date-fns";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { LangText } from "@/components/ui/lang-text";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CreditCard,
  FileText,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { env } from "@/lib/env";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string; currency?: string } | Promise<{ range?: string; currency?: string }>;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const rangeParam = resolvedSearchParams?.range;
  const currencyParam = resolvedSearchParams?.currency;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const now = new Date();
  const paymentsSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    paymentsByCurrency,
    invoices,
    automations,
    runs,
    user,
    paystackDismissed,
    activityLogs,
    recentPayments,
    unpaidInvoices,
    overdueCount,
    unpaidCount,
    failedPaymentCount,
    aiUsageCount,
  ] = await Promise.all([
    prisma.payment.groupBy({ by: ["currency"], _sum: { amount: true }, where: { userId } }),
    prisma.invoice.count({ where: { userId } }),
    prisma.automationFlow.count({ where: { userId } }),
    prisma.automationRun.groupBy({
      by: ["runStatus"],
      _count: { _all: true },
      where: { userId },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { publicId: true, preferredCurrency: true, businessProfile: { select: { defaultCurrency: true } } },
        })
      : Promise.resolve(null),
    userId
      ? prisma.activityLog.findFirst({
          where: { userId, action: "ANNOUNCEMENT_PAYSTACK_DISMISSED" },
          select: { id: true },
        })
      : Promise.resolve(null),
    userId
      ? prisma.activityLog.findMany({
          where: { userId },
          orderBy: { timestamp: "desc" },
          take: 8,
        })
      : Promise.resolve([]),
    userId
      ? prisma.payment.findMany({
          where: { userId, status: "SUCCEEDED", createdAt: { gte: paymentsSince } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    userId
      ? prisma.invoice.findMany({
          where: { userId, status: { in: ["SENT", "OVERDUE"] } },
          orderBy: { generatedAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    userId ? prisma.invoice.count({ where: { userId, status: "OVERDUE" } }) : Promise.resolve(0),
    userId
      ? prisma.invoice.count({ where: { userId, status: { in: ["SENT", "OVERDUE"] } } })
      : Promise.resolve(0),
    userId ? prisma.payment.count({ where: { userId, status: "FAILED" } }) : Promise.resolve(0),
    userId
      ? prisma.aiUsageLog.count({ where: { userId, createdAt: { gte: paymentsSince } } })
      : Promise.resolve(0),
  ]);

  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  const revenueRows = paymentsByCurrency || [];
  const successRuns = runs.find((r) => r.runStatus === "SUCCESS")?._count._all || 0;
  const failedRuns = runs.find((r) => r.runStatus === "FAILED")?._count._all || 0;
  const totalRuns = successRuns + failedRuns;
  const successRate = totalRuns ? Math.round((successRuns / totalRuns) * 100) : 0;
  const publicId = userId ? user?.publicId || (await ensureUserPublicId(userId)) : null;
  const systemStatus = [
    { label: "API", status: "ok" },
    { label: "Database", status: "ok" },
    { label: "Paystack", status: env.paystackSecret ? "configured" : "missing" },
    { label: "Flutterwave", status: env.flutterwaveSecret ? "configured" : "missing" },
    { label: "Email", status: env.emailHost ? "configured" : "missing" },
  ];
  const formatStatusBadge = (status: string) => {
    if (status === "ok" || status === "configured") return "success";
    return "warning";
  };
  const uptimeMinutes = Math.round(process.uptime() / 60);
  const uptimeLabel =
    uptimeMinutes >= 60
      ? `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m`;
  const activityActionMap: Record<string, { en: string; fr: string; icon: LucideIcon }> = {
    INVOICE_CREATED: { en: "Invoice created", fr: "Facture creee", icon: FileText },
    INVOICE_SENT: { en: "Invoice sent", fr: "Facture envoyee", icon: FileText },
    INVOICE_PAID: { en: "Invoice paid", fr: "Facture payee", icon: CreditCard },
    INVOICE_UPDATED: { en: "Invoice updated", fr: "Facture mise a jour", icon: FileText },
    INVOICE_DELETED: { en: "Invoice deleted", fr: "Facture supprimee", icon: FileText },
    SUBSCRIPTION_CREATED: { en: "Subscription started", fr: "Abonnement demarre", icon: CreditCard },
    SUBSCRIPTION_UPDATED: { en: "Subscription updated", fr: "Abonnement mis a jour", icon: CreditCard },
    SUBSCRIPTION_CANCELED: { en: "Subscription cancelled", fr: "Abonnement annule", icon: CreditCard },
    ADMIN_SUBSCRIPTION_CANCELED: {
      en: "Subscription cancelled by admin",
      fr: "Abonnement annule par admin",
      icon: CreditCard,
    },
    PLAN_INTENT: { en: "Plan selection", fr: "Choix de plan", icon: CreditCard },
    USER_SIGNIN: { en: "Signed in", fr: "Connexion", icon: Activity },
    USER_SIGNOUT: { en: "Signed out", fr: "Deconnexion", icon: Activity },
    PROFILE_UPDATED: { en: "Profile updated", fr: "Profil mis a jour", icon: Activity },
    PASSWORD_UPDATED: { en: "Password updated", fr: "Mot de passe mis a jour", icon: Activity },
    BUSINESS_PROFILE_CREATED: { en: "Business profile created", fr: "Profil entreprise cree", icon: Activity },
    BUSINESS_PROFILE_UPDATED: { en: "Business profile updated", fr: "Profil entreprise mis a jour", icon: Activity },
    AUTOMATION_CREATED: { en: "Automation created", fr: "Automatisation creee", icon: Bot },
    AUTOMATION_RUN: { en: "Automation run", fr: "Execution automatisation", icon: Bot },
    AI_ASSISTANT_USED: { en: "AI assistant used", fr: "Assistant IA utilise", icon: Sparkles },
    AI_CALL: { en: "AI call", fr: "Appel IA", icon: Sparkles },
    AI_INSIGHT: { en: "AI insight generated", fr: "Analyse IA generee", icon: Sparkles },
    AI_FEEDBACK: { en: "AI feedback sent", fr: "Retour IA envoye", icon: Sparkles },
    USAGE_LIMIT_EXCEEDED: { en: "Usage limit reached", fr: "Limite d usage atteinte", icon: AlertTriangle },
    SUPPORT_STATUS: { en: "Support ticket updated", fr: "Ticket support mis a jour", icon: AlertTriangle },
    ANNOUNCEMENT_PAYSTACK_DISMISSED: {
      en: "Paystack notice dismissed",
      fr: "Alerte Paystack fermee",
      icon: Activity,
    },
    ADMIN_FLAG_UPDATE: { en: "Admin flag update", fr: "Mise a jour drapeau admin", icon: AlertTriangle },
    ADMIN_IMPERSONATE: { en: "Admin impersonation", fr: "Impersonation admin", icon: AlertTriangle },
    ADMIN_TOGGLE_USER: { en: "User access updated", fr: "Acces utilisateur mis a jour", icon: AlertTriangle },
    ADMIN_SUB_OVERRIDE: { en: "Subscription override", fr: "Override abonnement", icon: AlertTriangle },
    ROLE_UPDATED: { en: "User role updated", fr: "Role utilisateur mis a jour", icon: AlertTriangle },
    ADMIN_AUTOMATION_REPLAY: { en: "Automation replayed", fr: "Rejouer automatisation", icon: Bot },
    ADMIN_RESET_PASSWORD: { en: "Password reset", fr: "Reinitialisation mot de passe", icon: AlertTriangle },
    ADMIN_WEBHOOK_RESOLVE: { en: "Webhook resolved", fr: "Webhook resolu", icon: Activity },
    ADMIN_WEBHOOK_REPLAY: { en: "Webhook replayed", fr: "Webhook rejoue", icon: Activity },
    ADMIN_WEBHOOK_ARCHIVE: { en: "Webhook archived", fr: "Webhook archive", icon: Activity },
    WEBHOOK_PROCESSED: { en: "Webhook processed", fr: "Webhook traite", icon: Activity },
    WEBHOOK_FAILED: { en: "Webhook failed", fr: "Webhook echoue", icon: AlertTriangle },
    PAYSTACK_INVOICE: { en: "Paystack invoice event", fr: "Evenement facture Paystack", icon: CreditCard },
    ONBOARDING_COMPLETE: { en: "Onboarding complete", fr: "Onboarding termine", icon: Activity },
    prelaunch_log_check: { en: "Prelaunch check", fr: "Verification prelaunch", icon: Activity },
    prelaunch_email_sent: { en: "Prelaunch email sent", fr: "Email prelaunch envoye", icon: Activity },
    prelaunch_email_failed: { en: "Prelaunch email failed", fr: "Email prelaunch echoue", icon: AlertTriangle },
  };
  const activityItems = (activityLogs || []).map((log) => {
    const action = String(log.action || "");
    const meta = (log.metadata || {}) as Record<string, any>;
    const fallbackTitle = action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/(^\\w|\\s\\w)/g, (m) => m.toUpperCase());
    const automationRunMatch = action.startsWith("AUTOMATION_RUN_") ? action.replace("AUTOMATION_RUN_", "") : "";
    const automationRunStatus = automationRunMatch.toLowerCase();
    const automationRunEntry = automationRunMatch
      ? {
          en: `Automation run ${automationRunStatus}`,
          fr: `Execution automatisation ${automationRunStatus === "failed" ? "echouee" : "reussie"}`,
          icon: Bot,
        }
      : null;
    const entry =
      automationRunEntry ||
      activityActionMap[action] ||
      ({
        en: fallbackTitle || "Activity",
        fr: fallbackTitle || "Activite",
        icon: Activity,
      } as const);
    const statusLabelMap: Record<string, { en: string; fr: string }> = {
      active: { en: "active", fr: "actif" },
      canceled: { en: "cancelled", fr: "annule" },
      cancelled: { en: "cancelled", fr: "annule" },
      failed: { en: "failed", fr: "echec" },
      paid: { en: "paid", fr: "paye" },
      sent: { en: "sent", fr: "envoye" },
      overdue: { en: "overdue", fr: "retard" },
      draft: { en: "draft", fr: "brouillon" },
      inactive: { en: "inactive", fr: "inactif" },
    };
    const planLabelMap: Record<string, { en: string; fr: string }> = {
      free: { en: "free", fr: "gratuit" },
      starter: { en: "starter", fr: "starter" },
      pro: { en: "pro", fr: "pro" },
      premium: { en: "business", fr: "business" },
      enterprise: { en: "enterprise", fr: "entreprise" },
    };
    const descriptionEn =
      meta.invoiceNumber
        ? `Invoice ${meta.invoiceNumber}`
        : meta.plan
          ? `Plan ${planLabelMap[String(meta.plan).toLowerCase()]?.en ?? String(meta.plan).toLowerCase()}`
          : meta.status
            ? `Status ${statusLabelMap[String(meta.status).toLowerCase()]?.en ?? String(meta.status).toLowerCase()}`
            : "";
    const descriptionFr =
      meta.invoiceNumber
        ? `Facture ${meta.invoiceNumber}`
        : meta.plan
          ? `Plan ${planLabelMap[String(meta.plan).toLowerCase()]?.fr ?? String(meta.plan).toLowerCase()}`
          : meta.status
            ? `Statut ${
                statusLabelMap[String(meta.status).toLowerCase()]?.fr ?? String(meta.status).toLowerCase()
              }`
            : "";
    const timestamp = log.timestamp ? format(new Date(log.timestamp), "dd MMM, HH:mm") : "";
    return {
      id: log.id,
      title: { en: entry.en, fr: entry.fr },
      description: { en: descriptionEn, fr: descriptionFr },
      timestamp,
      Icon: entry.icon,
    };
  });
  const rangeDays = rangeParam === "30d" ? 30 : 7;
  const availableCurrencies = revenueRows
    .map((row) => normalizeCurrency(row.currency))
    .filter(Boolean);
  const preferredCurrency = normalizeCurrency(user?.preferredCurrency || "");
  const businessCurrency = normalizeCurrency(user?.businessProfile?.defaultCurrency || "");
  const candidateCurrency = normalizeCurrency(currencyParam || "") || businessCurrency || preferredCurrency;
  const selectedCurrency = (() => {
    if (candidateCurrency && availableCurrencies.includes(candidateCurrency)) return candidateCurrency;
    if (availableCurrencies.length > 0) return availableCurrencies[0];
    return candidateCurrency || "USD";
  })();
  const chartStart = new Date(now);
  chartStart.setDate(chartStart.getDate() - (rangeDays - 1));
  chartStart.setHours(0, 0, 0, 0);
  const dayKeys = Array.from({ length: rangeDays }).map((_, idx) => {
    const date = new Date(chartStart);
    date.setDate(chartStart.getDate() + idx);
    return date;
  });
  const dailyTotals = new Map<string, number>();
  dayKeys.forEach((date) => dailyTotals.set(format(date, "yyyy-MM-dd"), 0));
  (recentPayments || []).forEach((payment: any) => {
    if (normalizeCurrency(payment.currency) !== selectedCurrency) return;
    const paymentDate = new Date(payment.createdAt);
    if (paymentDate < chartStart) return;
    const key = format(paymentDate, "yyyy-MM-dd");
    dailyTotals.set(key, (dailyTotals.get(key) || 0) + Number(payment.amount || 0));
  });
  const revenueSeries = dayKeys.map((date) => ({
    name: format(date, "dd MMM"),
    value: dailyTotals.get(format(date, "yyyy-MM-dd")) || 0,
  }));
  const selectedRevenueTotal =
    revenueRows.find((row) => normalizeCurrency(row.currency) === selectedCurrency)?._sum.amount || 0;
  const reminderItems = (unpaidInvoices || []).map((invoice: any) => {
    const meta = (invoice?.metadata || {}) as Record<string, any>;
    const dueDate = meta?.dueDate ? new Date(meta.dueDate) : null;
    const dueLabel = dueDate && !Number.isNaN(dueDate.getTime()) ? format(dueDate, "dd MMM") : "No due date";
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      dueLabel,
      total: formatCurrency(Number(invoice.total || 0), invoice.currency),
    };
  });
  const buildDashboardHref = (params: { range?: string; currency?: string }) => {
    const qs = new URLSearchParams();
    if (params.range) qs.set("range", params.range);
    if (params.currency) qs.set("currency", params.currency);
    const suffix = qs.toString();
    return suffix ? `/dashboard?${suffix}` : "/dashboard";
  };
  const formatCurrencyChip = (code: string) => {
    return normalizeCurrency(code);
  };
  const systemLabelMap: Record<string, { en: string; fr: string }> = {
    API: { en: "API", fr: "API" },
    Database: { en: "Database", fr: "Base de donnees" },
    Paystack: { en: "Paystack", fr: "Paystack" },
    Flutterwave: { en: "Flutterwave", fr: "Flutterwave" },
    Email: { en: "Email", fr: "Email" },
  };
  const statusLabelMap: Record<string, { en: string; fr: string }> = {
    ok: { en: "Healthy", fr: "Sain" },
    configured: { en: "Configured", fr: "Configure" },
    missing: { en: "Attention", fr: "Attention" },
  };

  return (
    <div className="space-y-6">
      <PaymentSuccessToast />
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {t("Dashboard", "Tableau")}
            </p>
            <h1 className="text-3xl font-semibold text-foreground">{t("Overview", "Vue d ensemble")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Real-time metrics across automations, invoices, and payments.",
                "Metriques en temps reel sur automatisations, factures et paiements."
              )}
            </p>
            {publicId && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("User ID:", "ID utilisateur :")}{" "}
                <span className="font-mono text-foreground">{publicId}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" className="font-semibold text-slate-900 dark:text-emerald-200">
              {t("Secure • Logged", "Securise • Connecte")}
            </Badge>
            <Link href="/dashboard/onboarding">
              <Button variant="secondary" size="sm">
                {t("Set up workspace", "Configurer l espace")}
              </Button>
            </Link>
            <RestartTourButton />
          </div>
        </div>

        <div className="mt-4">
          <PaystackNotice dismissed={Boolean(paystackDismissed)} />
        </div>
      </div>

      {automations === 0 && invoices === 0 && (
        <Card title={t("Quick start", "Demarrage rapide")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Start by creating your first automation or sending an invoice. Paid plans unlock AI workflows and WhatsApp automations.",
              "Commencez par creer votre premiere automatisation ou envoyer une facture. Les plans payants debloquent l IA et WhatsApp."
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/automations/new">
              <Button size="sm">{t("Create automation", "Creer une automatisation")}</Button>
            </Link>
            <Link href="/dashboard/invoices">
              <Button size="sm" variant="secondary">
                {t("Create invoice", "Creer une facture")}
              </Button>
            </Link>
            <Link href="/dashboard/subscription">
              <Button size="sm" variant="ghost">
                {t("View plans", "Voir les plans")}
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title={t("Quick actions", "Actions rapides")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/dashboard/invoices">
              <Button className="w-full justify-between">
                <span>{t("New invoice", "Nouvelle facture")}</span>
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/automations/new">
              <Button variant="secondary" className="w-full justify-between">
                <span>{t("New automation", "Nouvelle automatisation")}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/assistant">
              <Button variant="secondary" className="w-full justify-between">
                <span>{t("Ask AI assistant", "Demander a l assistant IA")}</span>
                <Sparkles className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/support">
              <Button variant="secondary" className="w-full justify-between">
                <span>{t("Contact support", "Contacter le support")}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "Launch a new invoice, run an automation, or ask the assistant for guidance.",
              "Lancez une facture, une automatisation, ou demandez conseil a l assistant."
            )}
          </p>
        </Card>

        <Card title={t("Needs attention", "A verifier")}>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                {t("Overdue invoices", "Factures en retard")}
              </div>
              <Badge variant={overdueCount ? "warning" : "success"} className="text-[11px]">
                {overdueCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                {t("Unpaid invoices", "Factures impayees")}
              </div>
              <Badge variant={unpaidCount ? "warning" : "success"} className="text-[11px]">
                {unpaidCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                {t("Failed runs", "Executions echouees")}
              </div>
              <Badge variant={failedRuns ? "warning" : "success"} className="text-[11px]">
                {failedRuns}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                {t("Failed payments", "Paiements echoues")}
              </div>
              <Badge variant={failedPaymentCount ? "warning" : "success"} className="text-[11px]">
                {failedPaymentCount}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Revenue", "Revenu")}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {formatCurrency(Number(selectedRevenueTotal || 0), selectedCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(`Last ${rangeDays} days - ${selectedCurrency}`, `Derniers ${rangeDays} jours - ${selectedCurrency}`)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Unpaid invoices", "Factures impayees")}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{unpaidCount}</p>
          <p className="text-xs text-muted-foreground">{t("Sent or overdue", "Envoyees ou en retard")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Active automations", "Automatisations actives")}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{automations}</p>
          <p className="text-xs text-muted-foreground">{t("Drafts included", "Brouillons inclus")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("AI usage", "Usage IA")}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{aiUsageCount}</p>
          <p className="text-xs text-muted-foreground">
            {t("Requests last 30 days", "Requetes sur 30 jours")}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card
          title={t("Revenue trend", "Tendance des revenus")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full border border-border bg-muted/40 p-1 text-xs font-semibold">
                {["7d", "30d"].map((range) => (
                  <Link
                    key={range}
                    href={buildDashboardHref({ range, currency: selectedCurrency })}
                    className={`rounded-full px-2 py-1 ${
                      (rangeParam ?? "7d") === range
                        ? "bg-indigo-600 text-white"
                        : "text-foreground"
                    }`}
                  >
                    {range}
                  </Link>
                ))}
              </div>
              <div className="flex items-center rounded-full border border-border bg-muted/40 p-1 text-xs font-semibold">
                {(availableCurrencies.length ? availableCurrencies : [selectedCurrency]).map((currency) => (
                  <Link
                    key={currency}
                    href={buildDashboardHref({ range: rangeParam ?? "7d", currency })}
                    className={`rounded-full px-2 py-1 ${
                      currency === selectedCurrency ? "bg-emerald-600 text-white" : "text-foreground"
                    }`}
                  >
                    {formatCurrencyChip(currency)}
                  </Link>
                ))}
              </div>
            </div>
          }
        >
          <MiniAreaChart data={revenueSeries} />
        </Card>

        <Card
          title={t("Reminder queue", "File de relance")}
          actions={
            <Link href="/dashboard/invoices" className="text-xs font-semibold text-indigo-600">
              {t("View invoices", "Voir factures")}
            </Link>
          }
        >
          {reminderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("No unpaid invoices waiting for follow-up.", "Aucune facture impayee en attente.")}
            </p>
          ) : (
            <div className="space-y-3">
              {reminderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`Due ${item.dueLabel}`, `Echeance ${item.dueLabel}`)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{item.total}</p>
                    <Badge variant={item.status === "OVERDUE" ? "warning" : "default"} className="text-[10px]">
                      {t(
                        String(item.status).toLowerCase(),
                        String(item.status).toLowerCase() === "sent"
                          ? "envoyee"
                          : String(item.status).toLowerCase() === "overdue"
                            ? "retard"
                            : String(item.status).toLowerCase()
                      )}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 max-md:gap-5">
        <Card title={t("Invoices", "Factures")}>
          <p className="text-3xl font-semibold text-foreground">{invoices}</p>
          <p className="text-xs text-muted-foreground">
            {t("Generated across all currencies", "Genere dans toutes les devises")}
          </p>
        </Card>
        <Card title={t("Run health", "Sante des executions")}>
          <p className="text-3xl font-semibold text-foreground">
            {successRuns} <span className="text-sm text-muted-foreground">{t("ok", "ok")}</span> / {failedRuns}{" "}
            <span className="text-sm text-rose-600 dark:text-rose-300">{t("failed", "echec")}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t("Last 100 runs", "100 dernieres executions")}</p>
        </Card>
      </div>

      <Card
        title={t("Automation throughput", "Debit automatisation")}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
              {t(`${successRate}% success`, `${successRate}% succes`)}
            </span>
            <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
              {t(`${totalRuns} runs`, `${totalRuns} executions`)}
            </span>
          </div>
        }
      >
        <div className="automation-throughput-card rounded-2xl border border-slate-200 p-4 shadow-[0_18px_32px_rgba(15,23,42,0.08)] dark:border-border/70">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-700 dark:text-indigo-300">
                {t("Last 7 days", "7 derniers jours")}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {t("Automation activity", "Activite automatisation")}
              </p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t(`${successRuns} successful runs`, `${successRuns} executions reussies`)}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {t(`${failedRuns} failed runs`, `${failedRuns} executions echouees`)}
            </span>
          </div>
          <MiniAreaChart
            className="[--chart-primary:#2563eb] dark:[--chart-primary:#6366f1]"
            data={[
              { name: "Mon", value: 40 },
              { name: "Tue", value: 56 },
              { name: "Wed", value: 62 },
              { name: "Thu", value: 58 },
              { name: "Fri", value: 80 },
              { name: "Sat", value: 76 },
              { name: "Sun", value: 90 },
            ]}
          />
        </div>
      </Card>

      <Card title={t("System status", "Etat du systeme")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {systemStatus.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-semibold text-foreground">
                {t(systemLabelMap[item.label]?.en ?? item.label, systemLabelMap[item.label]?.fr ?? item.label)}
              </span>
              <Badge variant={formatStatusBadge(item.status)} className="text-[11px]">
                {t(statusLabelMap[item.status]?.en ?? "Attention", statusLabelMap[item.status]?.fr ?? "Attention")}
              </Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t(`Uptime: ${uptimeLabel}`, `Uptime : ${uptimeLabel}`)}</p>
      </Card>

      <Card
        title={t("Recent activity", "Activite recente")}
        actions={
          <Link href="/dashboard/usage" className="text-xs font-semibold text-indigo-600">
            {t("View all", "Voir tout")}
          </Link>
        }
      >
        {activityItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No recent activity yet.", "Aucune activite pour le moment.")}</p>
        ) : (
          <div className="space-y-3">
            {activityItems.map((item) => {
              const Icon = item.Icon;
              return (
                <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {t(item.title.en, item.title.fr)}
                    </p>
                    {item.description?.en ? (
                      <p className="text-xs text-muted-foreground">{t(item.description.en, item.description.fr)}</p>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{item.timestamp}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
