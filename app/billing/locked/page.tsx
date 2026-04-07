import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getPlanPriceForInterval } from "@/lib/pricing";
import { getCheckoutPlanConfig } from "@/lib/checkout-plan-config";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { CheckCircle2 } from "lucide-react";
import { RetrySecurePaymentButton } from "./retry-secure-payment-button";
import { resolveImpersonationFromRequestContext } from "@/lib/admin/impersonation";
import { ExitImpersonationButton } from "./exit-impersonation-button";
import { resolveOrgContext } from "@/lib/org-auth";
import { canManageSubscription } from "@/lib/org-permissions";
import { ensureCurrentSubscriptionForOrg } from "@/lib/subscription-downgrade";
import { getPendingRenewalCheckoutForSubscription } from "@/lib/subscription-renewal";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscription-display";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";

function TrustLockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="15" r="1.2" />
      <path d="M12 16.2V17.4" />
    </svg>
  );
}

function TrustShieldCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.8L18 6.3v5.5c0 3.7-2.3 7-6 8.4-3.7-1.4-6-4.7-6-8.4V6.3L12 3.8Z" />
      <path d="m9.6 12.4 1.8 1.8 3.2-3.2" />
    </svg>
  );
}

function formatPlanPrice(currency: string, price: number | null) {
  if (price == null) return "-";
  const formatted = price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
}

export default async function BillingLockedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signup");
  }
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const t = (en: string, fr?: string, de?: string, es?: string, pt?: string) =>
    getLocalizedText({ en, fr, de, es, pt }, language);

  const impersonation = await resolveImpersonationFromRequestContext(session.user.id);
  const context = await resolveOrgContext(session.user.id);
  const actorCanManageSubscription = context ? canManageSubscription(context.role) : false;
  const owner =
    context
      ? await prisma.user.findUnique({
          where: { id: context.ownerUserId },
          select: { name: true, email: true },
        })
      : null;

  const [subscription, orgSub] = context
    ? await Promise.all([
        ensureCurrentSubscriptionForOrg(context.ownerUserId, context.orgId),
        prisma.orgSubscription.findUnique({
          where: { orgId: context.orgId },
          select: {
            provider: true,
            providerPaymentMethodData: true,
          },
        }),
      ])
    : [null, null];

  const plan = subscription?.plan || "STARTER";
  const interval = subscription?.interval === "yearly" ? "yearly" : "monthly";
  const currency = normalizeCurrency(subscription?.currency || "USD");
  const price = getPlanPriceForInterval(plan, currency, interval);
  const planConfig = getCheckoutPlanConfig(plan);
  const selectedPlanName = planConfig.planName.replace(/\s+Plan$/i, "");
  const planDescription =
    planConfig.positioning ||
    t(
      "Continue with your selected plan to unlock all premium features.",
      "Continuez avec le plan selectionne pour debloquer toutes les fonctionnalites premium.",
      "Fahre mit deinem ausgewahlten Plan fort, um alle Premium-Funktionen freizuschalten.",
      "Continua con tu plan seleccionado para desbloquear todas las funciones premium.",
      "Continue com o plano selecionado para desbloquear todas as funcionalidades premium."
    );
  const subscriptionStatus = resolveSubscriptionDisplayStatus(
    subscription?.status || context?.orgSubscriptionStatus || null,
    subscription?.renewalDate || null
  );
  const pendingRenewalCheckout = subscription ? await getPendingRenewalCheckoutForSubscription(subscription.id) : null;
  const pendingRenewalRedirectUrl =
    pendingRenewalCheckout?.providerPayload &&
    typeof pendingRenewalCheckout.providerPayload === "object" &&
    !Array.isArray(pendingRenewalCheckout.providerPayload)
      ? String(
          (pendingRenewalCheckout.providerPayload as Record<string, unknown>).nextActionUrl ||
            ((pendingRenewalCheckout.providerPayload as Record<string, unknown>).providerInit as Record<string, unknown> | undefined)
              ?.data &&
            typeof ((pendingRenewalCheckout.providerPayload as Record<string, unknown>).providerInit as Record<string, unknown>).data ===
              "object"
              ? String(
                  (
                    ((pendingRenewalCheckout.providerPayload as Record<string, unknown>).providerInit as Record<string, unknown>)
                      .data as Record<string, unknown>
                  ).link || ""
                )
              : ""
        ).trim() || null
      : null;
  const hasPendingRenewalRedirect = actorCanManageSubscription && subscriptionStatus === "PAST_DUE" && Boolean(pendingRenewalRedirectUrl);
  const canAttemptFlutterwaveRenewal =
    actorCanManageSubscription &&
    subscriptionStatus === "PAST_DUE" &&
    String(orgSub?.provider || "").toUpperCase() === "FLUTTERWAVE" &&
    Boolean(orgSub?.providerPaymentMethodData) &&
    subscription?.autoRenew !== false &&
    subscription?.cancelAtPeriodEnd !== true;

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-16 text-slate-900 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_40px_-28px_rgba(15,23,42,0.28)] sm:p-8">
          {impersonation ? (
            <div className="impersonation-banner mb-5 rounded-xl border p-3 text-sm font-semibold">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {`Impersonating: ${impersonation.targetEmail || impersonation.targetName || "Tenant user"} (Tenant: ${impersonation.tenantName || "Unknown tenant"})`}
                </p>
                <ExitImpersonationButton />
              </div>
            </div>
          ) : null}

            <div className="absolute right-6 top-6 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            {actorCanManageSubscription
              ? t("Subscription Incomplete", "Abonnement incomplet", "Abonnement unvollstandig", "Suscripción incompleta", "Subscrição incompleta")
              : t("Workspace Locked", "Espace de travail verrouille", "Workspace gesperrt", "Espacio de trabajo bloqueado", "Espa?o de trabalho bloqueado")}
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">{t("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação")}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {actorCanManageSubscription
              ? hasPendingRenewalRedirect
                ? t("Complete Your Renewal", "Finalisez votre renouvellement", "Erneuerung abschliessen", "Completa tu renovacion", "Conclua a sua renovacao")
                : t("Complete Your Subscription", "Finalisez votre abonnement", "Abonnement abschliessen", "Completa tu suscripción", "Conclua a sua subscrição")
              : t("Workspace Subscription Inactive", "Abonnement de l'espace de travail inactif", "Workspace-Abonnement inaktiv", "Suscripción del espacio de trabajo inactiva", "Subscrição do espa?o de trabalho inativa")}
          </h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            {actorCanManageSubscription
              ? hasPendingRenewalRedirect
                ? t("Your renewal is waiting on Flutterwave confirmation. Complete it to unlock full access.", "Votre renouvellement attend la confirmation Flutterwave. Finalisez-le pour debloquer l'accès complet.", "Deine Erneuerung wartet auf die Flutterwave-Bestätigung. Schliesse sie ab, um den vollen Zugriff freizuschalten.", "Tu renovacion esta pendiente de confirmaci?n de Flutterwave. Completala para desbloquear el acceso completo.", "A sua renovacao esta a aguardar confirma??o da Flutterwave. Conclua-a para desbloquear o acesso total.")
                : t("Your account is almost ready. Complete payment to unlock full access.", "Votre compte est presque pr?t. Finalisez le paiement pour debloquer l'accès complet.", "Dein Konto ist fast bereit. Schliesse die Zahlung ab, um den vollen Zugriff freizuschalten.", "Tu cuenta esta casi lista. Completa el pago para desbloquear el acceso completo.", "A sua conta esta quase pronta. Conclua o pagamento para desbloquear o acesso total.")
              : `${t("This workspace is currently unavailable because its subscription is inactive. Contact", "Cet espace de travail est actuellement indisponible car son abonnement est inactif. Contactez", "Dieser Workspace ist derzeit nicht verfügbar, weil sein Abonnement inaktiv ist. Kontaktiere", "Este espacio de trabajo no est? disponible porque su suscripción esta inactiva. Contacta con", "Este espa?o de trabalho esta indispon?vel porque a sua subscrição esta inativa. Contacte")} ${
                  owner?.name || owner?.email || "the workspace owner"
                } ${t("to restore access.", "pour restaurer l'accès.", "um den Zugriff wiederherzustellen.", "para restaurar el acceso.", "para restaurar o acesso.")}`}
          </p>

          {actorCanManageSubscription ? (
            <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{t("Selected Plan", "Plan selectionne", "Ausgewahlter Plan", "Plan seleccionado", "Plano selecionado")}</p>
              <p className="mt-3 text-xl font-semibold text-slate-900">{selectedPlanName}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{formatPlanPrice(currency, price)}</p>
              <p className="mt-2 text-sm font-medium text-slate-600">{t("Billed", "Facture", "Abgerechnet", "Facturado", "Cobrado")} {interval === "yearly" ? t("yearly", "annuellement", "jährlich", "anualmente", "anualmente") : t("monthly", "mensuellement", "monatlich", "mensualmente", "mensalmente")}</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{planDescription}</p>
            </section>
          ) : null}

          {actorCanManageSubscription ? (
            <section className="mt-6">
              <ul className="space-y-3">
                {planConfig.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-700 sm:text-base">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" strokeWidth={2} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="text-base font-semibold text-slate-900">
              {actorCanManageSubscription
                ? t("Payment Status", "Etat du paiement", "Zahlungsstatus", "Estado del pago", "Estado do pagamento")
                : t("Next Step", "Etape suivante", "Nächster Schritt", "Siguiente paso", "Próximo passo")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {actorCanManageSubscription
                ? hasPendingRenewalRedirect
                  ? t("A Flutterwave renewal is already in progress for this workspace.", "Un renouvellement Flutterwave est déjà en cours pour cet espace de travail.", "Für diesen Workspace lauft bereits eine Flutterwave-Erneuerung.", "Ya hay una renovacion de Flutterwave en curso para este espacio de trabajo.", "Ja existe uma renovacao Flutterwave em curso para este espa?o de trabalho.")
                  : canAttemptFlutterwaveRenewal
                  ? hasPendingRenewalRedirect
                    ? t("A Flutterwave renewal is waiting for final bank approval.", "Un renouvellement Flutterwave attend l'approbation finale de la banque.", "Eine Flutterwave-Erneuerung wartet auf die endgültige Bankfreigabe.", "Una renovacion de Flutterwave esta esperando la aprobacion final del banco.", "Uma renovacao Flutterwave esta a aguardar a aprovacao final do banco.")
                    : t("Your workspace is past due. We can retry the saved Flutterwave payment method now.", "Votre espace de travail est en retard de paiement. Nous pouvons réessayer le moyen de paiement Flutterwave enregistr? maintenant.", "Dein Workspace ist überfällig. Wir können jetzt die gespeicherte Flutterwave-Zahlungsmethode erneut versuchen.", "Tu espacio de trabajo esta vencido. Podemos reintentar ahora el método de pago Flutterwave guardado.", "O seu espa?o de trabalho esta em atraso. Podemos voltar a tentar agora o método de pagamento Flutterwave guardado.")
                  : t("Your previous payment attempt was not completed.", "Votre pr\u00e9c\u00e9dente tentative de paiement n'a pas \u00e9t\u00e9 finalis\u00e9e.", "Dein vorheriger Zahlungsversuch wurde nicht abgeschlossen.", "Tu intento de pago anterior no se completo.", "A sua tentativa de pagamento anterior não foi conclu?da.")
                : t("Only the workspace owner or billing admin can restore subscription access.", "Seul le proprietaire de l'espace de travail ou l'administrateur de facturation peut restaurer l'accès ? l'abonnement.", "Nur der Workspace-Eigentümer oder ein Abrechnungsadministrator kann den Abonnementzugriff wiederherstellen.", "Solo el propietario del espacio de trabajo o el administrador de facturación puede restaurar el acceso a la suscripción.", "Apenas o proprietário do espa?o de trabalho ou o administrador de faturação podem restaurar o acesso a subscrição.")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {actorCanManageSubscription
                ? hasPendingRenewalRedirect
                  ? t("Continue the pending Flutterwave payment to restore workspace access.", "Poursuivez le paiement Flutterwave en attente pour restaurer l'accès ? l'espace de travail.", "Setze die ausstehende Flutterwave-Zahlung fort, um den Workspace-Zugriff wiederherzustellen.", "Continua el pago pendiente de Flutterwave para restaurar el acceso al espacio de trabajo.", "Continue o pagamento Flutterwave pendente para restaurar o acesso ao espa?o de trabalho.")
                  : canAttemptFlutterwaveRenewal
                  ? hasPendingRenewalRedirect
                    ? t("Continue the pending Flutterwave renewal to unlock the workspace.", "Poursuivez le renouvellement Flutterwave en attente pour debloquer l'espace de travail.", "Setze die ausstehende Flutterwave-Erneuerung fort, um den Workspace zu entsperren.", "Continua la renovacion pendiente de Flutterwave para desbloquear el espacio de trabajo.", "Continue a renovacao Flutterwave pendente para desbloquear o espa?o de trabalho.")
                    : t("We will attempt the recurring renewal first and only fall back to checkout if needed.", "Nous tenterons d'abord le renouvellement recurrent et ne basculerons vers le paiement classique qu'en cas de besoin.", "Wir versuchen zuerst die wiederkehrende Erneuerung und wechseln nur bei Bedarf zum Checkout.", "Intentaremos primero la renovacion recurrente y solo pasaremos al checkout si hace falta.", "Tentaremos primeiro a renovacao recorrente e so iremos para o checkout se necessario.")
                  : t("Retry below to activate your subscription instantly.", "R?essayez ci-dessous pour activer instantanement votre abonnement.", "Versuche es unten erneut, um dein Abonnement sofort zu aktivieren.", "Vuelve a intentarlo abajo para activar tu suscripción al instante.", "Tente novamente abaixo para ativar a sua subscrição instantaneamente.")
                : owner?.email
                  ? `${t("Ask", "Demandez a", "Bitte", "Pide a", "Peça a")} ${owner.email} ${t("to renew or reactivate the workspace subscription.", "de renouveler ou reactiver l'abonnement de l'espace de travail.", "das Workspace-Abonnement zu erneuern oder zu reaktivieren.", "que renueve o reactive la suscripción del espacio de trabajo.", "que renove ou reative a subscrição do espa?o de trabalho.")}`
                  : t("Ask the workspace owner to renew or reactivate the workspace subscription.", "Demandez au proprietaire de l'espace de travail de renouveler ou reactiver l'abonnement.", "Bitte den Workspace-Eigentümer, das Abonnement zu erneuern oder zu reaktivieren.", "Pide al propietario del espacio de trabajo que renueve o reactive la suscripción.", "Peça ao proprietário do espa?o de trabalho para renovar ou reativar a subscrição.")}
            </p>
          </section>

          <div className="mt-6">
            {actorCanManageSubscription ? (
              <RetrySecurePaymentButton
                mode={hasPendingRenewalRedirect || canAttemptFlutterwaveRenewal ? "flutterwave_renewal" : "checkout"}
                autoStart={hasPendingRenewalRedirect || canAttemptFlutterwaveRenewal}
              />
            ) : null}
            <div className="mt-3 text-center">
              <Link href="/logout" className="text-sm font-medium text-slate-500 transition hover:text-slate-700">
                {t("Log out", "Se deconnecter", "Abmelden", "Cerrar sesión", "Terminar sessão")}
              </Link>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex items-center justify-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#6B7280] sm:px-2 sm:text-sm sm:whitespace-normal">
              <TrustLockIcon />
              <span>{t("SSL Encrypted", "SSL chiffre", "SSL-verschlusselt", "Cifrado SSL", "Encriptado SSL")}</span>
              <span aria-hidden="true">{"\u00B7"}</span>
              <TrustShieldCheckIcon />
              <span>{t("Secure global payment processing", "Traitement s?curis? des paiements mondiaux", "Sichere globale Zahlungsabwicklung", "Procesamiento global de pagos seguro", "Processamento global de pagamentos seguro")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

