import { Card } from "@/components/ui/card";
import { formatCurrencyCode } from "@/lib/currency";
import { formatDateDMY } from "@/lib/date";
import { InvoiceItem } from "@/lib/invoice";
import { getTaxIdLabel } from "@/lib/tax-labels";

type InvoicePreviewProps = {
  invoiceNumber: string;
  status: string;
  issuedAt: Date;
  dueDate?: Date | null;
  currency: string;
  items: InvoiceItem[];
  totals: { subtotal: number; taxAmount: number; discountAmount: number; total: number };
  business: {
    businessName: string;
    country?: string | null;
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
  };
  billTo?: { name?: string | null; email?: string | null; address?: string | null } | null;
};

export function InvoicePreview(props: InvoicePreviewProps) {
  const normalizedStatus = String(props.status || "").toUpperCase();
  const displayStatus =
    normalizedStatus === "SENT" || normalizedStatus === "OVERDUE"
      ? "UNPAID"
      : normalizedStatus === "CANCELED"
        ? "CANCELLED"
        : normalizedStatus;
  const taxLabel = getTaxIdLabel(props.business.country);
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-6 p-7 max-md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">{props.business.businessName}</h2>
          </div>
          <div className="space-y-3 text-right">
            <p className="text-base font-semibold uppercase tracking-[0.18em] text-foreground">
              INVOICE
            </p>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-end gap-3">
                <span>Status</span>
                <span className="font-semibold text-foreground">{displayStatus}</span>
              </div>
              <div className="flex items-center justify-end gap-3">
                <span>Invoice Number</span>
                <span className="font-semibold text-foreground">{props.invoiceNumber}</span>
              </div>
              <div className="flex items-center justify-end gap-3">
                <span>Invoice Date</span>
                <span className="font-semibold text-foreground">
                  {formatDateDMY(props.issuedAt)}
                </span>
              </div>
              {props.dueDate && (
                <div className="flex items-center justify-end gap-3">
                  <span>Due Date</span>
                  <span className="font-semibold text-foreground">{formatDateDMY(props.dueDate)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        <div className="grid gap-6 text-sm text-foreground md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller</p>
            <p className="font-semibold">{props.business.businessName}</p>
            {props.business.businessAddress && <p>{props.business.businessAddress}</p>}
            {props.business.businessEmail && <p>{props.business.businessEmail}</p>}
            {props.business.businessPhone && <p>{props.business.businessPhone}</p>}
            {props.business.taxId && (
              <p>
                {taxLabel.long}: {props.business.taxId}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill To</p>
            <p className="font-semibold">{props.billTo?.name || "Customer"}</p>
            {props.billTo?.address && <p>{props.billTo.address}</p>}
            {props.billTo?.email && <p>{props.billTo.email}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payment Details
            </p>
            <p className="text-muted-foreground">Provided via checkout or bank transfer.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground text-left text-[11px] uppercase tracking-[0.2em] text-background">
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3 text-right">Subtotal</th>
                  <th className="px-4 py-3 text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="border-t border-border/50">
                    <td className="px-4 py-5 text-foreground">{item.name}</td>
                    <td className="px-4 py-5 text-right text-foreground">{item.quantity}</td>
                    <td className="px-4 py-5 text-right text-foreground">
                      {formatCurrencyCode(item.price, props.currency)}
                    </td>
                    <td className="px-4 py-5 text-right text-foreground">
                      {formatCurrencyCode(item.price * item.quantity, props.currency)}
                    </td>
                    <td className="px-4 py-5 text-right text-muted-foreground">
                      {props.totals.taxAmount > 0
                        ? formatCurrencyCode(
                            (item.price * item.quantity * props.totals.taxAmount) /
                              Math.max(props.totals.subtotal, 1),
                            props.currency
                          )
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {props.items.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="rounded-xl border border-border/70 bg-background p-4"
              >
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Qty</span>
                  <span className="text-right text-foreground">{item.quantity}</span>
                  <span>Unit price</span>
                  <span className="text-right text-foreground">
                    {formatCurrencyCode(item.price, props.currency)}
                  </span>
                  <span>Subtotal</span>
                  <span className="text-right text-foreground">
                    {formatCurrencyCode(item.price * item.quantity, props.currency)}
                  </span>
                  <span>VAT</span>
                  <span className="text-right text-muted-foreground">
                    {props.totals.taxAmount > 0
                      ? formatCurrencyCode(
                          (item.price * item.quantity * props.totals.taxAmount) /
                            Math.max(props.totals.subtotal, 1),
                          props.currency
                        )
                      : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 border-t border-border/60 pt-4 text-sm text-foreground">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrencyCode(props.totals.subtotal, props.currency)}</span>
            </div>
            {props.totals.taxAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span>{formatCurrencyCode(props.totals.taxAmount, props.currency)}</span>
              </div>
            )}
            {props.totals.discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatCurrencyCode(props.totals.discountAmount, props.currency)}</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between text-lg font-semibold text-foreground">
              <span>Total to Pay</span>
              <span>{formatCurrencyCode(props.totals.total, props.currency)}</span>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-border/70" />
        <p className="text-center text-xs text-muted-foreground">Generated with Maboria</p>
      </div>
    </Card>
  );
}
