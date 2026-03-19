import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import { hasActiveImpersonationForActor } from "@/lib/admin/impersonation";
import ReceiptPreviewClient from "./ReceiptPreviewClient";

export default async function ReceiptPreviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorRole = await getActorSystemFlagRole(session.user.id);
  if (actorRole !== "SUPER_ADMIN") {
    redirect("/admin");
  }

  const cookieHeader = (await headers()).get("cookie");
  const impersonating = await hasActiveImpersonationForActor({
    actorUserId: session.user.id,
    cookieHeader,
  });
  if (impersonating) {
    redirect("/dashboard");
  }

  return <ReceiptPreviewClient />;
}
