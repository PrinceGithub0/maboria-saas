import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const plans = [
  {
    name: "Starter",
    price: "$29",
    desc: "Solo operators getting started",
    features: ["100 automations/month", "Invoice generator", "Email support"],
  },
  {
    name: "Growth",
    price: "$99",
    desc: "Scaling teams with revenue ops",
    features: [
      "Unlimited automations",
      "Stripe + Paystack",
      "AI assistant",
      "Audit logging",
      "Priority support",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "Security, SSO, bespoke workflows",
    features: [
      "Dedicated automation pods",
      "AI guardrails",
      "Custom SLAs",
      "Dedicated CSM",
      "Advanced reporting",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-16 space-y-10">
        <div className="text-center space-y-3">
          <Badge variant="success">Stripe · Paystack</Badge>
          <h1 className="text-4xl font-semibold text-white">Pricing that scales with you</h1>
          <p className="text-slate-400">
            Flexible billing in USD, EUR, and NGN. Switch plans anytime and stay compliant.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`h-full border-slate-800 bg-slate-900/60 ${plan.featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : ""}`}
              title={plan.name}
              actions={plan.featured ? <Badge variant="success">Popular</Badge> : undefined}
            >
              <div className="space-y-4">
                <p className="text-3xl font-semibold text-white">{plan.price}</p>
                <p className="text-sm text-slate-400">{plan.desc}</p>
                <ul className="space-y-2 text-sm text-slate-200">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/signup">
                  <Button variant={plan.featured ? "primary" : "secondary"} className="w-full">
                    Start {plan.name}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
