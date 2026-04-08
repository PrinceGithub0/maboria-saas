import { NextResponse } from "next/server";
import { isInvoicePublicLinkExpired, resolveInvoicePublicLink } from "@/lib/invoice-public-link";
import { ensureInvoicePaymentLink } from "@/lib/invoice-payments";
import { resolveInvoiceCustomer } from "@/lib/invoice";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const isPayableStatus = (status: string) => ["SENT", "OVERDUE", "FAILED"].includes(status);
const isFinalStatus = (status: string) => ["PAID", "CANCELED", "EXPIRED"].includes(status);
const redirectToErrorPage = (reason: string) =>
  NextResponse.redirect(new URL(`/pay/invoice/error?reason=${encodeURIComponent(reason)}`, env.appUrl));
const redirectToInvoicePage = (token: string, reason: string) =>
  NextResponse.redirect(
    new URL(`/pay/invoice/${encodeURIComponent(token)}?status=failed&reason=${encodeURIComponent(reason)}`, env.appUrl)
  );

export const GET = async (_req: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  if (!token) return redirectToErrorPage("invalid_token");

  const link = await resolveInvoicePublicLink(token);
  if (!link?.invoice) return redirectToErrorPage("invoice_not_found");
  if (isInvoicePublicLinkExpired(link)) return redirectToErrorPage("invoice_link_expired");

  const invoice = link.invoice;
  if (link.usedAt || isFinalStatus(invoice.status) || !isPayableStatus(invoice.status)) {
    return redirectToInvoicePage(token, "invoice_not_payable");
  }

  try {
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
  } catch (error) {
    log("warn", "invoice_payment_redirect_failed", {
      invoiceId: invoice.id,
      token,
      error,
    });
    return redirectToInvoicePage(token, "payment_link_unavailable");
  }
};
