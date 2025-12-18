# Production Deployment Checklist

1) Environment
- Copy `.env.production.example` to hosting env.
- Set DATABASE_URL (managed Postgres), NEXTAUTH_SECRET, NEXTAUTH_URL.
- Stripe keys + webhook secret, Paystack keys + webhook secret.
- OPENAI_API_KEY, EMAIL_*.
- NEXT_PUBLIC_ANNOUNCEMENT (optional), SENTRY_DSN/LOGTAIL token.

2) Database
- `npx prisma migrate deploy`
- `npm run db:generate`
- Seed if needed: `npm run db:seed` (adjust for production cautiously).
- Verify indices (see prisma/migrations).

3) Webhooks
- Stripe: point to `/api/payments/stripe/webhook`
- Paystack: point to `/api/payments/paystack/webhook`
- Test events in live mode.

4) Build & Test
- `npm run lint`
- `npm run build`
- `npm run check:prelaunch`
- Hit `/api/health`

5) Monitoring & Logs
- Configure Sentry/Logtail DSN
- Ensure activity logs + webhook logs visible in Admin.

6) Security
- Verify admin access control, CORS, security headers, HTTPS.
- Rotate secrets regularly.

7) Post-deploy
- Validate billing (Stripe USD, Paystack NGN)
- Run smoke tests: signup, onboarding, automation run, invoice create, AI assistant, admin pages.
- Announce via NEXT_PUBLIC_ANNOUNCEMENT if needed.
