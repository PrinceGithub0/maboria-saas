# API Surface

Base: `/api`

- `auth/[...nextauth]` – NextAuth handlers (login via credentials).
- `auth/signup` – POST name,email,password -> create user.
- `auth/forgot` – POST email -> password reset token emailed.
- `auth/reset` – POST token,password -> update password.
- `user/me` – GET current user, subscriptions.
- `automation` – GET list, POST create flow.
- `automation/[id]` – GET/PUT/DELETE flow by id.
- `automation/run` – POST { flowId, input } -> executes flow.
- `automation/runs` – GET runs for user with flow reference.
- `invoice` – GET list, POST create invoice.
- `invoice/[id]` – GET single, DELETE invoice.
- `payments` – GET user payments history.
- `payments/flutterwave` – POST { plan, currency } -> checkout session.
- `payments/flutterwave/webhook` – Flutterwave webhook (signature required).
- `payments/paystack` – POST { amount, currency } -> init Paystack.
- `payments/paystack/webhook` – Paystack webhook (HMAC signature).
- `ai/assistant` – POST { mode: "automation"|"assistant", prompt } -> AI response.
- `admin/overview` – GET metrics (admin only).
- `admin/users` – GET users + subscriptions (admin).
- `admin/logs` – GET activity logs (admin).
- `support` – GET/POST support tickets.
- `business` – GET/POST businesses for user.
- `workflows` – GET/POST workflows (triggers+actions).
- `workflows/[id]` – GET/PUT/DELETE workflow.
- `automation/schedule` – POST schedule future run.
- `notifications` – GET/POST/PUT mark read.
- `usage` – GET/POST usage records.
- `transactions` – GET/POST transactions.
- `webhooks/ingest` – POST webhook events routed to triggers (?path=/...).
- `auth/2fa` – POST send code, PUT verify code.

All endpoints return JSON. Validation via Zod where applicable; rate limiting on signup, AI, automation run. Auth required for non-public routes; admin routes require role check.
