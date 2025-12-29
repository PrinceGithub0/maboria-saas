import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16 space-y-8 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <div>
          <Badge variant="success">Built for operators</Badge>
          <h1 className="mt-3 text-4xl font-semibold text-foreground">Why Maboria</h1>
          <p className="mt-2 text-muted-foreground">
            We unify automations, billing, and AI so your teams can execute faster without stitching
            tools together.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Automation engine">
            <p className="text-sm text-muted-foreground">
              Drag-and-drop workflows with AI generated steps, restartable runs, and full logging.
            </p>
          </Card>
          <Card title="Financial ops">
            <p className="text-sm text-muted-foreground">
              Flutterwave (USD/Intl) and Paystack (NGN) in one control plane. Subscriptions, one-time, and
              audits.
            </p>
          </Card>
          <Card title="AI copilots">
            <p className="text-sm text-muted-foreground">
              Explain dashboards, generate flows, and draft invoices with OpenAI powered assistants.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
