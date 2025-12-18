"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function UpgradeModal({
  open,
  onClose,
  requiredPlan,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  requiredPlan: "starter" | "pro" | "enterprise";
  title?: string;
  description?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title ?? "Upgrade required"}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Plan</Badge>
          <span className="text-sm text-foreground">
            This feature requires{" "}
            <span className="font-semibold text-foreground">{requiredPlan.toUpperCase()}</span>.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {description ?? "Upgrade your plan to unlock this feature. Your account and data stay the same."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Link href="/dashboard/subscription" onClick={onClose}>
            <Button>View plans</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
