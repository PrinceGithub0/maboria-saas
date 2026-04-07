import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import { eInvoicingConnectionSchema } from "@/lib/validators";
import {
  deleteEInvoiceConnection,
  getEInvoiceConnectionForUser,
  listEInvoiceConnectionsForUser,
  upsertEInvoiceConnection,
} from "@/lib/einvoicing/connections";
import {
  getEInvoiceProviderDefinition,
  listEInvoiceProviderDefinitions,
} from "@/lib/einvoicing/provider-registry";
import { assessEInvoiceReadiness } from "@/lib/einvoicing/readiness";
import { LIMITED_COUNTRY_EINVOICING_ROLLOUT } from "@/lib/einvoicing/rollout-matrix";
import { resolveEInvoiceProvider } from "@/lib/einvoicing/resolve-provider";

const getSuggestedProvider = (country?: string | null) => {
  const normalized = String(country || "").trim().toUpperCase();
  if (!normalized) return null;
  return resolveEInvoiceProvider({ sellerCountry: normalized });
};

const buildConnectionReadiness = (connection: {
  provider: string;
  country: string;
  status: string;
  sandbox: boolean;
  hasCredentials: boolean;
  credentialKeys: string[];
  lastValidatedAt: string | null;
  lastError: string | null;
} | null) => {
  if (!connection) return null;
  const provider = resolveEInvoiceProvider({ sellerCountry: connection.country });
  const providerDefinition = getEInvoiceProviderDefinition(connection.provider);
  const rollout = LIMITED_COUNTRY_EINVOICING_ROLLOUT.find((item) => item.country === connection.country) || null;
  return assessEInvoiceReadiness({
    providerDefinition,
    rollout,
    connection,
    liveSubmissionImplemented: Boolean(providerDefinition?.liveSubmissionAvailable) && Boolean(provider?.submit),
    statusSyncImplemented: Boolean(provider?.getStatus),
    cancellationImplemented: Boolean(provider?.cancel),
  });
};

export const GET = withRequestLogging(
  withErrorHandling(async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "settings:business:read",
      requireActiveSubscription: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const targetUserId = access.context.ownerUserId;
    const [businessProfile, connections] = await Promise.all([
      prisma.businessProfile.findUnique({
        where: { userId: targetUserId },
        select: { country: true },
      }),
      listEInvoiceConnectionsForUser(targetUserId),
    ]);
    const suggestedProvider = getSuggestedProvider(businessProfile?.country);
    const selectedConnection = suggestedProvider
      ? connections.find((connection) => connection.provider === suggestedProvider.key) || null
      : null;
    const selectedReadiness = buildConnectionReadiness(selectedConnection);

    return NextResponse.json({
      country: businessProfile?.country ?? null,
      suggestedProvider: getEInvoiceProviderDefinition(suggestedProvider?.key ?? null),
      selectedConnection,
      selectedReadiness,
      items: connections.map((connection) => ({
        ...connection,
        readiness: buildConnectionReadiness(connection),
      })),
      providers: listEInvoiceProviderDefinitions(),
      rollout: LIMITED_COUNTRY_EINVOICING_ROLLOUT,
    });
  })
);

export const PUT = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "settings:business:write",
      requireActiveSubscription: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const parsed = eInvoicingConnectionSchema.parse(await req.json());
    if (parsed.clearCredentials && parsed.credentials) {
      return NextResponse.json(
        { error: "Choose either credentials or clearCredentials, not both." },
        { status: 400 }
      );
    }

    const suggestedProvider = getSuggestedProvider(parsed.country);
    if (!suggestedProvider || suggestedProvider.key !== parsed.provider) {
      return NextResponse.json(
        { error: "Provider does not match the selected seller country." },
        { status: 400 }
      );
    }

    const connection = await upsertEInvoiceConnection({
      userId: access.context.ownerUserId,
      provider: parsed.provider,
      country: parsed.country,
      sandbox: parsed.sandbox ?? true,
      status: parsed.status ?? "ACTIVE",
      credentials: parsed.clearCredentials ? null : parsed.credentials,
      metadata: parsed.metadata,
      lastValidatedAt: null,
      lastError: null,
    });

    await writeOrgAuditLog({
      orgId: access.context.orgId,
      actorUserId: session.user.id,
      targetUserId: access.context.ownerUserId,
      actionType: "EINVOICING_CONNECTION_UPSERTED",
      metadata: {
        provider: connection.provider,
        country: connection.country,
        sandbox: connection.sandbox,
        status: connection.status,
        hasCredentials: connection.hasCredentials,
      },
    });

    return NextResponse.json(connection);
  })
);

export const DELETE = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "settings:business:write",
      requireActiveSubscription: true,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
    }

    const url = new URL(req.url);
    const provider = String(url.searchParams.get("provider") || "").trim().toUpperCase();
    if (
      !provider ||
      ![
        "MYINVOIS",
        "RO_EFACTURA",
        "MYDATA",
        "ZATCA",
        "IT_SDI",
        "MX_CFDI",
        "BR_NFE",
        "CL_DTE",
        "CO_DIAN",
        "PE_SUNAT",
        "HU_NAV",
        "MD_EFACTURA",
      ].includes(provider)
    ) {
      return NextResponse.json({ error: "Valid provider is required." }, { status: 400 });
    }

    const existing = await getEInvoiceConnectionForUser({
      userId: access.context.ownerUserId,
      provider: provider as
        | "MYINVOIS"
        | "RO_EFACTURA"
        | "MYDATA"
        | "ZATCA"
        | "IT_SDI"
        | "MX_CFDI"
        | "BR_NFE"
        | "CL_DTE"
        | "CO_DIAN"
        | "PE_SUNAT"
        | "HU_NAV"
        | "MD_EFACTURA",
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteEInvoiceConnection({
      userId: access.context.ownerUserId,
      provider: existing.provider,
    });

    await writeOrgAuditLog({
      orgId: access.context.orgId,
      actorUserId: session.user.id,
      targetUserId: access.context.ownerUserId,
      actionType: "EINVOICING_CONNECTION_DELETED",
      metadata: {
        provider: existing.provider,
        country: existing.country,
      },
    });

    return NextResponse.json({ success: true });
  })
);
