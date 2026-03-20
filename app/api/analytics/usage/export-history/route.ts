import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUsageReportAccess } from "@/lib/usage/report";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const createSchema = z.object({
  feature: z.string().min(1).max(80),
  format: z.enum(["csv", "xlsx"]),
  mode: z.enum(["summary", "detailed"]),
  range: z.enum(["this_month", "last_month", "custom"]),
  include: z.enum(["summary_only", "full_logs"]).optional(),
  recordCount: z.number().int().min(0).max(200000).optional(),
});

function readString(meta: Record<string, unknown>, key: string, fallback = "") {
  const value = meta[key];
  return typeof value === "string" ? value : fallback;
}

export async function GET() {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await resolveUsageReportAccess(session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  if (access.orgAccessStatus !== "ACTIVE") {
    return NextResponse.json({ error: "Organization access is not active." }, { status: 403 });
  }
  if (access.orgSubscriptionStatus !== "ACTIVE") {
    return NextResponse.json({ error: "Organization subscription inactive." }, { status: 403 });
  }

  const logs = await prisma.activityLog.findMany({
    where: {
      userId: session.user.id,
      action: "USAGE_EXPORT_GENERATED",
      metadata: {
        path: ["orgId"],
        equals: access.orgId,
      },
    },
    orderBy: { timestamp: "desc" },
    take: 20,
    select: {
      id: true,
      timestamp: true,
      metadata: true,
    },
  });

  const items = logs.map((log) => {
    const metadata =
      log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};
    return {
      id: log.id,
      feature: readString(metadata, "feature", "Usage"),
      format: readString(metadata, "format", "csv"),
      mode: readString(metadata, "mode", "summary"),
      createdAt: log.timestamp.toISOString(),
    };
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await resolveUsageReportAccess(session.user.id);
  if (!access) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  if (access.orgAccessStatus !== "ACTIVE") {
    return NextResponse.json({ error: "Organization access is not active." }, { status: 403 });
  }
  if (access.orgSubscriptionStatus !== "ACTIVE") {
    return NextResponse.json({ error: "Organization subscription inactive." }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = parsed.data;
  const created = await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "USAGE_EXPORT_GENERATED",
      resourceType: "usage_export",
      metadata: {
        orgId: access.orgId,
        feature: payload.feature,
        format: payload.format,
        mode: payload.mode,
        range: payload.range,
        include: payload.include ?? null,
        recordCount: payload.recordCount ?? null,
      },
    },
    select: {
      id: true,
      timestamp: true,
      metadata: true,
    },
  });

  const metadata =
    created.metadata && typeof created.metadata === "object" && !Array.isArray(created.metadata)
      ? (created.metadata as Record<string, unknown>)
      : {};

  return NextResponse.json({
    item: {
      id: created.id,
      feature: readString(metadata, "feature", "Usage"),
      format: readString(metadata, "format", "csv"),
      mode: readString(metadata, "mode", "summary"),
      createdAt: created.timestamp.toISOString(),
    },
  });
}
