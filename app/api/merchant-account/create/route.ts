import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { merchantAccountCreateSchema } from "@/lib/validators";
import { normalizeCountryCode } from "@/lib/business-profile";
import { isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { createPaystackSubaccount } from "@/lib/payments/paystack";
import { createFlutterwaveSubaccount } from "@/lib/payments/flutterwave";
import { isSepaCountry, isValidIban, normalizeIban } from "@/lib/payments/sepa";
import { requireBillingAccess } from "@/lib/permissions";

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = merchantAccountCreateSchema.parse(await req.json());
    const provider = parsed.provider;
    const country = normalizeCountryCode(parsed.country);
    const payoutType = parsed.payoutType || (isSepaCountry(country) ? "sepa" : "local");
    const currency = payoutType === "sepa" ? "EUR" : normalizeCurrency(parsed.currency);
    const existingAccount = await prisma.merchantAccount.findUnique({
      where: { userId: session.user.id },
    });

    if (payoutType === "sepa" && provider !== "FLUTTERWAVE") {
      return NextResponse.json(
        { error: "SEPA payouts are available through Flutterwave only." },
        { status: 400 }
      );
    }

    const accountNumber = parsed.accountNumber?.trim() || null;
    const bankCode = parsed.bankCode?.trim() || null;
    const iban = parsed.iban ? normalizeIban(parsed.iban) : null;
    const bicSwift = parsed.bicSwift?.trim() || null;

    if (payoutType === "sepa") {
      if (!iban || !isValidIban(iban)) {
        return NextResponse.json(
          { error: "Please enter a valid IBAN." },
          { status: 400 }
        );
      }
      if (accountNumber || bankCode) {
        return NextResponse.json(
          { error: "SEPA payouts require IBAN only. Remove bank and account number fields." },
          { status: 400 }
        );
      }
    } else {
      if (!accountNumber || !bankCode) {
        return NextResponse.json(
          { error: "Bank and account number are required for local payouts." },
          { status: 400 }
        );
      }
      if (iban) {
        return NextResponse.json(
          { error: "IBAN is only allowed for SEPA payouts." },
          { status: 400 }
        );
      }
    }

    if (provider === "PAYSTACK" && !isProviderCurrency("PAYSTACK", currency)) {
      return NextResponse.json(
        {
          error: "Paystack does not support the selected currency.",
        },
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
            userId: session.user.id,
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
          accountName: parsed.accountName,
          accountNumber,
          bankCode,
          country,
          phone: parsed.phone,
          payoutType,
          iban,
          bicSwift,
          currency,
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
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        paystackSubaccountCode,
        flutterwaveSubaccountId,
        provider,
        payoutType: payoutType === "sepa" ? "SEPA" : "LOCAL",
        accountName: parsed.accountName,
        accountNumber,
        iban,
        bicSwift,
        currency,
        country,
      },
      update: {
        paystackSubaccountCode,
        flutterwaveSubaccountId,
        provider,
        payoutType: payoutType === "sepa" ? "SEPA" : "LOCAL",
        accountName: parsed.accountName,
        accountNumber,
        iban,
        bicSwift,
        currency,
        country,
      },
    });

    return NextResponse.json(record);
  })
);
