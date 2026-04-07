import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

type ScaffoldedProviderInput = {
  key: EInvoiceProviderAdapter["key"];
  countries: readonly string[];
  documentFormat: EInvoiceProviderAdapter["documentFormat"];
  supportsClearance: boolean;
  payloadWarning: string;
  buildWarnings: NonNullable<EInvoiceProviderAdapter["buildWarnings"]>;
};

export function createScaffoldedProvider(input: ScaffoldedProviderInput): EInvoiceProviderAdapter {
  return {
    key: input.key,
    countries: input.countries,
    documentFormat: input.documentFormat,
    supportsClearance: input.supportsClearance,
    buildPayload(context) {
      const result = createBasePayload(context, input.key, input.documentFormat);
      result.warnings.push(input.payloadWarning);
      return result;
    },
    validatePayload(payload, context) {
      return buildBaseValidationResult(payload, context);
    },
    buildWarnings: input.buildWarnings,
  };
}
