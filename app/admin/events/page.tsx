import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { hasActiveImpersonationForActor } from "@/lib/admin/impersonation";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import EventsExplorerClient from "./EventsExplorerClient";

export default async function AdminEventsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (actorRole !== "OPS_ADMIN" && actorRole !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const cookieHeader = (await headers()).get("cookie");
  const impersonating = await hasActiveImpersonationForActor({
    actorUserId: session.user.id,
    cookieHeader,
  });
  if (impersonating) {
    redirect("/dashboard");
  }

  return <EventsExplorerClient actorRole={actorRole} />;
}
