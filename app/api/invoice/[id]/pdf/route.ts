import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import fs from "fs/promises";
import path from "path";
import { ensureInvoicePdf, resolveInvoiceCustomer } from "@/lib/invoice";

type Params = { params: { id: string } };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: true,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const resolvedParams = await Promise.resolve(params);
  const url = new URL(_req.url);
  const forceFresh = url.searchParams.get("fresh") === "1";
  const queryId = url.searchParams.get("id") || "";
  const queryNumber = url.searchParams.get("n") || "";
  const candidate = resolvedParams?.id || queryId || queryNumber;
  const invoiceId = candidate
    ? decodeURIComponent(candidate).split("?")[0]?.split("&")[0]?.replace(/^id=/i, "").trim()
    : "";
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice link" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      userId: session.user.id,
      OR: [
        { id: invoiceId },
        { invoiceNumber: invoiceId },
        { invoiceNumber: { equals: invoiceId, mode: "insensitive" } },
      ],
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const metadata = (invoice.metadata as any) || {};
  let business = metadata.businessProfile;
  const customer = resolveInvoiceCustomer(metadata);
  if (!business?.businessName) {
    const profile = await prisma.businessProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        businessName: true,
        country: true,
        defaultCurrency: true,
        businessAddress: true,
        businessEmail: true,
        businessPhone: true,
        taxId: true,
      },
    });
    if (profile) {
      business = profile;
    } else {
      const account = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
      });
      const fallbackName =
        (account?.name || "").trim() ||
        (account?.email ? account.email.split("@")[0] : "") ||
        "Business";
      business = {
        businessName: fallbackName,
        country: "NG",
        defaultCurrency: invoice.currency || "USD",
        businessAddress: null,
        businessEmail: account?.email || null,
        businessPhone: null,
        taxId: null,
      };
    }
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        metadata: {
          ...metadata,
          businessProfile: business,
        },
      },
    });
  }

  let pdf: Buffer;
  if (invoice.pdfUrl && !forceFresh) {
    const filePath = path.join(process.cwd(), "public", invoice.pdfUrl.replace(/^\//, ""));
    try {
      pdf = await fs.readFile(filePath);
    } catch {
      const ensured = await ensureInvoicePdf({
        invoice: invoice as any,
        business,
        billTo: customer,
        forceRegenerate: forceFresh,
      });
      pdf = ensured.pdfBuffer;
    }
  } else {
    const ensured = await ensureInvoicePdf({
      invoice: invoice as any,
      business,
      billTo: customer,
      forceRegenerate: forceFresh,
    });
    pdf = ensured.pdfBuffer;
  }

  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");

  const body = new Uint8Array(pdf);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${safeNumber}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
});
