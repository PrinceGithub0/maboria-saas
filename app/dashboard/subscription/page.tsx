"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SubscriptionPage() {
  const router = useRouter();
  const { data, mutate } = useSWR("/api/subscription", fetcher);
  const subs = data || [];
  const [actionStatus, setActionStatus] = useState<{ message: string; variant: "info" | "success" | "error" } | null>(
    null
  );

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return "Starter";
      case "GROWTH":
      case "PREMIUM":
        return "Pro";
      case "ENTERPRISE":
        return "Enterprise";
      default:
        return plan;
    }
  };

  const trialSub = subs.find((sub: any) => sub.status === "TRIALING");
  const activeSub = subs.find((sub: any) => ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status));
  const currentPlan = activeSub?.plan ? formatPlan(activeSub.plan) : "No active plan";

  const cancelTrial = async () => {
    if (!trialSub) return;
    setActionStatus(null);
    const res = await fetch("/api/subscription/cancel-trial", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({
        message: json.error || "Could not cancel trial.",
        variant: "error",
      });
      return;
    }
    setActionStatus({
      message: "Trial canceled. Your account is now on the free plan.",
      variant: "success",
    });
    mutate();
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Subscription</p>
            <h1 className="text-3xl font-semibold text-foreground">Manage plan</h1>
          </div>
          <div className="flex gap-2 max-md:w-full">
            <Button className="max-md:w-full" onClick={() => mutate()}>
              Refresh
            </Button>
          </div>
        </div>
        {actionStatus && <div className="mt-4"><Alert variant={actionStatus.variant}>{actionStatus.message}</Alert></div>}
      </div>
      <Card title="Upgrade or downgrade">
        <p className="text-sm text-muted-foreground">Current plan: {currentPlan}</p>
        <div className="mt-3 flex flex-wrap gap-2 max-md:flex-col max-md:items-stretch">
          <Button type="button" onClick={() => router.push("/dashboard/payments")}>
            Upgrade plan
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/payments")}>
            Downgrade plan
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Plan changes are handled during checkout. Choose your new plan and payment method.
        </p>
      </Card>
      <Card title="Current plan">
        {subs.length === 0 ? (
          <Alert variant="info">No subscription yet.</Alert>
        ) : (
          <Table
            data={subs}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "plan", label: "Plan", render: (row: any) => formatPlan(row.plan) },
              { key: "status", label: "Status" },
              {
                key: "renewalDate",
                label: "Renews",
                render: (row: any) => new Date(row.renewalDate).toLocaleDateString(),
              },
              { key: "usageLimit", label: "Usage limit" },
            ]}
          />
        )}
      </Card>
      {trialSub ? (
        <Card title="Trial cancellation">
          <p className="text-sm text-muted-foreground">
            Your trial will auto-renew unless you cancel it before the end date.
          </p>
          <div className="mt-3">
            <Button variant="secondary" className="max-md:w-full" onClick={cancelTrial}>
              Cancel trial
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
