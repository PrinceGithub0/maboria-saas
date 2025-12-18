import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Talk to us</p>
          <h1 className="text-4xl font-semibold text-white">Contact Maboria</h1>
          <p className="text-slate-400">We respond within one business day.</p>
        </div>
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Name" placeholder="Your name" />
              <Input label="Email" placeholder="you@company.com" />
            </div>
            <Input label="Company" placeholder="Company" />
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              Message
              <textarea className="min-h-[120px] rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none" />
            </label>
            <Button>Send message</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
