"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { formatCurrencyWithCode } from "@/lib/currency";
import { allowedCurrencies } from "@/lib/payments/currency-allowlist";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const profileFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

export default function InvoicesPage() {
  const { data: invoices, mutate } = useSWR("/api/invoice", fetcher);
  const { data: me } = useSWR("/api/user/me", fetcher);
  const { data: businessProfile, mutate: refreshBusinessProfile } = useSWR(
    "/api/business-profile",
    profileFetcher
  );
  const [form, setForm] = useState({
    invoiceNumber: "",
    currency: "USD",
    status: "SENT",
    customerName: "",
    customerEmail: "",
    customerAddress: "",
    items: [{ name: "Service", quantity: 1, price: 100 }],
  });
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [query, setQuery] = useState("");
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    country: "NG",
    defaultCurrency: "NGN",
    businessAddress: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
  });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setForm((prev) => (prev.invoiceNumber ? prev : { ...prev, invoiceNumber: `INV-${Date.now()}` }));
  }, []);

  useEffect(() => {
    if (me?.preferredCurrency && form.currency === "USD") {
      setForm((prev) => ({ ...prev, currency: String(me.preferredCurrency).toUpperCase() }));
    }
  }, [me?.preferredCurrency, form.currency]);

  useEffect(() => {
    const profileCurrency = businessProfile?.data?.defaultCurrency;
    if (profileCurrency && form.currency === "USD") {
      setForm((prev) => ({ ...prev, currency: String(profileCurrency).toUpperCase() }));
    }
  }, [businessProfile?.data?.defaultCurrency, form.currency]);

  const profileMissing =
    businessProfile?.status === 404 || businessProfile?.data?.error === "Not found";

  const createBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    setProfileError(null);
    const res = await fetch("/api/business-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(json.error || "Could not create business profile.");
      return;
    }
    setProfileStatus("Business profile saved.");
    refreshBusinessProfile();
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        const required = json.requiredPlan
          ? json.requiredPlan === "starter"
            ? "Starter"
            : json.requiredPlan === "pro"
              ? "Pro"
              : json.requiredPlan === "enterprise"
                ? "Enterprise"
                : json.requiredPlan
          : null;
        if (json.type === "upgrade_required" || json.type === "limit_reached") {
          setStatus({
            message: `${json.reason || "Upgrade required."}${required ? ` Required plan: ${required}.` : ""}`,
            variant: "error",
          });
        } else {
          setStatus({ message: json.error || "Could not create invoice.", variant: "error" });
        }
      } else {
        const savedNumber = json?.invoiceNumber as string | undefined;
        if (savedNumber && savedNumber !== form.invoiceNumber) {
          setStatus({
            message: `Invoice number already existed. Saved as ${savedNumber}.`,
            variant: "success",
          });
        } else {
          setStatus({ message: "Invoice generated.", variant: "success" });
        }
        mutate();
        setForm((prev) => ({ ...prev, invoiceNumber: `INV-${Date.now()}` }));
      }
    } catch {
      setStatus({ message: "Could not create invoice. Please try again.", variant: "error" });
    }
  };

  const currencyOptions = allowedCurrencies.map((code) => ({ code, label: code }));
  const businessCurrencyOptions = allowedCurrencies.map((code) => ({ code, label: code }));
  const businessCountryOptions = [
    { code: "NG", label: "Nigeria (NG)" },
    { code: "GH", label: "Ghana (GH)" },
    { code: "KE", label: "Kenya (KE)" },
    { code: "ZA", label: "South Africa (ZA)" },
    { code: "CI", label: "Cote d'Ivoire (CI)" },
    { code: "EG", label: "Egypt (EG)" },
    { code: "RW", label: "Rwanda (RW)" },
    { code: "UG", label: "Uganda (UG)" },
    { code: "TZ", label: "Tanzania (TZ)" },
    { code: "ZM", label: "Zambia (ZM)" },
    { code: "MZ", label: "Mozambique (MZ)" },
  ];

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Invoices</p>
          <h1 className="text-3xl font-semibold text-foreground">Generator</h1>
        </div>
        {status && <div className="mt-4"><Alert variant={status.variant}>{status.message}</Alert></div>}
      </div>
      {profileMissing ? (
        <Card title="Business profile required">
          {profileStatus && <Alert variant="success">{profileStatus}</Alert>}
          {profileError && <Alert variant="error">{profileError}</Alert>}
          <p className="text-sm text-muted-foreground">
            Add your business profile before creating invoices.
          </p>
          <form
            className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3"
            onSubmit={createBusinessProfile}
          >
            <Input
              label="Business name"
              value={profileForm.businessName}
              onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Country
              <select
                value={profileForm.country}
                onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {businessCountryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Default currency
              <select
                value={profileForm.defaultCurrency}
                onChange={(e) => setProfileForm({ ...profileForm, defaultCurrency: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {businessCurrencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Business email"
              type="email"
              value={profileForm.businessEmail}
              onChange={(e) => setProfileForm({ ...profileForm, businessEmail: e.target.value })}
            />
            <Input
              label="Business phone"
              value={profileForm.businessPhone}
              onChange={(e) => setProfileForm({ ...profileForm, businessPhone: e.target.value })}
            />
            <Input
              label="Business address"
              value={profileForm.businessAddress}
              onChange={(e) => setProfileForm({ ...profileForm, businessAddress: e.target.value })}
            />
            <Input
              label="Tax ID"
              value={profileForm.taxId}
              onChange={(e) => setProfileForm({ ...profileForm, taxId: e.target.value })}
            />
            <div className="col-span-2 max-md:col-span-1">
              <Button type="submit" className="max-md:w-full">
                Save business profile
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Create invoice">
          <form className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3" onSubmit={createInvoice}>
            <Input
              label="Invoice number"
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <Input
              label="Customer name"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
            <Input
              label="Customer email"
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Customer address"
              value={form.customerAddress}
              onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
            />
            <Input
              label="Item name"
              value={form.items[0].name}
              onChange={(e) =>
                setForm({ ...form, items: [{ ...form.items[0], name: e.target.value }] })
              }
            />
            <div className="space-y-1">
              <Input
                label={`Item price (${form.currency})`}
                type="number"
                value={form.items[0].price}
                min={0}
                step={0.01}
                onChange={(e) =>
                  setForm({
                    ...form,
                    items: [{ ...form.items[0], price: Number(e.target.value) }],
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Displayed as {formatCurrencyWithCode(form.items[0].price || 0, form.currency)}.
              </p>
            </div>
            <div className="col-span-2 max-md:col-span-1">
              <Button type="submit" className="max-md:w-full">
                Save invoice
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title="History"
        actions={
          <input
            suppressHydrationWarning
            placeholder="Search invoices"
            className="w-56 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground max-md:w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <Table
          data={
            Array.isArray(invoices)
              ? invoices.filter(
                  (inv: any) =>
                    inv.invoiceNumber.toLowerCase().includes(query.toLowerCase()) ||
                    inv.status.toLowerCase().includes(query.toLowerCase())
                )
              : []
          }
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "invoiceNumber", label: "Number" },
            {
              key: "currency",
              label: "Currency",
              render: (row: any) => String(row.currency || "").toUpperCase(),
            },
            { key: "status", label: "Status" },
            {
              key: "total",
              label: "Total",
              render: (row: any) => formatCurrencyWithCode(Number(row.total || 0), row.currency),
            },
            {
              key: "id",
              label: "Actions",
              render: (row: any) => (
                <Link
                  href={`/dashboard/invoices/${row.id}`}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  View
                </Link>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
