import "server-only";

export class WhatsAppEmbeddedSignupError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "whatsapp_embedded_signup_error") {
    super(message);
    this.name = "WhatsAppEmbeddedSignupError";
    this.status = status;
    this.code = code;
  }
}

export function getWhatsAppGraphApiVersion() {
  return String(process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_API_VERSION || "v23.0").trim() || "v23.0";
}

export function getWhatsAppEmbeddedSignupConfig() {
  const appId = String(process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || "").trim();
  const configId = String(
    process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID ||
      process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID ||
      ""
  ).trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();

  return {
    appId,
    configId,
    appSecret,
    graphApiVersion: getWhatsAppGraphApiVersion(),
    enabled: Boolean(appId && configId && appSecret),
  };
}

export async function exchangeEmbeddedSignupCodeForToken(code: string) {
  const config = getWhatsAppEmbeddedSignupConfig();
  if (!config.enabled) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta WhatsApp embedded signup is not configured.",
      503,
      "whatsapp_embedded_signup_not_configured"
    );
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    code,
  });

  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsAppEmbeddedSignupError(
      String(payload?.error?.message || "Meta token exchange failed."),
      502,
      "whatsapp_embedded_signup_exchange_failed"
    );
  }

  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new WhatsAppEmbeddedSignupError(
      "Meta token exchange did not return an access token.",
      502,
      "whatsapp_embedded_signup_access_token_missing"
    );
  }

  return {
    accessToken,
    tokenType: String(payload?.token_type || "").trim() || null,
    expiresIn: Number(payload?.expires_in || 0) || null,
  };
}

export async function fetchEmbeddedSignupPhoneProfile(input: {
  accessToken: string;
  phoneNumberId: string;
}) {
  const config = getWhatsAppEmbeddedSignupConfig();
  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(
      input.phoneNumberId
    )}?fields=display_phone_number,verified_name,quality_rating`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsAppEmbeddedSignupError(
      String(payload?.error?.message || "Unable to verify the WhatsApp phone number."),
      502,
      "whatsapp_embedded_signup_phone_lookup_failed"
    );
  }

  return {
    displayPhoneNumber: String(payload?.display_phone_number || "").trim() || null,
    verifiedName: String(payload?.verified_name || "").trim() || null,
    qualityRating: String(payload?.quality_rating || "").trim() || null,
  };
}
