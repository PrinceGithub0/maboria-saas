import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/currency";
import { InvoiceItem } from "@/lib/invoice";

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
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
  };
  billTo?: { name?: string | null; email?: string | null; address?: string | null } | null;
};

const statusTone: Record<string, "success" | "warning" | "error" | "info"> = {
  PAID: "success",
  SENT: "info",
  OVERDUE: "warning",
  CANCELED: "error",
  DRAFT: "info",
};

export function InvoicePreview(props: InvoicePreviewProps) {
  const statusVariant = statusTone[props.status] || "info";
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-6 p-6 max-md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Invoice</p>
            <h1 className="text-3xl font-semibold text-foreground">INVOICE</h1>
          </div>
          <Badge variant={statusVariant} className="px-3 py-1 text-xs font-semibold uppercase">
            {props.status}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-sm text-foreground">
            <p className="font-semibold">{props.business.businessName}</p>
            {props.business.businessAddress && <p>{props.business.businessAddress}</p>}
            {props.business.businessEmail && <p>{props.business.businessEmail}</p>}
            {props.business.businessPhone && <p>{props.business.businessPhone}</p>}
            {props.business.taxId && <p>Tax/VAT ID: {props.business.taxId}</p>}
          </div>
          <div className="space-y-1 text-sm text-foreground md:text-right">
            <p>
              <span className="text-muted-foreground">Invoice #</span> {props.invoiceNumber}
            </p>
            <p>
              <span className="text-muted-foreground">Issue date</span>{" "}
              {props.issuedAt.toLocaleDateString()}
            </p>
            {props.dueDate && (
              <p>
                <span className="text-muted-foreground">Due date</span>{" "}
                {props.dueDate.toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {props.billTo ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill To</p>
            <p className="font-semibold">{props.billTo.name || "Customer"}</p>
            {props.billTo.address && <p>{props.billTo.address}</p>}
            {props.billTo.email && <p>{props.billTo.email}</p>}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-right text-foreground">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrencyWithCode(item.price, props.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrencyWithCode(item.price * item.quantity, props.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {props.items.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Qty</span>
                  <span className="text-right text-foreground">{item.quantity}</span>
                  <span>Unit price</span>
                  <span className="text-right text-foreground">
                    {formatCurrencyWithCode(item.price, props.currency)}
                  </span>
                  <span>Amount</span>
                  <span className="text-right text-foreground">
                    {formatCurrencyWithCode(item.price * item.quantity, props.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-2 text-sm text-foreground">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrencyWithCode(props.totals.subtotal, props.currency)}</span>
            </div>
            {props.totals.discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatCurrencyWithCode(props.totals.discountAmount, props.currency)}</span>
              </div>
            )}
            {props.totals.taxAmount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrencyWithCode(props.totals.taxAmount, props.currency)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrencyWithCode(props.totals.total, props.currency)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Generated by Maboria</p>
      </div>
    </Card>
  );
}
