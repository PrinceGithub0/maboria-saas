import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { listPaystackBanks } from "@/lib/payments/paystack";
import { listFlutterwaveBanks } from "@/lib/payments/flutterwave";
import { normalizeCountryCode } from "@/lib/business-profile";
import { isPayoutProvider } from "@/lib/payments/payment-providers";
import { resolvePayoutRequirements } from "@/lib/payments/payout-requirements";
import { requireBillingAccess } from "@/lib/permissions";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export const GET = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const provider = (searchParams.get("provider") || "").toUpperCase();
    const country = normalizeCountryCode(searchParams.get("country") || "NG");
    const currency = searchParams.get("currency") || "NGN";

    if (!isPayoutProvider(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const requirements = resolvePayoutRequirements({ provider, country, currency });
    if (!requirements.supported) {
      return NextResponse.json({ error: "Payout setup is not supported for this provider." }, { status: 400 });
    }

    if (!requirements.bankListRequired) {
      return NextResponse.json({ banks: [] });
    }

    if (provider === "PAYSTACK") {
      const response = await listPaystackBanks(requirements.currency);
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
      id: bank.id ?? null,
    }));
    return NextResponse.json({ banks });
  })
);
