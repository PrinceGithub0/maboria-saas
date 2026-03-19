import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceEntitlement } from "@/lib/entitlements";
import { getPaymentsLedgerData } from "@/lib/billing/payments-ledger";
import { billingEmail, billingMailto } from "@/lib/billing/contact";
import { requireBillingAccess } from "@/lib/permissions";
import { PaymentsLedgerPage } from "@/components/billing/payments-ledger-page";
import { Alert } from "@/components/ui/alert";

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
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return (
      <div className="mx-auto w-full max-w-[1280px] space-y-4 pb-6">
        <Alert variant="error">Access denied.</Alert>
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
        <Alert variant="error">{entitlement.reason || "Upgrade required to view payments."}</Alert>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams);
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
        Billing questions?{" "}
        <a href={billingMailto} className="font-medium text-slate-700 hover:underline dark:text-slate-200">
          {billingEmail}
        </a>
        .
      </p>
    </div>
  );
}
