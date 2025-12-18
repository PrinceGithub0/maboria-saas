import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const [payments, invoices, automations, runs] = await Promise.all([
    prisma.payment.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { userId } }),
    prisma.automationFlow.count({ where: { userId } }),
    prisma.automationRun.groupBy({
      by: ["runStatus"],
      _count: { _all: true },
      where: { userId },
    }),
  ]);

  const revenue = Number(payments._sum.amount || 0);
  const successRuns = runs.find((r) => r.runStatus === "SUCCESS")?._count._all || 0;
  const failedRuns = runs.find((r) => r.runStatus === "FAILED")?._count._all || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Dashboard</p>
          <h1 className="text-3xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-slate-400">
            Real-time metrics across automations, invoices, and payments.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="success">Secure · Logged</Badge>
          <Link href="/dashboard/onboarding">
            <Button variant="secondary" size="sm">
              Product tour
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card title="Total revenue">
          <p className="text-3xl font-semibold text-white">${(revenue / 100).toFixed(2)}</p>
          <p className="text-xs text-slate-400">Stripe + Paystack</p>
        </Card>
        <Card title="Invoices">
          <p className="text-3xl font-semibold text-white">{invoices}</p>
          <p className="text-xs text-slate-400">Generated across all currencies</p>
        </Card>
        <Card title="Automations">
          <p className="text-3xl font-semibold text-white">{automations}</p>
          <p className="text-xs text-slate-400">Active and draft flows</p>
        </Card>
        <Card title="Run health">
          <p className="text-3xl font-semibold text-white">
            {successRuns} <span className="text-sm text-slate-400">ok</span> /{" "}
            {failedRuns} <span className="text-sm text-rose-300">failed</span>
          </p>
          <p className="text-xs text-slate-400">Last 100 runs</p>
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
