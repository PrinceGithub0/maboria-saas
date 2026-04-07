import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

import { authOptions } from "@/lib/auth";
import { PaymentSuccessToast } from "@/components/ui/payment-success-toast";
import { Alert } from "@/components/ui/alert";
import { SubscriberOverviewDashboard } from "@/components/dashboard/subscriber-overview-dashboard";
import { getSubscriberDashboardData } from "@/lib/dashboard/subscriber-data";
import { hasOrgPermission, requireOrgPermission } from "@/lib/org-auth";
import { getLocalizedText, normalizeLanguage, type LocalizedText } from "@/lib/i18n";

type DashboardSearchParams = {
  range?: string;
  from?: string;
  to?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const localize = (text: LocalizedText) => getLocalizedText(text, language);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    const localizedAccessMessage =
      access.code === "ORG_ACCESS_DENIED"
        ? localize({
            en: "Organization access denied.",
            fr: "Accès à l'organisation refuse.",
            de: "Organisationszugriff verweigert.",
            es: "Acceso a la organización denegado.",
            pt: "Acesso a organização negado.",
          })
        : access.code === "TENANT_SUSPENDED"
          ? access.message === "Organization access has been disabled."
            ? localize({
                en: "Organization access has been disabled.",
                fr: "L'acc\u00e8s \u00e0 l'organisation a \u00e9t\u00e9 d\u00e9sactiv\u00e9.",
                de: "Der Organisationszugriff wurde deaktiviert.",
                es: "El acceso a la organización ha sido deshabilitado.",
                pt: "O acesso a organização foi desativado.",
              })
            : localize({
                en: "Organization access is suspended.",
                fr: "L accès à l'organisation est suspendu.",
                de: "Der Organisationszugriff ist ausgesetzt.",
                es: "El acceso a la organización esta suspendido.",
                pt: "O acesso a organização esta suspenso.",
              })
          : access.code === "SUBSCRIPTION_INACTIVE"
            ? access.message === "Organization subscription inactive. Please renew billing."
              ? localize({
                  en: "Organization subscription inactive. Please renew billing.",
                  fr: "L abonnement de l'organisation est inactif. Veuillez renouveler la facturation.",
                  de: "Das Organisationsabonnement ist inaktiv. Bitte erneuere die Abrechnung.",
                  es: "La suscripción de la organización esta inactiva. Renueva la facturación.",
                  pt: "A subscrição da organização esta inativa. Renove a faturação.",
                })
              : localize({
                  en: "Organization subscription inactive. Please contact the organization owner.",
                  fr: "L abonnement de l'organisation est inactif. Veuillez contacter le proprietaire de l'organisation.",
                  de: "Das Organisationsabonnement ist inaktiv. Bitte kontaktiere den Eigentümer der Organisation.",
                  es: "La suscripción de la organización esta inactiva. Ponte en contacto con el propietario de la organización.",
                  pt: "A subscrição da organização esta inativa. Contacte o proprietário da organização.",
                })
            : access.code === "FORBIDDEN"
              ? localize({
                  en: "You do not have permission for this action.",
                  fr: "Vous n'avez pas l autorisation pour cette action.",
                  de: "Du hast keine Berechtigung für diese Aktion.",
                  es: "No tienes permiso para esta acción.",
                  pt: "Não tem permissao para esta ação.",
                })
              : access.message;
    return (
      <div className="space-y-4">
        <Alert variant="error">{localizedAccessMessage}</Alert>
      </div>
    );
  }

  const resolved = searchParams ? await searchParams : undefined;
  const initialData = await getSubscriberDashboardData({
    userId: session.user.id,
    range: resolved?.range,
    from: resolved?.from,
    to: resolved?.to,
    scope: {
      orgId: access.context.orgId,
      ownerUserId: access.context.ownerUserId,
      canViewBilling: hasOrgPermission(access.context.role, "settings:payout:write"),
    },
  });

  return (
    <div className="space-y-4">
      <PaymentSuccessToast />
      <SubscriberOverviewDashboard initialData={initialData} />
    </div>
  );
}
