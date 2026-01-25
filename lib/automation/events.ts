import { prisma } from "../prisma";
import { log } from "../logger";
import {
  enforceEntitlement,
  enforceUsageLimit,
  getUserPlan,
  isPlanAtLeast,
  requiredPlanForSteps,
} from "../entitlements";

const normalizeStatus = (value: unknown) => String(value || "").trim().toUpperCase();

const matchesInvoiceStatus = (config: any, statuses: Set<string>) => {
  const single = normalizeStatus(config?.status);
  if (single && statuses.has(single)) return true;
  const list = Array.isArray(config?.statuses) ? config.statuses : [];
  return list.some((entry: any) => statuses.has(normalizeStatus(entry)));
};

export async function triggerInvoiceStatusAutomations({
  userId,
  invoiceId,
  invoiceNumber,
  status,
}: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
}) {
  const normalized = normalizeStatus(status);
  if (!normalized) return { triggered: 0 };
  const statusSet = new Set([normalized]);
  if (normalized === "SENT" || normalized === "OVERDUE") {
    statusSet.add("UNPAID");
  }
  if (normalized === "UNPAID") {
    statusSet.add("SENT");
    statusSet.add("OVERDUE");
  }

  const triggers = await prisma.trigger.findMany({
    where: { type: "invoice_status", flow: { userId } },
    include: { flow: true },
  });

  const matched = triggers.filter((trigger) => matchesInvoiceStatus(trigger.config, statusSet));
  if (!matched.length) return { triggered: 0 };

  let triggered = 0;
  try {
    const { executeAutomationRun } = await import("./engine");
    const plan = await getUserPlan(userId);
    for (const trigger of matched) {
      try {
        const entitlement = await enforceEntitlement(userId, {
          feature: "automations",
          requiredPlan: "starter",
          allowTrial: false,
        });
        if (!entitlement.ok) {
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: entitlement.reason,
            type: entitlement.type,
          });
          continue;
        }

        const required = requiredPlanForSteps((trigger.flow.steps as any[]) || []);
        if (required && !isPlanAtLeast(plan, required.plan)) {
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: required.reason,
            requiredPlan: required.plan,
          });
          continue;
        }

        const usage = await enforceUsageLimit(userId, "automationRuns");
        if (!usage.ok) {
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: "Automation run limit reached",
            plan: usage.plan,
            limit: usage.limit,
            used: usage.used,
          });
          continue;
        }

        await executeAutomationRun(trigger.flow as any, {
          event: "invoice_status",
          invoice: { id: invoiceId, invoiceNumber, status: normalized },
        });
        triggered += 1;
      } catch (error) {
        log("error", "invoice_status_trigger_failed", {
          invoiceId,
          flowId: trigger.flowId,
          error,
        });
      }
    }
  } catch (error) {
    log("error", "invoice_status_trigger_loader_failed", { invoiceId, error });
  }

  log("info", "invoice_status_triggered", {
    userId,
    invoiceId,
    invoiceNumber,
    status: normalized,
    triggered,
  });
  return { triggered };
}
