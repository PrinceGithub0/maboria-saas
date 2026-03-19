import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { listUserActivityTimeline, toUserActivityHttpError } from "@/lib/admin/user-activity";

type Params = {
  params:
    | { id: string }
    | Promise<{
        id: string;
      }>;
};

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const resolvedParams = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  try {
    const payload = await listUserActivityTimeline({
      actorId: session.user.id,
      userId: resolvedParams.id,
      cursor: url.searchParams.get("cursor"),
      cursorMode: url.searchParams.get("cursorMode") === "1",
      eventType: url.searchParams.get("eventType"),
      q: url.searchParams.get("q"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    const httpError = toUserActivityHttpError(error);
    return NextResponse.json({ error: httpError.message, code: httpError.code }, { status: httpError.status });
  }
});
