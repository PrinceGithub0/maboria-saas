import { Card } from "@/components/ui/card";
import { LangText } from "@/components/ui/lang-text";
import { parseBusinessAddress } from "@/lib/address";
import { getCountryName } from "@/lib/countries";
import { formatCurrency } from "@/lib/currency";
import { formatDateDMY } from "@/lib/date";
import { InvoiceItem } from "@/lib/invoice";
import {
  INVOICE_TOTALS_LABEL_WIDTH,
  INVOICE_TOTALS_VALUE_WIDTH,
} from "@/lib/invoice-totals-layout";
import { formatVatRateLabel } from "@/lib/vat";

type InvoicePreviewProps = {
  invoiceNumber: string;
  poNumber?: string | null;
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
    vatRate?: number | null;
    vatEnabled?: boolean | null;
    vatMode?: string | null;
  };
  lateFeeAmount?: number;
  totalDue?: number;
  paymentLink?: string | null;
  paymentProviderLabel?: string | null;
  logoDataUrl?: string | null;
  business: {
    businessName: string;
    country?: string | null;
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
    vatRateDisplay?: string | null;
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
  variant?: "default" | "dashboard" | "compact";
};

const getSingleLineAmountClass = (value: string, baseClass: string) => {
  const length = String(value || "").length;
  if (length >= 28) return `${baseClass} text-sm`;
  if (length >= 24) return `${baseClass} text-base`;
  if (length >= 20) return `${baseClass} text-[1.1rem]`;
  return baseClass;
};

const getSingleLineAmountStyle = (
  value: string,
  maxRem: number,
  minRem: number,
  shrinkFrom = 16,
  step = 0.075
) => {
  const length = String(value || "").length;
  const overflow = Math.max(0, length - shrinkFrom);
  const fontSize = Math.max(minRem, maxRem - overflow * step);
  return {
    fontSize: `${fontSize}rem`,
    letterSpacing: overflow > 8 ? "-0.03em" : overflow > 3 ? "-0.02em" : undefined,
  };
};

export function InvoicePreview(props: InvoicePreviewProps) {
  const previewVariant = props.variant ?? "default";
  const isCompactPreview = previewVariant === "compact";
  const normalizedStatus = String(props.status || "").toUpperCase();
  const statusPresentation = (() => {
    switch (normalizedStatus) {
      case "PAID":
        return {
          label: "PAID",
          fr: "PAYE",
          toneClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
        };
      case "REFUNDED":
        return {
          label: "REFUNDED",
          fr: "REMBOURSEE",
          toneClass: "bg-sky-500/15 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
        };
      case "PARTIALLY_REFUNDED":
        return {
          label: "PARTIALLY REFUNDED",
          fr: "PARTIELLEMENT REMBOURSEE",
          toneClass: "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
        };
      case "OVERDUE":
        return {
          label: "OVERDUE",
          fr: "EN RETARD",
          toneClass: "bg-rose-500/15 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        };
      case "FAILED":
        return {
          label: "FAILED",
          fr: "ECHEC",
          toneClass: "bg-rose-500/15 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        };
      case "CANCELED":
      case "CANCELLED":
        return {
          label: "CANCELED",
          fr: "ANNULEE",
          toneClass: "bg-slate-500/15 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
        };
      case "EXPIRED":
        return {
          label: "EXPIRED",
          fr: "EXPIREE",
          toneClass: "bg-slate-500/15 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
        };
      case "DRAFT":
        return {
          label: "DRAFT",
          fr: "BROUILLON",
          toneClass: "bg-slate-500/15 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
        };
      case "SENT":
        return {
          label: "DUE",
          fr: "EN ATTENTE",
          toneClass: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        };
      default:
        return {
          label: normalizedStatus || "DUE",
          fr: normalizedStatus || "EN ATTENTE",
          toneClass: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        };
    }
  })();
  const displayStatus = statusPresentation.label;
  const statusFr = statusPresentation.fr;
  const statusToneClass = statusPresentation.toneClass;
  const showTax = Boolean(props.totals.vatEnabled) && Number(props.totals.vatRate || 0) > 0;
  const lateFeeAmount = Math.max(0, Number(props.lateFeeAmount || 0));
  const totalDue = Number.isFinite(Number(props.totalDue))
    ? Number(props.totalDue)
    : Number(props.totals.total || 0);
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
  const businessAddressFields = parseBusinessAddress(rawBusinessAddress);
  const businessAddressLines = [
    businessAddressFields.streetAddress.trim(),
    [businessAddressFields.city.trim(), businessAddressFields.postalCode.trim()].filter(Boolean).join(" "),
    businessCountry,
  ].filter(Boolean);
  const billToAddressLines = (() => {
    const raw = String(props.billTo?.address || "").trim();
    if (!raw) return [];
    const parsed = parseBusinessAddress(raw);
    const parts = raw
      .split(/\r?\n|,/)
      .map((part) => part.trim())
      .filter(Boolean);
    const country = formatCountryName(parts.length > 3 ? parts[parts.length - 1] : "");
    const lines = [
      parsed.streetAddress.trim(),
      [parsed.city.trim(), parsed.postalCode.trim()].filter(Boolean).join(" "),
      country,
    ].filter(Boolean);
    return lines.length > 0 ? lines : parts;
  })();
  const paymentProviderLabel = String(props.paymentProviderLabel || "").trim();
  const formattedTotalDue = formatCurrency(totalDue, props.currency);
  const vatRateLabel = formatVatRateLabel(props.totals.vatRate, props.business.vatRateDisplay);
  const isDashboardDocument = previewVariant === "dashboard" && Array.isArray(props.items);
  const billToName = props.billTo?.name?.trim() || "Customer";
  const invoiceSummary =
    props.items.length === 1 ? props.items[0]?.name?.trim() || "1 item" : `${props.items.length} items`;

  if (isDashboardDocument) {
    return (
      <Card className="overflow-hidden border border-slate-200/80 bg-white p-0 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.3)] dark:border-slate-700/80 dark:bg-slate-950">
        <div className="flex min-h-[1050px] flex-col gap-8 p-7 sm:min-h-[1120px] sm:p-10">
          <div className="grid gap-8 border-b border-slate-200/80 pb-8 dark:border-slate-700/80 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div className="flex items-start gap-4">
                {props.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={props.logoDataUrl}
                    alt={`${props.business.businessName} logo`}
                    className="h-14 w-14 rounded-2xl border border-slate-200/80 bg-white object-contain p-2 dark:border-slate-700/80 dark:bg-slate-900"
                  />
                ) : null}
                <div className="min-w-0 pt-4">
                  <h2 className="text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.05em] text-foreground">
                    {props.business.businessName}
                  </h2>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5 lg:text-right">
              <div className="flex items-center justify-start gap-3 lg:justify-end">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusToneClass}`}
                >
                  <LangText en={displayStatus} fr={statusFr} />
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4 lg:justify-end lg:text-right">
                  <span className="text-muted-foreground">{t("Invoice No.", "Facture n°")}</span>
                  <span className="max-w-[65%] break-words font-semibold text-foreground">{props.invoiceNumber}</span>
                </div>
                {props.poNumber ? (
                  <div className="flex items-start justify-between gap-4 lg:justify-end lg:text-right">
                    <span className="text-muted-foreground">{t("PO Number", "Bon de commande")}</span>
                    <span className="max-w-[65%] break-words font-semibold text-foreground">{props.poNumber}</span>
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-4 lg:justify-end lg:text-right">
                  <span className="text-muted-foreground">{t("Issue Date", "Date d emission")}</span>
                  <span className="font-semibold text-foreground">{formatDateDMY(props.issuedAt)}</span>
                </div>
                {props.dueDate ? (
                  <div className="flex items-start justify-between gap-4 lg:justify-end lg:text-right">
                    <span className="text-muted-foreground">{t("Due Date", "Echeance")}</span>
                    <span className="font-semibold text-foreground">{formatDateDMY(props.dueDate)}</span>
                  </div>
                ) : null}
              </div>
              <div className="border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  {t("Total due", "Total du")}
                </p>
                <div
                  className={getSingleLineAmountClass(
                    formattedTotalDue,
                    "mt-2 max-w-full overflow-hidden whitespace-nowrap font-semibold tracking-[-0.05em] text-foreground"
                  )}
                  style={getSingleLineAmountStyle(formattedTotalDue, 2.8, 1.15)}
                >
                  {formattedTotalDue}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 border-b border-slate-200/80 pb-8 dark:border-slate-700/80 md:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Billed to", "Facture a")}
              </p>
              <div className="mt-4 space-y-1.5 text-sm leading-7 text-foreground">
                <p className="text-[1.08rem] font-semibold tracking-[-0.025em]">
                  {props.billTo?.name ?? <LangText en="Customer" fr="Client" />}
                </p>
                {props.billTo?.companyName && <p>{props.billTo.companyName}</p>}
                {props.billTo?.email && <p>{props.billTo.email}</p>}
                {billToAddressLines.length > 0 ? (
                  <div className="space-y-0.5">
                    {billToAddressLines.map((line) => (
                      <p key={`bill-to-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {props.billTo?.taxId && (
                  <p className="pt-1">
                    {t("Tax ID", "ID fiscal")}: {props.billTo.taxId}
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-0 md:text-right">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Invoiced by", "Facture par")}
              </p>
              <div className="mt-4 space-y-1.5 text-sm leading-7 text-foreground">
                <p className="text-[1.08rem] font-semibold tracking-[-0.025em]">{props.business.businessName}</p>
                {props.business.businessEmail && <p>{props.business.businessEmail}</p>}
                {businessAddressLines.length > 0 ? (
                  <div className="space-y-0.5">
                    {businessAddressLines.map((line) => (
                      <p key={`business-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : businessAddress ? (
                  <p className="break-words">{businessAddress}</p>
                ) : null}
                {props.business.taxId && (
                  <p className="pt-1">
                    {t("Tax ID", "ID fiscal")}: {props.business.taxId}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_124px_118px] gap-3 border-b border-slate-200/80 px-1 pb-4 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
              <div className="min-w-0">{t("Description", "Description")}</div>
              <div className="text-center whitespace-nowrap">{t("Qty", "Qt")}</div>
              <div className="text-center whitespace-nowrap">{t("Unit Price", "Prix unitaire")}</div>
              <div className="pr-1 text-right whitespace-nowrap">{t("Total", "Total")}</div>
            </div>
            <div className="divide-y divide-slate-200/80 dark:divide-slate-700/80">
              {props.items.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_124px_118px] items-start gap-3 px-1 py-5 text-sm text-foreground"
                >
                  <div className="min-w-0 leading-8 break-words whitespace-normal">
                    {item.name}
                  </div>
                  <div className="text-center tabular-nums whitespace-nowrap">{item.quantity}</div>
                  <div className="flex min-w-0 justify-center">
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(item.price, props.currency),
                        "max-w-full overflow-hidden whitespace-nowrap text-center tabular-nums leading-tight text-foreground"
                      )}
                      style={getSingleLineAmountStyle(
                        formatCurrency(item.price, props.currency),
                        1.08,
                        0.52,
                        8,
                        0.11
                      )}
                    >
                      {formatCurrency(item.price, props.currency)}
                    </span>
                  </div>
                  <div className="flex min-w-0 justify-end pr-1">
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(item.price * item.quantity, props.currency),
                        "max-w-full overflow-hidden whitespace-nowrap text-right font-semibold tabular-nums leading-tight text-foreground"
                      )}
                      style={getSingleLineAmountStyle(
                        formatCurrency(item.price * item.quantity, props.currency),
                        1.12,
                        0.5,
                        8,
                        0.115
                      )}
                    >
                      {formatCurrency(item.price * item.quantity, props.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-8 border-t border-slate-200/80 pt-8 dark:border-slate-700/80 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
            <div className="space-y-5">
              {props.note ? (
                <div className="space-y-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    {t("Customer note", "Note au client")}
                  </p>
                  <p className="max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-foreground">
                    {props.note}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="w-full lg:ml-auto">
              <div
                className="space-y-3 text-sm text-foreground"
                style={{
                  width: "100%",
                  maxWidth: 290,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{t("Subtotal", "Sous-total")}</span>
                  <span
                    className={getSingleLineAmountClass(
                      formatCurrency(props.totals.subtotal, props.currency),
                      "max-w-[60%] overflow-hidden whitespace-nowrap text-right font-semibold tabular-nums text-foreground"
                    )}
                    style={getSingleLineAmountStyle(
                      formatCurrency(props.totals.subtotal, props.currency),
                      1,
                      0.54,
                      10,
                      0.1
                    )}
                  >
                    {formatCurrency(props.totals.subtotal, props.currency)}
                  </span>
                </div>
                {showTax ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">
                      {t("Tax", "Taxe")} ({vatRateLabel}%)
                    </span>
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(props.totals.taxAmount, props.currency),
                        "max-w-[60%] overflow-hidden whitespace-nowrap text-right font-semibold tabular-nums text-foreground"
                      )}
                      style={getSingleLineAmountStyle(
                        formatCurrency(props.totals.taxAmount, props.currency),
                        1,
                        0.54,
                        10,
                        0.1
                      )}
                    >
                      {formatCurrency(props.totals.taxAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {props.totals.discountAmount > 0 ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">{t("Discount", "Remise")}</span>
                    <span
                      className={getSingleLineAmountClass(
                        `-${formatCurrency(props.totals.discountAmount, props.currency)}`,
                        "max-w-[60%] overflow-hidden whitespace-nowrap text-right font-semibold tabular-nums text-foreground"
                      )}
                      style={getSingleLineAmountStyle(
                        `-${formatCurrency(props.totals.discountAmount, props.currency)}`,
                        1,
                        0.54,
                        10,
                        0.1
                      )}
                    >
                      -{formatCurrency(props.totals.discountAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {lateFeeAmount > 0 ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">{t("Late fee", "Frais de retard")}</span>
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(lateFeeAmount, props.currency),
                        "max-w-[60%] overflow-hidden whitespace-nowrap text-right font-semibold tabular-nums text-foreground"
                      )}
                      style={getSingleLineAmountStyle(
                        formatCurrency(lateFeeAmount, props.currency),
                        1,
                        0.54,
                        10,
                        0.1
                      )}
                    >
                      {formatCurrency(lateFeeAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                <div className="border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      {t("Total due", "Total du")}
                    </span>
                    <span
                      className={getSingleLineAmountClass(
                        formattedTotalDue,
                        "max-w-[62%] overflow-hidden whitespace-nowrap text-right font-semibold tracking-[-0.04em] tabular-nums text-foreground"
                      )}
                      style={getSingleLineAmountStyle(formattedTotalDue, 2.15, 0.66, 10, 0.12)}
                    >
                      {formattedTotalDue}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-auto min-h-[180px] border-t border-slate-200/80 pb-4 pt-6 dark:border-slate-700/80">
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              {props.dueDate
                ? t(
                    "Payment is expected by the due date shown above.",
                    "Le paiement est attendu avant l echeance indiquee ci-dessus."
                  )
                : t(
                    "This invoice is ready to be shared with your customer.",
                    "Cette facture est prete a etre partagee avec votre client."
                  )}
            </p>
            <p className="absolute inset-x-0 bottom-0 text-center text-[0.68rem] font-medium uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              {t("Generated with Maboria", "Genere avec Maboria")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (previewVariant === "dashboard") {
    return (
      <Card className="overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-0 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.32)] dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] dark:shadow-[0_32px_84px_-42px_rgba(2,6,23,0.92)]">
        <div className="space-y-7 p-7 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] xl:items-start">
            <div className="self-start rounded-[28px] border border-slate-200/80 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-slate-700/80 dark:bg-slate-950/58 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start gap-4">
                {props.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={props.logoDataUrl}
                    alt={`${props.business.businessName} logo`}
                    className="h-16 w-16 rounded-2xl border border-slate-200/80 bg-white object-contain p-2 dark:border-slate-700/80 dark:bg-slate-900"
                  />
                ) : null}
                <div className="min-w-0 flex-1 pt-4">
                  <div className="space-y-1.5">
                    <h2 className="text-[2.15rem] font-semibold leading-[0.95] tracking-[-0.045em] text-foreground">
                      {props.business.businessName}
                    </h2>
                  </div>
                </div>
              </div>
            </div>

            <div className="self-start rounded-[28px] border border-indigo-200/70 bg-[linear-gradient(180deg,rgba(238,242,255,0.92),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_54px_-34px_rgba(79,70,229,0.45)] dark:border-indigo-400/20 dark:bg-[linear-gradient(180deg,rgba(49,46,129,0.26),rgba(15,23,42,0.9))] dark:shadow-[0_28px_60px_-38px_rgba(67,56,202,0.55)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-indigo-700/80 dark:text-indigo-200/90">
                    {t("Total due", "Total du")}
                  </p>
                  <div
                    className={getSingleLineAmountClass(
                      formattedTotalDue,
                      "mt-3 max-w-full overflow-hidden whitespace-nowrap font-semibold tracking-[-0.05em] text-foreground"
                    )}
                    style={getSingleLineAmountStyle(formattedTotalDue, 3.1, 1.3)}
                  >
                    {formattedTotalDue}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusToneClass}`}
                >
                  <LangText en={displayStatus} fr={statusFr} />
                </span>
              </div>
              <div className="mt-5 space-y-3 rounded-2xl border border-slate-200/80 bg-white/78 p-4 text-sm dark:border-slate-700/80 dark:bg-slate-950/58">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("Invoice No.", "Facture n°")}</span>
                  <span className="max-w-[60%] break-words text-right font-semibold text-foreground">{props.invoiceNumber}</span>
                </div>
                {props.poNumber ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{t("PO Number", "Bon de commande")}</span>
                    <span className="max-w-[60%] break-words text-right font-semibold text-foreground">{props.poNumber}</span>
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("Issue Date", "Date d emission")}</span>
                  <span className="font-semibold text-foreground">{formatDateDMY(props.issuedAt)}</span>
                </div>
                {props.dueDate ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{t("Due", "Echeance")}</span>
                    <span className="font-semibold text-foreground">{formatDateDMY(props.dueDate)}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 dark:border-slate-700/80 dark:bg-slate-950/60">
                  {t("SSL encrypted", "SSL chiffre")}
                </span>
                <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 dark:border-slate-700/80 dark:bg-slate-950/60">
                  {paymentProviderLabel || t("Secure payment route", "Route de paiement securisee")}
                </span>
              </div>
              <div className="mt-5">
                {props.paymentLink ? (
                  <a
                    href={props.paymentLink}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_22px_46px_-22px_rgba(79,70,229,0.88)] hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
                  >
                    {t("Pay Now Securely", "Payer de maniere securisee")}
                  </a>
                ) : (
                  <span className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t("Payment unavailable", "Paiement indisponible")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            <div className="self-start rounded-[24px] border border-slate-200/80 bg-white/78 p-5 dark:border-slate-700/80 dark:bg-slate-950/58">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Billed to", "Facture a")}
              </p>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-foreground">
                <p className="text-[1.05rem] font-semibold tracking-[-0.025em]">
                  {props.billTo?.name ?? <LangText en="Customer" fr="Client" />}
                </p>
                {props.billTo?.email && <p>{props.billTo.email}</p>}
                {props.billTo?.companyName && <p>{props.billTo.companyName}</p>}
                {billToAddressLines.length > 0 ? (
                  <div className="space-y-0.5">
                    {billToAddressLines.map((line) => (
                      <p key={`bill-to-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {props.billTo?.taxId && <p>{t("Tax ID", "ID fiscal")}: {props.billTo.taxId}</p>}
              </div>
            </div>
            <div className="self-start rounded-[24px] border border-slate-200/80 bg-white/78 p-5 dark:border-slate-700/80 dark:bg-slate-950/58">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Invoiced by", "Facture par")}
              </p>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-foreground">
                <p className="text-[1.05rem] font-semibold tracking-[-0.025em]">{props.business.businessName}</p>
                {props.business.businessEmail && <p>{props.business.businessEmail}</p>}
                {businessAddressLines.length > 0 ? (
                  <div className="space-y-0.5">
                    {businessAddressLines.map((line) => (
                      <p key={`business-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : businessAddress ? (
                  <p className="break-words">{businessAddress}</p>
                ) : null}
                {props.business.taxId && <p>{t("Tax ID", "ID fiscal")}: {props.business.taxId}</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(290px,0.82fr)] xl:items-start">
            <div className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/80 dark:border-slate-700/80 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-700/80">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    {t("Line items", "Articles")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {props.items.length === 1
                      ? <LangText en="1 item on this invoice" fr="1 article sur cette facture" />
                      : (
                        <>
                          {props.items.length} <LangText en="items on this invoice" fr="articles sur cette facture" />
                        </>
                      )}
                  </p>
                </div>
                {showTax ? (
                  <div className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300">
                    {t("VAT", "TVA")} ({vatRateLabel}%)
                  </div>
                ) : null}
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1.95fr)_72px_minmax(0,0.75fr)_minmax(0,0.8fr)] gap-2 border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-400">
                <div className="min-w-0">{t("Description", "Description")}</div>
                <div className="text-center whitespace-nowrap">{t("Qty", "Qt")}</div>
                <div className="text-right whitespace-nowrap">{t("Unit Price", "Prix unitaire")}</div>
                <div className="text-right whitespace-nowrap">{t("Total", "Total")}</div>
              </div>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-700/80">
                {props.items.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="grid min-w-0 grid-cols-[minmax(0,1.95fr)_72px_minmax(0,0.75fr)_minmax(0,0.8fr)] items-start gap-2 px-5 py-5 text-sm text-foreground"
                  >
                    <div className="min-w-0 font-medium leading-relaxed break-words whitespace-normal">
                      {item.name}
                    </div>
                    <div className="text-center tabular-nums whitespace-nowrap">{item.quantity}</div>
                    <div className="min-w-0 text-right tabular-nums leading-tight break-all">
                      {formatCurrency(item.price, props.currency)}
                    </div>
                    <div className="min-w-0 text-right font-semibold tabular-nums leading-tight break-all">
                      {formatCurrency(item.price * item.quantity, props.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="self-start rounded-[26px] border border-slate-200/80 bg-white/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-slate-700/80 dark:bg-slate-950/58 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Summary", "Resume")}
              </p>
              <div className="mt-5 space-y-3 text-sm text-foreground">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("Subtotal", "Sous-total")}</span>
                  <span className="max-w-[55%] text-right font-semibold tabular-nums break-all">
                    {formatCurrency(props.totals.subtotal, props.currency)}
                  </span>
                </div>
                {showTax ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t("Tax", "Taxe")} ({vatRateLabel}%)
                    </span>
                    <span className="max-w-[55%] text-right font-semibold tabular-nums break-all">
                      {formatCurrency(props.totals.taxAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {props.totals.discountAmount > 0 ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{t("Discount", "Remise")}</span>
                    <span className="max-w-[55%] text-right font-semibold tabular-nums break-all">
                      -{formatCurrency(props.totals.discountAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {lateFeeAmount > 0 ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{t("Late fee", "Frais de retard")}</span>
                    <span className="max-w-[55%] text-right font-semibold tabular-nums break-all">
                      {formatCurrency(lateFeeAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    {t("Total Due", "Total du")}
                  </span>
                  <span
                    className={getSingleLineAmountClass(
                      formattedTotalDue,
                      "max-w-[60%] overflow-hidden whitespace-nowrap text-right font-semibold tracking-[-0.04em] tabular-nums text-foreground"
                    )}
                    style={getSingleLineAmountStyle(formattedTotalDue, 2, 0.9)}
                  >
                    {formattedTotalDue}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {props.note ? (
            <div className="rounded-[22px] border border-slate-200/80 bg-white/78 p-5 dark:border-slate-700/80 dark:bg-slate-950/58">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Customer note", "Note au client")}
              </p>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-foreground">
                {props.note}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-sm text-muted-foreground dark:border-slate-700/80">
            <span>
              {props.dueDate
                ? t("Payment is expected by the due date shown above.", "Le paiement est attendu avant l echeance indiquee ci-dessus.")
                : t("Please complete payment using the secure checkout link.", "Veuillez effectuer le paiement via le lien securise.")}
            </span>
            <span className="font-semibold text-foreground">
              {t("Generated with Maboria", "Genere avec Maboria")}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  if (previewVariant === "default" || previewVariant === "compact") {
    return (
      <Card className="p-0">
        <div
          className={`flex flex-col ${isCompactPreview ? "gap-6 p-5" : "gap-8 p-8 pt-10 max-md:p-5"}`}
          suppressHydrationWarning
        >
          <div className={`grid items-start gap-6 ${isCompactPreview ? "grid-cols-1" : "grid-cols-[1fr_auto] max-md:grid-cols-1"}`}>
            <div className="flex min-w-0 items-start gap-4">
              {props.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.logoDataUrl}
                  alt={`${props.business.businessName} logo`}
                  className={`${isCompactPreview ? "h-12 w-12" : "h-16 w-16"} rounded-xl object-contain`}
                />
              ) : null}
              <div className={`min-w-0 ${isCompactPreview ? "pt-2" : "pt-4"}`}>
                <h2 className={`break-words font-semibold text-foreground ${isCompactPreview ? "text-[2.1rem] leading-[1]" : "text-3xl"}`}>
                  {props.business.businessName}
                </h2>
              </div>
            </div>

            <div
              className={`flex w-full flex-col gap-1.5 text-sm text-muted-foreground ${
                isCompactPreview
                  ? "max-w-none items-start text-left"
                  : "max-w-[276px] items-end text-right max-md:max-w-none max-md:items-start max-md:text-left"
              }`}
            >
              <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-indigo-600 ${isCompactPreview ? "mb-1" : "mb-1 max-md:mb-2"}`}>
                Invoice
              </p>
              <div
                className={`grid max-w-full items-baseline gap-y-2 ${
                  isCompactPreview
                    ? "w-full grid-cols-[max-content_1fr] gap-x-3 justify-start"
                    : "w-fit grid-cols-[max-content_max-content] gap-x-4 justify-end max-md:justify-start"
                }`}
              >
                <span className="font-semibold text-foreground">Invoice No:</span>
                <span className={`${isCompactPreview ? "break-all" : "whitespace-nowrap"} text-left text-foreground`}>
                  {props.invoiceNumber}
                </span>
                {props.poNumber ? (
                  <>
                    <span className="font-semibold text-foreground">PO Number:</span>
                    <span className="whitespace-nowrap text-left text-foreground">
                      {props.poNumber}
                    </span>
                  </>
                ) : null}
                <span className="font-semibold text-foreground">Issue Date:</span>
                <span className="text-left text-foreground">{formatDateDMY(props.issuedAt)}</span>
                {props.dueDate ? (
                  <>
                    <span className="font-semibold text-foreground">Due Date:</span>
                    <span className="text-left text-foreground">
                      {formatDateDMY(props.dueDate)}
                    </span>
                  </>
                ) : null}
              </div>
              <span
                className={`mt-2 inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold ${statusToneClass} ${isCompactPreview ? "mr-14 self-end" : ""}`}
              >
                {displayStatus}
              </span>
            </div>
          </div>

          <div className="h-px w-full bg-border/70 invoice-section" />

          <div className={`invoice-section grid text-sm text-foreground ${isCompactPreview ? "grid-cols-1 gap-6" : "grid-cols-2 gap-8 max-md:grid-cols-1"}`}>
            <div className="w-full py-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Billed To</p>
              <div className="mt-3 space-y-1">
                <p className="font-semibold text-foreground">{billToName}</p>
                {props.billTo?.companyName ? <p>{props.billTo.companyName}</p> : null}
                {props.billTo?.email ? <p>{props.billTo.email}</p> : null}
                {billToAddressLines.length > 0 ? (
                  <div className="space-y-1">
                    {billToAddressLines.map((line) => (
                      <p key={`public-billto-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {props.billTo?.taxId ? <p>Tax ID: {props.billTo.taxId}</p> : null}
              </div>
            </div>
            <div className={`w-full py-1 ${isCompactPreview ? "" : "md:pl-32"}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Invoiced By</p>
              <div className="mt-3 space-y-1">
                <p className="font-semibold text-foreground">{props.business.businessName}</p>
                {props.business.businessEmail ? <p>{props.business.businessEmail}</p> : null}
                {businessAddressLines.length > 0 ? (
                  <div className="space-y-1">
                    {businessAddressLines.map((line) => (
                      <p key={`public-invoicedby-${line}`} className="break-words">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : businessAddress ? (
                  <p className="break-words">{businessAddress}</p>
                ) : null}
                {props.business.taxId ? <p>Tax ID: {props.business.taxId}</p> : null}
              </div>
            </div>
          </div>

          <div className={`invoice-section grid gap-6 ${isCompactPreview ? "grid-cols-1" : "grid-cols-[1.2fr_0.8fr] max-md:grid-cols-1"}`}>
            <div className="flex h-full flex-col p-1">
              <h4 className="text-sm font-semibold text-foreground">Invoice Details</h4>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                {isCompactPreview ? (
                  <div className="font-medium text-foreground">
                    {props.items.length === 1 ? "1 item" : `${props.items.length} items`}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">Description:</span>
                    <span className="min-w-0 break-words">
                      {props.items.length === 1 ? invoiceSummary : `${props.items.length} items`}
                    </span>
                  </div>
                )}
              </div>
              {showTax ? (
                <div className="mt-4 max-w-[118px] p-0 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">VAT ({vatRateLabel}%)</div>
                  <div className="mt-1 tabular-nums text-foreground">
                    {formatCurrency(props.totals.taxAmount, props.currency)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex h-full flex-col p-1">
              <h4 className="text-sm font-semibold text-foreground">Total Due</h4>
              <div
                className={
                  isCompactPreview
                    ? getSingleLineAmountClass(
                        formattedTotalDue,
                        "mt-3 max-w-full overflow-hidden whitespace-nowrap font-semibold tracking-[-0.04em] text-foreground"
                      )
                    : "mt-4 text-3xl font-semibold text-foreground"
                }
                style={isCompactPreview ? getSingleLineAmountStyle(formattedTotalDue, 2, 1.05, 10, 0.11) : undefined}
              >
                {formattedTotalDue}
              </div>
              <div className="mt-auto pt-6">
                {props.paymentLink ? (
                  <a
                    href={props.paymentLink}
                    className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                  >
                    Pay Now
                  </a>
                ) : (
                  <span className="inline-flex w-full items-center justify-center rounded-md bg-indigo-300/70 px-4 py-3 text-sm font-semibold text-white/95">
                    Pay Now
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="min-w-0 overflow-hidden">
              {isCompactPreview ? (
                <>
                  <div className="border-b border-border/60 bg-muted/20 px-3 py-3 text-[11px] font-semibold text-foreground">
                    Description
                  </div>
                  <div className="divide-y divide-border">
                    {props.items.map((item, idx) => (
                      <div key={`${item.name}-${idx}`} className="px-3 py-3 text-foreground">
                        <div className="text-[13px] font-medium leading-relaxed break-words">
                          {item.name}
                        </div>
                        <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-border/50 pt-3">
                          <div className="min-w-0">
                            <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Qty
                            </div>
                            <div className="mt-1 text-[13px] tabular-nums text-foreground">
                              {item.quantity}
                            </div>
                          </div>
                          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                            <div className="min-w-0 text-right">
                              <div className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                Unit Price
                              </div>
                              <div
                                className={getSingleLineAmountClass(
                                  formatCurrency(item.price, props.currency),
                                  "mt-1 max-w-full overflow-hidden whitespace-nowrap tabular-nums text-foreground"
                                )}
                                style={getSingleLineAmountStyle(formatCurrency(item.price, props.currency), 0.78, 0.5, 7, 0.06)}
                              >
                                {formatCurrency(item.price, props.currency)}
                              </div>
                            </div>
                            <div className="min-w-0 text-right">
                              <div className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                Total
                              </div>
                              <div
                                className={getSingleLineAmountClass(
                                  formatCurrency(item.price * item.quantity, props.currency),
                                  "mt-1 max-w-full overflow-hidden whitespace-nowrap font-semibold tabular-nums text-foreground"
                                )}
                                style={getSingleLineAmountStyle(
                                  formatCurrency(item.price * item.quantity, props.currency),
                                  0.78,
                                  0.5,
                                  7,
                                  0.06
                                )}
                              >
                                {formatCurrency(item.price * item.quantity, props.currency)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1.6fr)_72px_minmax(0,0.85fr)_minmax(0,0.95fr)] gap-2 border-b border-border/60 bg-muted/20 px-4 py-4 text-xs font-semibold text-foreground">
                    <div className="min-w-0">Description</div>
                    <div className="whitespace-nowrap text-center">Qty</div>
                    <div className="whitespace-nowrap text-right">Unit Price</div>
                    <div className="whitespace-nowrap text-right">Total</div>
                  </div>
                  <div className="divide-y divide-border">
                    {props.items.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="grid min-w-0 grid-cols-[minmax(0,1.6fr)_72px_minmax(0,0.85fr)_minmax(0,0.95fr)] items-start gap-2 px-4 py-4 text-sm text-foreground"
                      >
                        <div className="min-w-0 font-medium leading-relaxed break-words whitespace-normal">
                          {item.name}
                        </div>
                        <div className="text-center tabular-nums whitespace-nowrap">{item.quantity}</div>
                        <div className="min-w-0 text-right tabular-nums leading-tight break-all">
                          {formatCurrency(item.price, props.currency)}
                        </div>
                        <div className="min-w-0 text-right tabular-nums leading-tight break-all">
                          {formatCurrency(item.price * item.quantity, props.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={`mt-3 grid items-start gap-8 ${isCompactPreview ? "grid-cols-1" : "grid-cols-[1fr_auto] max-md:grid-cols-1"}`}>
            <div className={`min-w-0 ${isCompactPreview ? "hidden" : "pt-10 max-md:pt-2"}`}>
              {props.note ? (
                <div className="text-xs text-muted-foreground">
                  <div className="font-semibold text-[1rem] text-foreground">Note</div>
                  <div className="mt-1 whitespace-pre-line break-words text-[0.95rem] leading-7">
                    {props.note}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`flex w-full flex-col ${isCompactPreview ? "items-start" : "items-end justify-self-end max-md:items-start"}`}>
              <div
                className="space-y-2 pt-2 text-sm text-foreground whitespace-nowrap"
                style={{
                  width: isCompactPreview
                    ? "100%"
                    : INVOICE_TOTALS_LABEL_WIDTH + 70 + INVOICE_TOTALS_VALUE_WIDTH + 10,
                }}
              >
                <div
                  className="grid items-center text-foreground"
                  style={{
                    gridTemplateColumns: isCompactPreview
                      ? "1fr auto"
                      : `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                    columnGap: 10,
                  }}
                >
                  <span className="whitespace-nowrap text-left text-muted-foreground">Subtotal</span>
                  <span
                    className={getSingleLineAmountClass(
                      formatCurrency(props.totals.subtotal, props.currency),
                      "max-w-full overflow-hidden whitespace-nowrap text-right text-foreground tabular-nums"
                    )}
                    style={getSingleLineAmountStyle(formatCurrency(props.totals.subtotal, props.currency), 0.95, 0.7, 10, 0.04)}
                  >
                    {formatCurrency(props.totals.subtotal, props.currency)}
                  </span>
                </div>
                {showTax ? (
                  <div
                    className="grid items-center text-foreground"
                    style={{
                      gridTemplateColumns: isCompactPreview
                        ? "1fr auto"
                        : `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                      columnGap: 10,
                    }}
                  >
                    <span className="whitespace-nowrap text-left text-muted-foreground">
                      VAT ({vatRateLabel}%)
                    </span>
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(props.totals.taxAmount, props.currency),
                        "max-w-full overflow-hidden whitespace-nowrap text-right text-foreground tabular-nums"
                      )}
                      style={getSingleLineAmountStyle(formatCurrency(props.totals.taxAmount, props.currency), 0.95, 0.7, 10, 0.04)}
                    >
                      {formatCurrency(props.totals.taxAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {props.totals.discountAmount > 0 ? (
                  <div
                    className="grid items-center text-foreground"
                    style={{
                      gridTemplateColumns: isCompactPreview
                        ? "1fr auto"
                        : `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                      columnGap: 10,
                    }}
                  >
                    <span className="whitespace-nowrap text-left text-muted-foreground">Discount</span>
                    <span
                      className={getSingleLineAmountClass(
                        `-${formatCurrency(props.totals.discountAmount, props.currency)}`,
                        "max-w-full overflow-hidden whitespace-nowrap text-right text-foreground tabular-nums"
                      )}
                      style={getSingleLineAmountStyle(`-${formatCurrency(props.totals.discountAmount, props.currency)}`, 0.95, 0.7, 10, 0.04)}
                    >
                      -{formatCurrency(props.totals.discountAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                {lateFeeAmount > 0 ? (
                  <div
                    className="grid items-center text-foreground"
                    style={{
                      gridTemplateColumns: isCompactPreview
                        ? "1fr auto"
                        : `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                      columnGap: 10,
                    }}
                  >
                    <span className="whitespace-nowrap text-left text-muted-foreground">Late fee</span>
                    <span
                      className={getSingleLineAmountClass(
                        formatCurrency(lateFeeAmount, props.currency),
                        "max-w-full overflow-hidden whitespace-nowrap text-right text-foreground tabular-nums"
                      )}
                      style={getSingleLineAmountStyle(formatCurrency(lateFeeAmount, props.currency), 0.95, 0.7, 10, 0.04)}
                    >
                      {formatCurrency(lateFeeAmount, props.currency)}
                    </span>
                  </div>
                ) : null}
                <div
                  className="mt-1 grid items-center text-lg font-semibold text-foreground"
                  style={{
                    gridTemplateColumns: isCompactPreview
                      ? "1fr auto"
                      : `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                    columnGap: 10,
                  }}
                >
                  <span className="whitespace-nowrap text-left">Total Due</span>
                  <span
                    className={getSingleLineAmountClass(
                      formattedTotalDue,
                      "text-right tabular-nums whitespace-nowrap"
                    )}
                    style={getSingleLineAmountStyle(formattedTotalDue, 1.125, 0.78)}
                  >
                    {formattedTotalDue}
                  </span>
                </div>
              </div>

              {isCompactPreview && props.note ? (
                <div className="mt-6 w-full text-xs text-muted-foreground">
                  <div className="font-semibold text-[1rem] text-foreground">Note</div>
                  <div className="mt-1 whitespace-pre-line break-words text-[0.95rem] leading-7">
                    {props.note}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`invoice-section text-center text-sm text-muted-foreground ${isCompactPreview ? "pt-4" : "pt-6"}`}>
            Please make the payment by the due date. Thank you for your business.
          </div>

          <p className={`invoice-section text-center text-xs font-medium text-muted-foreground ${isCompactPreview ? "pt-6" : "pt-10"}`}>
            Generated with Maboria
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-8 p-8 pt-10 max-md:p-5" suppressHydrationWarning>
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
            <div className="min-w-0 pt-4">
              <h2 className="text-3xl font-semibold text-foreground">{props.business.businessName}</h2>
            </div>
          </div>
          <div className="flex w-full max-w-[260px] flex-col items-end gap-2 text-sm text-muted-foreground text-right">
            <div className="inline-flex items-baseline justify-end gap-2">
              <span className="font-semibold text-foreground">{t("Invoice No:", "Facture n°")}</span>
              <span className="min-w-[150px] text-left text-foreground">{props.invoiceNumber}</span>
            </div>
            {props.poNumber ? (
              <div className="inline-flex items-baseline justify-end gap-2">
                <span className="font-semibold text-foreground">{t("PO Number:", "Bon de commande :")}</span>
                <span className="min-w-[150px] text-left text-foreground">{props.poNumber}</span>
              </div>
            ) : null}
            <div className="inline-flex items-baseline justify-end gap-2">
              <span className="font-semibold text-foreground">{t("Issue Date:", "Date d emission :")}</span>
              <span className="min-w-[150px] text-left text-foreground">{formatDateDMY(props.issuedAt)}</span>
            </div>
            {props.dueDate ? (
              <div className="inline-flex items-baseline justify-end gap-2">
                <span className="font-semibold text-foreground">{t("Due Date:", "Echeance:")}</span>
                <span className="min-w-[150px] text-left text-foreground">{formatDateDMY(props.dueDate)}</span>
              </div>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusToneClass}`}
            >
              <LangText en={displayStatus} fr={statusFr} />
            </span>
          </div>
        </div>

        <div className="h-px w-full bg-border/70 invoice-section" />

        <div className="invoice-section grid grid-cols-2 gap-8 text-sm text-foreground max-md:grid-cols-1">
          <div className="w-full py-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
              {t("Billed To", "Facture a")}
            </p>
            <div className="mt-3 space-y-1">
              <p className="font-semibold text-foreground">
                {props.billTo?.name ?? <LangText en="Customer" fr="Client" />}
              </p>
              {props.billTo?.email && <p>{props.billTo.email}</p>}
              {props.billTo?.companyName && <p>{props.billTo.companyName}</p>}
              {billToAddressLines.length > 0 ? (
                <div className="space-y-1">
                  {billToAddressLines.map((line) => (
                    <p key={`legacy-billto-${line}`} className="break-words">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              {props.billTo?.taxId && <p>{t("Tax ID", "ID fiscal")}: {props.billTo.taxId}</p>}
            </div>
          </div>
          <div className="w-full py-1 md:pl-32">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
              {t("Invoiced By", "Facture par")}
            </p>
            <div className="mt-3 space-y-1">
              <p className="font-semibold text-foreground">{props.business.businessName}</p>
              {props.business.businessEmail ? <p>{props.business.businessEmail}</p> : null}
              {businessAddressLines.length > 0 ? (
                <div className="space-y-1">
                  {businessAddressLines.map((line) => (
                    <p key={`legacy-invoicedby-${line}`} className="break-words">
                      {line}
                    </p>
                  ))}
                </div>
              ) : businessAddress ? (
                <p className="break-words">{businessAddress}</p>
              ) : null}
              {props.business.taxId ? <p>{t("Tax ID", "ID fiscal")}: {props.business.taxId}</p> : null}
            </div>
          </div>
        </div>

        <div className="invoice-section grid grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="flex h-full flex-col p-1">
            <h4 className="text-sm font-semibold text-foreground">{t("Invoice Details", "Details")}</h4>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{t("Description", "Description")}:</span>
                  <span className="min-w-0 break-words">
                    {props.items.length === 1 ? props.items[0].name : `${props.items.length} items`}
                  </span>
                </div>
              </div>
            {showTax ? (
              <div className="mt-4 p-0 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">
                  {t("VAT", "TVA")} ({vatRateLabel}%)
                </div>
                <div className="mt-1 tabular-nums text-foreground">{formatCurrency(props.totals.taxAmount, props.currency)}</div>
              </div>
            ) : null}
          </div>
          <div className="flex h-full flex-col p-1">
            <h4 className="text-sm font-semibold text-foreground">{t("Amount Due", "Montant du")}</h4>
            <div className="mt-4 text-3xl font-semibold text-foreground">
              {formatCurrency(totalDue, props.currency)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Secure payment checkout", "Paiement securise")}
            </p>
            {paymentProviderLabel ? (
              <p className="mt-1 text-xs font-semibold text-foreground">
                {t("Payment provider:", "Prestataire de paiement :")} {paymentProviderLabel}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
                {t("SSL encrypted", "SSL chiffre")}
              </span>
              <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1">
                {t("Trusted payment provider", "Prestataire de paiement securise")}
              </span>
            </div>
            <div className="mt-4">
              {props.paymentLink ? (
                <a
                  href={props.paymentLink}
                  className="inline-flex w-full items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                >
                  {t("Pay Now Securely", "Payer de maniere securisee")}
                </a>
              ) : (
                <span className="inline-flex w-full items-center justify-center rounded-full border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
                  {t("Payment unavailable", "Paiement indisponible")}
                </span>
              )}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t(
                "Your payment details are encrypted and handled on a secure provider page.",
                "Les details de paiement sont chiffres et traites sur une page securisee."
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1.2fr_0.8fr] items-start gap-6">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60">
            <div className="grid min-w-0 grid-cols-[minmax(0,1.6fr)_72px_minmax(0,0.85fr)_minmax(0,0.95fr)] gap-2 border-b border-border/60 bg-muted/20 px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              <div className="min-w-0">{t("Description", "Description")}</div>
              <div className="text-center whitespace-nowrap">{t("Qty", "Qt")}</div>
              <div className="text-right whitespace-nowrap">{t("Unit Price", "Prix unitaire")}</div>
              <div className="text-right whitespace-nowrap">{t("Total", "Total")}</div>
            </div>
            <div className="divide-y divide-border">
              {props.items.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="grid min-w-0 grid-cols-[minmax(0,1.6fr)_72px_minmax(0,0.85fr)_minmax(0,0.95fr)] items-start gap-2 px-4 py-4 text-sm text-foreground"
                >
                  <div className="min-w-0 font-medium leading-relaxed break-words whitespace-normal">
                    {item.name}
                  </div>
                  <div className="text-center tabular-nums whitespace-nowrap">{item.quantity}</div>
                  <div className="min-w-0 text-right tabular-nums leading-tight break-all">
                    {formatCurrency(item.price, props.currency)}
                  </div>
                  <div className="min-w-0 text-right tabular-nums leading-tight break-all">
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
              {lateFeeAmount > 0 && (
                <div
                  className="grid items-center text-foreground"
                  style={{
                    gridTemplateColumns: `${INVOICE_TOTALS_LABEL_WIDTH + 70}px ${INVOICE_TOTALS_VALUE_WIDTH}px`,
                    columnGap: 10,
                  }}
                >
                  <span className="whitespace-nowrap text-left font-semibold">
                    {t("Late fee", "Frais de retard")}
                  </span>
                  <span className="text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                    {formatCurrency(lateFeeAmount, props.currency)}
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
                <span
                  className={getSingleLineAmountClass(
                    formattedTotalDue,
                    "text-right tabular-nums whitespace-nowrap"
                  )}
                  style={getSingleLineAmountStyle(formattedTotalDue, 1.125, 0.78)}
                >
                  {formattedTotalDue}
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
