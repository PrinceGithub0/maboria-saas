import "server-only";

import { prisma } from "@/lib/prisma";

let supportsSubaccountFiltersCache: boolean | null = null;
let supportsLockedFieldsCache: boolean | null = null;

function isMissingWhereFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `viaSubaccount`") ||
    error.message.includes("Unknown argument `isManual`")
  );
}

export async function supportsInvoicePaymentSubaccountFilters() {
  if (supportsSubaccountFiltersCache !== null) return supportsSubaccountFiltersCache;

  try {
    await prisma.invoicePayment.count({
      where: {
        viaSubaccount: true,
        isManual: false,
      },
    });
    supportsSubaccountFiltersCache = true;
    return true;
  } catch (error) {
    if (isMissingWhereFieldError(error)) {
      supportsSubaccountFiltersCache = false;
      return false;
    }
    throw error;
  }
}

function isMissingLockedFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown field `amountOriginal`") ||
    error.message.includes("Unknown field `currencyOriginal`") ||
    error.message.includes("Unknown field `amountConverted`") ||
    error.message.includes("Unknown field `currencyDefault`") ||
    error.message.includes("Unknown field `confirmedAt`") ||
    error.message.includes("Unknown argument `confirmedAt`")
  );
}

export async function supportsInvoicePaymentLockedFields() {
  if (supportsLockedFieldsCache !== null) return supportsLockedFieldsCache;

  try {
    await prisma.invoicePayment.findFirst({
      select: {
        amountOriginal: true,
        currencyOriginal: true,
        amountConverted: true,
        currencyDefault: true,
        confirmedAt: true,
      },
    });
    supportsLockedFieldsCache = true;
    return true;
  } catch (error) {
    if (isMissingLockedFieldError(error)) {
      supportsLockedFieldsCache = false;
      return false;
    }
    throw error;
  }
}

export function withInvoicePaymentSubaccountFilters<T extends Record<string, unknown>>(
  where: T,
  supportsSubaccountFilters: boolean
) {
  if (!supportsSubaccountFilters) return where;
  return {
    ...where,
    viaSubaccount: true,
    isManual: false,
  };
}
