export const billingEmail =
  process.env.NEXT_PUBLIC_BILLING_EMAIL ||
  process.env.NEXT_PUBLIC_EMAIL_BILLING_FROM ||
  "billing@maboria.com";

export const billingMailto = `mailto:${billingEmail}`;
