const requiredVars = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_FROM",
];

requiredVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const env = {
  databaseUrl: process.env.DATABASE_URL!,
  nextAuthSecret: process.env.NEXTAUTH_SECRET!,
  nextAuthUrl: process.env.NEXTAUTH_URL!,
  stripeKey: process.env.STRIPE_SECRET_KEY!,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  paystackSecret: process.env.PAYSTACK_SECRET_KEY!,
  paystackPublic: process.env.PAYSTACK_PUBLIC_KEY!,
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET!,
  openaiKey: process.env.OPENAI_API_KEY!,
  emailUser: process.env.EMAIL_SERVER_USER!,
  emailPass: process.env.EMAIL_SERVER_PASSWORD!,
  emailHost: process.env.EMAIL_SERVER_HOST!,
  emailPort: Number(process.env.EMAIL_SERVER_PORT!),
  emailFrom: process.env.EMAIL_FROM!,
  appUrl: process.env.APP_URL || process.env.NEXTAUTH_URL!,
  sentryDsn: process.env.SENTRY_DSN || "",
  logtail: process.env.LOGTAIL_SOURCE_TOKEN || "",
};
