import { getServerSession } from "next-auth";
import { forbidden } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { log } from "@/lib/logger";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import CreatePlatformUserClientPage from "./CreatePlatformUserClient";

export default async function CreatePlatformUserPage() {
  const session = await getServerSession(authOptions);
  const actorRole = session?.user?.id ? await getActorSystemFlagRole(session.user.id) : "USER";
  if (!session?.user?.id || (actorRole !== "OPS_ADMIN" && actorRole !== "SUPER_ADMIN")) {
    log("warn", "identity_create_page_forbidden", {
      actorId: session?.user?.id || null,
      reason: "not_admin",
    });
    forbidden();
  }

  return <CreatePlatformUserClientPage />;
}
