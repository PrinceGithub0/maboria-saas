import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { MiniAreaChart } from "@/components/charts/area-chart";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [users, payments, runs, tickets, revenueAgg, activeSubs, userCount, aiMemories, failed30] = await Promise.all([
    prisma.user.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.automationRun.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { flow: true } }),
    prisma.supportTicket.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
    prisma.aiMemory.count(),
    prisma.payment.count({ where: { status: "FAILED", createdAt: { gt: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  const totalRevenue = Number(revenueAgg._sum.amount || 0) / 100;
  const totalUsers = userCount;

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Platform health</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card title="Total revenue">
          <p className="text-3xl font-semibold text-foreground">${totalRevenue.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Stripe + Paystack</p>
        </Card>
        <Card title="Active subscriptions">
          <p className="text-3xl font-semibold text-foreground">{activeSubs}</p>
          <p className="text-xs text-muted-foreground">Across all plans</p>
        </Card>
        <Card title="Recent users">
          <p className="text-3xl font-semibold text-foreground">{totalUsers}</p>
          <p className="text-xs text-muted-foreground">Latest signups</p>
        </Card>
        <Card title="Automation errors">
          <p className="text-3xl font-semibold text-rose-200">
            {runs.filter((r) => r.runStatus === "FAILED").length}
          </p>
          <p className="text-xs text-muted-foreground">Last 5 runs</p>
        </Card>
        <Card title="AI assistant messages">
          <p className="text-3xl font-semibold text-foreground">{aiMemories}</p>
          <p className="text-xs text-muted-foreground">Total stored interactions</p>
        </Card>
        <Card title="Failed payments (30d)">
          <p className="text-3xl font-semibold text-rose-200">{failed30}</p>
          <p className="text-xs text-muted-foreground">Watch churn risk</p>
        </Card>
      </div>
      <Card title="MRR trend">
        <MiniAreaChart
          data={[
            { name: "W1", value: 10 },
            { name: "W2", value: 14 },
            { name: "W3", value: 16 },
            { name: "W4", value: 18 },
          ]}
        />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Latest users">
          <Table
            data={users}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "role", label: "Role" },
            ]}
          />
        </Card>
        <Card title="Recent payments">
          <Table
            data={payments}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "provider", label: "Provider" },
              { key: "currency", label: "Currency" },
              {
                key: "amount",
                label: "Amount",
                render: (row) => `$${(Number(row.amount) / 100).toFixed(2)}`,
              },
            ]}
          />
        </Card>
        <Card title="Recent runs">
          <Table
            data={runs}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "flow", label: "Flow", render: (row: any) => row.flow?.title },
              { key: "runStatus", label: "Status" },
              { key: "createdAt", label: "Created", render: (row) => new Date(row.createdAt).toLocaleString() },
            ]}
          />
        </Card>
        <Card title="Support tickets">
          <Table
            data={tickets}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "title", label: "Title" },
              { key: "status", label: "Status" },
              { key: "createdAt", label: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
