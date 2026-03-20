import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUsageReportSnapshot, resolveUsageReportAccess } from "@/lib/usage/report";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const featureSchema = z.enum([
  "ai_requests",
  "invoices",
  "whatsapp_messages",
  "automations_runs",
  "team_members_seats",
]);

function sanitizeCsvCell(value: unknown) {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

function csvEscape(value: unknown) {
  const safe = sanitizeCsvCell(value).replace(/"/g, '""');
  return `"${safe}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map((header) => csvEscape(header)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return lines.join("\n");
}

function buildSnapshotRows(snapshot: Awaited<ReturnType<typeof getUsageReportSnapshot>>) {
  return snapshot.cards.map((card) => ({
    date: new Date().toISOString(),
    feature: card.featureKey,
    amount: Number(card.used ?? 0),
    type: "summary",
    status: card.unlimited ? "unlimited" : "recorded",
    source: "snapshot",
    idempotency_key: "",
  }));
}

export async function GET(req: Request) {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cycle = (searchParams.get("cycle") || "current").toLowerCase();
  if (cycle !== "current") {
    return NextResponse.json({ error: "Only cycle=current is supported." }, { status: 400 });
  }

  const featureParam = searchParams.get("feature");
  const feature = featureParam ? featureSchema.safeParse(featureParam) : null;
  if (feature && !feature.success) {
    return NextResponse.json({ error: "Invalid feature key." }, { status: 400 });
  }

  try {
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

    const snapshot = await getUsageReportSnapshot(session.user.id, access);
    const selectedFeature = feature?.success ? feature.data : null;

    const events = await prisma.usageEvent.findMany({
      where: {
        orgId: snapshot.orgId,
        cycleKey: snapshot.cycle.key,
        ...(selectedFeature
          ? {
              featureKey:
                selectedFeature === "ai_requests"
                  ? "AI_REQUESTS"
                  : selectedFeature === "invoices"
                    ? "INVOICES"
                    : selectedFeature === "whatsapp_messages"
                      ? "WHATSAPP_MESSAGES"
                      : selectedFeature === "automations_runs"
                        ? "AUTOMATIONS_RUNS"
                        : "TEAM_MEMBERS_SEATS",
            }
          : {}),
      },
      orderBy: { occurredAt: "asc" },
      select: {
        occurredAt: true,
        featureKey: true,
        quantity: true,
        source: true,
        idempotencyKey: true,
      },
    });

    const eventRows = events.map((event) => ({
      date: event.occurredAt.toISOString(),
      feature:
        event.featureKey === "AI_REQUESTS"
          ? "ai_requests"
          : event.featureKey === "INVOICES"
            ? "invoices"
            : event.featureKey === "WHATSAPP_MESSAGES"
              ? "whatsapp_messages"
              : event.featureKey === "AUTOMATIONS_RUNS"
                ? "automations_runs"
                : "team_members_seats",
      amount: Number(event.quantity) || 0,
      type: "usage",
      status: "recorded",
      source: event.source.toLowerCase(),
      idempotency_key: event.idempotencyKey,
    }));

    const recentActivityRows = snapshot.recentActivity
      .filter((row) => (selectedFeature ? row.featureKey === selectedFeature : true))
      .map((row) => ({
        date: row.date,
        feature: row.featureKey,
        amount: row.amount,
        type: row.type,
        status: row.status,
        source: "snapshot",
        idempotency_key: "",
      }));

    const snapshotRows = buildSnapshotRows(snapshot).filter((row) =>
      selectedFeature ? row.feature === selectedFeature : true
    );

    let rows =
      eventRows.length > 0
        ? eventRows
        : selectedFeature === "team_members_seats"
          ? snapshotRows
          : recentActivityRows.length > 0
            ? recentActivityRows
            : snapshotRows;

    if (!selectedFeature && !rows.some((row) => row.feature === "team_members_seats")) {
      rows = [
        ...rows,
        ...snapshotRows.filter((row) => row.feature === "team_members_seats"),
      ];
    }

    const csv = toCsv(rows);
    const suffix = selectedFeature ? `${selectedFeature}` : "full_cycle";
    const filename = `usage-${suffix}-${snapshot.cycle.startAt.slice(0, 10)}.csv`;

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "USAGE_EXPORT_GENERATED",
        resourceType: "usage_export",
        metadata: {
          orgId: snapshot.orgId,
          feature: selectedFeature ?? "full_cycle",
          format: "csv",
          mode: selectedFeature ? "detailed" : "summary",
          range: "current",
          include: selectedFeature ? "filtered_feature" : "full_cycle",
          recordCount: rows.length,
        },
      },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("usage_export_failed", error);
    return NextResponse.json(
      { error: "Unable to generate export right now. Please try again." },
      { status: 500 }
    );
  }
}
