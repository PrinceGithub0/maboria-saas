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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const [paymentsByCurrency, invoices, automations, runs, user, paystackDismissed] = await Promise.all([
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
  ]);

  const revenueRows = paymentsByCurrency || [];
  const successRuns = runs.find((r) => r.runStatus === "SUCCESS")?._count._all || 0;
  const failedRuns = runs.find((r) => r.runStatus === "FAILED")?._count._all || 0;
  const publicId = userId ? user?.publicId || (await ensureUserPublicId(userId)) : null;

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
    </div>
  );
}
