import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { merchantAccountCreateSchema } from "@/lib/validators";
import { normalizeCountryCode } from "@/lib/business-profile";
import { isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { createPaystackSubaccount } from "@/lib/payments/paystack";
import { createFlutterwaveSubaccount } from "@/lib/payments/flutterwave";
import {
  resolvePayoutRequirements,
  sanitizePayoutDetails,
} from "@/lib/payments/payout-requirements";
import { isValidIban, normalizeIban } from "@/lib/payments/sepa";
import { requireBillingAccess } from "@/lib/permissions";
import { requireSystemFlag } from "@/lib/system-flags-guard";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeOrgAuditLog } from "@/lib/org-auth";

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    assertRateLimit(`merchant-account:create:${session.user.id}`, 10, 60_000);

    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: 403 });
    }

    const parsed = merchantAccountCreateSchema.parse(await req.json());
    const country = normalizeCountryCode(parsed.country);
    const requirements = resolvePayoutRequirements({
      provider: parsed.provider,
      country,
      currency: parsed.currency,
    });
    const provider = requirements.provider;
    const payoutType = requirements.payoutType;
    const currency = requirements.currency;
    const existingAccount = await prisma.merchantAccount.findUnique({
      where: { userId: access.ownerUserId },
    });

    const accountName = parsed.accountName.trim();
    const accountNumber = parsed.accountNumber?.trim() || null;
    const bankCode = parsed.bankCode?.trim() || null;
    const iban = parsed.iban ? normalizeIban(parsed.iban) : null;
    const bicSwift = parsed.bicSwift?.trim() || null;
    const payoutDetails = sanitizePayoutDetails({
      branchCode: parsed.branchCode,
      routingNumber: parsed.routingNumber,
      sortCode: parsed.sortCode,
    });
    const payoutDetailsValue = Object.keys(payoutDetails).length ? payoutDetails : Prisma.DbNull;

    if (!requirements.supported) {
      return NextResponse.json(
        {
          error:
            provider === "PAYSTACK"
              ? "Paystack payout setup is not available for this country or currency."
              : "This payout setup is not available for the selected country and currency.",
        },
        { status: 400 }
      );
    }

    for (const field of requirements.requiredFields) {
      if (field === "accountName" && !parsed.accountName.trim()) {
        return NextResponse.json({ error: "Account holder name is required." }, { status: 400 });
      }
      if (field === "bankCode" && !bankCode) {
        return NextResponse.json({ error: "Bank selection is required." }, { status: 400 });
      }
      if (field === "accountNumber" && !accountNumber) {
        return NextResponse.json({ error: "Account number is required." }, { status: 400 });
      }
      if (field === "iban" && (!iban || !isValidIban(iban))) {
        return NextResponse.json({ error: "Please enter a valid IBAN." }, { status: 400 });
      }
      if (field === "bicSwift" && !bicSwift) {
        return NextResponse.json({ error: "BIC / SWIFT is required for this payout route." }, { status: 400 });
      }
      if (field === "branchCode" && !payoutDetails.branchCode) {
        return NextResponse.json({ error: "Branch code is required for this payout route." }, { status: 400 });
      }
      if (field === "routingNumber" && !payoutDetails.routingNumber) {
        return NextResponse.json({ error: "Routing number is required for this payout route." }, { status: 400 });
      }
      if (field === "sortCode" && !payoutDetails.sortCode) {
        return NextResponse.json({ error: "Sort code is required for this payout route." }, { status: 400 });
      }
    }

    if (payoutType === "sepa" && (accountNumber || bankCode)) {
      return NextResponse.json(
        { error: "SEPA payouts use IBAN and BIC / SWIFT only." },
        { status: 400 }
      );
    }

    if (payoutType !== "sepa" && iban) {
      return NextResponse.json(
        { error: "IBAN is only allowed for EUR SEPA payouts." },
        { status: 400 }
      );
    }

    if (existingAccount) {
      const nextProvider = provider;
      const nextPayoutType = payoutType === "sepa" ? "SEPA" : "LOCAL";
      const hasProviderChange =
        existingAccount.provider && existingAccount.provider !== nextProvider;
      const hasPayoutTypeChange =
        existingAccount.payoutType && existingAccount.payoutType !== nextPayoutType;
      const hasCurrencyChange = existingAccount.currency && existingAccount.currency !== currency;

      if (hasProviderChange || hasPayoutTypeChange || hasCurrencyChange) {
        const unpaidInvoices = await prisma.invoice.findMany({
          where: {
            userId: access.ownerUserId,
            status: { in: ["SENT", "OVERDUE"] },
          },
          select: { id: true, currency: true },
        });
        const incompatible = unpaidInvoices.find((inv) => {
          const invCurrency = normalizeCurrency(inv.currency || "");
          if (nextPayoutType === "SEPA" && invCurrency !== "EUR") return true;
          return !isProviderCurrency(nextProvider, invCurrency);
        });
        if (incompatible) {
          return NextResponse.json(
            {
              error:
                "You have unpaid invoices that require your current payout configuration. Settle or cancel them before switching payout settings.",
            },
            { status: 400 }
          );
        }
      }
    }

    let paystackSubaccountCode: string | null = null;
    let flutterwaveSubaccountId: string | null = null;

    if (provider === "PAYSTACK") {
      let response;
      try {
        response = await createPaystackSubaccount({
          businessName: parsed.businessName,
          bankCode: bankCode || "",
          accountNumber: accountNumber || "",
        });
      } catch {
        return NextResponse.json(
          {
            error:
              "We could not verify that bank account. Please confirm the account number and bank, then try again.",
          },
          { status: 400 }
        );
      }
      paystackSubaccountCode = response?.data?.subaccount_code || null;
      if (!paystackSubaccountCode) {
        return NextResponse.json(
          { error: "Paystack subaccount creation failed." },
          { status: 502 }
        );
      }
    } else {
      let response;
      try {
        response = await createFlutterwaveSubaccount({
          businessName: parsed.businessName,
          businessEmail: parsed.businessEmail,
          accountName,
          accountNumber,
          bankCode,
          country,
          phone: parsed.phone,
          payoutType,
          iban,
          bicSwift,
          currency,
          payoutDetails,
        });
      } catch {
        return NextResponse.json(
          {
            error:
              "We could not verify that bank account. Please confirm the account number and bank, then try again.",
          },
          { status: 400 }
        );
      }
      flutterwaveSubaccountId = response?.data?.subaccount_id || response?.data?.id || null;
      if (!flutterwaveSubaccountId) {
        return NextResponse.json(
          { error: "Flutterwave subaccount creation failed." },
          { status: 502 }
        );
      }
    }

    const record = await prisma.merchantAccount.upsert({
      where: { userId: access.ownerUserId },
      create: {
        userId: access.ownerUserId,
        paystackSubaccountCode,
        flutterwaveSubaccountId,
        provider,
        payoutType: payoutType === "sepa" ? "SEPA" : "LOCAL",
        accountName,
        accountNumber,
        iban,
        bicSwift,
        payoutDetails: payoutDetailsValue,
        currency,
        country,
      },
      update: {
        paystackSubaccountCode,
        flutterwaveSubaccountId,
        provider,
        payoutType: payoutType === "sepa" ? "SEPA" : "LOCAL",
        accountName,
        accountNumber,
        iban,
        bicSwift,
        payoutDetails: payoutDetailsValue,
        currency,
        country,
      },
    });

    await writeOrgAuditLog({
      orgId: access.businessId,
      actorUserId: session.user.id,
      actionType: "PAYOUT_ACCOUNT_CREATED",
      metadata: {
        provider: record.provider,
        payoutType: record.payoutType,
        country: record.country,
        currency: record.currency,
      },
    });

    return NextResponse.json(record);
  })
);
