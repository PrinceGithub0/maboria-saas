"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr?: string | null } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");

  const { data: totpStatus, mutate: refreshTotp } = useSWR("/api/auth/2fa/totp", fetcher);
  const enabled = Boolean(totpStatus?.enabled);

  const startTotpSetup = async () => {
    setStatus(null);
    setBackupCodes(null);
    const res = await fetch("/api/auth/2fa/totp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not start 2FA setup.");
      return;
    }
    setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
    setStatus("Scan the setup in your authenticator app (or enter the secret), then confirm with a code.");
  };

  const enableTotp = async () => {
    if (!otp.trim()) return;
    const res = await fetch("/api/auth/2fa/totp", { method: "PUT", body: JSON.stringify({ code: otp }) });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not enable 2FA.");
      return;
    }
    setSetup(null);
    setOtp("");
    setBackupCodes(data.backupCodes || null);
    setStatus("Two-factor authentication enabled.");
    refreshTotp();
  };

  const disableTotp = async () => {
    if (!disableCode.trim()) return;
    const res = await fetch("/api/auth/2fa/totp", {
      method: "DELETE",
      body: JSON.stringify({ code: disableCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not disable 2FA.");
      return;
    }
    setDisableCode("");
    setBackupCodes(null);
    setSetup(null);
    setStatus("Two-factor authentication disabled.");
    refreshTotp();
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

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Authenticator 2FA (TOTP)</p>
              <p className="text-xs text-slate-400">
                Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.).
              </p>
            </div>
            <div className="flex gap-2">
              {!enabled ? (
                <Button onClick={startTotpSetup}>Enable 2FA</Button>
              ) : (
                <Button variant="secondary" onClick={() => refreshTotp()}>
                  Refresh
                </Button>
              )}
            </div>
          </div>

          {!enabled && setup && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                {setup.qr ? (
                  <div className="mb-3 flex items-center justify-center">
                    <img
                      src={setup.qr}
                      alt="Authenticator setup QR code"
                      className="h-44 w-44 rounded-xl border border-slate-800 bg-white p-2"
                    />
                  </div>
                ) : null}
                <p className="font-semibold text-white">Setup secret</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">{setup.secret}</p>
                <p className="mt-2 font-semibold text-white">Setup link (otpauth)</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">{setup.uri}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label="Enter 6-digit code from your authenticator app"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                />
                <Button onClick={enableTotp}>Confirm & enable</Button>
              </div>
            </div>
          )}

          {enabled && (
            <div className="mt-4 space-y-3">
              <Alert variant="success">2FA is enabled for your account.</Alert>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label="Disable 2FA (enter current 2FA code or a backup code)"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or ABCDE-F1234"
                />
                <Button variant="secondary" onClick={disableTotp}>
                  Disable
                </Button>
              </div>
            </div>
          )}

          {backupCodes?.length ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-200">Backup codes</p>
              <p className="mt-1 text-xs text-amber-100/90">
                Save these now. Each code can be used once if you lose access to your authenticator app.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {backupCodes.map((c) => (
                  <div
                    key={c}
                    className="rounded-lg border border-amber-500/20 bg-slate-950/40 px-3 py-2 font-mono text-xs text-amber-100"
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
