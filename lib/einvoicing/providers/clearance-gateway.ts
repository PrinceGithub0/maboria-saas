import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import type { EInvoiceProviderAdapter, EInvoiceProviderKey } from "@/lib/einvoicing/types";

type ClearanceGatewayOptions = {
  key: EInvoiceProviderKey;
  countries: readonly string[];
  documentFormat: EInvoiceProviderAdapter["documentFormat"];
  supportsClearance: boolean;
  schemaWarning: string;
  providerWarning: string;
};

export function createClearanceGatewayProvider(options: ClearanceGatewayOptions): EInvoiceProviderAdapter {
  return {
    key: options.key,
    countries: options.countries,
    documentFormat: options.documentFormat,
    supportsClearance: options.supportsClearance,
    buildPayload(context) {
      const result = createBasePayload(context, options.key, options.documentFormat);
      result.warnings.push(options.schemaWarning);
      return result;
    },
    validatePayload(payload, context) {
      return buildBaseValidationResult(payload, context);
    },
    buildWarnings() {
      return [options.providerWarning];
    },
  };
}
