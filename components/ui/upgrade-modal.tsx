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
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t("Upgrade required", "Mise a niveau requise")}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">{t("Plan", "Plan")}</Badge>
          <span className="text-sm text-foreground">
            {t("This feature requires", "Cette fonctionnalite demande")}{" "}
            <span className="font-semibold text-foreground">{requiredPlan.toUpperCase()}</span>.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {description ??
            t(
              "Upgrade your plan to unlock this feature. Your account and data stay the same.",
              "Ameliorez votre plan pour debloquer cette fonction. Votre compte et vos donnees restent identiques."
            )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t("Not now", "Pas maintenant")}
          </Button>
          <Link href="/dashboard/subscription" onClick={onClose}>
            <Button>{t("View plans", "Voir les plans")}</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
