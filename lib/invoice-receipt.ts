import PDFDocument from "pdfkit";
import path from "path";
import { existsSync } from "fs";
import fs from "fs/promises";
import { prisma } from "./prisma";
import { sendBillingMail } from "./email";
import { log } from "./logger";
import { formatCurrency } from "./currency";
import { formatDateDMY } from "./date";
import {
  InvoiceItem,
  calculateTotalsFromAmounts,
  getBusinessLogoBuffer,
  normalizeInvoiceItems,
  resolveInvoiceCustomer,
} from "./invoice";
import { formatVatRateLabel, normalizeVatSettings } from "./vat";
import { logUserActivity } from "./user-activity";

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
function ensureFontPath() {
  if (!existsSync(interFontPath)) {
    throw new Error("Receipt font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
}

function sanitizeFilename(value: string) {
  return String(value || "receipt").replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function persistInvoiceReceiptPdf(receiptNumber: string, pdfBuffer: Buffer) {
  const safeNumber = sanitizeFilename(receiptNumber);
  const fileName = `Invoice_Receipt_${safeNumber}.pdf`;
  const dir = path.join(process.cwd(), "public", "receipts", "invoices");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/receipts/invoices/${fileName}`;
}

export function buildInvoiceReceiptPdfBuffer(input: {
  receiptNumber: string;
  paidAt: Date;
  invoiceNumber: string;
  amount: number;
  currency: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  paymentMethod?: string | null;
  reference?: string | null;
  business: {
    businessName: string;
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    vatRateDisplay?: string | null;
  };
  logoBuffer?: Buffer | null;
  billTo?: { name?: string | null; email?: string | null; address?: string | null } | null;
  items: InvoiceItem[];
  totals: ReturnType<typeof calculateTotalsFromAmounts>;
}) {
  const fontPath = ensureFontPath();
  const logo = input.logoBuffer || null;
  const doc = new PDFDocument({ margin: 54, size: "A4", font: fontPath });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  doc.on("error", (err) => {
    throw err;
  });

  doc.registerFont("Inter", fontPath);
  doc.font("Inter");

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;
  let y = 40;
  const drawBold = (textValue: string, x: number, yPos: number, size = 12) => {
    doc.fontSize(size).fillColor("#111827").text(textValue, x, yPos);
    doc.fontSize(size).fillColor("#111827").text(textValue, x + 0.4, yPos);
  };

  if (logo) {
    doc.image(logo, left, y, { width: 48, height: 48 });
  }

  const headerLeft = left + (logo ? 60 : 0);

  drawBold(input.business.businessName, headerLeft, y + 4, 20);
  const addressLine = [input.business.businessAddress, input.business.businessEmail]
    .filter((line) => line && String(line).trim().length > 0)
    .join(" - ");
  if (addressLine) {
    doc.fontSize(9.5).fillColor("#6B7280").text(addressLine, headerLeft, y + 28);
  }

  const headerBottomPadding = 20;
  y += 76 + headerBottomPadding;
  const titleY = y;
  doc
    .fontSize(18)
    .fillColor("#111827")
    .text("Payment Receipt", left, titleY, { width: pageWidth, align: "center" });
  const paidBadgeWidth = 48;
  const paidBadgeHeight = 18;
  const paidBadgeX = right - paidBadgeWidth - 4;
  const paidBadgeY = titleY + 2;
  doc.roundedRect(paidBadgeX, paidBadgeY, paidBadgeWidth, paidBadgeHeight, 5).fill("#16A34A");
  doc.fontSize(9).fillColor("#FFFFFF").text("PAID", paidBadgeX, paidBadgeY + 4, {
    width: paidBadgeWidth,
    align: "center",
  });
  const titleBottomMargin = 22;
  y = titleY + titleBottomMargin;

  const summaryBoxHeight = 52;
  doc.roundedRect(left, y, pageWidth, summaryBoxHeight, 8).fill("#F8FAFC").strokeColor("#E5E7EB").stroke();
  const third = pageWidth / 3;
  const boxY = y + 10;
  const labelColor = "#6B7280";
  doc.fontSize(9).fillColor(labelColor).text("Receipt Number", left + 16, boxY);
  drawBold(input.receiptNumber, left + 16, boxY + 14, 11);
  doc.fontSize(9).fillColor(labelColor).text("Payment Date", left + third + 16, boxY);
  drawBold(formatDateDMY(input.paidAt), left + third + 16, boxY + 14, 11);
  doc.fontSize(9).fillColor(labelColor).text("Amount Paid", left + third * 2 + 16, boxY);
  drawBold(formatCurrency(input.totals.total, input.currency), left + third * 2 + 16, boxY + 14, 12);

  y += summaryBoxHeight + 14;
  const paymentBoxHeight = input.reference ? 58 : 44;
  doc.roundedRect(left, y, pageWidth, paymentBoxHeight, 8).fill("#F8FAFC").strokeColor("#E5E7EB").stroke();
  doc.fontSize(9).fillColor(labelColor).text("Payment Method", left + 16, y + 8);
  doc
    .fontSize(11)
    .fillColor("#111827")
    .text(`${input.provider} - ${input.paymentMethod || "Card"}`, left + 16, y + 22);
  if (input.reference) {
    doc.fontSize(9).fillColor(labelColor).text("Payment Reference", left + pageWidth / 2 - 80, y + 8, {
      width: 160,
      align: "center",
    });
    doc.fontSize(10.5).fillColor("#111827").text(String(input.reference), left + pageWidth / 2 - 120, y + 22, {
      width: 240,
      align: "center",
    });
  }
  doc.fontSize(9).fillColor(labelColor).text("Amount Paid", right - 140, y + 8, { width: 120, align: "right" });
  doc
    .fontSize(11)
    .fillColor("#16A34A")
    .text(formatCurrency(input.totals.total, input.currency), right - 140, y + 22, { width: 120, align: "right" });

  y += paymentBoxHeight + 20;
  drawBold("Billed To:", left, y, 11);
  const billedLines = [
    input.billTo?.name || "Customer",
    input.billTo?.email || "",
    input.billTo?.address || "",
  ].filter((line) => line && String(line).trim().length > 0);
  const lineHeight = 14;
  billedLines.forEach((line, index) => {
    doc.fontSize(10.5).fillColor("#6B7280").text(String(line), left, y + 18 + index * lineHeight);
  });

  y += 22 + billedLines.length * lineHeight + 16;

  const tableTop = y;
  const headerHeight = 28;
  const rowHeight = 22;
  const reservedBottom = 140;
  const maxTableHeight = Math.max(0, doc.page.height - reservedBottom - tableTop);
  const maxRows = Math.max(1, Math.floor((maxTableHeight - headerHeight - 12) / rowHeight));
  const itemsToRender = input.items.slice(0, maxRows);
  const truncatedCount = input.items.length - itemsToRender.length;
  const tableHeight = headerHeight + itemsToRender.length * rowHeight + 12;
  doc.roundedRect(left, tableTop, pageWidth, tableHeight, 8).strokeColor("#E5E7EB").stroke();
  doc.rect(left, tableTop, pageWidth, headerHeight).fill("#F3F4F6");
  doc
    .fontSize(9.5)
    .fillColor("#6B7280")
    .text("Description", left + 12, tableTop + 9)
    .text("Subtotal", right - 140, tableTop + 9, { width: 120, align: "right" });

  let rowY = tableTop + headerHeight + 8;
  itemsToRender.forEach((item) => {
    doc.fontSize(10.5).fillColor("#111827").text(item.name, left + 12, rowY);
    doc
      .fontSize(10.5)
      .fillColor("#111827")
      .text(formatCurrency(item.price * item.quantity, input.currency), right - 140, rowY, {
        width: 120,
        align: "right",
      });
    rowY += rowHeight;
  });

  y = rowY + 10;
  const vatRate = Number((input.totals as any).vatRate || 0);
  const vatEnabled = Boolean((input.totals as any).vatEnabled) && vatRate > 0;
  drawBold("Subtotal:", right - 260, y, 10.5);
  doc
    .fontSize(10.5)
    .fillColor("#111827")
    .text(formatCurrency(input.totals.subtotal, input.currency), right - 140, y, {
      width: 120,
      align: "right",
    });
  y += 14;
  if (vatEnabled && input.totals.taxAmount > 0) {
    drawBold(
      `VAT (${formatVatRateLabel(vatRate, input.business.vatRateDisplay)}%)`,
      right - 260,
      y,
      10.5
    );
    doc
      .fontSize(10.5)
      .fillColor("#111827")
      .text(formatCurrency(input.totals.taxAmount, input.currency), right - 140, y, {
        width: 120,
        align: "right",
      });
    y += 14;
  }
  drawBold("Total Paid:", right - 260, y, 11.5);
  doc
    .fontSize(12)
    .fillColor("#111827")
    .text(formatCurrency(input.totals.total, input.currency), right - 140, y - 2, {
      width: 120,
      align: "right",
    });

  y += 72;
  doc.fontSize(10.5).fillColor("#111827").text("Thank you for your payment!", left, y);
  if (truncatedCount > 0) {
    doc
      .fontSize(10)
      .fillColor("#6B7280")
      .text(`Additional items omitted from receipt: ${truncatedCount}`, left, y + 16);
  }
  doc
    .fontSize(9)
    .fillColor("#6B7280")
    .text("This receipt was generated automatically by Maboria.", 0, doc.page.height - 70, {
      align: "center",
    });
  // footer intentionally minimal for customer receipt

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function maybeCreateInvoiceReceipt({
  invoicePaymentId,
  invoiceId,
  userId,
  provider,
  reference,
  amount,
  currency,
  paymentMethod,
  paidAt,
  rawPayload,
}: {
  invoicePaymentId: string;
  invoiceId: string;
  userId: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference?: string | null;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  paidAt: Date;
  rawPayload?: any;
}) {
  const existing = await prisma.receipt.findUnique({ where: { invoicePaymentId } });
  if (existing?.pdfUrl) return existing;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });
  if (!invoice) {
    log("warn", "invoice_receipt_missing_invoice", { invoiceId, invoicePaymentId });
    return null;
  }

  const metadata = (invoice.metadata as any) || {};
  let business = metadata?.businessProfile || {};
  if (!business?.businessName) {
    const profile = await prisma.businessProfile.findUnique({
      where: { userId },
      select: {
        businessName: true,
        businessAddress: true,
        businessEmail: true,
        businessPhone: true,
        vatEnabled: true,
        vatRate: true,
        vatRateDisplay: true,
        vatPricingMode: true,
      },
    });
    if (profile) {
      business = profile;
    }
  }
  const customer = resolveInvoiceCustomer(metadata);
  const items = normalizeInvoiceItems(invoice.items);
  const vatSettings = normalizeVatSettings({
    enabled: business?.vatEnabled ?? false,
    rate: business?.vatRate ? Number(business.vatRate) : 0,
    mode:
      String(business?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(items, vatSettings, Number(invoice.discount || 0));

  const receiptNumber = reference || `RCT-${Date.now()}`;
  const pdfBuffer = await buildInvoiceReceiptPdfBuffer({
    receiptNumber,
    paidAt,
    invoiceNumber: invoice.invoiceNumber,
    amount,
    currency,
    provider,
    paymentMethod,
    reference,
    business: {
      businessName: business.businessName || "Your Business",
      businessAddress: business.businessAddress,
      businessEmail: business.businessEmail,
      businessPhone: business.businessPhone,
      vatRateDisplay: business.vatRateDisplay,
    },
    logoBuffer: await getBusinessLogoBuffer(userId),
    billTo: customer || undefined,
    items,
    totals,
  });

  const pdfUrl = await persistInvoiceReceiptPdf(receiptNumber, pdfBuffer);

  const issuedAt = new Date();
  const receipt = await prisma.receipt.create({
    data: {
      invoicePaymentId,
      invoiceId,
      userId,
      receiptNumber,
      amount,
      currency,
      provider,
      paymentMethod: paymentMethod || null,
      reference: reference || null,
      customerEmail: customer?.email || null,
      issuedAt,
      pdfUrl,
      metadata: rawPayload || undefined,
    },
  });

  await logUserActivity({
    userId,
    actorId: userId,
    eventType: "receipt_generated",
    metadata: {
      receiptId: receipt.id,
      receiptNumber,
      invoiceId,
      invoicePaymentId,
      provider,
      reference: reference || null,
    },
  });

  const merchant = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  const recipients = new Set<string>();
  if (customer?.email) recipients.add(customer.email);
  if (merchant?.email) recipients.add(merchant.email);

  if (recipients.size > 0) {
    const subject = "Your Maboria Payment Receipt";
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Your payment has been confirmed. Attached is your receipt for invoice ${invoice.invoiceNumber}.</p>
        <p style="margin-top: 24px;">- The Maboria Team</p>
      </div>
    `;
    await sendBillingMail({
      to: Array.from(recipients).join(","),
      subject,
      html,
      attachments: [
        {
          filename: `Maboria_Receipt_${receiptNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }

  log("info", "invoice_receipt_issued", {
    invoiceId,
    invoicePaymentId,
    provider,
    receiptNumber,
  });
  return receipt;
}






