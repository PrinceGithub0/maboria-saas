import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { sendCustomerReminder } from "@/lib/customer-reminders";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "@/lib/subscriber-settings";
import { requireBillingAccess } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;

  const body = await request.json().catch(() => ({}));
  const applyLateFee = Boolean(body?.applyLateFee);
  const triggerSource =
    body?.triggeredBy === "automation" ? "automation" : "manual";
  const automationId =
    typeof body?.automationId === "string" && body.automationId.trim()
      ? body.automationId.trim()
      : undefined;

  if (applyLateFee) {
    const settingsRow = await getOrCreateSubscriberSetting(targetUserId);
    const settings = toLateFeeSettingsSnapshot(settingsRow);
    if (!settings.enabled) {
      return NextResponse.json(
        { error: "Late fees are disabled for this account." },
        { status: 403 }
      );
    }
    if (triggerSource === "automation" && !settings.allowAutomationLateFee) {
      return NextResponse.json(
        { error: "Automations are not allowed to apply late fees." },
        { status: 403 }
      );
    }
  }

  try {
    const result = await sendCustomerReminder({
      userId: targetUserId,
      customerId: id,
      applyLateFee,
      triggeredBy: triggerSource,
      automationId,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to send reminder." },
      { status: Number(error?.status || 500) }
    );
  }
}
