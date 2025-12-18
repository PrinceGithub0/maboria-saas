# Maboria SaaS Platform

Full-stack automation, billing, and AI platform built with Next.js 14 (App Router), TypeScript, TailwindCSS, Prisma, PostgreSQL, NextAuth, Stripe, Paystack, and OpenAI.

## Features
- Auth: email/password, password reset, optional email 2FA, role-based access (user/admin).
- Workspaces: businesses, members, workflows with triggers → conditions → actions, scheduler, retry queue, webhook listener.
- Automation engine: AI-assisted builder, run logs, restart, error recovery, WhatsApp/email/API/database actions, usage metering, auto-invoice, payment recovery.
- AI assistant: natural-language workflow generation, task explanations, suggestions, AI memory, business insights.
- Billing: Stripe (USD/EUR) subscriptions, Paystack (NGN), usage metering, transactions, invoices, failed payment notifications.
- Dashboards: user overview, automations, workflows, runs, invoices, payments, assistant, settings; admin metrics/users/logs/support/analytics.
- Notifications: in-app notifications, audit logs, rate limiting, CSRF-safe payment flows.
- DevOps: Dockerfile, docker-compose Postgres, Prisma migrations/seed, ESLint/Prettier, path aliases.

## Stack
- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4
- Prisma ORM + PostgreSQL
- NextAuth (Credentials + Prisma adapter)
- Stripe + Paystack
- OpenAI API (automation suggestions + assistant)
- Zod, bcryptjs, pdfkit, nodemailer, recharts, swr

## Project Structure
- `app/` – pages & API routes
  - `api/` – auth (signup/reset/2fa), automation (run/schedule), workflows, payments (stripe/paystack + webhooks), invoices (pdf), ai/assistant, admin (overview/users/logs/support), business, usage, notifications, transactions, webhooks ingest
  - `dashboard/` – overview, automations, workflows, runs, invoices, payments, assistant, settings
  - `admin/` – main, metrics, logs, support
  - `onboarding/` – business onboarding
- `components/` – UI library (buttons, inputs, cards, tables, tabs, modal, alerts, dropdown, sidebar/navbar, badges), charts, automation/workflow builders, assistant chat
- `lib/` – prisma client, auth config, validators (Zod), rate limiter, logger, email, invoice helpers, automation engine, payments helpers, AI helpers, billing/usage, jobs queue, assistant memory
- `prisma/` – `schema.prisma`, `seed.ts`
- `docs/API.md` – API summary
- `docker-compose.yml`, `Dockerfile`, `.env.example`, `middleware.ts`

## Environment Variables
Copy `.env.example` to `.env` and set:
- `DATABASE_URL`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_FROM`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `NEXT_PUBLIC_STRIPE_PRICE_*`
- `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`
- `OPENAI_API_KEY`, `APP_URL`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

## Setup
```bash
npm install
npx prisma generate
npx prisma migrate dev --name init   # requires DATABASE_URL
npm run db:seed
npm run dev
```
Start Postgres locally: `docker-compose up -d`.

## Automation Engine
- Steps: parseText, condition, extractData, callApi, databaseWrite, webhook, generateInvoice, sendEmail, sendWhatsApp, generateReport, aiTransform, meterUsage, recoverPayment, autoInvoice.
- Workflow builder uses triggers + ordered actions; webhook listener at `/api/webhooks/ingest?path=/path`.
- Scheduler `/api/automation/schedule`, run executor `/api/automation/run`, retry queue stub in `lib/jobs.ts`.

## Billing
- Stripe checkout `/api/payments/stripe`, Paystack init `/api/payments/paystack`, webhooks recorded to `Payment`.
- Transactions via `/api/transactions`, usage metering `/api/usage`, auto-invoice helper in `lib/billing.ts`.

## Admin
- Metrics `/api/admin/overview`, users `/api/admin/users`, logs `/api/admin/logs`, support `/api/admin/support`.
- Admin pages show revenue, runs, AI memory, users, payments, logs, support tickets.

## Testing & Verification
- `npm run lint` for linting.
- Seed users: `user@maboria.com` / `password123`, `admin@maboria.com` / `admin123`.
- Exercise dashboards and APIs per `docs/API.md`.
