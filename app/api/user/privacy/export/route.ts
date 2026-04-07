import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { resolveOrgContext } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import {
  buildUserPrivacyExportFilename,
  buildUserPrivacyExportPayload,
} from "@/lib/user-privacy";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const orgContext = await resolveOrgContext(userId);
  const [user, memberships, businessProfile, subscriptions, merchantAccount, eInvoicingConnections, connectedMailboxes, activityLogs, auditLogs, userActivityLogs, supportTickets, customerCount, invoiceCount, paymentCount, automationCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          publicId: true,
          name: true,
          email: true,
          role: true,
          status: true,
          authProvider: true,
          onboardingComplete: true,
          tourComplete: true,
          preferredCurrency: true,
          locale: true,
          timeZone: true,
          twoFactorEnabled: true,
          isPlatformUser: true,
          createdAt: true,
          lastLoginAt: true,
          archivedAt: true,
        },
      }),
      prisma.businessMember.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: {
          business: {
            select: {
              id: true,
              name: true,
              accessStatus: true,
              createdAt: true,
              orgSubscription: {
                select: {
                  planId: true,
                  status: true,
                  billingInterval: true,
                  currentCycleStartAt: true,
                  currentCycleEndAt: true,
                  paidThroughAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.businessProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          businessName: true,
          country: true,
          defaultCurrency: true,
          businessAddress: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          businessEmail: true,
          businessPhone: true,
          taxId: true,
          registrationNumber: true,
          branchCode: true,
          vatEnabled: true,
          vatRate: true,
          vatRateDisplay: true,
          vatPricingMode: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.merchantAccount.findUnique({
        where: { userId },
        select: {
          id: true,
          provider: true,
          payoutType: true,
          accountName: true,
          accountNumber: true,
          iban: true,
          bicSwift: true,
          payoutDetails: true,
          currency: true,
          country: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.eInvoicingConnection.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.connectedMailbox.findMany({
        where: { subscriberId: userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          provider: true,
          status: true,
          emailAddress: true,
          displayName: true,
          providerAccountId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.activityLog.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 500,
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [{ userId }, { targetUserId: userId }],
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.userActivityLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.supportThreadTicket.findMany({
        where: { subscriberId: userId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          workspaceId: true,
          subject: true,
          status: true,
          priority: true,
          assignedAdminId: true,
          archived: true,
          createdAt: true,
          lastActivityAt: true,
          firstResponseAt: true,
        },
      }),
      prisma.customer.count({ where: { userId } }),
      prisma.invoice.count({ where: { userId } }),
      prisma.invoicePayment.count({ where: { userId } }),
      prisma.automationFlow.count({ where: { userId } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const exportedAt = new Date().toISOString();
  const payload = buildUserPrivacyExportPayload({
    exportedAt,
    user: {
      ...user,
      orgContext: orgContext
        ? {
            orgId: orgContext.orgId,
            role: orgContext.role,
            orgAccessStatus: orgContext.orgAccessStatus,
            orgSubscriptionStatus: orgContext.orgSubscriptionStatus,
          }
        : null,
    },
    memberships,
    businessProfile,
    subscriptions,
    merchantAccount,
    eInvoicingConnections,
    connectedMailboxes,
    workspaceSummary: {
      customerCount,
      invoiceCount,
      paymentCount,
      automationCount,
    },
    activityLogs,
    auditLogs,
    userActivityLogs,
    supportTickets,
  });
  const filename = buildUserPrivacyExportFilename({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
