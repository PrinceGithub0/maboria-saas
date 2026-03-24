const OPENAI_PROVIDER_ERROR_PATTERNS = [
  /incorrect api key/i,
  /invalid api key/i,
  /platform\.openai\.com\/account\/api-keys/i,
  /\bsk-[a-z0-9_-]+/i,
];

export function getSafeAssistantError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  const isProviderAuthError =
    status === 401 ||
    code === "invalid_api_key" ||
    OPENAI_PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(message));

  if (isProviderAuthError) {
    return {
      status: 503,
      message: "Assistant service is temporarily unavailable. Please try again later or contact support.",
    };
  }

  return {
    status: status && Number.isFinite(status) ? status : 500,
    message: message || "Assistant is unavailable right now.",
  };
}
