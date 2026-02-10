import { Card } from "@/components/ui/card";
import { LangText } from "@/components/ui/lang-text";
import { getCountryName } from "@/lib/countries";
import { formatCurrency } from "@/lib/currency";
import { formatDateDMY } from "@/lib/date";
import { InvoiceItem } from "@/lib/invoice";
import {
  INVOICE_TOTALS_GAP,
  INVOICE_TOTALS_LABEL_WIDTH,
  INVOICE_TOTALS_MAX_WIDTH,
  INVOICE_TOTALS_VALUE_WIDTH,
} from "@/lib/invoice-totals-layout";

type InvoicePreviewProps = {
  invoiceNumber: string;
  status: string;
  issuedAt: Date;
  dueDate?: Date | null;
  currency: string;
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    vatRate?: number;
    vatEnabled?: boolean;
    vatMode?: string;
  };
  paymentLink?: string | null;
  logoDataUrl?: string | null;
  business: {
    businessName: string;
    country?: string | null;
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
  };
  billTo?: {
    name?: string | null;
    email?: string | null;
    address?: string | null;
    type?: "INDIVIDUAL" | "BUSINESS" | null;
    companyName?: string | null;
    taxId?: string | null;
  } | null;
  note?: string | null;
};

export function InvoicePreview(props: InvoicePreviewProps) {
  const normalizedStatus = String(props.status || "").toUpperCase();
  const displayStatus = normalizedStatus === "PAID" ? "PAID" : "DUE";
  const statusFrMap: Record<string, string> = { DUE: "EN ATTENTE", PAID: "PAYE" };
  const statusFr = statusFrMap[displayStatus] ?? displayStatus;
  const showTax = Boolean(props.totals.vatEnabled) && Number(props.totals.vatRate || 0) > 0;
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  const formatCountryName = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.length === 2) return getCountryName(raw.toUpperCase(), "en");
    return raw;
  };
  const rawBusinessAddress = props.business.businessAddress?.trim() || "";
  const businessCountry = formatCountryName(props.business.country);
  const businessAddress = rawBusinessAddress
    ? businessCountry &&
      !rawBusinessAddress.toLowerCase().includes(businessCountry.toLowerCase())
      ? `${rawBusinessAddress}, ${businessCountry}`
      : rawBusinessAddress
    : businessCountry;
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-8 p-8 pt-10 max-md:p-5">
        <div className="grid grid-cols-[1fr_auto] items-start gap-6">
          <div className="flex items-start gap-4">
            {props.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.logoDataUrl}
                alt={`${props.business.businessName} logo`}
                className="h-16 w-16 rounded-xl object-contain"
              />
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">{t("Invoice", "Facture")}</p>
              <h2 className="text-3xl font-semibold text-foreground">{props.business.businessName}</h2>
              {props.business.businessEmail && (
                <p className="text-sm text-muted-foreground">{props.business.businessEmail}</p>
              )}
              {businessAddress ? (
                <p className="text-sm text-muted-foreground">{businessAddress}</p>
              ) : null}
            </div>
          </div>
          <div className="flex w-full max-w-[260px] flex-col items-end gap-2 text-sm text-muted-foreground text-right">
            <div className="inline-flex items-baseline justify-end gap-2">
              <span className="font-semibold text-foreground">{t("Invoice No:", "Facture n°")}</span>
              <span className="text-foreground">{props.invoiceNumber}</span>
            </div>
            <div className="inline-flex items-baseline justify-end gap-2">
              <span className="font-semibold text-foreground">{t("Date:", "Date:")}</span>
              <span className="text-foreground">{formatDateDMY(props.issuedAt)}</span>
            </div>
            {props.dueDate ? (
              <div className="inline-flex items-baseline justify-end gap-2">
                <span className="font-semibold text-foreground">{t("Due Date:", "Echeance:")}</span>
                <span className="text-foreground">{formatDateDMY(props.dueDate)}</span>
              </div>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                displayStatus === "PAID"
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-amber-500/15 text-amber-700"
              }`}
            >
              <LangText en={displayStatus} fr={statusFr} />
            </span>
          </div>
        </div>

        <div className="h-px w-full bg-border/70 invoice-section" />

        <div className="invoice-section grid grid-cols-2 gap-6 text-sm text-foreground">
          <div className="w-full rounded-2xl border border-border/60 bg-background/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
              {t("Billed To", "Facture a")}
            </p>
            <div className="mt-3 space-y-1">
              <p className="font-semibold text-foreground">
                {props.billTo?.name ?? <LangText en="Customer" fr="Client" />}
              </p>
              {props.billTo?.email && <p>{props.billTo.email}</p>}
              {props.billTo?.companyName && <p>{props.billTo.companyName}</p>}
              {props.billTo?.address && <p>{props.billTo.address}</p>}
              {props.billTo?.taxId && <p>{t("Tax ID", "ID fiscal")}: {props.billTo.taxId}</p>}
            </div>
          </div>
          <div className="w-full rounded-2xl border border-border/60 bg-background/60 p-5 md:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
              {t("Invoiced By", "Facture par")}
            </p>
            <div className="mt-3 space-y-1">
              <p className="font-semibold text-foreground">{props.business.businessName}</p>
              {props.business.businessEmail && <p>{props.business.businessEmail}</p>}
              {businessAddress ? <p>{businessAddress}</p> : null}
              {props.business.taxId && <p>{t("Tax ID", "ID fiscal")}: {props.business.taxId}</p>}
            </div>
          </div>
        </div>

        <div className="invoice-section grid grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-muted/15 p-5">
            <h4 className="text-sm font-semibold text-foreground">{t("Invoice Details", "Details")}</h4>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{t("Description", "Description")}:</span>
                <span>{props.items.length === 1 ? props.items[0].name : `${props.items.length} items`}</span>
              </div>
            </div>
            {showTax ? (
              <div className="mt-4 rounded-xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">
                  {t("VAT", "TVA")} ({Number(props.totals.vatRate || 0).toFixed(1).replace(/\\.0$/, "")}%)
                </div>
                <div className="mt-1 text-foreground">{formatCurrency(props.totals.taxAmount, props.currency)}</div>
              </div>
            ) : null}
          </div>
          <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-muted/15 p-5">
            <h4 className="text-sm font-semibold text-foreground">{t("Amount Due", "Montant du")}</h4>
            <div className="mt-4 text-3xl font-semibold text-foreground">
              {formatCurrency(props.totals.total, props.currency)}
            </div>
            <div className="mt-4">
              {props.paymentLink ? (
                <a
                  href={props.paymentLink}
                  className="inline-flex w-full items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                >
                  {t("Pay Now", "Payer")}
                </a>
              ) : (
                <span className="inline-flex w-full items-center justify-center rounded-full border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
                  {t("Payment unavailable", "Paiement indisponible")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1.2fr_0.8fr] items-start gap-6">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60">
            <div className="grid min-w-0 grid-cols-[1.6fr_0.4fr_0.6fr_0.6fr] gap-2 border-b border-border/60 bg-muted/20 px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              <div className="min-w-0">{t("Description", "Description")}</div>
              <div className="text-center whitespace-nowrap">{t("Qty", "Qt")}</div>
              <div className="text-center whitespace-nowrap">{t("Unit Price", "Prix unitaire")}</div>
              <div className="text-center whitespace-nowrap">{t("Total", "Total")}</div>
            </div>
            <div className="divide-y divide-border">
              {props.items.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="grid min-w-0 grid-cols-[1.6fr_0.4fr_0.6fr_0.6fr] items-start gap-2 px-4 py-4 text-sm text-foreground"
                >
                  <div className="min-w-0 font-medium leading-relaxed break-words whitespace-normal">
                    {item.name}
                  </div>
                  <div className="text-center tabular-nums whitespace-nowrap">{item.quantity}</div>
                  <div className="text-center tabular-nums whitespace-nowrap">
                    {formatCurrency(item.price, props.currency)}
                  </div>
                  <div className="text-center tabular-nums whitespace-nowrap">
                    {formatCurrency(item.price * item.quantity, props.currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex w-full flex-col items-end justify-self-end">
            <div
              className="space-y-2 border-t border-border/60 pt-4 text-sm text-foreground whitespace-nowrap"
              style={{
                width:
                  INVOICE_TOTALS_LABEL_WIDTH + 70 + INVOICE_TOTALS_VALUE_WIDTH + 10,
              }}
            >
              <div
                className="grid items-center text-foreground"
                style={{
                  gridTemplateColumns: `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                  columnGap: 10,
                }}
              >
                <span className="whitespace-nowrap text-left font-semibold">
                  {t("Subtotal", "Sous-total")}
                </span>
                <span className="text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                  {formatCurrency(props.totals.subtotal, props.currency)}
                </span>
              </div>
              {showTax ? (
                <div
                  className="grid items-center text-foreground"
                  style={{
                    gridTemplateColumns: `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                    columnGap: 10,
                  }}
                >
                  <span className="whitespace-nowrap text-left font-semibold">
                    {t("Tax", "Taxe")}
                  </span>
                  <span className="text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                    {formatCurrency(props.totals.taxAmount, props.currency)}
                  </span>
                </div>
              ) : null}
              {props.totals.discountAmount > 0 && (
                <div
                  className="grid items-center text-foreground"
                  style={{
                    gridTemplateColumns: `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                    columnGap: 10,
                  }}
                >
                  <span className="whitespace-nowrap text-left font-semibold">
                    {t("Discount", "Remise")}
                  </span>
                  <span className="text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                    -{formatCurrency(props.totals.discountAmount, props.currency)}
                  </span>
                </div>
              )}
              <div
                className="mt-4 grid items-center text-lg font-semibold text-foreground"
                style={{
                  gridTemplateColumns: `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                  columnGap: 10,
                }}
              >
                <span className="whitespace-nowrap text-left">{t("Total Due", "Total du")}</span>
                <span className="text-right tabular-nums whitespace-nowrap">
                  {formatCurrency(props.totals.total, props.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="invoice-section rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          <div className="text-center">
            {t(
              "Please make the payment by the due date. Thank you for your business.",
              "Veuillez payer avant l'echeance. Merci pour votre confiance."
            )}
          </div>
          {/* Card network logos removed */}
        </div>

        {props.note ? (
          <div className="rounded-2xl border border-border bg-background/60 p-4 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">{t("Note", "Note")}</div>
            <div className="mt-1">{props.note}</div>
          </div>
        ) : null}

        <p className="invoice-section text-center text-xs font-semibold text-muted-foreground">
          {t("This invoice was generated with Maboria.", "Facture generee avec Maboria.")}
        </p>
      </div>
    </Card>
  );
}
