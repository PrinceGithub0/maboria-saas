import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { PaymentSuccessToast } from "@/components/ui/payment-success-toast";
import { Alert } from "@/components/ui/alert";
import { SubscriberOverviewDashboard } from "@/components/dashboard/subscriber-overview-dashboard";
import { getSubscriberDashboardData } from "@/lib/dashboard/subscriber-data";
import { hasOrgPermission, requireOrgPermission } from "@/lib/org-auth";

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{access.message}</Alert>
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
      canAI: true,
    },
  });

  return (
    <div className="space-y-4">
      <PaymentSuccessToast />
      <SubscriberOverviewDashboard initialData={initialData} />
    </div>
  );
}
