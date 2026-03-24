export function resolveFlutterwaveConfirmationTarget(input: {
  transactionId?: string | null;
  txRef?: string | null;
  fallbackReference?: string | null;
}) {
  const normalize = (value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    return trimmed || null;
  };

  const transactionId = normalize(input.transactionId);
  if (transactionId) {
    return {
      mode: "transaction" as const,
      value: transactionId,
    };
  }

  const reference = normalize(input.txRef) ?? normalize(input.fallbackReference);
  if (reference) {
    return {
      mode: "reference" as const,
      value: reference,
    };
  }

  return null;
}
