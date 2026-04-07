"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";

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
  const { m } = useLanguage();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? m("upgrade.required.title")}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">{m("common.plan")}</Badge>
          <span className="text-sm text-foreground">
            {m("upgrade.required.featureRequires")}{" "}
            <span className="font-semibold text-foreground">{requiredPlan.toUpperCase()}</span>.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {description ?? m("upgrade.required.description")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {m("common.notNow")}
          </Button>
          <Link href="/dashboard/subscription" onClick={onClose}>
            <Button>{m("subscription.viewPlans")}</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
