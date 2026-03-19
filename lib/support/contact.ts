export const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
  process.env.NEXT_PUBLIC_EMAIL_SUPPORT_FROM ||
  "support@mail.maboria.com";

export const supportMailto = `mailto:${supportEmail}`;
