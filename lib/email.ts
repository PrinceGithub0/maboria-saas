import nodemailer from "nodemailer";
import { log } from "./logger";

const port = Number(process.env.EMAIL_SERVER_PORT) || 587;
const secure = process.env.EMAIL_SERVER_SECURE === "true" || port === 465;

const allowSelfSigned = process.env.EMAIL_ALLOW_SELF_SIGNED === "true";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port,
  secure,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
  tls: allowSelfSigned
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.EMAIL_FROM || "no-reply@maboria.com";
  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
    log("info", "Email sent", { to, subject });
  } catch (error) {
    log("error", "Email send failed", { error });
    throw error;
  }
}

export async function sendTemplateEmail(to: string, subject: string, html: string) {
  return sendEmail({ to, subject, html });
}
