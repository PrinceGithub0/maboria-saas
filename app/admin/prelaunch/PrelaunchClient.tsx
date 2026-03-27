"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type RawCheck = {
  name?: string;
  item?: string;
  status?: string;
};

type PrelaunchApiResponse =
  | RawCheck[]
  | {
      checks?: RawCheck[];
      readiness?: number;
      lastRunAt?: string | null;
      triggeredBy?: string | null;
    };

type CheckStatus = "ok" | "warning" | "fail" | "pending";

type CheckRow = {
  name: string;
  status: CheckStatus;
};

const fetcher = async (url: string): Promise<PrelaunchApiResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as any).error === "string"
        ? (payload as any).error
        : null) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as PrelaunchApiResponse;
};

function normalizeStatus(input: string | undefined): CheckStatus {
  const value = String(input || "").trim().toLowerCase();
  if (value === "ok") return "ok";
  if (value === "fail") return "fail";
  if (value === "warning") return "warning";
  return "pending";
}

function normalizePayload(raw: PrelaunchApiResponse | undefined) {
  const checksSource = Array.isArray(raw) ? raw : Array.isArray(raw?.checks) ? raw.checks : [];

  const checks: CheckRow[] = checksSource.map((check) => ({
    name: String(check.name || check.item || "Unknown check"),
    status: normalizeStatus(check.status),
  }));

  const passed = checks.filter((check) => check.status === "ok").length;
  const computedReadiness = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  const readiness =
    raw && !Array.isArray(raw) && typeof raw.readiness === "number"
      ? Math.max(0, Math.min(100, Math.round(raw.readiness)))
      : computedReadiness;

  const issues = checks.filter((check) => check.status !== "ok").length;
  const lastRunAt = raw && !Array.isArray(raw) ? raw.lastRunAt || null : null;
  const triggeredBy = raw && !Array.isArray(raw) ? raw.triggeredBy || null : null;

  return { checks, readiness, issues, lastRunAt, triggeredBy };
}

function buildAsciiBar(percent: number) {
  const total = 20;
  const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  return `${"#".repeat(filled)}${"-".repeat(total - filled)}`;
}

function statusColor(status: CheckStatus) {
  if (status === "ok") return "text-emerald-600 dark:text-emerald-400";
  if (status === "fail") return "text-rose-600 dark:text-rose-400";
  return "text-amber-600 dark:text-amber-300";
}

function statusIcon(status: CheckStatus) {
  if (status === "ok") return "✓";
  if (status === "fail") return "✖";
  return "⚠";
}

export default function PrelaunchClient() {
  const { language, t } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";

  const { data, error, isLoading, isValidating, mutate } = useSWR<PrelaunchApiResponse>("/api/admin/prelaunch", fetcher);
  const [isRunning, setIsRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [localLastRunAt, setLocalLastRunAt] = useState<string | null>(null);
  const [localTriggeredBy, setLocalTriggeredBy] = useState<string | null>(null);

  const normalized = useMemo(() => normalizePayload(data), [data]);
  const renderLastRunAt = normalized.lastRunAt || localLastRunAt;
  const renderTriggeredBy = normalized.triggeredBy || localTriggeredBy;
  const stamp = renderLastRunAt ? new Date(renderLastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const runChecks = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/admin/prelaunch", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as any).error === "string"
            ? (payload as any).error
            : null) || `Request failed (${res.status})`;
        throw new Error(message);
      }

      setLocalLastRunAt(new Date().toISOString());
      setLocalTriggeredBy(t("Current admin", "Admin actuel", "Aktueller Admin", "Administrador actual", "Administrador atual"));
      await mutate(payload as PrelaunchApiResponse, { revalidate: false });
      await mutate();
    } catch (runError) {
      setToastMessage(
        runError instanceof Error
          ? localizeAdminServerMessage(
              runError.message,
              language,
              t(
                "Failed to run diagnostics.",
                "Echec du diagnostic.",
                "Diagnose konnte nicht ausgefuehrt werden.",
                "No se pudieron ejecutar los diagnosticos.",
                "Nao foi possivel executar os diagnosticos."
              )
            )
          : t("Failed to run diagnostics.", "Echec du diagnostic.", "Diagnose konnte nicht ausgeführt werden.", "No se pudieron ejecutar los diagnosticos.", "Não foi possivel executar os diagnosticos.")
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Pre-Launch Diagnostics", "Diagnostic pre-lancement", "Pre-Launch-Diagnose", "Diagnosticos previos al lanzamiento", "Diagnosticos pre-lancamento")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Verify platform readiness before production launch.", "Verifiez la preparation de la plateforme avant le lancement.", "Prüfe die Plattformbereitschaft vor dem Produktionsstart.", "Verifica la preparacion de la plataforma antes del lanzamiento en producción.", "Verifique a prontidao da plataforma antes do lancamento em produção.")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Last run:", "Derniere execution:", "Letzte Ausfuhrung:", "Ultima ejecucion:", "Ultima execucao:")}{" "}
            {renderLastRunAt ? formatDateTimeDMY(new Date(renderLastRunAt), LANGUAGE_LOCALES[language]) : t("Not available", "Indisponible", "Nicht verfuegbar", "No disponible", "Indisponivel")}{" "}
            <span className="mx-2">|</span>
            {t("Triggered by:", "Declenche par:", "Ausgelöst von:", "Iniciado por:", "Acionado por:")} {renderTriggeredBy || t("Unknown", "Inconnu", "Unbekannt", "Desconocido", "Desconhecido")}
          </p>
        </div>
        <Button type="button" onClick={runChecks} disabled={isValidating || isRunning} loading={isRunning}>
          {isRunning
            ? t("Running diagnostics...", "Diagnostic en cours...", "Diagnose lauft...", "Ejecutando diagnosticos...", "A executar diagnosticos...")
            : t("Run checks", "Lancer les controles", "Prufungen ausfuhren", "Ejecutar comprobaciones", "Executar verificacoes")}
        </Button>
      </header>

      {error ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("Failed to load diagnostics.", "Echec du chargement du diagnostic.", "Diagnose konnte nicht geladen werden.", "No se pudieron cargar los diagnosticos.", "Não foi possivel carregar os diagnosticos.")}</span>
            <Button size="sm" variant="secondary" onClick={() => void mutate()}>
              {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card title={t("System Diagnostics", "Diagnostic systeme", "Systemdiagnose", "Diagnosticos del sistema", "Diagnosticos do sistema")}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`rounded-xl border px-4 py-4 font-mono text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 ${
                forceLight ? "!border-slate-200 !bg-slate-50 !text-slate-900" : "border-slate-800 bg-slate-950"
              }`}
            >
              {normalized.checks.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-300">{t("No diagnostics available.", "Aucun diagnostic disponible.", "Keine Diagnose verfügbar.", "No hay diagnosticos disponibles.", "Não ha diagnosticos disponiveis.")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {normalized.checks.map((check) => (
                    <li
                      key={check.name}
                      className={`flex items-start gap-2 dark:text-slate-200 ${forceLight ? "!text-slate-900" : "text-slate-100"}`}
                    >
                      <span className={`w-12 dark:text-slate-400 ${forceLight ? "!text-slate-600" : "text-slate-500"}`}>{stamp}</span>
                      <span className={`w-4 text-center ${statusColor(check.status)}`}>{statusIcon(check.status)}</span>
                      <span>{check.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {t("Readiness score:", "Score de preparation:", "Bereitschaftswert:", "Puntuacion de preparacion:", "Pontuacao de prontidao:")} {normalized.readiness}%
              </p>
              <p className="font-mono text-xs text-muted-foreground">{buildAsciiBar(normalized.readiness)} {normalized.readiness}%</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${normalized.readiness}%` }} />
              </div>
              {normalized.issues > 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {normalized.issues} {t("issues require attention before launch.", "problemes requierent votre attention avant le lancement.", "Probleme erfordern vor dem Start Aufmerksamkeit.", "problemas requieren atencion antes del lanzamiento.", "problemas exigem atencao antes do lancamento.")}
                </p>
              ) : (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{t("No blocking issues detected.", "Aucun probleme bloquant detecte.", "Keine blockierenden Probleme erkannt.", "No se detectaron problemas bloqueantes.", "Não foram detetados problemas bloqueadores.")}</p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Toast message={toastMessage} show={Boolean(toastMessage)} />
    </div>
  );
}
