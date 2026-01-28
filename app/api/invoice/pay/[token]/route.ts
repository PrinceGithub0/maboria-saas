import { NextResponse } from "next/server";
import { resolveInvoicePublicLink } from "@/lib/invoice-public-link";
import { ensureInvoicePaymentLink } from "@/lib/invoice-payments";
import { resolveInvoiceCustomer } from "@/lib/invoice";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const isPayableStatus = (status: string) => ["SENT", "OVERDUE", "FAILED"].includes(status);
const isFinalStatus = (status: string) => ["PAID", "CANCELED", "EXPIRED"].includes(status);

export const GET = async (_req: Request, { params }: { params: { token: string } }) => {
  const token = params?.token;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const link = await resolveInvoicePublicLink(token);
  if (!link?.invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const invoice = link.invoice;
  if (link.usedAt || isFinalStatus(invoice.status) || !isPayableStatus(invoice.status)) {
    return NextResponse.json({ error: "Invoice not payable" }, { status: 400 });
  }

  const customer = resolveInvoiceCustomer(invoice.metadata as any);
  const payment = await ensureInvoicePaymentLink({
    invoice,
    customerName: customer?.name || null,
    returnUrl: `${env.appUrl}/api/invoice/confirm/${encodeURIComponent(token)}`,
  });

  log("info", "invoice_payment_redirect", {
    invoiceId: invoice.id,
    reference: payment.reference,
    provider: payment.provider,
  });

  return NextResponse.redirect(payment.paymentUrl);
};
