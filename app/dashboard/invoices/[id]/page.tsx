import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { Alert } from "@/components/ui/alert";
import { InvoiceItem, calculateTotalsFromAmounts } from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

type Params = { params: { id: string } };

export default async function InvoiceDetailPage({ params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const entitlement = await enforceEntitlement(session.user.id, {
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
    where: { id: params.id, userId: session.user.id },
  });
  if (!invoice) {
    notFound();
  }

  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  const currencyAllowed = isAllowedCurrency(normalizedCurrency);
  const metadata = (invoice.metadata as any) || {};
  const business = metadata.businessProfile;
  const customer = metadata.customer || null;
  const businessMissing = !business?.businessName;
  const items = (invoice.items as InvoiceItem[]) || [];
  const totals = calculateTotalsFromAmounts(
    items,
    Number(invoice.tax || 0),
    Number(invoice.discount || 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Invoices</p>
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
            <Link
              href={`/api/invoice/${invoice.id}/pdf`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
            >
              Download PDF
            </Link>
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
