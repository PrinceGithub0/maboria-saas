 "use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";

export default function SettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const send2fa = async () => {
    const res = await fetch("/api/auth/2fa", { method: "POST" });
    const data = await res.json();
    setStatus(data.error || "2FA code sent to your email.");
  };

  const verify2fa = async () => {
    const res = await fetch("/api/auth/2fa", { method: "PUT", body: JSON.stringify({ code }) });
    const data = await res.json();
    setStatus(data.error || "2FA verified.");
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Settings</p>
        <h1 className="text-3xl font-semibold text-white">Profile & security</h1>
      </div>
      {status && <Alert variant="info">{status}</Alert>}
      <Card title="Profile">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" placeholder="Your name" />
          <Input label="Email" placeholder="you@company.com" />
          <div className="col-span-2">
            <Button>Save profile</Button>
          </div>
        </div>
      </Card>
      <Card title="Security">
        <div className="grid grid-cols-2 gap-4">
          <Input label="New password" type="password" />
          <Input label="Confirm password" type="password" />
          <div className="col-span-2">
            <Button variant="secondary">Update password</Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Button onClick={send2fa}>Send 2FA code</Button>
          <Input
            label="Enter 2FA code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <Button variant="secondary" onClick={verify2fa}>
            Verify 2FA
          </Button>
        </div>
      </Card>
    </div>
  );
}
