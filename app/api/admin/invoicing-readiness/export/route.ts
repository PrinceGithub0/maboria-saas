import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import {
  getEInvoiceCountryProductionSignoff,
  summarizeEInvoiceProductionSignoff,
} from "@/lib/einvoicing/production-signoffs";
import { listCountryLaunchReadiness, type CountryLaunchState } from "@/lib/invoicing/country-readiness";
import { getCountryRegulatoryReview } from "@/lib/invoicing/regulatory-review-registry";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  state: z.string().trim().optional(),
  q: z.string().trim().max(200).optional(),
});

const VALID_STATES = new Set<CountryLaunchState>(["LIVE", "BETA", "MANUAL_REVIEW", "NOT_READY"]);

function csvEscape(value: unknown) {
  const stringValue = String(value ?? "");
  if (!/[,"\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function normalizeState(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return VALID_STATES.has(normalized as CountryLaunchState) ? (normalized as CountryLaunchState) : null;
}

export const GET = withErrorHandling(async (req: Request) => {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    format: url.searchParams.get("format") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const values = parsed.data;
  const selectedState = normalizeState(values.state);
  const query = String(values.q || "").trim().toLowerCase();
  const rows = listCountryLaunchReadiness().filter((row) => {
    if (selectedState && row.launchState !== selectedState) return false;
    if (!query) return true;
    return (
      row.countryCode.toLowerCase().includes(query) ||
      row.countryName.toLowerCase().includes(query) ||
      row.blockers.some((blocker) => blocker.toLowerCase().includes(query))
    );
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (values.format === "json") {
    const enrichedRows = rows.map((row) => {
      const signoff = getEInvoiceCountryProductionSignoff(row.countryCode);
      const signoffSummary = summarizeEInvoiceProductionSignoff(signoff);
      const regulatoryReview = getCountryRegulatoryReview(row.countryCode);
      return {
        ...row,
        eInvoiceGateProgress: signoffSummary.totalCount
          ? `${signoffSummary.passedCount}/${signoffSummary.totalCount}`
          : null,
        eInvoiceEvidenceCount: signoff?.evidenceCount || 0,
        eInvoicePendingGates: signoffSummary.pendingGateLabels,
        regulatoryReview,
      };
    });

    return new NextResponse(JSON.stringify(enrichedRows, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoicing-readiness-${stamp}.json"`,
      },
    });
  }

  const header = [
    "countryCode",
    "countryName",
    "laúnchState",
    "supportLevel",
    "taxSystem",
    "requiresEInvoicing",
    "activeBlueprintImplementation",
    "researchedBlueprintImplementation",
    "evidenceCount",
    "lastReviewedAt",
    "eInvoiceProviderKey",
    "eInvoiceCompletionStage",
    "eInvoiceProductionReady",
    "eInvoicePromotionState",
    "eInvoicePromotionPriority",
    "eInvoiceProductionReviewedAt",
    "eInvoiceGateProgress",
    "eInvoiceEvidenceCount",
    "eInvoicePendingGates",
    "regulatoryOwner",
    "regulatoryLastReviewedAt",
    "regulatoryNextReviewDueAt",
    "regulatoryCadenceDays",
    "regulatorySourceCount",
    "blockers",
  ];
  const csv = [
    header.join(","),
    ...rows.map((row) => {
      const signoff = getEInvoiceCountryProductionSignoff(row.countryCode);
      const signoffSummary = summarizeEInvoiceProductionSignoff(signoff);
      const regulatoryReview = getCountryRegulatoryReview(row.countryCode);
      return [
        row.countryCode,
        row.countryName,
        row.launchState,
        row.supportLevel,
        row.taxSystem,
        row.requiresEInvoicing,
        row.activeBlueprintImplementation,
        row.researchedBlueprintImplementation,
        row.evidenceCount,
        row.lastReviewedAt,
        row.eInvoiceProviderKey,
        row.eInvoiceCompletionStage,
        row.eInvoiceProductionReady,
        row.eInvoicePromotionState,
        row.eInvoicePromotionPriority,
        row.eInvoiceProductionReviewedAt,
        signoffSummary.totalCount ? `${signoffSummary.passedCount}/${signoffSummary.totalCount}` : "",
        signoff?.evidenceCount || 0,
        signoffSummary.pendingGateLabels.join(" | "),
        regulatoryReview?.owner || "",
        regulatoryReview?.lastReviewedAt || "",
        regulatoryReview?.nextReviewDueAt || "",
        regulatoryReview?.cadenceDays || "",
        regulatoryReview?.sourceEvidenceCount || 0,
        row.blockers.join(" | "),
      ]
        .map(csvEscape)
        .join(",");
    }),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoicing-readiness-${stamp}.csv"`,
    },
  });
});
