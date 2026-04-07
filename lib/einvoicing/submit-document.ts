import { resolveEInvoiceProvider, resolveInvoiceEInvoicingSnapshot } from "@/lib/einvoicing/resolve-provider";
import type { EInvoiceProviderContext, InvoiceEInvoicingSnapshot } from "@/lib/einvoicing/types";

type SubmitEInvoiceResult = {
  snapshot: InvoiceEInvoicingSnapshot;
  payload: Record<string, unknown> | null;
};

export async function submitEInvoiceDocument(
  context: EInvoiceProviderContext
): Promise<SubmitEInvoiceResult> {
  const provider = resolveEInvoiceProvider(context);
  const snapshot = resolveInvoiceEInvoicingSnapshot(context);

  if (!provider || snapshot.status === "NOT_REQUIRED" || snapshot.status === "NOT_CONFIGURED") {
    return { snapshot, payload: null };
  }

  if (snapshot.requirement === "REQUIRED" && !snapshot.productionReady) {
    return {
      snapshot: {
        ...snapshot,
        status: "VALIDATION_FAILED",
        lastError:
          snapshot.productionBlockers[0] ||
          "This country is still blocked on e-invoicing production signoff.",
        warnings: [
          ...snapshot.warnings,
          "Submission is blocked until the country e-invoicing production signoff gates are complete.",
        ],
      },
      payload: null,
    };
  }

  const builtPayload = await provider.buildPayload(context);
  const validation = await provider.validatePayload(builtPayload, context);

  if (!validation.ok) {
    return {
      payload: builtPayload.payload,
      snapshot: {
        ...snapshot,
        status: "VALIDATION_FAILED",
        lastError: validation.errors.join(" "),
        warnings: [...snapshot.warnings, ...(validation.warnings || [])],
      },
    };
  }

  if (!provider.submit) {
    return {
      payload: builtPayload.payload,
      snapshot: {
        ...snapshot,
        warnings: [...snapshot.warnings, ...(validation.warnings || [])],
      },
    };
  }

  const submitted = await provider.submit(builtPayload, context);
  const submittedAt = new Date().toISOString();
  const acceptedAt = submitted.status === "ACCEPTED" ? submittedAt : null;

  return {
    payload: builtPayload.payload,
    snapshot: {
      ...snapshot,
      status: submitted.status,
      submissionId: submitted.submissionId,
      providerReference: submitted.providerReference ?? null,
      submittedAt,
      acceptedAt,
      lastSyncAt: submittedAt,
      warnings: [...snapshot.warnings, ...(validation.warnings || [])],
    },
  };
}
