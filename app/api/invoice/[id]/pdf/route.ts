import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import fs from "fs/promises";
import path from "path";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

type Params = { params: { id: string } };

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

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency)) {
    return NextResponse.json({ error: "Invalid invoice currency" }, { status: 400 });
  }

  if (!invoice.pdfUrl) {
    return NextResponse.json({ error: "PDF not generated yet" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", invoice.pdfUrl.replace(/^\//, ""));
  let pdf: Buffer;
  try {
    pdf = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Stored PDF not found" }, { status: 404 });
  }

  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice_${safeNumber}.pdf"`,
    },
  });
});
