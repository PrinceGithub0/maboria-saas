import "server-only";

const requiredVars = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "FLUTTERWAVE_SECRET_KEY",
  "FLUTTERWAVE_PUBLIC_KEY",
  "OPENAI_API_KEY",
];

requiredVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom =
  process.env.PLATFORM_EMAIL_FROM ||
  process.env.EMAIL_INFO_FROM ||
  process.env.EMAIL_FROM ||
  process.env.EMAIL_SUPPORT_FROM ||
  "info@maboria.com";

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  nextAuthSecret: process.env.NEXTAUTH_SECRET!,
  nextAuthUrl: process.env.NEXTAUTH_URL!,
  paystackSecret: process.env.PAYSTACK_SECRET_KEY!,
  paystackPublic: process.env.PAYSTACK_PUBLIC_KEY!,
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET!,
  flutterwaveSecret: process.env.FLUTTERWAVE_SECRET_KEY!,
  flutterwavePublic: process.env.FLUTTERWAVE_PUBLIC_KEY!,
  flutterwaveWebhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || "",
  openaiKey: process.env.OPENAI_API_KEY!,
  resendApiKey,
  emailFrom,
  appUrl: process.env.APP_URL || process.env.NEXTAUTH_URL!,
  sentryDsn: process.env.SENTRY_DSN || "",
  logtail: process.env.LOGTAIL_SOURCE_TOKEN || "",
};
