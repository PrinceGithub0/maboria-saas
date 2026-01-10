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
import { formatCurrency } from "@/lib/currency";
import { PaymentSuccessToast } from "@/components/ui/payment-success-toast";
import { format } from "date-fns";
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
      ? prisma.user.findUnique({ where: { id: userId }, select: { publicId: true } })
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

  const revenueRows = paymentsByCurrency || [];
  const successRuns = runs.find((r) => r.runStatus === "SUCCESS")?._count._all || 0;
  const failedRuns = runs.find((r) => r.runStatus === "FAILED")?._count._all || 0;
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
  const activityItems = (activityLogs || []).map((log) => {
    const action = String(log.action || "");
    const meta = (log.metadata || {}) as Record<string, any>;
    const labelMap: Record<string, { title: string; icon: LucideIcon }> = {
      INVOICE_CREATED: { title: "Invoice created", icon: FileText },
      INVOICE_SENT: { title: "Invoice sent", icon: FileText },
      INVOICE_PAID: { title: "Invoice paid", icon: CreditCard },
      SUBSCRIPTION_UPDATED: { title: "Subscription updated", icon: CreditCard },
      AUTOMATION_CREATED: { title: "Automation created", icon: Bot },
      AUTOMATION_RUN: { title: "Automation run", icon: Bot },
      AI_ASSISTANT_USED: { title: "AI assistant used", icon: Sparkles },
    };
    const fallbackTitle = action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
    const entry = labelMap[action] || { title: fallbackTitle || "Activity", icon: Activity };
    const description =
      meta.invoiceNumber
        ? `Invoice ${meta.invoiceNumber}`
        : meta.plan
          ? `Plan ${String(meta.plan).toLowerCase()}`
          : meta.status
            ? `Status ${String(meta.status).toLowerCase()}`
            : "";
    const timestamp = log.timestamp ? format(new Date(log.timestamp), "dd MMM, HH:mm") : "";
    return {
      id: log.id,
      title: entry.title,
      description,
      timestamp,
      Icon: entry.icon,
    };
  });
  const rangeDays = rangeParam === "30d" ? 30 : 7;
  const availableCurrencies = revenueRows.map((row) => row.currency).filter(Boolean);
  const selectedCurrency =
    (currencyParam && availableCurrencies.includes(currencyParam)
      ? currencyParam
      : availableCurrencies[0]) || "NGN";
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
    if (payment.currency !== selectedCurrency) return;
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
    revenueRows.find((row) => row.currency === selectedCurrency)?._sum.amount || 0;
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

  return (
    <div className="space-y-6">
      <PaymentSuccessToast />
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Dashboard</p>
            <h1 className="text-3xl font-semibold text-foreground">Overview</h1>
            <p className="text-sm text-muted-foreground">Real-time metrics across automations, invoices, and payments.</p>
            {publicId && (
              <p className="mt-1 text-xs text-muted-foreground">
                User ID: <span className="font-mono text-foreground">{publicId}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" className="font-semibold text-slate-900 dark:text-emerald-200">
              {"Secure \u2022 Logged"}
            </Badge>
            <Link href="/dashboard/onboarding">
              <Button variant="secondary" size="sm">
                Product tour
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <PaystackNotice dismissed={Boolean(paystackDismissed)} />
        </div>
      </div>

      {automations === 0 && invoices === 0 && (
        <Card title="Quick start">
          <p className="text-sm text-muted-foreground">
            Start by creating your first automation or sending an invoice. Pro unlocks AI workflows and WhatsApp
            automations.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/automations/new">
              <Button size="sm">Create automation</Button>
            </Link>
            <Link href="/dashboard/invoices">
              <Button size="sm" variant="secondary">
                Create invoice
              </Button>
            </Link>
            <Link href="/dashboard/subscription">
              <Button size="sm" variant="ghost">
                Upgrade to Pro
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title="Quick actions">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/dashboard/invoices">
              <Button className="w-full justify-between">
                <span>New invoice</span>
                <Plus className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/automations/new">
              <Button variant="secondary" className="w-full justify-between">
                <span>New automation</span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/assistant">
              <Button variant="outline" className="w-full justify-between">
                <span>Ask AI assistant</span>
                <Sparkles className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/support">
              <Button variant="outline" className="w-full justify-between">
                <span>Contact support</span>
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Launch a new invoice, run an automation, or ask the assistant for guidance.
          </p>
        </Card>

        <Card title="Needs attention">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                Overdue invoices
              </div>
              <Badge variant={overdueCount ? "warning" : "success"} className="text-[11px]">
                {overdueCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                Unpaid invoices
              </div>
              <Badge variant={unpaidCount ? "warning" : "success"} className="text-[11px]">
                {unpaidCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                Failed runs
              </div>
              <Badge variant={failedRuns ? "warning" : "success"} className="text-[11px]">
                {failedRuns}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                Failed payments
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
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Revenue</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {formatCurrency(Number(selectedRevenueTotal || 0), selectedCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">Last {rangeDays} days · {selectedCurrency}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Unpaid invoices</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{unpaidCount}</p>
          <p className="text-xs text-muted-foreground">Sent or overdue</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Active automations</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{automations}</p>
          <p className="text-xs text-muted-foreground">Drafts included</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">AI usage</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{aiUsageCount}</p>
          <p className="text-xs text-muted-foreground">Requests last 30 days</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card
          title="Revenue trend"
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
                    {currency}
                  </Link>
                ))}
              </div>
            </div>
          }
        >
          <MiniAreaChart data={revenueSeries} />
        </Card>

        <Card
          title="Reminder queue"
          actions={
            <Link href="/dashboard/invoices" className="text-xs font-semibold text-indigo-600">
              View invoices
            </Link>
          }
        >
          {reminderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid invoices waiting for follow-up.</p>
          ) : (
            <div className="space-y-3">
              {reminderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">Due {item.dueLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{item.total}</p>
                    <Badge variant={item.status === "OVERDUE" ? "warning" : "secondary"} className="text-[10px]">
                      {String(item.status).toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4 max-md:gap-5">
        <Card title="Total revenue">
          {revenueRows.length ? (
            <div className="space-y-1">
              {revenueRows.map((row) => (
                <p key={row.currency} className="text-2xl font-semibold text-foreground">
                  {formatCurrency(Number(row._sum.amount || 0), row.currency)}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-2xl font-semibold text-foreground">--</p>
          )}
          <p className="text-xs text-muted-foreground">Flutterwave + Paystack</p>
        </Card>
        <Card title="Invoices">
          <p className="text-3xl font-semibold text-foreground">{invoices}</p>
          <p className="text-xs text-muted-foreground">Generated across all currencies</p>
        </Card>
        <Card title="Automations">
          <p className="text-3xl font-semibold text-foreground">{automations}</p>
          <p className="text-xs text-muted-foreground">Active and draft flows</p>
        </Card>
        <Card title="Run health">
          <p className="text-3xl font-semibold text-foreground">
            {successRuns} <span className="text-sm text-muted-foreground">ok</span> / {failedRuns}{" "}
            <span className="text-sm text-rose-600 dark:text-rose-300">failed</span>
          </p>
          <p className="text-xs text-muted-foreground">Last 100 runs</p>
        </Card>
      </div>

      <Card title="Automation throughput">
        <MiniAreaChart
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
      </Card>

      <Card title="System status">
        <div className="grid gap-3 sm:grid-cols-2">
          {systemStatus.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <Badge variant={formatStatusBadge(item.status)} className="text-[11px]">
                {item.status === "ok" ? "Healthy" : item.status === "configured" ? "Configured" : "Attention"}
              </Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Uptime: {uptimeLabel}</p>
      </Card>

      <Card title="Recent activity" actions={<Link href="/dashboard/usage" className="text-xs font-semibold text-indigo-600">View all</Link>}>
        {activityItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
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
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    {item.description ? (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
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
