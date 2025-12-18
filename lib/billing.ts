import { prisma } from "./prisma";
import { createInvoiceRecord } from "./invoice";
import { log } from "./logger";

export async function meterUsage(userId: string, category: string, amount: number, period: string) {
  await prisma.usageRecord.create({
    data: { userId, category, amount, period },
  });
}

export async function autoInvoiceFromUsage(userId: string, currency = "USD") {
  const usage = await prisma.usageRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!usage.length) return null;
  const totalAmount = usage.reduce((sum, u) => sum + u.amount, 0);
  const invoiceNumber = `INV-${Date.now()}`;
  const invoice = await createInvoiceRecord({
    userId,
    invoiceNumber,
    currency,
    items: usage.map((u) => ({ name: `${u.category} (${u.period})`, quantity: 1, price: u.amount })),
    status: "SENT",
    tax: 0,
    discount: 0,
  });
  await prisma.usageRecord.deleteMany({ where: { userId } });
  log("info", "Auto invoice generated", { userId, invoiceNumber, totalAmount });
  return invoice;
}

export async function recoverFailedPayment(userId: string) {
  await prisma.notification.create({
    data: {
      userId,
      type: "payment",
      message: "We could not process your payment. Please update your billing details.",
    },
  });
}
