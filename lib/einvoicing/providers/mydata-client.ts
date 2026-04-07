import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoiceStatusResult,
} from "@/lib/einvoicing/types";

const MYDATA_TEST_BASE_URL = "https://mydataapidev.aade.gr";
const MYDATA_PRODUCTION_BASE_URL = "https://mydatapi.aade.gr/myDATA";
const MYDATA_DEVELOPER_PORTAL_URL = "https://mydata-dev.portal.azure-api.net";
const MYDATA_TEST_REGISTER_URL = "https://mydata-dev-register.azurewebsites.net";
const MYDATA_USER_REGISTRATION_URL = "https://www1.aade.gr/saadeapps2/bookkeeper-web";

export type MyDataCredentials = {
  aadeUserId: string;
  subscriptionKey: string;
  entityVatNumber?: string;
};

export type MyDataEndpointInput = {
  connection?: EInvoiceConnectionConfig | null;
  baseUrl?: string | null;
};

export type MyDataRequestDocsParams = {
  mark: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  entityVatNumber?: string | null;
  counterVatNumber?: string | null;
  invType?: string | number | null;
  maxMark?: string | number | null;
  nextPartitionKey?: string | null;
  nextRowKey?: string | null;
};

export type MyDataCancelInvoiceParams = {
  mark: string;
  entityVatNumber?: string | null;
};

export type MyDataSubmissionResult = {
  status: "QUEUED" | "SUBMITTED" | "ACCEPTED";
  submissionId: string;
  providerReference: string | null;
  rawResponse: Record<string, unknown> | null;
};

const trim = (value: unknown) => String(value || "").trim();

function sanitizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getConnectionCredentials(connection?: EInvoiceConnectionConfig | null) {
  return (connection?.credentials || {}) as Record<string, unknown>;
}

export function getMyDataCredentials(connection?: EInvoiceConnectionConfig | null): MyDataCredentials {
  const credentials = getConnectionCredentials(connection);
  const aadeUserId = trim(credentials.aadeUserId || credentials.username || credentials.userId);
  const subscriptionKey = trim(credentials.subscriptionKey || credentials.apiKey || credentials.ocpApimSubscriptionKey);
  const entityVatNumber = trim(credentials.entityVatNumber || credentials.vatNumber || credentials.taxId);

  if (!aadeUserId || !subscriptionKey) {
    throw new Error("myDATA requires an AADE user ID and subscription key.");
  }

  return {
    aadeUserId,
    subscriptionKey,
    ...(entityVatNumber ? { entityVatNumber } : {}),
  };
}

export function getMyDataBaseUrl(input?: MyDataEndpointInput) {
  const connection = input?.connection ?? null;
  const credentials = getConnectionCredentials(connection);
  const explicitBaseUrl = trim(input?.baseUrl || credentials.baseUrl || credentials.apiBaseUrl || connection?.metadata?.baseUrl);

  if (explicitBaseUrl) {
    return sanitizeBaseUrl(explicitBaseUrl);
  }

  if (connection?.sandbox !== false) {
    return MYDATA_TEST_BASE_URL;
  }

  return MYDATA_PRODUCTION_BASE_URL;
}

export const buildMyDataBaseUrl = getMyDataBaseUrl;

function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | null | undefined>) {
  const normalizedBase = sanitizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${normalizedBase}/${normalizedPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      const normalized = String(value ?? "").trim();
      if (normalized) {
        url.searchParams.set(key, normalized);
      }
    }
  }
  return url.toString();
}

export function buildMyDataHeaders(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getMyDataCredentials(connection);
  return {
    "aade-user-id": credentials.aadeUserId,
    "ocp-apim-subscription-key": credentials.subscriptionKey,
  };
}

export function buildMyDataDeveloperPortalUrl() {
  return MYDATA_DEVELOPER_PORTAL_URL;
}

export function buildMyDataTestRegistrationUrl() {
  return MYDATA_TEST_REGISTER_URL;
}

export function buildMyDataUserRegistrationUrl() {
  return MYDATA_USER_REGISTRATION_URL;
}

export function buildMyDataSendInvoicesUrl(input?: MyDataEndpointInput) {
  return buildUrl(getMyDataBaseUrl(input), "/SendInvoices");
}

export function buildMyDataSendIncomeClassificationUrl(input?: MyDataEndpointInput) {
  return buildUrl(getMyDataBaseUrl(input), "/SendIncomeClassification");
}

export function buildMyDataSendExpensesClassificationUrl(input?: MyDataEndpointInput) {
  return buildUrl(getMyDataBaseUrl(input), "/SendExpensesClassification");
}

export function buildMyDataSendPaymentsMethodUrl(input?: MyDataEndpointInput) {
  return buildUrl(getMyDataBaseUrl(input), "/SendPaymentsMethod");
}

export function buildMyDataRequestDocsUrl(input: MyDataEndpointInput & { params: MyDataRequestDocsParams }) {
  return buildUrl(getMyDataBaseUrl(input), "/RequestDocs", input.params);
}

export function buildMyDataRequestTransmittedDocsUrl(input: MyDataEndpointInput & { params: MyDataRequestDocsParams }) {
  return buildUrl(getMyDataBaseUrl(input), "/RequestTransmittedDocs", input.params);
}

export function buildMyDataCancelInvoiceUrl(input: MyDataEndpointInput & { params: MyDataCancelInvoiceParams }) {
  return buildUrl(getMyDataBaseUrl(input), "/CancelInvoice", input.params);
}

export function buildMyDataRequestMyIncomeUrl(input: MyDataEndpointInput & { params: { entityVatNumber?: string | null } }) {
  return buildUrl(getMyDataBaseUrl(input), "/RequestMyIncome", input.params);
}

export function buildMyDataRequestMyExpensesUrl(input: MyDataEndpointInput & { params: { entityVatNumber?: string | null } }) {
  return buildUrl(getMyDataBaseUrl(input), "/RequestMyExpenses", input.params);
}

function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function getResponseField(parsed: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = parsed?.[key];
    const normalized = trim(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

export async function submitMyDataInvoicesDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: Record<string, unknown>;
}) {
  const response = await fetch(buildMyDataSendInvoicesUrl({ connection: input.connection }), {
    method: "POST",
    headers: {
      ...buildMyDataHeaders(input.connection),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input.payload),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      getResponseField(parsed, "error_description", "error", "message") ||
      `myDATA SendInvoices request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const submissionId = getResponseField(parsed, "mark", "invoiceMark", "uid", "submissionId", "invoiceUid") || "mydata-submission";
  const providerReference = getResponseField(parsed, "uid", "submissionId", "invoiceUid", "mark", "invoiceMark") || null;
  const statusField = getResponseField(parsed, "status", "message", "responseStatus");
  const status = statusField.toLowerCase().includes("accept")
    ? "ACCEPTED"
    : statusField.toLowerCase().includes("queue")
      ? "QUEUED"
      : "SUBMITTED";

  return {
    status,
    submissionId,
    providerReference,
    rawResponse: parsed,
  } satisfies MyDataSubmissionResult;
}

function normalizeMyDataStatus(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toLowerCase();
  if (normalized.includes("cancel")) return "CANCELLED";
  if (normalized.includes("reject") || normalized.includes("error") || normalized.includes("fail")) return "REJECTED";
  if (normalized.includes("accept") || normalized.includes("success")) return "ACCEPTED";
  if (normalized.includes("queue") || normalized.includes("pending")) return "QUEUED";
  return "SUBMITTED";
}

function findMyDataInvoiceRecord(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined;
  }
  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    if (Array.isArray(objectPayload.invoices)) {
      return objectPayload.invoices.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined;
    }
    return objectPayload;
  }
  return undefined;
}

export async function getMyDataInvoiceStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getMyDataCredentials(input.connection);
  const response = await fetch(
    buildMyDataRequestTransmittedDocsUrl({
      connection: input.connection,
      params: {
        mark: input.submissionId,
        entityVatNumber: credentials.entityVatNumber || null,
      },
    }),
    {
      method: "GET",
      headers: {
        ...buildMyDataHeaders(input.connection),
        Accept: "application/json",
      },
    }
  );
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      getResponseField(parsed, "error_description", "error", "message") ||
      `myDATA RequestTransmittedDocs request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const invoiceRecord = findMyDataInvoiceRecord(parsed);
  const providerReference =
    getResponseField(invoiceRecord || null, "uid", "submissionId", "invoiceUid", "mark", "invoiceMark") ||
    input.submissionId;
  const statusValue =
    getResponseField(invoiceRecord || null, "status", "invoiceStatus", "message", "responseStatus") || "submitted";

  return {
    status: normalizeMyDataStatus(statusValue),
    providerReference,
    rawResponse: parsed,
    errorMessage: null,
  };
}

export async function cancelMyDataInvoice(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getMyDataCredentials(input.connection);
  const response = await fetch(
    buildMyDataCancelInvoiceUrl({
      connection: input.connection,
      params: {
        mark: input.submissionId,
        entityVatNumber: credentials.entityVatNumber || null,
      },
    }),
    {
      method: "POST",
      headers: {
        ...buildMyDataHeaders(input.connection),
        Accept: "application/json",
      },
    }
  );
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      getResponseField(parsed, "error_description", "error", "message") ||
      `myDATA CancelInvoice request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
