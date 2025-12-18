import { AutomationFlow, AutomationRunStatus, Prisma } from "@prisma/client";
import OpenAI from "openai";
import { prisma } from "../prisma";
import { sendEmail } from "../email";
import { createInvoiceRecord, calculateTotals } from "../invoice";
import { log } from "../logger";
import { meterUsage, autoInvoiceFromUsage, recoverFailedPayment } from "../billing";
import { enqueueJob } from "../jobs";
import { env } from "../env";

type Context = Record<string, any>;

export async function executeAutomationRun(
  flow: AutomationFlow & { userId: string },
  input: Context
) {
  const logs: any[] = [];
  let status: AutomationRunStatus = "RUNNING";
  const openai = new OpenAI({ apiKey: env.openaiKey });

  try {
    const steps = (flow.steps as Prisma.JsonValue as any[]) ?? [];
    const context: Context = { input };

    for (const step of steps) {
      const { type, config } = step;
      log("info", "Running step", { type, flowId: flow.id });
      switch (type) {
        case "parseText": {
          const text: string = input.text || "";
          context.parsed = { length: text.length, preview: text.slice(0, 120) };
          logs.push({ step: type, result: context.parsed });
          break;
        }
        case "condition": {
          const field = config.field;
          const equals = config.equals;
          if (context[field] !== equals) {
            logs.push({ step: type, skipped: true });
            continue;
          }
          break;
        }
        case "extractData": {
          const text: string = input.text || "";
          const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
          context.extracted = { email };
          logs.push({ step: type, result: context.extracted });
          break;
        }
        case "callApi": {
          const response = await fetch(config.url, {
            method: config.method || "GET",
            headers: config.headers,
            body: config.body ? JSON.stringify(config.body) : undefined,
          });
          const data = await response.json();
          context.api = data;
          logs.push({ step: type, result: data });
          break;
        }
        case "databaseWrite": {
          await prisma.activityLog.create({
            data: { action: config.action || "DB_WRITE", metadata: config.payload },
          });
          logs.push({ step: type, result: "written" });
          break;
        }
        case "webhook": {
          await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(context),
          });
          logs.push({ step: type, result: "webhook-sent" });
          break;
        }
        case "generateInvoice": {
          const invoiceNumber = `INV-${Date.now()}`;
          const items = config.items || [{ name: "Automation Service", quantity: 1, price: 10000 }];
          const invoice = await createInvoiceRecord({
            userId: flow.userId,
            invoiceNumber,
            currency: config.currency || "USD",
            items,
            status: "SENT",
            tax: config.tax ?? 0,
            discount: config.discount ?? 0,
          });
          context.invoice = invoice;
          logs.push({ step: type, result: { invoiceNumber } });
          break;
        }
        case "sendEmail": {
          const to = context.extracted?.email || config.to;
          await sendEmail({
            to,
            subject: config.subject || "Automation Update",
            html: config.html || `<p>Automation ${flow.title} completed.</p>`,
          });
          logs.push({ step: type, result: { to } });
          break;
        }
        case "generateReport": {
          const totals = context.invoice
            ? calculateTotals(context.invoice.items as any[], 0, 0)
            : { total: 0 };
          const report = {
            title: flow.title,
            metrics: { totalInvoices: 1, totalValue: totals.total },
          };
          context.report = report;
          logs.push({ step: type, result: report });
          break;
        }
        case "aiTransform": {
          const prompt = config.prompt || "Summarize data";
          const text = input.text || JSON.stringify(context);
          const completion = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: `Task: ${prompt}\n\nContext: ${text}`,
          });
          const aiResult = completion.output_text;
          context.ai = aiResult;
          logs.push({ step: type, result: aiResult });
          break;
        }
        case "sendWhatsApp": {
          logs.push({ step: type, result: "queued-whatsapp" });
          enqueueJob("send-notification", { channel: "whatsapp", to: config.to, text: config.text });
          break;
        }
        case "meterUsage": {
          await meterUsage(flow.userId, config.category || "automation", config.amount || 1, "monthly");
          logs.push({ step: type, result: "usage-metered" });
          break;
        }
        case "recoverPayment": {
          await recoverFailedPayment(flow.userId);
          logs.push({ step: type, result: "recovery-triggered" });
          break;
        }
        case "autoInvoice": {
          const invoice = await autoInvoiceFromUsage(flow.userId, config.currency || "USD");
          logs.push({ step: type, result: invoice?.invoiceNumber });
          break;
        }
        default:
          logs.push({ step: type, error: "Unknown step" });
      }
    }

    status = "SUCCESS";
    return { status, logs, context };
  } catch (error: any) {
    status = "FAILED";
    logs.push({ error: error.message });
    throw error;
  } finally {
    await prisma.$transaction([
      prisma.automationRun.create({
        data: {
          flowId: flow.id,
          userId: flow.userId,
          runStatus: status,
          logs,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: flow.userId,
          action: `AUTOMATION_RUN_${status}`,
          metadata: { flowId: flow.id, logsCount: logs.length },
        },
      }),
      prisma.notification.create({
        data: {
          userId: flow.userId,
          type: "automation",
          message: `Automation ${flow.title} finished with ${status}`,
        },
      }),
    ]);
  }
}
