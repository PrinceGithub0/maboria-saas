"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function InvoicesPage() {
  const { data: invoices, mutate } = useSWR("/api/invoice", fetcher);
  const [form, setForm] = useState({
    invoiceNumber: `INV-${Date.now()}`,
    currency: "USD",
    status: "SENT",
    items: [{ name: "Service", quantity: 1, price: 10000 }],
  });
  const [query, setQuery] = useState("");

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/invoice", {
      method: "POST",
      body: JSON.stringify(form),
    });
    mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Invoices</p>
        <h1 className="text-3xl font-semibold text-white">Generator</h1>
      </div>
      <Card title="Create invoice">
        <form className="grid grid-cols-2 gap-4" onSubmit={createInvoice}>
          <Input
            label="Invoice number"
            value={form.invoiceNumber}
            onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
          />
          <Input
            label="Currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          />
          <Input
            label="Item name"
            value={form.items[0].name}
            onChange={(e) =>
              setForm({ ...form, items: [{ ...form.items[0], name: e.target.value }] })
            }
          />
          <Input
            label="Item price (cents)"
            type="number"
            value={form.items[0].price}
            onChange={(e) =>
              setForm({
                ...form,
                items: [{ ...form.items[0], price: Number(e.target.value) }],
              })
            }
          />
          <div className="col-span-2">
            <Button type="submit">Save invoice</Button>
          </div>
        </form>
      </Card>
      <Card
        title="History"
        actions={
          <input
            placeholder="Search invoices"
            className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <Table
          data={
            invoices?.filter(
              (inv: any) =>
                inv.invoiceNumber.toLowerCase().includes(query.toLowerCase()) ||
                inv.status.toLowerCase().includes(query.toLowerCase())
            ) || []
          }
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "invoiceNumber", label: "Number" },
            { key: "currency", label: "Currency" },
            { key: "status", label: "Status" },
            {
              key: "total",
              label: "Total",
              render: (row: any) => `$${(Number(row.total) / 100).toFixed(2)}`,
            },
          ]}
        />
      </Card>
    </div>
  );
}
