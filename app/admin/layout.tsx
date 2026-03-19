import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/layouts/app-shell";
import { AdminIncidentBanner } from "@/components/admin/AdminIncidentBanner";
import { isPlatformRole } from "@/lib/global-role";
import { resolveImpersonationFromRequestContext } from "@/lib/admin/impersonation";
import { getActorSystemFlagRole } from "@/lib/system-flags";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (!isPlatformRole(actorRole)) {
    redirect("/dashboard");
  }
  const impersonation = await resolveImpersonationFromRequestContext(session.user.id);
  if (impersonation) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      role={actorRole}
      announcement={process.env.NEXT_PUBLIC_ANNOUNCEMENT}
      impersonation={impersonation}
    >
      <>
        <AdminIncidentBanner />
        {children}
      </>
    </AppShell>
  );
}
