import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Talk to us</p>
          <h1 className="text-4xl font-semibold text-foreground">Contact Maboria</h1>
          <p className="text-muted-foreground">
            We respond within one business day. You can also email us at{" "}
            <a className="text-indigo-500 hover:text-indigo-400" href="mailto:info@maboria.com">
              info@maboria.com
            </a>
            .
          </p>
        </div>
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Name" placeholder="Your name" />
              <Input label="Email" placeholder="you@company.com" />
            </div>
            <Input label="Company" placeholder="Company" />
            <label className="flex flex-col gap-2 text-sm text-foreground">
              Message
              <textarea className="min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none" />
            </label>
            <Button>Send message</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
