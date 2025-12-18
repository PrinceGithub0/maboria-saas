"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PaymentsPage() {
  const { data: payments } = useSWR("/api/payments", fetcher, { revalidateOnFocus: false });
  const [message, setMessage] = useState<string | null>(null);

  const payWithStripe = async () => {
    const res = await fetch("/api/payments/stripe", {
      method: "POST",
      body: JSON.stringify({
        plan: "starter",
        currency: "USD",
      }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setMessage(data.error || "Stripe checkout failed");
  };

  const payWithPaystack = async () => {
    const res = await fetch("/api/payments/paystack", {
      method: "POST",
      body: JSON.stringify({ plan: "starter", currency: "NGN" }),
    });
    const data = await res.json();
    if (data?.data?.authorization_url) window.location.href = data.data.authorization_url;
    else setMessage(data.error || "Paystack init failed");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Payments</p>
          <h1 className="text-3xl font-semibold text-white">Billing + subscriptions</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={payWithStripe}>Stripe (USD/EUR)</Button>
          <Button variant="secondary" onClick={payWithPaystack}>
            Paystack (NGN)
          </Button>
        </div>
      </div>
      {message && <Alert variant="error">{message}</Alert>}
      <Card title="Recent payments">
        <Table
          data={payments || []}
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "provider", label: "Provider" },
            { key: "currency", label: "Currency" },
            {
              key: "amount",
              label: "Amount",
              render: (row: any) => `$${(Number(row.amount || 0) / 100).toFixed(2)}`,
            },
            { key: "status", label: "Status" },
          ]}
        />
      </Card>
    </div>
  );
}
