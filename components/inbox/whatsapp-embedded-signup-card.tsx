"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
        options?: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type WhatsAppConnection =
  | {
      mode: "whatsapp_api";
      configured: true;
      phoneNumberId: string;
      displayPhoneNumber?: string | null;
      verifiedName?: string | null;
      qualityRating?: string | null;
      apiVersion: string;
      hasVerifyToken: boolean;
      hasAppSecret: boolean;
    }
  | {
      mode: "none";
      configured: false;
    };

type Props = {
  connection: WhatsAppConnection | null;
  onConnected?: () => Promise<unknown> | unknown;
};

type EmbeddedSignupEventPayload = {
  phoneNumberId?: string | null;
  wabaId?: string | null;
  businessId?: string | null;
};

const META_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const META_ALLOWED_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://m.facebook.com",
]);

function isConfiguredRuntimeValue(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("your_") ||
    normalized.includes("_here") ||
    normalized.includes("example") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me")
  ) {
    return false;
  }
  return true;
}

function readEnv() {
  return {
    appId: process.env.NEXT_PUBLIC_META_APP_ID || "",
    configId: process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "",
    graphVersion: process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION || "v23.0",
  };
}

function parseMessageEvent(data: unknown): { event: string; payload: EmbeddedSignupEventPayload } | null {
  if (!data) return null;
  const parsed =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data);
          } catch {
            return null;
          }
        })()
      : data;
  if (!parsed || typeof parsed !== "object") return null;

  const maybeEvent = String((parsed as any).event || (parsed as any).type || "").trim().toUpperCase();
  const details = (parsed as any).data && typeof (parsed as any).data === "object" ? (parsed as any).data : parsed;
  const phoneNumberId = String(
    details?.phone_number_id || details?.phoneNumberId || details?.phone_number?.id || ""
  ).trim();
  const wabaId = String(details?.waba_id || details?.wabaId || details?.business_account_id || "").trim();
  const businessId = String(details?.business_id || details?.businessId || "").trim();

  if (!maybeEvent) return null;

  return {
    event: maybeEvent,
    payload: {
      phoneNumberId: phoneNumberId || null,
      wabaId: wabaId || null,
      businessId: businessId || null,
    },
  };
}

function ensureMetaSdkLoaded(appId: string, graphVersion: string) {
  return new Promise<void>((resolve, reject) => {
    if (!appId) {
      reject(new Error("Meta app is not configured."));
      return;
    }

    const initialize = () => {
      if (!window.FB) {
        reject(new Error("Meta SDK failed to load."));
        return;
      }
      window.FB.init({
        appId,
        autoLogAppEvents: false,
        xfbml: false,
        version: graphVersion,
      });
      resolve();
    };

    if (window.FB) {
      initialize();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${META_SDK_SRC}"]`);
    window.fbAsyncInit = initialize;

    if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      existing.addEventListener("error", () => reject(new Error("Meta SDK failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = META_SDK_SRC;
    script.onload = initialize;
    script.onerror = () => reject(new Error("Meta SDK failed to load."));
    document.body.appendChild(script);
  });
}

export function WhatsAppEmbeddedSignupCard({ connection, onConnected }: Props) {
  const env = readEnv();
  const enabled = isConfiguredRuntimeValue(env.appId) && isConfiguredRuntimeValue(env.configId);
  const missingClientConfig = [
    !isConfiguredRuntimeValue(env.appId) ? "NEXT_PUBLIC_META_APP_ID" : null,
    !isConfiguredRuntimeValue(env.configId) ? "NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID" : null,
  ].filter(Boolean) as string[];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const eventRef = useRef<EmbeddedSignupEventPayload | null>(null);
  const completingRef = useRef(false);

  const completeSignup = useCallback(async () => {
    if (completingRef.current) return;
    const code = codeRef.current;
    const payload = eventRef.current;
    if (!code || !payload?.phoneNumberId) return;

    completingRef.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/inbox/unified/whatsapp/embedded-signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          phoneNumberId: payload.phoneNumberId,
          wabaId: payload.wabaId || undefined,
          businessId: payload.businessId || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Unable to complete WhatsApp onboarding.");
      }

      setSuccess("WhatsApp Business was connected successfully.");
      codeRef.current = null;
      eventRef.current = null;
      await onConnected?.();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to complete WhatsApp onboarding.");
    } finally {
      completingRef.current = false;
      setBusy(false);
    }
  }, [onConnected]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!META_ALLOWED_ORIGINS.has(event.origin)) return;
      const parsed = parseMessageEvent(event.data);
      if (!parsed) return;

      if (parsed.event.includes("CANCEL")) {
        setBusy(false);
        setError("WhatsApp onboarding was cancelled before completion.");
        codeRef.current = null;
        eventRef.current = null;
        return;
      }

      if (parsed.event.includes("ERROR")) {
        setBusy(false);
        setError("Meta returned an error during WhatsApp onboarding.");
        codeRef.current = null;
        eventRef.current = null;
        return;
      }

      if (parsed.event.includes("FINISH")) {
        eventRef.current = parsed.payload;
        void completeSignup();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [completeSignup]);

  const launchSignup = async () => {
    if (!enabled) {
      setError("Meta embedded signup is not configured in this deployment.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    codeRef.current = null;
    eventRef.current = null;

    try {
      await ensureMetaSdkLoaded(env.appId, env.graphVersion);
      if (!window.FB) {
        throw new Error("Meta SDK is unavailable.");
      }

      window.FB.login(
        (response) => {
          const code = String(response?.authResponse?.code || "").trim();
          if (!code) {
            setBusy(false);
            setError("Meta did not return an authorization code.");
            return;
          }
          codeRef.current = code;
          void completeSignup();
        },
        {
          config_id: env.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: 3,
          },
        }
      );
    } catch (sdkError: any) {
      setBusy(false);
      setError(sdkError?.message || "Unable to start WhatsApp onboarding.");
    }
  };

  return (
    <div className="space-y-3">
      {!enabled ? (
        <Alert variant="warning">
          WhatsApp connect is unavailable until real Meta app values are added. Missing runtime config: {missingClientConfig.join(", ")}.
        </Alert>
      ) : null}

      {connection?.mode === "whatsapp_api" ? (
        <div className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {connection.verifiedName || "WhatsApp Business"} connected
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {connection.displayPhoneNumber || "Business number connected"} - {connection.phoneNumberId}
          </p>
          {connection.qualityRating ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Quality rating: {connection.qualityRating}</p>
          ) : null}
        </div>
      ) : null}

      {success ? <Alert variant="success">{success}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={launchSignup}
          loading={busy}
          disabled={!enabled || busy}
          className={
            !enabled
              ? "cursor-not-allowed bg-slate-300 text-slate-600 shadow-none hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400"
              : ""
          }
        >
          {!enabled
            ? "WhatsApp connect unavailable"
            : connection?.mode === "whatsapp_api"
              ? "Reconnect WhatsApp Business"
              : "Connect WhatsApp Business"}
        </Button>
        {enabled ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Uses Meta embedded signup. No raw API tokens are typed into your app.</p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Add the real Meta app ID, signup config ID, and app secret, then restart the app.</p>
        )}
      </div>
    </div>
  );
}
