import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireBillingAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStoredInvoiceReceiptPdf } from "@/lib/invoice-receipt";

type Params = { params: Promise<{ paymentId: string }> };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paymentId } = await params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  const payment = await prisma.invoicePayment.findFirst({
    where: {
      id: paymentId,
      invoice: {
        is: {
          userId: access.ownerUserId,
        },
      },
    },
    select: {
      id: true,
      reference: true,
      receipt: {
        select: {
          pdfUrl: true,
          receiptNumber: true,
        },
      },
    },
  });

  if (!payment?.receipt?.pdfUrl) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const buffer = await readStoredInvoiceReceiptPdf(payment.receipt.pdfUrl);
  if (!buffer) {
    return NextResponse.json({ error: "Receipt file missing" }, { status: 404 });
  }

  const safeNumber = String(payment.receipt.receiptNumber || payment.reference || payment.id).replace(/[^a-zA-Z0-9-_]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Maboria_Receipt_${safeNumber}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
});
