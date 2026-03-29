"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";

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
  compact?: boolean;
  hideUnavailableDetails?: boolean;
  buttonClassName?: string;
  containerClassName?: string;
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

export function WhatsAppEmbeddedSignupCard({
  connection,
  onConnected,
  compact = false,
  hideUnavailableDetails = false,
  buttonClassName,
  containerClassName,
}: Props) {
  const { language, t } = useLanguage();
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
        throw new Error(
          data?.error ||
            t(
              "Unable to complete WhatsApp onboarding.",
              "Impossible de finaliser l'onboarding WhatsApp.",
              "WhatsApp-Onboarding kann nicht abgeschlossen werden.",
              "No se pudo completar la configuración de WhatsApp.",
              "Não foi possivel concluir a configuração do WhatsApp."
            )
        );
      }

      setSuccess(
        t(
          "WhatsApp Business was connected successfully.",
          "WhatsApp Business a ?t? connecte avec succes.",
          "WhatsApp Business wurde erfolgreich verbunden.",
          "WhatsApp Business se conecto correctamente.",
          "O WhatsApp Business foi ligado com sucesso."
        )
      );
      codeRef.current = null;
      eventRef.current = null;
      await onConnected?.();
    } catch (requestError: any) {
      setError(
        requestError?.message ||
          t(
            "Unable to complete WhatsApp onboarding.",
            "Impossible de finaliser l'onboarding WhatsApp.",
            "WhatsApp-Onboarding kann nicht abgeschlossen werden.",
            "No se pudo completar la configuración de WhatsApp.",
            "Não foi possivel concluir a configuração do WhatsApp."
          )
      );
    } finally {
      completingRef.current = false;
      setBusy(false);
    }
  }, [onConnected, t]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!META_ALLOWED_ORIGINS.has(event.origin)) return;
      const parsed = parseMessageEvent(event.data);
      if (!parsed) return;

      if (parsed.event.includes("CANCEL")) {
        setBusy(false);
        setError(
          t(
            "WhatsApp onboarding was cancelled before completion.",
            "L'onboarding WhatsApp a ?t? annule avant la fin.",
            "Das WhatsApp-Onboarding wurde vor dem Abschluss abgebrochen.",
            "La configuración de WhatsApp se cancelo antes de completarse.",
            "A configuração do WhatsApp foi cancelada antes de terminar."
          )
        );
        codeRef.current = null;
        eventRef.current = null;
        return;
      }

      if (parsed.event.includes("ERROR")) {
        setBusy(false);
        setError(
          t(
            "Meta returned an error during WhatsApp onboarding.",
            "Meta a renvoye une erreur pendant l'onboarding WhatsApp.",
            "Meta hat wahrend des WhatsApp-Onboardings einen Fehler zurückgegeben.",
            "Meta devolvio un error durante la configuración de WhatsApp.",
            "A Meta devolveu um erro durante a configuração do WhatsApp."
          )
        );
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
  }, [completeSignup, t]);

  const launchSignup = async () => {
    if (!enabled) {
      setError(
        t(
          "Meta embedded signup is not configured in this deployment.",
          "L'inscription integree Meta n'est pas configuree sur ce deploiement.",
          "Das eingebettete Meta-Signup ist in diesem Deployment nicht konfiguriert.",
          "El alta integrada de Meta no esta configurada en este despliegue.",
          "O registo incorporado da Meta não esta configurado nesta instalacao."
        )
      );
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
        throw new Error(
          t(
            "Meta SDK is unavailable.",
            "Le SDK Meta est indisponible.",
            "Das Meta SDK ist nicht verfügbar.",
            "El SDK de Meta no esta disponible.",
            "O SDK da Meta não esta disponível."
          )
        );
      }

      window.FB.login(
        (response) => {
          const code = String(response?.authResponse?.code || "").trim();
          if (!code) {
            setBusy(false);
            setError(
              t(
                "Meta did not return an authorization code.",
                "Meta n'a pas renvoye de code d'autorisation.",
                "Meta hat keinen Autorisierungscode zurückgegeben.",
                "Meta no devolvio un código de autorizacion.",
                "A Meta não devolveu um código de autorizacao."
              )
            );
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
      setError(
        sdkError?.message ||
          t(
            "Unable to start WhatsApp onboarding.",
            "Impossible de demarrer l'onboarding WhatsApp.",
            "WhatsApp-Onboarding kann nicht gestartet werden.",
            "No se pudo iniciar la configuración de WhatsApp.",
            "Não foi possivel iniciar a configuração do WhatsApp."
          )
      );
    }
  };

  return (
    <div className={`space-y-3 ${containerClassName || ""}`.trim()}>
      {!enabled && !hideUnavailableDetails ? (
        <Alert variant="warning">
          {t("WhatsApp connect is unavailable until real Meta app values are added. Missing runtime config:", "La connexion WhatsApp est indisponible tant que les vraies valeurs de l'application Meta ne sont pas ajoutees. Configuration manquante :", "WhatsApp-Verbindung ist nicht verfügbar, bis echte Meta-App-Werte hinzugefugt wurden. Fehlende Runtime-Konfiguration:", "La conexion de WhatsApp no esta disponible hasta que se agreguen los valores reales de la app de Meta. Falta esta configuración:", "A ligacao do WhatsApp esta indisponivel at? serem adicionados valores reais da app Meta. Falta esta configuração:")} {missingClientConfig.join(", ")}.
        </Alert>
      ) : null}

      {connection?.mode === "whatsapp_api" && !compact ? (
        <div className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {connection.verifiedName || "WhatsApp Business"} {t("connected", "connecte", "verbunden", "conectado", "ligado")}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {connection.displayPhoneNumber || t("Business number connected", "Numero professionnel connecte", "Geschäftsnummer verbunden", "Numero comercial conectado", "Numero empresarial ligado")} - {connection.phoneNumberId}
          </p>
          {connection.qualityRating ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("Quality rating", "Qualite", "Qualitatsbewertung", "Calidad", "Qualidade")}: {connection.qualityRating}</p>
          ) : null}
        </div>
      ) : null}

      {success ? <Alert variant="success">{success}</Alert> : null}
      {error ? (
        <Alert variant="error">
          {localizeServerMessage(
            error,
            language,
            t(
              "Unable to complete WhatsApp onboarding.",
              "Impossible de finaliser l'onboarding WhatsApp.",
              "WhatsApp-Onboarding kann nicht abgeschlossen werden.",
              "No se pudo completar la configuraciÃ³n de WhatsApp.",
              "NÃ£o foi possivel concluir a configuraÃ§Ã£o do WhatsApp."
            )
          )}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={launchSignup}
          loading={busy}
          disabled={!enabled || busy}
          className={
            `${!enabled
              ? "cursor-not-allowed bg-slate-300 text-slate-600 shadow-none hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400"
              : ""} ${buttonClassName || ""}`.trim()
          }
        >
          {!enabled
            ? t("WhatsApp connect unavailable", "Connexion WhatsApp indisponible", "WhatsApp-Verbindung nicht verfügbar", "Conexion de WhatsApp no disponible", "Ligacao do WhatsApp indisponivel")
            : connection?.mode === "whatsapp_api"
              ? t("Reconnect WhatsApp Business", "Reconnecter WhatsApp Business", "WhatsApp Business erneut verbinden", "Reconectar WhatsApp Business", "Ligar novamente o WhatsApp Business")
              : t("Connect WhatsApp Business", "Connecter WhatsApp Business", "WhatsApp Business verbinden", "Conectar WhatsApp Business", "Ligar WhatsApp Business")}
        </Button>
        {!compact && enabled ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("Uses Meta embedded signup. No raw API tokens are typed into your app.", "Utilise l'inscription integree Meta. Aucun jeton API brut n'est saisi dans votre application.", "Verwendet das eingebettete Meta-Signup. Es werden keine rohen API-Tokens in deine App eingegeben.", "Usa el alta integrada de Meta. No se escriben tokens API sin procesar en la app.", "Utiliza o registo incorporado da Meta. Não sao introduzidos tokens API brutos na aplicacao.")}</p>
        ) : !compact ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("Add the real Meta app ID, signup config ID, and app secret, then restart the app.", "Ajoutez l'identifiant reel de l'application Meta, l'identifiant de configuration d'inscription et le secret de l'application, puis redemarrez l'application.", "Füge die echte Meta-App-ID, die Signup-Konfigurations-ID und das App-Secret hinzu und starte dann die App neu.", "Agrega el ID real de la app de Meta, el ID de configuración de alta y el secreto de la app, y luego reinicia la aplicación.", "Adicione o ID real da app Meta, o ID de configuração de registo e o segredo da app, depois reinicie a aplicacao.")}</p>
        ) : !enabled && hideUnavailableDetails ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              "WhatsApp is not available on this deployment yet.",
              "WhatsApp n'est pas encore disponible sur ce deploiement.",
              "WhatsApp ist in dieser Bereitstellung noch nicht verfugbar.",
              "WhatsApp aun no esta disponible en este despliegue.",
              "O WhatsApp ainda nao esta disponivel nesta implementacao."
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
