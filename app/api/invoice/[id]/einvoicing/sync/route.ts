import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { requireBillingAccess } from "@/lib/permissions";
import { loadInvoiceEInvoiceRuntime } from "@/lib/einvoicing/invoice-runtime";
import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { resolveEInvoiceProvider } from "@/lib/einvoicing/resolve-provider";
import { syncEInvoiceStatus } from "@/lib/einvoicing/sync-status";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const POST = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entitlement = await enforceEntitlement(access.ownerUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json({ error: "Access denied", reason: entitlement.reason }, { status: 403 });
  }

  const { id } = await params;
  const runtimeRecord = await loadInvoiceEInvoiceRuntime({
    userId: access.ownerUserId,
    invoiceId: id,
  });
  if (!runtimeRecord) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (!runtimeRecord.snapshot.providerKey || !runtimeRecord.snapshot.submissionId) {
    return NextResponse.json({ error: "This invoice has no submitted e-invoice to sync." }, { status: 400 });
  }
  const providerDefinition = getEInvoiceProviderDefinition(runtimeRecord.snapshot.providerKey);
  const provider = resolveEInvoiceProvider(runtimeRecord.context);
  if (!provider?.getStatus || (providerDefinition && !providerDefinition.supportsStatusSync)) {
    return NextResponse.json(
      {
        error:
          providerDefinition.capabilitySummary ||
          "Status sync is not available yet for this e-invoicing provider.",
      },
      { status: 400 }
    );
  }

  const nextSnapshot = await syncEInvoiceStatus(runtimeRecord.snapshot, runtimeRecord.context);
  const updated = await prisma.invoice.update({
    where: { id: runtimeRecord.invoice.id },
    data: {
      metadata: {
        ...(((runtimeRecord.invoice.metadata as any) || {}) as Record<string, unknown>),
        eInvoicing: nextSnapshot,
      },
    },
    select: {
      id: true,
      status: true,
      metadata: true,
    },
  });

  return NextResponse.json({
    invoiceId: updated.id,
    invoiceStatus: updated.status,
    eInvoicing: (updated.metadata as any)?.eInvoicing || nextSnapshot,
  });
});
