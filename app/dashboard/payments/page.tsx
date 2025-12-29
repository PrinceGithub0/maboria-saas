"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/currency";
import { pricingTableDualCurrency } from "@/lib/pricing";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PaymentsPage() {
  const { data: payments } = useSWR("/api/payments", fetcher, { revalidateOnFocus: false });
  const [message, setMessage] = useState<string | null>(null);
  const [preferPaystack, setPreferPaystack] = useState(false);
  const [plan, setPlan] = useState<"starter" | "pro">("starter");
  const [currency, setCurrency] = useState<string>("NGN");
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("flutterwave");

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (["Africa/Lagos", "Africa/Accra", "Africa/Johannesburg"].includes(tz)) {
      setPreferPaystack(true);
      setCurrency("NGN");
      setProvider("paystack");
    }
  }, []);

  const plans = useMemo(() => pricingTableDualCurrency(), []);
  const selectedPlan = plans.find((p) => (plan === "starter" ? p.plan === "STARTER" : p.plan === "GROWTH"));
  const paystackCountries = ["Nigeria", "Ghana", "Kenya", "South Africa", "Cote d'Ivoire"];
  const flutterwaveCountries = [
    "Nigeria",
    "Ghana",
    "Kenya",
    "South Africa",
    "Uganda",
    "Tanzania",
    "Rwanda",
    "Zambia",
    "Mozambique",
    "Egypt",
  ];
  const paystackCurrencies = [{ code: "NGN", label: "NGN (Nigeria)" }];
  const flutterwaveCurrencies = [
    { code: "NGN", label: "NGN (Nigeria)" },
    { code: "GHS", label: "GHS (Ghana)" },
    { code: "KES", label: "KES (Kenya)" },
    { code: "ZAR", label: "ZAR (South Africa)" },
    { code: "XOF", label: "XOF (Côte d’Ivoire)" },
    { code: "UGX", label: "UGX (Uganda)" },
    { code: "TZS", label: "TZS (Tanzania)" },
    { code: "RWF", label: "RWF (Rwanda)" },
    { code: "ZMW", label: "ZMW (Zambia)" },
    { code: "MZN", label: "MZN (Mozambique)" },
    { code: "EGP", label: "EGP (Egypt)" },
    { code: "USD", label: "USD (United States)" },
    { code: "GBP", label: "GBP (United Kingdom)" },
    { code: "EUR", label: "EUR (Europe)" },
  ];
  const availableCurrencies = provider === "paystack" ? paystackCurrencies : flutterwaveCurrencies;

  const payWithFlutterwave = async () => {
    setMessage(null);
    setProvider("flutterwave");
    const res = await fetch("/api/payments/flutterwave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        currency,
      }),
    });
    const data = await res.json();
    if (data?.data?.link) window.location.href = data.data.link;
    else setMessage(data.error || "Flutterwave checkout failed");
  };

  const payWithPaystack = async () => {
    setMessage(null);
    setProvider("paystack");
    if (currency !== "NGN") {
      setCurrency("NGN");
      return;
    }
    const res = await fetch("/api/payments/paystack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, currency: "NGN" }),
    });
    const data = await res.json();
    if (data?.data?.authorization_url) window.location.href = data.data.authorization_url;
    else setMessage(data.error || "Paystack init failed");
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Payments</p>
            <h1 className="text-3xl font-semibold text-foreground">Billing + subscriptions</h1>
            <p className="text-sm text-muted-foreground">
              Select a plan and continue to secure checkout to add a payment method.
            </p>
          </div>
        </div>
        {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title="Select a plan">
          <div className="grid gap-3 md:grid-cols-2 max-md:grid-cols-1">
            {plans
              .filter((p) => p.plan !== "ENTERPRISE")
              .map((p) => {
                const isSelected = (plan === "starter" ? "STARTER" : "GROWTH") === p.plan;
                return (
                  <button
                    key={p.plan}
                    type="button"
                    onClick={() => setPlan(p.plan === "STARTER" ? "starter" : "pro")}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-border bg-card/50 hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{p.label}</p>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {p.ngn ? formatCurrency(p.ngn, "NGN", { maximumFractionDigits: 0 }) : "Contact sales"}
                    </div>
                    {p.usd != null && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(p.usd, "USD", { maximumFractionDigits: 0 })} / mo
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        </Card>
        <Card title="Choose payment method">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 max-md:grid-cols-1">
              <button
                type="button"
                onClick={() => setProvider("paystack")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  provider === "paystack"
                    ? "border-indigo-500 bg-indigo-500/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                Paystack
              </button>
              <button
                type="button"
                onClick={() => setProvider("flutterwave")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  provider === "flutterwave"
                    ? "border-indigo-500 bg-indigo-500/10 text-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                Flutterwave
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {provider === "paystack"
                ? `Paystack supported countries: ${paystackCountries.join(", ")}.`
                : `Flutterwave supported countries: ${flutterwaveCountries.join(", ")}.`}
            </p>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2 text-sm max-md:flex-col max-md:items-start max-md:gap-2">
              <span className="text-muted-foreground">Billing currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {availableCurrencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 max-md:gap-3">
              <Button onClick={payWithPaystack} className="max-md:w-full">
                Continue with Paystack
              </Button>
              <Button onClick={payWithFlutterwave} className="max-md:w-full">
                Continue with Flutterwave
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              You’ll be redirected to a secure checkout page to enter card or bank details. Your plan activates
              immediately after payment.
            </div>
            {selectedPlan ? (
              <div className="rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                Selected plan: <span className="font-semibold text-foreground">{selectedPlan.label}</span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <Card title="Recent payments">
        <Table
          data={payments || []}
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "provider", label: "Provider" },
            {
              key: "currency",
              label: "Currency",
              render: (row: any) => String(row.currency || "").toUpperCase(),
            },
            {
              key: "amount",
              label: "Amount",
              render: (row: any) => formatCurrency(Number(row.amount || 0), row.currency),
            },
            { key: "status", label: "Status" },
          ]}
        />
      </Card>
    </div>
  );
}
