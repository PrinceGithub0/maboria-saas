import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceEntitlement } from "@/lib/entitlements";
import { getPaymentsLedgerData } from "@/lib/billing/payments-ledger";
import { billingEmail, billingMailto } from "@/lib/billing/contact";
import { requireBillingAccess } from "@/lib/permissions";
import { PaymentsLedgerPage } from "@/components/billing/payments-ledger-page";
import { Alert } from "@/components/ui/alert";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";

type SearchParams = {
  range?: string;
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  page?: string;
};

export default async function BillingPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const t = (en: string, fr?: string, de?: string, es?: string, pt?: string) =>
    getLocalizedText({ en, fr, de, es, pt }, language);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return (
      <div className="mx-auto w-full max-w-[1280px] space-y-4 pb-6">
        <Alert variant="error">{t("Access denied.", "Accès refuse.", "Zugriff verweigert.", "Acceso denegado.", "Acesso negado.")}</Alert>
      </div>
    );
  }

  const entitlement = await enforceEntitlement(access.ownerUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return (
      <div className="mx-auto w-full max-w-[1280px] space-y-4 pb-6">
        <Alert variant="error">{entitlement.reason || t("Upgrade required to view payments.", "Mise a niveau requise pour voir les paiements.", "Upgrade erforderlich, um Zahlungen zu sehen.", "Se requiere una mejora para ver los pagos.", "Atualizacao necessária para ver os pagamentos.")}</Alert>
      </div>
    );
  }

  const params = searchParams ? await searchParams : undefined;
  const initialData = await getPaymentsLedgerData({
    userId: access.ownerUserId,
    range: params?.range,
    from: params?.from,
    to: params?.to,
    status: params?.status,
    query: params?.q,
    page: Number(params?.page || 1),
    pageSize: 20,
  });

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 pb-6">
      <PaymentsLedgerPage initialData={initialData} initialStatus={params?.status || "all"} initialQuery={params?.q || ""} />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("Billing questions? ", "Questions de facturation ? ", "Fragen zur Abrechnung? ", "Preguntas de facturación? ", "Duvidas de faturação? ")}
        <a href={billingMailto} className="font-medium text-slate-700 hover:underline dark:text-slate-200">
          {billingEmail}
        </a>
      </p>
    </div>
  );
}
