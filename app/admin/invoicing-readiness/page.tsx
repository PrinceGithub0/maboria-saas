import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasActiveImpersonationForActor } from "@/lib/admin/impersonation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getEInvoiceCountryProductionSignoff,
  summarizeEInvoiceProductionSignoff,
} from "@/lib/einvoicing/production-signoffs";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import {
  listCountryLaunchReadiness,
  type CountryLaunchReadiness,
  type CountryLaunchState,
} from "@/lib/invoicing/country-readiness";
import { getCountryRegulatoryReview } from "@/lib/invoicing/regulatory-review-registry";
import { getLocalizedText, normalizeLanguage, type LocalizedText } from "@/lib/i18n";

type SearchParams = {
  state?: string;
  q?: string;
};

const STATE_ORDER: CountryLaunchState[] = ["LIVE", "BETA", "MANUAL_REVIEW", "NOT_READY"];

function normalizeState(value?: string | null): CountryLaunchState | "ALL" {
  const normalized = String(value || "").trim().toUpperCase();
  if (STATE_ORDER.includes(normalized as CountryLaunchState)) return normalized as CountryLaunchState;
  return "ALL";
}

function stateBadgeVariant(state: CountryLaunchState) {
  if (state === "LIVE") return "success" as const;
  if (state === "BETA") return "pending" as const;
  if (state === "MANUAL_REVIEW") return "warning" as const;
  return "danger" as const;
}

function stateSortValue(state: CountryLaunchState) {
  return STATE_ORDER.indexOf(state);
}

function summarize(rows: CountryLaunchReadiness[]) {
  return rows.reduce<Record<CountryLaunchState, number>>(
    (acc, row) => {
      acc[row.launchState] += 1;
      return acc;
    },
    {
      LIVE: 0,
      BETA: 0,
      MANUAL_REVIEW: 0,
      NOT_READY: 0,
    }
  );
}

export default async function AdminInvoicingReadinessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (actorRole !== "OPS_ADMIN" && actorRole !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const cookieHeader = (await headers()).get("cookie");
  const impersonating = await hasActiveImpersonationForActor({
    actorUserId: session.user.id,
    cookieHeader,
  });
  if (impersonating) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedState = normalizeState(resolvedSearchParams?.state);
  const query = String(resolvedSearchParams?.q || "").trim().toLowerCase();
  const allRows = listCountryLaunchReadiness().sort((a, b) => {
    const byState = stateSortValue(a.launchState) - stateSortValue(b.launchState);
    if (byState !== 0) return byState;
    return a.countryCode.localeCompare(b.countryCode);
  });
  const eInvoicePromotionQueue = allRows
    .filter((row) => row.launchState === "MANUAL_REVIEW" && row.requiresEInvoicing)
    .sort(
      (a, b) =>
        (a.eInvoicePromotionPriority || Number.MAX_SAFE_INTEGER) -
        (b.eInvoicePromotionPriority || Number.MAX_SAFE_INTEGER)
    );
  const queueRows = eInvoicePromotionQueue.map((row) => {
    const signoff = getEInvoiceCountryProductionSignoff(row.countryCode);
    return {
      row,
      signoff,
      signoffSummary: summarizeEInvoiceProductionSignoff(signoff),
    };
  });
  const gateBacklog = queueRows.reduce<Record<string, number>>((acc, entry) => {
    entry.signoffSummary.pendingGateLabels.forEach((label) => {
      acc[label] = (acc[label] || 0) + 1;
    });
    return acc;
  }, {});
  const topGateBacklog = Object.entries(gateBacklog).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const counts = summarize(allRows);
  const filteredRows = allRows.filter((row) => {
    if (selectedState !== "ALL" && row.launchState !== selectedState) return false;
    if (!query) return true;
    return (
      row.countryCode.toLowerCase().includes(query) ||
      row.countryName.toLowerCase().includes(query) ||
      row.blockers.some((blocker) => blocker.toLowerCase().includes(query))
    );
  });
  const exportParams = new URLSearchParams();
  exportParams.set("format", "csv");
  if (selectedState !== "ALL") exportParams.set("state", selectedState);
  if (query) exportParams.set("q", query);
  const exportHref = `/api/admin/invoicing-readiness/export?${exportParams.toString()}`;
  const pageText = (text: LocalizedText) => getLocalizedText(text, language);

  const intro = getLocalizedText(
    {
      en: "One laúnch state per country. This is the only view that matters for go-live decisions.",
      fr: "Un etat de lancement par pays. C est la seule vue qui compte pour les decisions de mise en production.",
      de: "Ein Laúnch-Status pro Land. Das ist die einzige Ansicht, die für Go-Live-Entscheidungen zaehlt.",
      es: "Un estado de lanzamiento por pais. Esta es la unica vista que importa para decidir salidas a producción.",
      pt: "Um estado de lançamento por pais. Esta e a unica vista que importa para decidir entradas em produção.",
    },
    language
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {pageText({ en: "Admin", fr: "Admin", de: "Admin", es: "Admin", pt: "Admin" })}
            </p>
            <h1 className="text-3xl font-semibold text-foreground">
              {pageText({
                en: "Invoicing Readiness",
                fr: "Preparation de facturation",
                de: "Abrechnungsbereitschaft",
                es: "Preparacion de facturación",
                pt: "Preparacao de faturação",
              })}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={exportHref}>
              <Button variant="secondary" size="sm">
                {pageText({
                  en: "Export CSV",
                  fr: "Exporter CSV",
                  de: "CSV exportieren",
                  es: "Exportar CSV",
                  pt: "Exportar CSV",
                })}
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="secondary" size="sm">
                {pageText({
                  en: "Back To Admin",
                  fr: "Retour a l admin",
                  de: "Zurück zum Adminbereich",
                  es: "Volver a admin",
                  pt: "Voltar ao admin",
                })}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATE_ORDER.map((state) => (
            <div key={state} className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{state.replace(/_/g, " ")}</p>
                <Badge variant={stateBadgeVariant(state)}>{counts[state]}</Badge>
              </div>
            </div>
          ))}
        </div>

        <form className="mt-6 flex flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {(["ALL", ...STATE_ORDER] as const).map((state) => {
              const isActive = selectedState === state;
              const href =
                state === "ALL"
                  ? `/admin/invoicing-readiness${query ? `?q=${encodeURIComponent(query)}` : ""}`
                  : `/admin/invoicing-readiness?state=${encodeURIComponent(state)}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
              return (
                <Link key={state} href={href}>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                      isActive
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {state.replace(/_/g, " ")}
                  </span>
                </Link>
              );
            })}
          </div>
          <input
            type="search"
            name="q"
            defaultValue={String(resolvedSearchParams?.q || "")}
            placeholder={pageText({
              en: "Search country, code, or blocker",
              fr: "Rechercher un pays, code ou blocage",
              de: "Land, Code oder Blocker suchen",
              es: "Buscar pais, código o bloqueo",
              pt: "Procurar pais, código ou bloqueio",
            })}
            className="h-10 min-w-[260px] rounded-2xl border border-border bg-background px-4 text-sm text-foreground"
          />
          {selectedState !== "ALL" ? <input type="hidden" name="state" value={selectedState} /> : null}
          <Button size="sm" type="submit">
            {pageText({ en: "Apply", fr: "Appliquer", de: "Anwenden", es: "Aplicar", pt: "Aplicar" })}
          </Button>
        </form>
      </section>

      {queueRows.length > 0 ? (
        <section className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">
              {pageText({
                en: "Manual Review Queue",
                fr: "File de revision manuelle",
                de: "Warteschlange für manuelle Prüfung",
                es: "Cola de revision manual",
                pt: "Fila de revisao manual",
              })}
            </p>
            <h2 className="text-xl font-semibold text-foreground">
              {pageText({
                en: "E-Invoicing Production Promotion",
                fr: "Promotion en production de la facturation electronique",
                de: "Produktionsfreigabe für E-Rechnungen",
                es: "Promocion a producción de facturación electronica",
                pt: "Promocao para produção da faturação eletronica",
              })}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {pageText({
                en: "These countries are blocked on explicit go-live signoff. Transport is wired. The remaining work is schema, legal, certification, and operator readiness.",
                fr: "Ces pays restent bloques en attente d une validation explicite de mise en production. Le transport est pret. Le travail restant concerne le schema, le juridique, la certification et la preparation des operations.",
                de: "Diese Lander sind bis zur expliziten Go-Live-Freigabe blockiert. Der Transport ist angebunden. Offen sind noch Schema, Recht, Zertifizierung und operative Bereitschaft.",
                es: "Estos paises estan bloqueados hasta obtener una aprobacion explicita de salida a producción. El transporte ya esta conectado. Falta esquema, legal, certificacion y preparacion operativa.",
                pt: "Estes paises estão bloqueados até existir aprovacao explicita para entrada em produção. O transporte ja esta ligado. Falta esquema, juridico, certificacao e prontidao operaciónal.",
              })}
            </p>
          </div>
          {topGateBacklog.length > 0 ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {topGateBacklog.map(([label, count]) => (
                <div key={label} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {pageText({
                      en: "Missing gate",
                      fr: "Validation manquante",
                      de: "Fehlendes Gate",
                      es: "Paso faltante",
                      pt: "Etapa em falta",
                    })}
                  </div>
                  <div className="mt-2 font-medium text-foreground">{label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{`${count} countries blocked`}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {queueRows.map(({ row, signoff, signoffSummary }) => (
              <div key={row.countryCode} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{row.countryName}</div>
                    <div className="text-xs text-muted-foreground">
                      {`${row.countryCode} • Priority ${row.eInvoicePromotionPriority || "N/A"} • ${row.eInvoiceProviderKey || "Missing provider"}`}
                    </div>
                  </div>
                  <Badge variant="warning">
                    {row.eInvoicePromotionState?.replace(/_/g, " ") || "PENDING"}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {row.eInvoiceCompletionStage ? `Stage ${row.eInvoiceCompletionStage}` : "No completion stage recorded"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {`Gate progress ${signoffSummary.passedCount}/${signoffSummary.totalCount} | Evidence ${signoff?.evidenceCount || 0}`}
                </div>
                {signoffSummary.pendingGateLabels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {signoffSummary.pendingGateLabels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
                  {row.blockers[0] || "No blocker recorded"}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/70 bg-card p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/25 text-left text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <th className="px-4 py-3">{pageText({ en: "Country", fr: "Pays", de: "Land", es: "Pais", pt: "Pais" })}</th>
                <th className="px-4 py-3">{pageText({ en: "Laúnch", fr: "Lancement", de: "Laúnch", es: "Lanzamiento", pt: "Lancamento" })}</th>
                <th className="px-4 py-3">{pageText({ en: "Support", fr: "Support", de: "Support", es: "Soporte", pt: "Suporte" })}</th>
                <th className="px-4 py-3">{pageText({ en: "Blueprint", fr: "Blueprint", de: "Blueprint", es: "Blueprint", pt: "Blueprint" })}</th>
                <th className="px-4 py-3">{pageText({ en: "E-Invoice", fr: "E-facture", de: "E-Rechnung", es: "Factura electronica", pt: "Fatura eletronica" })}</th>
                <th className="px-4 py-3">{pageText({ en: "Reviewed", fr: "Revu", de: "Geprüft", es: "Revisado", pt: "Revisto" })}</th>
                <th className="px-4 py-3">{pageText({ en: "Top blockers", fr: "Principaux blocages", de: "Wichtigste Blocker", es: "Bloqueos principales", pt: "Principais bloqueios" })}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const signoff = getEInvoiceCountryProductionSignoff(row.countryCode);
                const signoffSummary = summarizeEInvoiceProductionSignoff(signoff);
                const regulatoryReview = getCountryRegulatoryReview(row.countryCode);
                return (
                <tr key={row.countryCode} className="border-b border-border/50 align-top last:border-b-0">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-foreground">{row.countryName}</div>
                    <div className="text-xs text-muted-foreground">{row.countryCode}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={stateBadgeVariant(row.launchState)}>
                      {row.launchState.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">{row.supportLevel || "UNKNOWN"}</div>
                    <div className="text-xs text-muted-foreground">{row.taxSystem || "No tax system"}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">
                      {row.activeBlueprintImplementation || "NONE"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {`Researched: ${row.researchedBlueprintImplementation || "NONE"} • Evidence: ${row.evidenceCount}`}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">
                      {row.requiresEInvoicing ? row.eInvoiceProviderKey || "Missing provider" : "Not required"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.requiresEInvoicing
                        ? `${row.eInvoiceCompletionStage || "NO_STAGE"} • Production ${row.eInvoiceProductionReady ? "ready" : "not ready"}`
                        : "No mandatory e-invoicing"}
                    </div>
                    {row.requiresEInvoicing ? (
                      <div className="text-xs text-muted-foreground">
                        {`${row.eInvoicePromotionState || "PENDING"}${row.eInvoicePromotionPriority ? ` | P${row.eInvoicePromotionPriority}` : ""}${signoffSummary.totalCount ? ` | Gates ${signoffSummary.passedCount}/${signoffSummary.totalCount}` : ""}${signoff?.evidenceCount ? ` | Signoff evidence ${signoff.evidenceCount}` : ""}`}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">
                      {regulatoryReview?.lastReviewedAt || row.eInvoiceProductionReviewedAt || row.lastReviewedAt || "Not reviewed"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {regulatoryReview
                        ? `Next ${regulatoryReview.nextReviewDueAt || "Unscheduled"} | ${regulatoryReview.owner} | Sources ${regulatoryReview.sourceEvidenceCount}`
                        : "No review schedule"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {row.blockers.length > 0 ? (
                      <div className="space-y-2">
                        {row.blockers.slice(0, 2).map((blocker) => (
                          <div key={blocker} className="max-w-[420px] rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                            {blocker}
                          </div>
                        ))}
                        {signoffSummary.pendingGateLabels.slice(0, 2).map((label) => (
                          <div key={label} className="max-w-[420px] rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                            {`Pending gate: ${label}`}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-emerald-600 dark:text-emerald-300">
                        {pageText({ en: "No blockers", fr: "Aucun blocage", de: "Keine Blocker", es: "Sin bloqueos", pt: "Sem bloqueios" })}
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">
            {pageText({
              en: "No countries matched the current filter.",
              fr: "Aucun pays ne correspond au filtre actuel.",
              de: "Kein Land entspricht dem aktuellen Filter.",
              es: "Ningun pais coincide con el filtro actual.",
              pt: "Nenhum pais corresponde ao filtro atual.",
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
