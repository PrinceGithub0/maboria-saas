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

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = merchantAccountCreateSchema.parse(await req.json());
    const provider = parsed.provider;
    const country = normalizeCountryCode(parsed.country);
    const currency = normalizeCurrency(parsed.currency);

    if (provider === "PAYSTACK" && !isProviderCurrency("PAYSTACK", currency)) {
      return NextResponse.json(
        {
          error: "Paystack does not support the selected currency.",
        },
        { status: 400 }
      );
    }

    let paystackSubaccountCode: string | null = null;
    let flutterwaveSubaccountId: string | null = null;

    if (provider === "PAYSTACK") {
      let response;
      try {
        response = await createPaystackSubaccount({
          businessName: parsed.businessName,
          bankCode: parsed.bankCode,
          accountNumber: parsed.accountNumber,
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
          accountNumber: parsed.accountNumber,
          bankCode: parsed.bankCode,
          country,
          phone: parsed.phone,
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
      },
      update: {
        paystackSubaccountCode,
        flutterwaveSubaccountId,
      },
    });

    return NextResponse.json(record);
  })
);
