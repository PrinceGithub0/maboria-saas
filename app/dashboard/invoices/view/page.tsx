import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { Alert } from "@/components/ui/alert";
import {
  calculateTotalsFromAmounts,
  resolveInvoiceCustomer,
  normalizeInvoiceItems,
  getBusinessLogoDataUrl,
} from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { LangText } from "@/components/ui/lang-text";
import { getOrCreateInvoicePublicLink } from "@/lib/invoice-public-link";
import { normalizeVatSettings } from "@/lib/vat";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ searchParams }: PageProps) {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  if (!userId) {
    redirect("/login");
  }

  const resolvedSearchParams = await Promise.resolve(searchParams);
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
        <Alert variant="error">{t("Invalid invoice link.", "Lien de facture invalide.")}</Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          {t("Back to invoices", "Retour aux factures")}
        </Link>
      </div>
    );
  }

  const entitlement = await enforceEntitlement(userId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return (
      <div className="space-y-6">
        <Alert variant="error">
          {t("Access denied.", "Acces refuse.")}{" "}
          {entitlement.reason || t("Upgrade required to view invoices.", "Mise a niveau requise pour voir les factures.")}
        </Alert>
      </div>
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      userId,
      OR: candidates.flatMap((value) => [
        { id: value },
        { invoiceNumber: value },
        { invoiceNumber: { equals: value, mode: "insensitive" } },
      ]),
    },
  });

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          {t(
            "Invoice not found. It may have been deleted or the link is incorrect.",
            "Facture introuvable. Elle a peut-etre ete supprimee ou le lien est incorrect."
          )}
        </Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          {t("Back to invoices", "Retour aux factures")}
        </Link>
      </div>
    );
  }

  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  const currencyAllowed = isAllowedCurrency(normalizedCurrency);
  const metadata = (invoice.metadata as any) || {};
  let business = metadata.businessProfile;
  const customer = resolveInvoiceCustomer(metadata);
  const note = typeof metadata?.note === "string" ? metadata.note : null;
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
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
      vatPricingMode: true,
    },
  });
  if (profile) {
    business = profile;
  }
  if (business?.businessName && JSON.stringify(metadata.businessProfile || {}) !== JSON.stringify(business)) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        metadata: {
          ...metadata,
          businessProfile: business,
        },
      },
    });
  }
  const businessMissing = !business?.businessName;
  const items = normalizeInvoiceItems(invoice.items);
  const vatSettings = normalizeVatSettings({
    enabled: business?.vatEnabled ?? false,
    rate: business?.vatRate ? Number(business.vatRate) : 0,
    mode:
      String(business?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(items, vatSettings, Number(invoice.discount || 0));
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  const paymentLink = `/pay/invoice/${encodeURIComponent(publicLink.token)}`;
  const logoDataUrl = getBusinessLogoDataUrl(invoice.userId || userId);
  const downloadUrl = `/api/invoice/${encodeURIComponent(
    String(invoice.id)
  )}/pdf?fresh=1&v=${invoice.generatedAt?.getTime?.() ?? Date.now()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Invoices", "Factures")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            {t("Invoice", "Facture")} {invoice.invoiceNumber}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
          >
            {t("Back to invoices", "Retour aux factures")}
          </Link>
          {currencyAllowed && !businessMissing ? (
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
            >
              {t("Download PDF", "Telecharger PDF")}
            </a>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
              title="Fix invoice currency and business profile to enable PDF."
              aria-disabled="true"
            >
              {t("Download PDF", "Telecharger PDF")}
            </span>
          )}
        </div>
      </div>

      {!currencyAllowed && (
        <Alert variant="error">
          {t(
            "Invoice currency is invalid. Update the invoice currency before downloading a PDF.",
            "Devise invalide. Mettez a jour la devise avant de telecharger le PDF."
          )}
        </Alert>
      )}
      {businessMissing && (
        <Alert variant="error">
          {t(
            "Business profile snapshot is missing on this invoice. Please recreate the invoice.",
            "Profil entreprise manquant sur cette facture. Veuillez recreer la facture."
          )}
        </Alert>
      )}

      {currencyAllowed && !businessMissing ? (
        <InvoicePreview
          invoiceNumber={invoice.invoiceNumber}
          status={invoice.status}
          issuedAt={invoice.generatedAt}
          dueDate={dueDate}
          currency={normalizedCurrency}
          items={items}
          totals={totals}
          paymentLink={paymentLink}
          logoDataUrl={logoDataUrl}
          business={business}
          billTo={customer}
          note={note}
        />
      ) : null}
    </div>
  );
}
