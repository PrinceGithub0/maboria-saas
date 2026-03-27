"use client";

import { Card } from "@/components/ui/card";
import { Circle } from "lucide-react";
import useSWR from "swr";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatusItem({ label, status }: { label: string; status: "green" | "yellow" | "red" }) {
  const color =
    status === "green" ? "text-emerald-700" : status === "yellow" ? "text-amber-800" : "text-rose-700";
  return (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <Circle className={`h-3 w-3 ${color}`} />
      {label}
    </div>
  );
}

export default function StatusPage() {
  const { t } = useLanguage();
  const { data } = useSWR("/api/health", fetcher);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <h1 className="text-3xl font-semibold">{t("System Status", "Etat du systeme")}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("Core services", "Services coeur")}>
          <div className="space-y-2">
            <StatusItem label={t("API", "API")} status={data?.status === "ok" ? "green" : "red"} />
            <StatusItem label={t("Database", "Base de données")} status={data?.db === "connected" ? "green" : "red"} />
            <StatusItem label={t("Automation engine", "Moteur automatisation")} status="green" />
          </div>
        </Card>
        <Card title={t("Integrations", "Integrations")}>
          <div className="space-y-2">
            <StatusItem label="Flutterwave" status={data?.flutterwave === "configured" ? "green" : "yellow"} />
            <StatusItem label="Paystack" status={data?.paystack === "configured" ? "green" : "yellow"} />
            <StatusItem label={t("AI engine", "Moteur IA")} status="green" />
          </div>
        </Card>
      </div>
    </div>
  );
}
