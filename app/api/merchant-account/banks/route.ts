import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { listPaystackBanks } from "@/lib/payments/paystack";
import { listFlutterwaveBanks } from "@/lib/payments/flutterwave";
import { isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { normalizeCountryCode } from "@/lib/business-profile";
import { requireBillingAccess } from "@/lib/permissions";

export const GET = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const provider = (searchParams.get("provider") || "").toUpperCase();
    const country = normalizeCountryCode(searchParams.get("country") || "NG");
    const currency = normalizeCurrency(searchParams.get("currency") || "NGN");

    if (provider !== "PAYSTACK" && provider !== "FLUTTERWAVE") {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    if (provider === "PAYSTACK" && !isProviderCurrency("PAYSTACK", currency)) {
      return NextResponse.json(
        {
          error: "Unsupported currency for Paystack.",
        },
        { status: 400 }
      );
    }

    if (provider === "PAYSTACK") {
      const response = await listPaystackBanks(currency);
      const banks = (response?.data || []).map((bank: any) => ({
        name: bank.name,
        code: bank.code,
      }));
      return NextResponse.json({ banks });
    }

    const response = await listFlutterwaveBanks(country);
    const banks = (response?.data || []).map((bank: any) => ({
      name: bank.name,
      code: bank.code,
    }));
    return NextResponse.json({ banks });
  })
);
