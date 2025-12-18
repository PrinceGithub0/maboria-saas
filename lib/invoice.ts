import PDFDocument from "pdfkit";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { log } from "./logger";

export type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
};

export function calculateTotals(items: InvoiceItem[], tax = 0, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const taxAmount = (subtotal * tax) / 100;
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal + taxAmount - discountAmount;
  return { subtotal, taxAmount, discountAmount, total };
}

export async function createInvoiceRecord({
  userId,
  invoiceNumber,
  currency,
  items,
  status,
  tax,
  discount,
}: {
  userId: string;
  invoiceNumber: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  tax?: number;
  discount?: number;
}) {
  const totals = calculateTotals(items, tax, discount);
  return prisma.invoice.create({
    data: {
      userId,
      invoiceNumber,
      currency,
      status: status as any,
      items,
      tax: totals.taxAmount,
      discount: totals.discountAmount,
      total: totals.total,
    },
  });
}

export function buildInvoicePdfBuffer({
  invoiceNumber,
  userName,
  currency,
  items,
  totals,
}: {
  invoiceNumber: string;
  userName: string;
  currency: string;
  items: InvoiceItem[];
  totals: ReturnType<typeof calculateTotals>;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.fontSize(20).text("Maboria Invoice", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
    doc.text(`Bill To: ${userName}`);
    doc.moveDown();

    items.forEach((item) => {
      doc.text(`${item.name} x${item.quantity} - ${currency} ${item.price}`);
      if (item.description) doc.text(item.description, { indent: 12 });
    });

    doc.moveDown();
    doc.text(`Subtotal: ${currency} ${totals.subtotal.toFixed(2)}`);
    doc.text(`Tax: ${currency} ${totals.taxAmount.toFixed(2)}`);
    doc.text(`Discount: ${currency} ${totals.discountAmount.toFixed(2)}`);
    doc.text(`Total: ${currency} ${totals.total.toFixed(2)}`, { underline: true });

    doc.end();
  });
}

export async function emailInvoice({
  to,
  invoiceNumber,
  pdfBuffer,
}: {
  to: string;
  invoiceNumber: string;
  pdfBuffer: Buffer;
}) {
  const base64 = pdfBuffer.toString("base64");
  await sendEmail({
    to,
    subject: `Your invoice ${invoiceNumber}`,
    html: `<p>Please find attached invoice <strong>${invoiceNumber}</strong>.</p>`,
  });
  log("info", "Invoice email prepared", { to, invoiceNumber, size: base64.length });
}
