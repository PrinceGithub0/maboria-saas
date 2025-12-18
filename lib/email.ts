import nodemailer from "nodemailer";
import { log } from "./logger";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
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
