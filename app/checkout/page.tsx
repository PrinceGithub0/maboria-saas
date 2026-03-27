import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { isAllowedCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { getPlanPriceForInterval } from "@/lib/pricing";
import { requireOrgPermission, resolveOrgContext } from "@/lib/org-auth";
import { ensureCurrentSubscriptionForOrg } from "@/lib/subscription-downgrade";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const t = (en: string, fr?: string, de?: string, es?: string, pt?: string) =>
    getLocalizedText({ en, fr, de, es, pt }, language);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const orgContext = await resolveOrgContext(session.user.id);
  let checkoutUserId = session.user.id;
  let subscription = null as Awaited<ReturnType<typeof prisma.subscription.findFirst>>;

  if (orgContext) {
    const access = await requireOrgPermission(session.user.id, {
      permission: "subscription:manage",
      requireActiveSubscription: false,
    });
    if (!access.ok) {
      redirect("/dashboard");
    }

    checkoutUserId = access.context.ownerUserId;
    subscription = await ensureCurrentSubscriptionForOrg(access.context.ownerUserId, access.context.orgId);
  } else {
    subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-[980px] rounded-[14px] border border-[#EAEAEA] bg-white p-8 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.14)] sm:p-10">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">{t("Checkout", "Paiement", "Checkout", "Checkout", "Checkout")}</p>
          <h1 className="mt-3 text-3xl font-semibold">{t("Subscription not found", "Abonnement introuvable", "Abonnement nicht gefunden", "Suscripción no encontrada", "Subscrição não encontrada")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "We couldn't locate an active or pending subscription for this account. Please contact support to restore billing or sign out and try again.",
              "Nous n'avons pas pu trouver d'abonnement actif ou en attente pour ce compte. Veuillez contacter le support pour restaurer la facturation ou vous deconnecter puis réessayer.",
              "Wir konnten kein aktives oder ausstehendes Abonnement für dieses Konto finden. Bitte kontaktiere den Support, um die Abrechnung wiederherzustellen, oder melde dich ab und versuche es erneut.",
              "No pudimos encontrar una suscripción activa o pendiente para esta cuenta. Contacta con soporte para restaurar la facturación o cierra sesión e intentalo de nuevo.",
              "Não conseguimos encontrar uma subscrição ativa ou pendente para esta conta. Contacte o suporte para restaurar a faturação ou termine a sessão e tente novamente."
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/support"
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              {t("Contact support", "Contacter le support", "Support kontaktieren", "Contactar soporte", "Contactar suporte")}
            </Link>
            <Link
              href="/logout"
              className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              {t("Log out", "Se deconnecter", "Abmelden", "Cerrar sesión", "Terminar sessão")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: checkoutUserId },
    select: { preferredCurrency: true },
  });
  let currency = normalizeCurrency(user?.preferredCurrency || "USD");
  if (!isAllowedCurrency(currency)) {
    currency = "USD";
  }

  const monthlyPrice = getPlanPriceForInterval(subscription.plan, currency, "monthly");
  const yearlyPrice = getPlanPriceForInterval(subscription.plan, currency, "yearly");
  return (
    <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-8 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.14)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">{t("Checkout", "Paiement", "Checkout", "Checkout", "Checkout")}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{t("Complete your subscription", "Finalisez votre abonnement", "Abonnement abschliessen", "Completa tu suscripción", "Conclua a sua subscrição")}</h1>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            {t("Activate your selected plan to unlock automation, invoicing, WhatsApp workflows, and reporting.", "Activez le plan selectionne pour debloquer l'automatisation, la facturation, les workflows WhatsApp et les rapports.", "Aktiviere deinen ausgewahlten Plan, um Automatisierung, Rechnungen, WhatsApp-Workflows und Berichte freizuschalten.", "Activa tu plan seleccionado para desbloquear automatización, facturación, flujos de WhatsApp e informes.", "Ative o plano selecionado para desbloquear automação, faturação, fluxos de WhatsApp e relatórios.")}
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">
            {t("Secure checkout", "Paiement securise", "Sicherer Checkout", "Pago seguro", "Checkout seguro")} {"\u00B7"} {t("Cancel anytime", "Annulable a tout moment", "Jederzeit kundbar", "Cancela cuando quieras", "Cancele quando quiser")} {"\u00B7"} {t("No hidden fees", "Aucun frais cache", "Keine versteckten Gebühren", "Sin cargos ocultos", "Sem taxas escondidas")}
          </p>
        </div>
        <CheckoutPanel
          userId={checkoutUserId}
          plan={subscription.plan}
          interval={subscription.interval === "yearly" ? "yearly" : "monthly"}
          currency={currency}
          monthlyPrice={monthlyPrice}
          yearlyPrice={yearlyPrice}
        />
      </div>
    </div>
  );
}
