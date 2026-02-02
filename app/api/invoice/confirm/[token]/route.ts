import { NextResponse } from "next/server";
import { resolveInvoicePublicLink } from "@/lib/invoice-public-link";
import { verifyPaystackTransaction } from "@/lib/payments/paystack";
import { verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { recordInvoicePayment } from "@/lib/invoice-payments";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { fromMinorUnits } from "@/lib/payments/currency-allowlist";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export const GET = async (req: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  const url = new URL(req.url);
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const link = await resolveInvoicePublicLink(token);
  if (!link?.invoice) return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=failed`, url));

  const invoice = link.invoice;
  const metadata = (invoice.metadata as any) || {};
  const paymentMeta = metadata?.payment || {};
  const provider = String(paymentMeta?.provider || "").toUpperCase();
  const reference =
    url.searchParams.get("reference") ||
    url.searchParams.get("trxref") ||
    url.searchParams.get("tx_ref") ||
    paymentMeta?.reference ||
    "";

  if (!provider || !reference) {
    return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=failed`, url));
  }

  try {
    if (provider === "PAYSTACK") {
      const verification = await verifyPaystackTransaction(reference);
      const verified = verification?.data;
      if (!verification?.status || !verified || verified.status !== "success") {
        return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=failed`, url));
      }
      await recordInvoicePayment({
        provider: "PAYSTACK",
        reference: verified.reference || reference,
        amount: fromMinorUnits(Number(verified.amount || 0), verified.currency || "NGN"),
        currency: normalizeCurrency(verified.currency || "NGN"),
        status: "SUCCEEDED",
        invoiceId: metadata?.invoiceId || invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: metadata?.userId || invoice.userId,
        organizationId: metadata?.organizationId || invoice.userId,
        verified: true,
        verifiedAt: verified?.paid_at || verified?.paidAt || verified?.transaction_date,
        rawPayload: verified,
      });
    } else if (provider === "FLUTTERWAVE") {
      const verification = await verifyFlutterwaveTransaction(reference);
      const verified = verification?.data;
      if (!verification?.status || !verified || verified.status !== "successful") {
        return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=failed`, url));
      }
      await recordInvoicePayment({
        provider: "FLUTTERWAVE",
        reference: verified.tx_ref || reference,
        amount: Number(verified.amount || 0),
        currency: normalizeCurrency(verified.currency || "USD"),
        status: "SUCCEEDED",
        invoiceId: metadata?.invoiceId || invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: metadata?.userId || invoice.userId,
        organizationId: metadata?.organizationId || invoice.userId,
        verified: true,
        verifiedAt: verified?.created_at || new Date().toISOString(),
        rawPayload: verified,
      });
    }
  } catch (error) {
    log("error", "invoice_payment_confirm_failed", { token, reference, error });
    return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=failed`, url));
  }

  return NextResponse.redirect(new URL(`/pay/invoice/${token}?status=paid`, url));
};
