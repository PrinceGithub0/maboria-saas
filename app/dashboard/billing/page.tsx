"use client";

import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Billing</p>
        <h1 className="text-3xl font-semibold text-foreground">Billing history</h1>
      </div>

      <Card title="Plans">
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isEnterprise = p.plan === "ENTERPRISE";
            const href = isEnterprise ? "/contact" : "/dashboard/subscription";
            const cta = isEnterprise ? "Contact sales" : "Manage plan";

            return (
              <Card key={p.plan} className="bg-card/60" title={p.label}>
                <div className="space-y-3">
                  <div className="text-2xl font-semibold text-foreground">
                    {p.ngn == null ? (
                      "Contact sales"
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(p.ngn, "NGN")}
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        {p.usd != null && (
                          <div className="text-sm font-medium text-muted-foreground">{formatMoney(p.usd, "USD")}/mo</div>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                        <span>{f}</span>
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

      <Card title="Payments">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data?.payments || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "provider", label: "Provider" },
              { key: "status", label: "Status" },
              { key: "currency", label: "Currency" },
              { key: "amount", label: "Amount", render: (row: any) => Number(row.amount).toFixed(2) },
            ]}
          />
        )}
      </Card>

      <Card title="Invoices">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data?.invoices || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "invoiceNumber", label: "Invoice" },
              { key: "status", label: "Status" },
              { key: "currency", label: "Currency" },
              { key: "total", label: "Total", render: (row: any) => Number(row.total).toFixed(2) },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
