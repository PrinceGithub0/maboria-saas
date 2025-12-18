export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-slate-100">
      <h1 className="text-3xl font-semibold">Maboria Internal Docs</h1>
      <section>
        <h2 className="text-xl font-semibold">Architecture overview</h2>
        <p className="text-sm text-slate-300">
          Next.js App Router, Prisma/Postgres, NextAuth, Stripe/Paystack, OpenAI. Clean architecture with lib/
          services, app/ routes, and shared UI components. Automation engine executes JSON-defined steps with AI augmentation.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Folder structure</h2>
        <ul className="text-sm text-slate-300 list-disc pl-4">
          <li>app/ - routes (marketing, dashboard, admin, api)</li>
          <li>lib/ - auth, prisma, ai router, billing, pricing, validators</li>
          <li>components/ - UI + builders + assistant</li>
          <li>prisma/ - schema, migrations, seed</li>
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-semibold">API reference</h2>
        <p className="text-sm text-slate-300">See docs/API.md for endpoints (auth, automations, payments, invoices, AI, admin).</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Database schema</h2>
        <p className="text-sm text-slate-300">Users, subscriptions, payments, invoices, automations, runs, AI memory, logs, settings.</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">AI system</h2>
        <p className="text-sm text-slate-300">
          Router supports flow generation, improvement, step generation, insights, diagnosis. Memory stored in AiMemory, usage logs in AiUsageLog.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Automation engine</h2>
        <p className="text-sm text-slate-300">
          Executes steps: parse, condition, extract, API call, DB write, webhook, invoice, email, AI transform, usage metering, recovery.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Payment system</h2>
        <p className="text-sm text-slate-300">
          Stripe for USD/EUR, Paystack for NGN. Webhooks with idempotency, dual-currency storage, subscriptions table, billing history API.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Deployment steps</h2>
        <ol className="text-sm text-slate-300 list-decimal pl-4">
          <li>Set env vars from .env.production.example</li>
          <li>Provision Postgres + run prisma migrate deploy</li>
          <li>Configure Stripe/Paystack webhooks</li>
          <li>Deploy Next.js (Vercel) and verify /api/health</li>
          <li>Run pre-launch checklist UI/API</li>
        </ol>
      </section>
    </div>
  );
}
