import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { requireBillingAccess } from "@/lib/permissions";
import { ensureInvoicePdf, resolveInvoiceCustomer } from "@/lib/invoice";

type Params = { params: { id: string } };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetUserId = access.ownerUserId;

  const entitlement = await enforceEntitlement(targetUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
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
      userId: targetUserId,
      OR: [
        { id: invoiceId },
        { invoiceNumber: invoiceId },
        { invoiceNumber: { equals: invoiceId, mode: "insensitive" } },
        { metadata: { path: ["invoiceNumberAliases"], array_contains: [invoiceId] } },
      ],
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const metadata = (invoice.metadata as any) || {};
  let business = metadata.businessProfile;
  const customer = resolveInvoiceCustomer(metadata);
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: targetUserId },
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
  if (profile) {
    business = profile;
  } else if (!business?.businessName) {
    const account = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { name: true, email: true },
    });
    const fallbackName =
      (account?.name || "").trim() || (account?.email ? account.email.split("@")[0] : "") || "Business";
    business = {
      businessName: fallbackName,
      country: "NG",
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
  if (business?.businessName && JSON.stringify(metadata.businessProfile || {}) !== JSON.stringify(business)) {
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

  const ensured = await ensureInvoicePdf({
    invoice: invoice as any,
    business,
    billTo: customer,
    forceRegenerate: forceFresh,
  });
  const pdf = ensured.pdfBuffer;

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
