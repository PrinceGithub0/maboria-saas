import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { resolveInvoicePublicLink } from "@/lib/invoice-public-link";
import { ensureInvoicePdf, resolveInvoiceCustomer } from "@/lib/invoice";
import {
  readInvoiceSupportingFilesFromMetadata,
  readStoredInvoiceSupportingFile,
} from "@/lib/invoice-supporting-files";

type Params = { params: Promise<{ token: string }> };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const link = await resolveInvoicePublicLink(token);
  if (!link?.invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoice = link.invoice as any;
  const metadata = (invoice.metadata as any) || {};
  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  const fileId = String(url.searchParams.get("id") || "").trim();

  if (type === "pdf") {
    let business = metadata.businessProfile;
    const customer = resolveInvoiceCustomer(metadata);
    const profile = await prisma.businessProfile.findUnique({
      where: { userId: invoice.userId },
      select: {
        businessName: true,
        country: true,
        defaultCurrency: true,
        businessAddress: true,
        businessEmail: true,
        businessPhone: true,
        taxId: true,
        vatEnabled: true,
        vatRate: true,
        vatPricingMode: true,
      },
    });
    if (profile) business = profile;
    else if (!business?.businessName) {
      const account = await prisma.user.findUnique({
        where: { id: invoice.userId },
        select: { name: true, email: true },
      });
      const fallbackName =
        (account?.name || "").trim() ||
        (account?.email ? account.email.split("@")[0] : "") ||
        "Business";
      business = {
        businessName: fallbackName,
        country: "US",
        defaultCurrency: invoice.currency || "USD",
        businessAddress: null,
        businessEmail: account?.email || null,
        businessPhone: null,
        taxId: null,
        vatEnabled: false,
        vatRate: 0,
        vatPricingMode: "EXCLUSIVE",
      };
    }
    const ensured = await ensureInvoicePdf({
      invoice,
      business,
      billTo: customer,
    });
    const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
    return new NextResponse(new Uint8Array(ensured.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice_${safeNumber}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const files = readInvoiceSupportingFilesFromMetadata(metadata);
  const file = files.find((entry) => entry.id === fileId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readStoredInvoiceSupportingFile(file);
  const safeName = String(file.filename || "attachment").replace(/["\r\n]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
