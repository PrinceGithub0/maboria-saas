import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { Alert } from "@/components/ui/alert";
import { InvoiceItem, calculateTotalsFromAmounts, resolveInvoiceCustomer } from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ searchParams }: PageProps) {
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
        <Alert variant="error">Invalid invoice link.</Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          Back to invoices
        </Link>
      </div>
    );
  }

  const entitlement = await enforceEntitlement(userId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: true,
  });
  if (!entitlement.ok) {
    return (
      <div className="space-y-6">
        <Alert variant="error">
          Access denied. {entitlement.reason || "Upgrade required to view invoices."}
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
          Invoice not found. It may have been deleted or the link is incorrect.
        </Alert>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
        >
          Back to invoices
        </Link>
      </div>
    );
  }

  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  const currencyAllowed = isAllowedCurrency(normalizedCurrency);
  const metadata = (invoice.metadata as any) || {};
  let business = metadata.businessProfile;
  const customer = resolveInvoiceCustomer(metadata);
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
  if (!business?.businessName) {
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
      },
    });
    if (profile) {
      business = profile;
    }
  }
  const businessMissing = !business?.businessName;
  const items = (invoice.items as InvoiceItem[]) || [];
  const totals = calculateTotalsFromAmounts(
    items,
    Number(invoice.tax || 0),
    Number(invoice.discount || 0)
  );
  const downloadUrl = `/api/invoice/${encodeURIComponent(
    String(invoice.id)
  )}/pdf?fresh=1&v=${invoice.updatedAt?.getTime?.() ?? Date.now()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            Invoices
          </p>
          <h1 className="text-3xl font-semibold text-foreground">Invoice {invoice.invoiceNumber}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:brightness-95"
          >
            Back to invoices
          </Link>
          {currencyAllowed && !businessMissing ? (
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
            >
              Download PDF
            </a>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
              title="Fix invoice currency and business profile to enable PDF."
              aria-disabled="true"
            >
              Download PDF
            </span>
          )}
        </div>
      </div>

      {!currencyAllowed && (
        <Alert variant="error">
          Invoice currency is invalid. Update the invoice currency before downloading a PDF.
        </Alert>
      )}
      {businessMissing && (
        <Alert variant="error">
          Business profile snapshot is missing on this invoice. Please recreate the invoice.
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
          business={business}
          billTo={customer}
        />
      ) : null}
    </div>
  );
}
