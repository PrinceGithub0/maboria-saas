import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveInvoicePublicLink } from "@/lib/invoice-public-link";
import {
  normalizeInvoiceItems,
  resolveInvoiceCustomer,
  getBusinessLogoDataUrl,
  resolveInvoiceBusinessSnapshot,
  resolveStoredInvoiceTotals,
} from "@/lib/invoice";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { formatCurrency } from "@/lib/currency";
import { deriveInvoiceDisplayStatus } from "@/lib/invoice-refund-status";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const isPayableStatus = (status: string) => ["SENT", "OVERDUE", "FAILED"].includes(status);
const isFinalStatus = (status: string) => ["PAID", "CANCELED", "EXPIRED"].includes(status);

export default async function PublicInvoicePage({ params, searchParams }: PageProps) {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const t = (en: string, fr?: string, de?: string, es?: string, pt?: string) =>
    getLocalizedText({ en, fr, de, es, pt }, language);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawToken = resolvedParams?.token;
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) notFound();

  const link = await resolveInvoicePublicLink(token);
  if (!link?.invoice) notFound();

  const invoice = link.invoice;
  const metadata = (invoice.metadata as any) || {};
  const paymentSnapshot =
    metadata?.payment && typeof metadata.payment === "object" ? metadata.payment : null;
  const paymentProvider = String(paymentSnapshot?.provider || "").toUpperCase();
  const paymentProviderLabel =
    paymentProvider === "PAYSTACK"
      ? "Paystack"
      : paymentProvider === "FLUTTERWAVE"
        ? "Flutterwave"
        : null;
  const customer = resolveInvoiceCustomer(metadata);
  const note = typeof metadata?.note === "string" ? metadata.note : null;
  const poNumber =
    typeof invoice.poNumber === "string" && invoice.poNumber.trim()
      ? invoice.poNumber.trim()
      : typeof metadata?.poNumber === "string" && metadata.poNumber.trim()
        ? metadata.poNumber.trim()
        : null;
  const businessSnapshot = metadata.businessProfile || null;
  const business =
    businessSnapshot ||
    (await prisma.businessProfile.findUnique({
      where: { userId: invoice.userId },
      select: {
        businessName: true,
        country: true,
        defaultCurrency: true,
        businessEmail: true,
        businessPhone: true,
        businessAddress: true,
        taxId: true,
        vatEnabled: true,
        vatRate: true,
        vatRateDisplay: true,
        vatPricingMode: true,
      },
    }));

  const normalizedCurrency = normalizeCurrency(invoice.currency || business?.defaultCurrency || "USD");
  if (!isAllowedCurrency(normalizedCurrency)) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-foreground">
          {t(
            "This invoice has an unsupported currency. Please contact the sender.",
            "Cette facture utilis? une devise non prise en charge. Veuillez contacter l'exp?diteur.",
            "Diese Rechnung verwendet eine nicht unterstutzte Währung. Bitte kontaktiere den Absender.",
            "Esta factura usa una moneda no compatible. Contacta con el emisor.",
            "Esta fatura utiliza uma moeda não suportada. Contacte o remetente."
          )}
        </div>
      </div>
    );
  }

  const dueDateRaw = metadata?.dueDate ? new Date(metadata.dueDate) : null;
  const dueDate = dueDateRaw && !Number.isNaN(dueDateRaw.getTime()) ? dueDateRaw : null;

  const items = normalizeInvoiceItems(invoice.items);
  const resolvedBusiness = resolveInvoiceBusinessSnapshot(invoice, business);
  const totals = resolveStoredInvoiceTotals(invoice, resolvedBusiness);
  const lateFeeAmount = Number(invoice.lateFeeTotalAccumulated || invoice.lateFeeAmount || 0);
  const totalDue = Number(invoice.total || 0);
  const displayStatus = deriveInvoiceDisplayStatus(invoice);

  const payable = isPayableStatus(invoice.status) && !link.usedAt && !isFinalStatus(invoice.status);
  const paymentLink = payable ? `/api/invoice/pay/${encodeURIComponent(token)}` : null;
  const logoDataUrl = await getBusinessLogoDataUrl(invoice.userId || "");
  const invoicePath = `/pay/invoice/${encodeURIComponent(token)}`;
  const isPaid = resolvedSearchParams?.status === "paid";
  const isFailed = resolvedSearchParams?.status === "failed";

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
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
        paymentProviderLabel={paymentProviderLabel}
        logoDataUrl={logoDataUrl}
        business={{
          businessName: resolvedBusiness?.businessName || "Business",
          country: resolvedBusiness?.country,
          businessEmail: resolvedBusiness?.businessEmail,
          businessAddress: resolvedBusiness?.businessAddress,
          businessPhone: resolvedBusiness?.businessPhone,
          taxId: resolvedBusiness?.taxId,
          vatRateDisplay: resolvedBusiness?.vatRateDisplay,
        }}
        billTo={customer}
        note={note}
        compliance={(invoice.metadata as any)?.compliance || null}
      />

      {isPaid ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <p className="text-base font-semibold">{t("Payment confirmed", "Paiement confirme", "Zahlung bestatigt", "Pago confirmado", "Pagamento confirmado")}</p>
          <p className="mt-1 text-sm text-emerald-800">
            {t(
              "Your payment was received successfully and your invoice is now marked as paid.",
              "Votre paiement a bien \u00e9t\u00e9 re\u00e7u et votre facture est maintenant marqu\u00e9e comme pay\u00e9e.",
              "Deine Zahlung wurde erfolgreich erhalten und deine Rechnung ist nun als bezahlt markiert.",
              "Tu pago se recibio correctamente y tu factura ya figura como pagada.",
              "O seu pagamento foi recebido com sucesso e a sua fatura esta agora marcada como paga."
            )}
          </p>
          <div className="mt-4 grid gap-2 rounded-xl border border-emerald-200/80 bg-white/80 p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700/80">{t("Invoice", "Facture", "Rechnung", "Factura", "Fatura")}</p>
              <p className="font-semibold text-emerald-950">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700/80">{t("Amount paid", "Montant paye", "Bezahlter Betrag", "Importe pagado", "Montante pago")}</p>
              <p className="font-semibold text-emerald-950">
                {formatCurrency(totalDue, normalizedCurrency)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700/80">{t("Payment provider", "Fournisseur de paiement", "Zahlungsanbieter", "Proveedor de pago", "Fornecedor de pagamento")}</p>
              <p className="font-semibold text-emerald-950">{paymentProviderLabel || t("Secure checkout", "Paiement s?curis?", "Sicherer Checkout", "Pago seguro", "Checkout seguro")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700/80">{t("Receipt", "Recu", "Beleg", "Recibo", "Recibo")}</p>
              <p className="font-semibold text-emerald-950">{t("Sent to the available email address", "Envoy\u00e9 \u00e0 l'adresse e-mail disponible", "An die verf\u00fcgbare E-Mail-Adresse gesendet", "Enviado a la direcci?n de correo disponible", "Enviado para o endereco de email dispon\u00edvel")}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={invoicePath}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              {t("View invoice", "Voir la facture", "Rechnung ansehen", "Ver factura", "Ver fatura")}
            </Link>
            <Link
              href={invoicePath}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              {t("Return to business", "Retour \u00e0 l'entreprise", "Zur\u00fcck zum Unternehmen", "Volver al negocio", "Voltar ao negocio")}
            </Link>
          </div>
        </div>
      ) : null}
      {isFailed ? (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t(
            "Payment could not be confirmed. Please try again or contact the sender.",
            "Le paiement n'a pas pu être confirme. Veuillez réessayer ou contacter l'exp?diteur.",
            "Die Zahlung konnte nicht bestatigt werden. Bitte versuche es erneut oder kontaktiere den Absender.",
            "No se pudo confirmar el pago. Intentalo de nuevo o contacta con el emisor.",
            "Não foi poss?vel confirmar o pagamento. Tente novamente ou contacte o remetente."
          )}
        </div>
      ) : null}

      <div className="mt-8 text-center text-xs text-muted-foreground">
        <div>{t("This invoice was generated by Maboria.", "Cette facture a \u00e9t\u00e9 g\u00e9n\u00e9r\u00e9e par Maboria.", "Diese Rechnung wurde von Maboria erstellt.", "Esta factura fue generada por Maboria.", "Esta fatura foi gerada pela Maboria.")}</div>
        <div>
          <Link href="https://www.maboria.com" className="underline">
            www.maboria.com
          </Link>
        </div>
      </div>
    </div>
  );
}
