import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const faqs = [
  { q: "How do I create automations?", a: "Use the dashboard Automations tab or AI flow generator." },
  { q: "How does billing work?", a: "Choose USD (Stripe) or NGN (Paystack); subscriptions renew monthly." },
  { q: "Where can I see logs?", a: "Admins can view system logs in the Admin panel; users see run logs in dashboard." },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-12 text-slate-100">
      <h1 className="text-3xl font-semibold">Support Center</h1>
      <div className="grid gap-6 md:grid-cols-3">
        <Card title="FAQ">
          <div className="space-y-3 text-sm text-slate-300">
            {faqs.map((item) => (
              <div key={item.q}>
                <p className="font-semibold text-white">{item.q}</p>
                <p className="text-slate-400">{item.a}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Troubleshooting">
          <p className="text-sm text-slate-300">
            Restart failed automations from Runs, verify webhook signatures, ensure billing details are valid, and
            check system status on /status.
          </p>
        </Card>
        <Card title="Documentation">
          <p className="text-sm text-slate-300">See internal /docs for architecture, APIs, and deployment guides.</p>
        </Card>
      </div>
      <Card title="Contact support">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Email" placeholder="you@company.com" />
          <Input label="Subject" placeholder="Billing, automation, AI..." />
          <div className="md:col-span-2">
            <Textarea placeholder="Describe the issue" />
          </div>
          <div className="md:col-span-2">
            <Button>Submit ticket</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
