import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { requireBillingAccess } from "@/lib/permissions";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { Alert } from "@/components/ui/alert";
import {
  resolveInvoiceCustomer,
  normalizeInvoiceItems,
  getBusinessLogoDataUrl,
  resolveInvoiceBusinessSnapshot,
  resolveStoredInvoiceTotals,
} from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { LangText } from "@/components/ui/lang-text";
import { getOrCreateInvoicePublicLink } from "@/lib/invoice-public-link";
import { deriveInvoiceDisplayStatus } from "@/lib/invoice-refund-status";
import { cookies } from "next/headers";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";
import { getInvoiceComplianceRecord } from "@/lib/invoicing/blueprint/read";
import { getCountryLaunchReadiness } from "@/lib/invoicing/country-readiness";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const isPayableStatus = (status: string) => ["SENT", "OVERDUE", "FAILED"].includes(String(status || "").toUpperCase());
const isFinalStatus = (status: string) => ["PAID", "CANCELED", "EXPIRED"].includes(String(status || "").toUpperCase());

export default async function InvoiceDetailPage({ searchParams }: PageProps) {
  const t = (en: string, fr: string, de?: string, es?: string, pt?: string) => (
    <LangText en={en} fr={fr} de={de} es={es} pt={pt} />
  );
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const pdfHint = getLocalizedText(
    {
      en: "Fix invoice currency and business profile to enable PDF.",
      fr: "Corrigez la devise et le profil entreprise pour activer le PDF.",
      de: "Korrigiere Rechnungswährung und Unternehmensprofil, um das PDF zu aktivieren.",
      es: "Corrige la divisa de la factura y el perfil de empresa para habilitar el PDF.",
      pt: "Corrija a moeda da fatura e o perfil da empresa para ativar o PDF.",
    },
    language
  );
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  if (!userId) {
    redirect("/login");
  }
  const access = await requireBillingAccess(userId);
  if (!access.ok) {
    return (
      <div className="space-y-6">
        <Alert variant="error">{t("Access denied.", "Accès refuse.", "Zugriff verweigert.", "Acceso denegado.", "Acesso negado.")}</Alert>
      </div>
    );
  }
  const targetUserId = access.ownerUserId;

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const readParam = (value?: string | string[]) =>
    typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const normalizeCandidate = (value?: string) => {
    if (!value) return "";
    const decoded = safeDecode(value).trim();
    const [base] = decoded.split("?")[0]?.split("&") ?? [decoded];
    return base?.replace(/^id=/i, "").trim() || "";
  };
  const candidates = [readParam(resolvedSearchParams?.id), readParam(resolvedSearchParams?.n)]
    .map(normalizeCandidate)
    .filter(Boolean);
  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{t("Invalid invoice link.", "Lien de facture invalide.", "Ungültiger Rechnungslink.", "Enlace de factura no valido.", "Liga??o de fatura invalida.")}</Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          {t("Back to invoices", "Retour aux factures", "Zurück zu Rechnungen", "Volver a facturas", "Voltar a faturas")}
        </Link>
      </div>
    );
  }

  const entitlement = await enforceEntitlement(targetUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return (
      <div className="space-y-6">
        <Alert variant="error">
          {t("Access denied.", "Accès refuse.", "Zugriff verweigert.", "Acceso denegado.", "Acesso negado.")}{" "}
          {entitlement.reason ||
            t(
              "Upgrade required to view invoices.",
              "Mise a niveau requise pour voir les factures.",
              "Upgrade erforderlich, um Rechnungen anzusehen.",
              "Se requiere una mejora para ver las facturas.",
              "E necessario fazer upgrade para ver as faturas."
            )}
        </Alert>
      </div>
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      userId: targetUserId,
      subscriptionId: null,
      OR: candidates.flatMap((value) => [
        { id: value },
        { invoiceNumber: value },
        { invoiceNumber: { equals: value, mode: "insensitive" } },
        { metadata: { path: ["invoiceNumberAliases"], array_contains: [value] } },
      ]),
    },
    include: {
      invoicePayments: {
        select: {
          status: true,
          refundOfId: true,
          amount: true,
          amountOriginal: true,
        },
      },
    },
  });

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          {t(
            "Invoice not found. It may have been deleted or the link is incorrect.",
            "Facture introuvable. Elle a peut-\u00eatre \u00e9t\u00e9 supprim\u00e9e ou le lien est incorrect.",
            "Rechnung nicht gefunden. Sie wurde moglicherweise gelöscht oder der Link ist falsch.",
            "No se encontro la factura. Puede que se haya eliminado o que el enlace sea incorrecto.",
            "Fatura não encontrada. Pode ter sido eliminada ou a liga??o esta incorreta."
          )}
        </Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          {t("Back to invoices", "Retour aux factures", "Zurück zu Rechnungen", "Volver a facturas", "Voltar a faturas")}
        </Link>
      </div>
    );
  }

  const complianceRecord = await getInvoiceComplianceRecord(invoice.id);

  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  const currencyAllowed = isAllowedCurrency(normalizedCurrency);
  const metadata = (invoice.metadata as any) || {};
  const sellerCountryLaunch = getCountryLaunchReadiness(
    complianceRecord?.sellerCountryCode || metadata?.compliance?.sellerCountry || null
  );
  const businessSnapshot = resolveInvoiceBusinessSnapshot(invoice);
  const customer = resolveInvoiceCustomer(metadata);
  const note = typeof metadata?.note === "string" ? metadata.note : null;
  const poNumber =
    typeof invoice.poNumber === "string" && invoice.poNumber.trim()
      ? invoice.poNumber.trim()
      : typeof metadata?.poNumber === "string" && metadata.poNumber.trim()
        ? metadata.poNumber.trim()
        : null;
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
  const profile = businessSnapshot
    ? null
    : await prisma.businessProfile.findUnique({
        where: { userId: targetUserId },
        select: {
          businessName: true,
          country: true,
          defaultCurrency: true,
          businessAddress: true,
          businessEmail: true,
          businessPhone: true,
          taxId: true,
          vatEnabled: true,
          vatRate: true,
          vatRateDisplay: true,
          vatPricingMode: true,
        },
      });
  const normalizedProfile = profile
    ? {
        ...profile,
        vatRate: profile.vatRate !== null && profile.vatRate !== undefined ? Number(profile.vatRate) : null,
      }
    : null;
  const business = resolveInvoiceBusinessSnapshot(invoice, normalizedProfile);
  const businessMissing = !business?.businessName;
  const items = normalizeInvoiceItems(invoice.items);
  const totals = resolveStoredInvoiceTotals(invoice, business);
  const lateFeeAmount = Number(invoice.lateFeeTotalAccumulated || invoice.lateFeeAmount || 0);
  const totalDue = Number(invoice.total || 0);
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  const paymentLink =
    isPayableStatus(invoice.status) && !isFinalStatus(invoice.status)
      ? `/api/invoice/pay/${encodeURIComponent(publicLink.token)}`
      : null;
  const logoDataUrl = await getBusinessLogoDataUrl(invoice.userId || targetUserId);
  const downloadUrl = `/api/invoice/${encodeURIComponent(
    String(invoice.id)
  )}/pdf?fresh=1&v=${invoice.generatedAt?.getTime?.() ?? Date.now()}`;
  const displayStatus = deriveInvoiceDisplayStatus(invoice);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Invoices", "Factures", "Rechnungen", "Facturas", "Faturas")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            {t("Invoice", "Facture", "Rechnung", "Factura", "Fatura")} {invoice.invoiceNumber}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
          >
            {t("Back to invoices", "Retour aux factures", "Zurück zu Rechnungen", "Volver a facturas", "Voltar a faturas")}
          </Link>
          {currencyAllowed && !businessMissing ? (
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
            >
              {t("Download PDF", "Télécharger PDF", "PDF herunterladen", "Descargar PDF", "Transferir PDF")}
            </a>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
              title={pdfHint}
              aria-disabled="true"
            >
              {t("Download PDF", "Télécharger PDF", "PDF herunterladen", "Descargar PDF", "Transferir PDF")}
            </span>
          )}
        </div>
      </div>

      {!currencyAllowed && (
        <Alert variant="error">
          {t(
            "Invoice currency is invalid. Update the invoice currency before downloading a PDF.",
            "Devise invalide. Mettez a jour la devise avant de télécharger le PDF.",
            "Die Rechnungswährung ist unzulassig. Aktualisiere die Währung, bevor du ein PDF herunterladst.",
            "La moneda de la factura no es valida. Actualiza la moneda antes de descargar el PDF.",
            "A moeda da fatura e invalida. Atualize a moeda antes de transferir o PDF."
          )}
        </Alert>
      )}
      {businessMissing && (
        <Alert variant="error">
          {t(
            "Business profile snapshot is missing on this invoice. Please recreate the invoice.",
            "Profil entreprise manquant sur cette facture. Veuillez recreer la facture.",
            "Der Snapshot des Unternehmensprofils fehlt auf dieser Rechnung. Bitte erstelle die Rechnung erneut.",
            "Falta la instantanea del perfil de empresa en esta factura. Vuelve a crear la factura.",
            "Falta o snapshot do perfil da empresa nesta fatura. Crie a fatura novamente."
          )}
        </Alert>
      )}

      {currencyAllowed && !businessMissing ? (
        <InvoicePreview
          invoiceNumber={invoice.invoiceNumber}
          poNumber={poNumber}
          status={displayStatus}
          issuedAt={invoice.generatedAt}
          dueDate={dueDate}
          currency={normalizedCurrency}
          items={items}
          totals={totals}
          lateFeeAmount={lateFeeAmount}
          totalDue={totalDue}
          paymentLink={paymentLink}
          logoDataUrl={logoDataUrl}
          business={business}
          billTo={customer}
          note={note}
          compliance={(invoice.metadata as any)?.compliance || null}
          variant="dashboard"
        />
      ) : null}

      {complianceRecord ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/70">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t("Compliance", "Conformite", "Compliance", "Cumplimiento", "Conformidade")}
              </p>
              <h2 className="text-lg font-semibold text-foreground">
                {`Support level: ${String(complianceRecord.supportLevel || "UNKNOWN").toLowerCase()}`}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {`Seller: ${complianceRecord.sellerCountryCode || "N/A"} • Buyer: ${complianceRecord.buyerCountryCode || "N/A"} • Tax: ${complianceRecord.taxSystem || "N/A"}`}
              </p>
              {sellerCountryLaunch ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {`Country launch state: ${sellerCountryLaunch.launchState.toLowerCase().replace(/_/g, " ")}${sellerCountryLaunch.lastReviewedAt ? ` • Reviewed: ${sellerCountryLaunch.lastReviewedAt}` : ""}`}
                </p>
              ) : null}
            </div>
            <div className="inline-flex flex-col items-end gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{`Errors: ${complianceRecord.blockingIssueCount || 0}`}</span>
              <span>{`Warnings: ${complianceRecord.warningIssueCount || 0}`}</span>
              <span>{`Info: ${complianceRecord.infoIssueCount || 0}`}</span>
            </div>
          </div>
          {Number(complianceRecord.blockingIssueCount || 0) > 0 ? (
            <div className="mt-4">
              <Alert variant="error">
                {t(
                  "Compliance blockers detected. Resolve the errors before sending this invoice.",
                  "Blocages de conformite detectes. Corrigez les erreurs avant l envoi.",
                  "Compliance-Fehler gefunden. Behebe sie vor dem Versand.",
                  "Se detectaron bloqueos de cumplimiento. Corrige los errores antes de enviar.",
                  "Bloqueios de conformidade detectados. Corrija os erros antes de enviar."
                )}
              </Alert>
            </div>
          ) : null}
          {sellerCountryLaunch && sellerCountryLaunch.launchState !== "LIVE" && sellerCountryLaunch.blockers.length > 0 ? (
            <div className="mt-4 space-y-2">
              {sellerCountryLaunch.blockers.slice(0, 2).map((blocker) => (
                <Alert key={blocker} variant="info">
                  {blocker}
                </Alert>
              ))}
            </div>
          ) : null}
          {Array.isArray(complianceRecord.issues) && complianceRecord.issues.length > 0 ? (
            <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {complianceRecord.issues.slice(0, 3).map((issue: any) => (
                <div key={issue.id} className="flex items-start justify-between gap-3">
                  <span>{issue.message}</span>
                  <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    {String(issue.severity || "info")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
