import "server-only";

import nodemailer from "nodemailer";
import { log } from "./logger";

const port = Number(process.env.EMAIL_SERVER_PORT) || 587;
const secure = process.env.EMAIL_SERVER_SECURE === "true" || port === 465;

const allowSelfSigned = process.env.EMAIL_ALLOW_SELF_SIGNED === "true";
const host = process.env.EMAIL_SERVER_HOST;
const user = process.env.EMAIL_SERVER_USER;
const pass = process.env.EMAIL_SERVER_PASSWORD;

function createTransport(options: { port: number; secure: boolean; allowInsecure?: boolean }) {
  return nodemailer.createTransport({
    host,
    port: options.port,
    secure: options.secure,
    requireTLS: !options.secure,
    family: 4,
    auth: { user, pass },
    tls:
      allowSelfSigned || options.allowInsecure
        ? { rejectUnauthorized: false, servername: host }
        : {
            servername: host,
          },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const primaryConfig = { port, secure };

function isRetryableSmtpError(err: unknown) {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const message = (err as Error | undefined)?.message || "";
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EPIPE" ||
    message.includes("ECONNRESET")
  );
}

function normalizeEmailError(err: unknown) {
  const message = String((err as Error | undefined)?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("self-signed certificate") || lower.includes("certificate")) {
    return "Email server certificate error. Please verify SMTP security settings.";
  }
  if (lower.includes("spam") || lower.includes("5.7.1") || lower.includes("jfe")) {
    return "Email rejected by the mail server. Please verify sender identity and try again.";
  }
  if (lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("econnrefused")) {
    return "Email server connection failed. Please try again.";
  }
  return "Email delivery failed. Please try again.";
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const from = process.env.EMAIL_FROM || "no-reply@maboria.com";
  const configs = [
    primaryConfig,
    { port: 587, secure: false },
    { port: 465, secure: true },
  ].filter(
    (cfg, idx, arr) => arr.findIndex((c) => c.port === cfg.port && c.secure === cfg.secure) === idx
  );

  let lastError: unknown;
  for (const cfg of configs) {
    try {
      const transport = createTransport(cfg);
      await transport.sendMail({ from, to, subject, html, attachments });
      log("info", "Email sent", { to, subject, port: cfg.port, secure: cfg.secure });
      return;
    } catch (error) {
      lastError = error;
      const err = error as NodeJS.ErrnoException;
      log("error", "Email send failed", { error: err?.message || err, port: cfg.port });
      if (!isRetryableSmtpError(error)) break;

      // Final fallback: allow insecure TLS once per config to handle bad certificate chains.
      try {
        const insecureTransport = createTransport({ ...cfg, allowInsecure: true });
        await insecureTransport.sendMail({ from, to, subject, html, attachments });
        log("info", "Email sent via insecure TLS fallback", { to, subject, port: cfg.port });
        return;
      } catch (fallbackError) {
        lastError = fallbackError;
        log("error", "Email insecure fallback failed", { error: (fallbackError as Error).message });
      }
    }
  }

  const safeError = new Error(normalizeEmailError(lastError));
  (safeError as any).status = 502;
  throw safeError;
}

export async function sendTemplateEmail(to: string, subject: string, html: string) {
  return sendEmail({ to, subject, html });
}
