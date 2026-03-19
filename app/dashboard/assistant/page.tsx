"use client";

import { AssistantChat } from "@/components/assistant/chat";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/use-user";
import { useState } from "react";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/components/providers/language-provider";
import { isPlatformRole } from "@/lib/global-role";

export default function AssistantPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { user, isLoading } = useUser();
  const { data: session } = useSession();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const isAdmin = isPlatformRole(user?.role) || isPlatformRole(session?.user?.role);
  const canUseAI =
    isAdmin ||
    user?.plan === "starter" ||
    user?.plan === "pro" ||
    user?.plan === "growth" ||
    user?.plan === "business" ||
    user?.plan === "enterprise";
  const showGate = !isLoading && !canUseAI;

  return (
    <div className="min-h-[70vh]">
      {showGate && (
        <div className="mb-6 flex items-center gap-3 rounded-full border border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <Badge
            variant="default"
            className="badge-pro-feature dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
          >
            {t("Starter feature", "Fonction Starter")}
          </Badge>
          <span>{t("Upgrade to unlock the AI Assistant.", "Passez a Starter pour utiliser l assistant IA.")}</span>
          <Button size="sm" variant="secondary" onClick={() => setUpgradeOpen(true)}>
            {t("Upgrade", "Mettre a niveau")}
          </Button>
        </div>
      )}

      <div className="relative">
        {showGate && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur">
            <div className="max-w-sm space-y-2 text-center">
              <p className="text-sm font-semibold text-foreground">
                {t("Upgrade to Starter to use the AI Assistant", "Passez a Starter pour utiliser l assistant IA")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "AI features are available on Starter and higher plans.",
                  "Fonctions IA disponibles des plans Starter et plus."
                )}
              </p>
              <Button onClick={() => setUpgradeOpen(true)}>{t("Upgrade", "Mettre a niveau")}</Button>
            </div>
          </div>
        )}
        <div className={showGate ? "pointer-events-none opacity-50" : undefined}>
          <AssistantChat />
        </div>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} requiredPlan="starter" />
    </div>
  );
}
