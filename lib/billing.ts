import { prisma } from "./prisma";
import { createInvoiceRecord } from "./invoice";
import { buildInvoiceIssuerCode, buildInvoiceNumberDraft } from "./invoice-number";
import { log } from "./logger";
import { createOrGetCustomer } from "./customers";

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
  const invoiceNumber = buildInvoiceNumberDraft(new Date(), buildInvoiceIssuerCode(userId, userId));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  const customer = await createOrGetCustomer({
    userId,
    name: user?.name || "Unknown Customer",
    email: user?.email || `unknown+${userId}@placeholder.local`,
  });
  const invoice = await createInvoiceRecord({
    userId,
    customerId: customer.id,
    invoiceNumber,
    currency,
    items: usage.map((u) => ({ name: `${u.category} (${u.period})`, quantity: 1, price: u.amount })),
    status: "SENT",
    discount: 0,
  });
  await prisma.usageRecord.deleteMany({ where: { userId } });
  log("info", "Auto invoice generated", { userId, invoiceNumber: invoice.invoiceNumber, totalAmount });
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
