"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { pricingTableForUI } from "@/lib/pricing";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function BillingPage() {
  const { data, isLoading } = useSWR("/api/billing/history", fetcher);
  const plans = pricingTableForUI("NGN");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Billing</p>
        <h1 className="text-3xl font-semibold text-white">Billing history</h1>
      </div>
      <Card title="Plans">
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.plan} className="bg-slate-900/60" title={(p as any).label ?? p.plan}>
              <p className="text-2xl font-semibold text-white">
                {p.price == null ? (
                  "Contact sales"
                ) : (
                  <>
                    ₦{Number(p.price).toLocaleString()}
                    <span className="text-sm text-slate-400">/mo</span>
                  </>
                )}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <Button className="mt-3 w-full" variant="secondary">
                {p.plan === "ENTERPRISE" ? "Contact" : "Choose"}
              </Button>
            </Card>
          ))}
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
