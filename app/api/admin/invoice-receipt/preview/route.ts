import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildInvoiceReceiptPdfBuffer } from "@/lib/invoice-receipt";
import { prisma } from "@/lib/prisma";
import { calculateTotalsFromAmounts, getBusinessLogoBuffer } from "@/lib/invoice";
import { normalizeVatSettings } from "@/lib/vat";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can access receipt preview.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  const profile = await prisma.businessProfile.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      userId: true,
      businessName: true,
      businessAddress: true,
      businessEmail: true,
      businessPhone: true,
      vatEnabled: true,
      vatRate: true,
      vatPricingMode: true,
    },
  });
  const logoBuffer = profile?.userId ? await getBusinessLogoBuffer(profile.userId) : null;

  const items = [
    { name: "Automation Service", quantity: 1, price: 650 },
    { name: "Monthly Maintenance", quantity: 1, price: 130 },
  ];
  const vatSettings = normalizeVatSettings({
    enabled: profile?.vatEnabled ?? false,
    rate: profile?.vatRate ? Number(profile.vatRate) : 0,
    mode:
      String(profile?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(items, vatSettings, 0);

  const pdfBuffer = await buildInvoiceReceiptPdfBuffer({
    receiptNumber: "RCT-SAMPLE-0001",
    paidAt: new Date(),
    invoiceNumber: "INV-SAMPLE-0001",
    amount: totals.total,
    currency: "USD",
    provider: "PAYSTACK",
    paymentMethod: "Card",
    reference: "MBR_SAMPLE_REF",
    business: {
      businessName: profile?.businessName || "Sample Business",
      businessAddress: profile?.businessAddress || "123 Main Street, City",
      businessEmail: profile?.businessEmail || "owner@samplebiz.com",
      businessPhone: profile?.businessPhone || "+1 555 555 0100",
    },
    logoBuffer,
    billTo: {
      name: "Sample Customer",
      email: "customer@example.com",
      address: "123 Main Street, City",
    },
    items,
    totals,
  });

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "no-store",
  });
  const filename = "Maboria_Invoice_Receipt_Preview.pdf";
  headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename=\"${filename}\"`);

  const body = new Uint8Array(pdfBuffer);
  return new NextResponse(body, { status: 200, headers });
}
