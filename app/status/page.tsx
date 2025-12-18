"use client";

import { Card } from "@/components/ui/card";
import { Circle } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatusItem({ label, status }: { label: string; status: "green" | "yellow" | "red" }) {
  const color =
    status === "green" ? "text-emerald-400" : status === "yellow" ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <Circle className={`h-3 w-3 ${color}`} />
      {label}
    </div>
  );
}

export default function StatusPage() {
  const { data } = useSWR("/api/health", fetcher);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10 text-foreground">
      <h1 className="text-3xl font-semibold">System Status</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Core services">
          <div className="space-y-2">
            <StatusItem label="API" status={data?.status === "ok" ? "green" : "red"} />
            <StatusItem label="Database" status={data?.db === "connected" ? "green" : "red"} />
            <StatusItem label="Automation engine" status="green" />
          </div>
        </Card>
        <Card title="Integrations">
          <div className="space-y-2">
            <StatusItem label="Stripe" status={data?.stripe === "configured" ? "green" : "yellow"} />
            <StatusItem label="Paystack" status={data?.paystack === "configured" ? "green" : "yellow"} />
            <StatusItem label="AI engine" status="green" />
          </div>
        </Card>
      </div>
    </div>
  );
}
