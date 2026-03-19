import "server-only";

import {
  EmailType,
  getSenderForEmailType,
  sendBillingMail,
  sendInfoMail,
  sendNotificationsMail,
  sendMailByType,
  sendPlatformMail,
  sendSecurityMail,
  sendSupportMail,
  type MailAttachment,
  type TypedMailPayload,
} from "@/lib/email/mailer";

export {
  EmailType,
  getSenderForEmailType,
  sendSupportMail,
  sendPlatformMail,
  sendSecurityMail,
  sendNotificationsMail,
  sendBillingMail,
  sendInfoMail,
  sendMailByType,
};
export type { MailAttachment, TypedMailPayload };

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  replyTo,
  headers,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
}) {
  return sendInfoMail({ to, subject, html, attachments, replyTo, headers });
}

export async function sendTemplateEmail(to: string, subject: string, html: string) {
  return sendInfoMail({ to, subject, html });
}
