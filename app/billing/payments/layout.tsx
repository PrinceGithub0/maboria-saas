import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layouts/app-shell";
import { authOptions } from "@/lib/auth";
import { resolveImpersonationFromRequestContext } from "@/lib/admin/impersonation";
import { evaluateWorkspaceGate, isOpsAdminRole, isPlatformRole, shouldRunWorkspaceChecks } from "@/lib/global-role";
import { resolveOrgContext } from "@/lib/org-auth";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import { prisma } from "@/lib/prisma";

export default async function BillingPaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const globalRole = await getActorSystemFlagRole(session.user.id);
  if (isPlatformRole(globalRole)) {
    const impersonation = await resolveImpersonationFromRequestContext(session.user.id);
    if (!impersonation && isOpsAdminRole(globalRole)) {
      redirect("/admin");
    }
    const effectiveRole = impersonation ? "USER" : globalRole;
    if (impersonation) {
      const context = await resolveOrgContext(session.user.id);
      const outcome = evaluateWorkspaceGate({
        globalRole: effectiveRole,
        hasTenantContext: Boolean(context),
        orgAccessStatus: context?.orgAccessStatus,
        subscriptionStatus: context?.orgSubscriptionStatus,
      });
      if (outcome === "onboarding") {
        redirect("/dashboard/onboarding");
      }
      if (outcome === "locked") {
        redirect("/billing/locked");
      }
    }
    return (
      <AppShell
        role={effectiveRole}
        announcement={process.env.NEXT_PUBLIC_ANNOUNCEMENT}
        impersonation={impersonation}
      >
        {children}
      </AppShell>
    );
  }

  if (shouldRunWorkspaceChecks(globalRole)) {
    const context = await resolveOrgContext(session.user.id);
    if (!context) {
      const subscription = await prisma.subscription.findFirst({
        where: { userId: session.user.id },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { status: true },
      });

      if (subscription?.status === "ACTIVE") {
        redirect("/dashboard/onboarding");
      }
      if (subscription) {
        redirect("/checkout");
      }
      redirect("/start-workspace");
    }
    const outcome = evaluateWorkspaceGate({
      globalRole,
      hasTenantContext: true,
      orgAccessStatus: context?.orgAccessStatus,
      subscriptionStatus: context?.orgSubscriptionStatus,
    });
    if (outcome === "onboarding") {
      redirect("/dashboard/onboarding");
    }
    if (outcome === "locked") {
      redirect("/billing/locked");
    }
  }

  return (
    <AppShell role={globalRole} announcement={process.env.NEXT_PUBLIC_ANNOUNCEMENT}>
      {children}
    </AppShell>
  );
}
