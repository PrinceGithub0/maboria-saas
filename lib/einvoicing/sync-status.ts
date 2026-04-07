import { resolveEInvoiceProvider } from "@/lib/einvoicing/resolve-provider";
import type { EInvoiceProviderContext, InvoiceEInvoicingSnapshot } from "@/lib/einvoicing/types";

export async function syncEInvoiceStatus(
  snapshot: InvoiceEInvoicingSnapshot,
  context: EInvoiceProviderContext
): Promise<InvoiceEInvoicingSnapshot> {
  if (!snapshot.providerKey || !snapshot.submissionId) {
    return snapshot;
  }

  const provider = resolveEInvoiceProvider(context);
  if (!provider?.getStatus) {
    return snapshot;
  }

  const synced = await provider.getStatus(snapshot.submissionId, context);
  const now = new Date().toISOString();

  return {
    ...snapshot,
    status: synced.status,
    providerReference: synced.providerReference ?? snapshot.providerReference,
    lastSyncAt: now,
    acceptedAt: synced.status === "ACCEPTED" ? snapshot.acceptedAt || now : snapshot.acceptedAt,
    rejectedAt: synced.status === "REJECTED" ? snapshot.rejectedAt || now : snapshot.rejectedAt,
    lastError: synced.errorMessage ?? null,
  };
}
