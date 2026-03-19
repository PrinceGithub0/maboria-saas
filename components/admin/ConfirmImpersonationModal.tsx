"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tenantName: string;
};

export function ConfirmImpersonationModal({ open, onClose, onConfirm, tenantName }: Props) {
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmChecked(false);
      setConfirmText("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const canSubmit = confirmChecked && confirmText === "IMPERSONATE" && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Unable to start impersonation.");
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title="Confirm Impersonation">
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">You are about to impersonate this tenant account.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>This will switch your session from Admin -&gt; Tenant view.</li>
            <li>You will no longer have admin access during impersonation.</li>
            <li>Subscription rules and restrictions will apply.</li>
            <li>Actions are audited.</li>
            <li>Click &quot;Exit Impersonation&quot; to return to Admin.</li>
          </ul>
          <p className="mt-2 text-xs text-amber-800">{`Tenant: ${tenantName || "Unknown tenant"}`}</p>
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(event) => setConfirmChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>I understand I will act as the tenant user and not as Admin.</span>
        </label>

        <Input
          label='Type "IMPERSONATE" to confirm'
          placeholder='Type "IMPERSONATE" to confirm'
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
        />

        {error ? <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!canSubmit}
            loading={submitting}
            className="border border-rose-700"
          >
            Confirm &amp; Impersonate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
