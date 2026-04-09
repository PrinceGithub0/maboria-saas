import PDFDocument from "pdfkit";
import path from "path";
import { existsSync, readFileSync } from "fs";
import fs from "fs/promises";
import { prisma } from "./prisma";
import { sendBillingMail } from "./email";
import { log } from "./logger";
import { formatCurrency } from "./currency";
import { formatDateDMY } from "./date";
import { readStoredAssetFromRoots } from "./file-storage";
import { STANDARD_VAT_RATE } from "./vat";

export const SUPPORTED_SUBSCRIPTION_RECEIPT_PROVIDERS = ["PAYSTACK", "FLUTTERWAVE", "STRIPE"] as const;
export type SupportedSubscriptionReceiptProvider = (typeof SUPPORTED_SUBSCRIPTION_RECEIPT_PROVIDERS)[number];

export function isSubscriptionReceiptProvider(value: unknown): value is SupportedSubscriptionReceiptProvider {
  return SUPPORTED_SUBSCRIPTION_RECEIPT_PROVIDERS.includes(String(value || "").toUpperCase() as SupportedSubscriptionReceiptProvider);
}

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const logoPath = path.join(process.cwd(), "public", "branding", "Maboria Company logo.png");

const issuer = {
  name: "Maboria",
  website: "www.maboria.com",
  email: "info@maboria.com",
};

function ensureFontPath() {
  if (!existsSync(interFontPath)) {
    throw new Error("Receipt font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
}

function tryReadLogo() {
  try {
    if (!existsSync(logoPath)) return null;
    return readFileSync(logoPath);
  } catch (error) {
    log("warn", "subscription_receipt_logo_failed", { error: (error as Error).message });
    return null;
  }
}

function sanitizeFilename(value: string) {
  return String(value || "receipt").replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function persistSubscriptionReceiptPdf(receiptNumber: string, pdfBuffer: Buffer) {
  const safeNumber = sanitizeFilename(receiptNumber);
  const fileName = `Subscription_Receipt_${safeNumber}.pdf`;
  const dir = path.join(process.cwd(), "uploads", "receipts", "subscriptions");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/receipts/subscriptions/${fileName}`;
}

export async function readStoredSubscriptionReceiptPdf(pdfUrl?: string | null) {
  return readStoredAssetFromRoots(pdfUrl, [
    path.join(process.cwd(), "uploads"),
    path.join(process.cwd(), "public"),
  ]);
}

function formatBillingInterval(interval: "monthly" | "yearly") {
  return interval === "yearly" ? "Yearly" : "Monthly";
}

export function buildSubscriptionReceiptPdfBuffer(input: {
  receiptNumber: string;
  paidAt: Date;
  plan: string;
  amount: number;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerCompany?: string | null;
  provider: SupportedSubscriptionReceiptProvider;
  paymentMethod?: string | null;
  reference?: string | null;
  interval: "monthly" | "yearly";
}) {
  const fontPath = ensureFontPath();
  const logo = tryReadLogo();
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
  const drawEmphasis = (text: string, x: number, y: number, options?: PDFKit.Mixins.TextOptions) => {
    doc.text(text, x, y, options);
    doc.text(text, x + 0.2, y, options);
  };
  let y = 42;

  if (logo) {
    try {
      doc.image(logo, left, y, { width: 34, height: 34 });
    } catch (error) {
      log("warn", "subscription_receipt_logo_render_failed", {
        error: (error as Error).message,
      });
    }
  }

  const headerLeft = left + (logo ? 52 : 0);
  doc
    .fontSize(15.5)
    .fillColor("#111827")
    .text(issuer.name, headerLeft, y + 2);
  doc
    .fontSize(9.5)
    .fillColor("#4B5563")
    .text(issuer.website, headerLeft, y + 20)
    .text(issuer.email, headerLeft, y + 34);

  const metaBlockWidth = 210;
  const metaX = right - metaBlockWidth;
  doc.fontSize(9.5).fillColor("#6B7280");
  drawEmphasis(`Receipt No:  ${input.receiptNumber}`, metaX, y + 2, {
    width: metaBlockWidth,
    align: "right",
  });
  drawEmphasis(`Issue date:  ${formatDateDMY(input.paidAt)}`, metaX, y + 18, {
    width: metaBlockWidth,
    align: "right",
  });
  drawEmphasis(`Billing cycle:  ${formatBillingInterval(input.interval)}`, metaX, y + 34, {
    width: metaBlockWidth,
    align: "right",
  });
  drawEmphasis("Status:", metaX, y + 52, { width: metaBlockWidth, align: "right" });

  const badgeWidth = 64;
  const badgeHeight = 18;
  const badgeX = right - badgeWidth;
  const badgeY = y + 50;
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill("#16A34A");
  doc
    .fontSize(9)
    .fillColor("#FFFFFF")
    .text("PAID", badgeX, badgeY + 4, { width: badgeWidth, align: "center" });

  y += 90;
  doc
    .fontSize(22)
    .fillColor("#111827")
    .text("Subscription Receipt", left, y, { width: pageWidth, align: "center" });

  y += 24;
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();

  y += 18;
  const columnGap = 40;
  const columnWidth = (pageWidth - columnGap) / 2;
  const billedX = left;
  const paymentX = left + columnWidth + columnGap;

  doc.fontSize(10.5).fillColor("#111827");
  drawEmphasis("Billed To", billedX, y);
  drawEmphasis("Payment Details", paymentX, y);

  doc
    .moveTo(billedX, y + 14)
    .lineTo(billedX + columnWidth, y + 14)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();
  doc
    .moveTo(paymentX, y + 14)
    .lineTo(paymentX + columnWidth, y + 14)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();

  const billedLines = [
    input.customerName || "Subscriber",
    input.customerEmail || "",
    input.customerCompany || "",
  ].filter((line) => line && String(line).trim().length > 0);

  const billingTypeLabel =
    input.interval === "yearly" ? "Yearly subscription" : "Monthly subscription";
  const paymentLines = [
    `Plan: ${input.plan}`,
    `Billing type: ${billingTypeLabel}`,
    `Quantity: 1`,
    input.interval === "yearly" ? "Yearly billing" : "",
    `Payment provider: ${input.provider}`,
    `Payment method: ${input.paymentMethod || "Card"}`,
    input.reference ? `Transaction reference: ${input.reference}` : "",
  ].filter((line) => line && String(line).trim().length > 0);

  const lineHeight = 14;
  billedLines.forEach((line, index) => {
    doc
      .fontSize(10.5)
      .fillColor("#111827")
      .text(String(line), billedX, y + 22 + index * lineHeight);
  });
  paymentLines.forEach((line, index) => {
    doc
      .fontSize(10.5)
      .fillColor("#111827")
      .text(String(line), paymentX, y + 22 + index * lineHeight);
  });

  y += 24 + Math.max(billedLines.length, paymentLines.length) * lineHeight + 20;

  doc.fontSize(11).fillColor("#111827");
  drawEmphasis("Summary", left, y);

  y += 12;
  const tableTop = y;
  const tableHeight = 66;
  doc
    .roundedRect(left, tableTop, pageWidth, tableHeight, 6)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke();

  doc
    .rect(left, tableTop, pageWidth, 26)
    .fill("#F3F4F6");
  doc.fontSize(10.5).fillColor("#111827");
  drawEmphasis("Description", left + 12, tableTop + 8);
  drawEmphasis("Amount", right - 140, tableTop + 8, { width: 120, align: "right" });

  doc
    .fontSize(10.5)
    .fillColor("#111827")
    .text(`Subscription \u2014 ${input.plan}`, left + 12, tableTop + 36)
    .text(formatCurrency(input.amount, input.currency), right - 140, tableTop + 36, {
      width: 120,
      align: "right",
    });

  y = tableTop + tableHeight + 18;
  const vatRate = STANDARD_VAT_RATE / 100;
  const vatAmount = Math.round(input.amount * vatRate * 100) / 100;
  const netAmount = Math.round((input.amount - vatAmount) * 100) / 100;
  const totalsLabelX = right - 280;
  const totalsValueX = right - 110;
  const totalsLabelWidth = 170;
  const totalsValueWidth = 110;

  doc.fontSize(10.5).fillColor("#111827");
  drawEmphasis("Plan Price (VAT-inclusive)", totalsLabelX, y, { width: totalsLabelWidth, align: "left" });
  drawEmphasis(formatCurrency(input.amount, input.currency), totalsValueX, y, {
    width: totalsValueWidth,
    align: "right",
  });
  y += 14;
  drawEmphasis(`VAT (${STANDARD_VAT_RATE}%)`, totalsLabelX, y, { width: totalsLabelWidth, align: "left" });
  drawEmphasis(formatCurrency(vatAmount, input.currency), totalsValueX, y, {
    width: totalsValueWidth,
    align: "right",
  });
  y += 14;
  drawEmphasis("Net Price (excluding VAT)", totalsLabelX, y, { width: totalsLabelWidth, align: "left" });
  drawEmphasis(formatCurrency(netAmount, input.currency), totalsValueX, y, {
    width: totalsValueWidth,
    align: "right",
  });
  y += 20;
  doc.fontSize(11.5).fillColor("#111827");
  drawEmphasis("Total Paid", totalsLabelX, y, { width: totalsLabelWidth, align: "left" });
  doc.fontSize(15).fillColor("#111827");
  drawEmphasis(formatCurrency(input.amount, input.currency), totalsValueX, y - 2, {
    width: totalsValueWidth,
    align: "right",
  });

  y += 40;
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  const notesY = Math.min(y + 12, doc.page.height - 190);
  doc.fontSize(10.5).fillColor("#111827");
  drawEmphasis("Notes", left, notesY);
  doc
    .fontSize(9.5)
    .fillColor("#4B5563")
    .text("Thank you for your payment.", left, notesY + 16)
    .text("This receipt confirms successful payment for your subscription.", left, notesY + 30);

  const footerBase = Math.max(notesY + 84, doc.page.height - 110);
  doc
    .fontSize(9)
    .fillColor("#4B5563")
    .text("This receipt was generated automatically by Maboria.", 0, footerBase, {
      align: "center",
    });
  doc
    .fontSize(9)
    .fillColor("#4B5563")
    .text(issuer.email, 0, footerBase + 14, { align: "center" })
    .text(issuer.website, 0, footerBase + 28, { align: "center" });

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function maybeSendSubscriptionReceipt({
  paymentId,
  userId,
  amount,
  currency,
  provider,
  reference,
  paidAt,
  plan,
  interval,
  paymentMethod,
  verified,
}: {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  provider: SupportedSubscriptionReceiptProvider;
  reference?: string | null;
  paidAt: Date;
  plan?: string | null;
  interval: "monthly" | "yearly";
  paymentMethod?: string | null;
  verified: boolean;
}) {
  if (!verified) {
    log("warn", "subscription_receipt_unverified_skip", { userId, reference, provider });
    return;
  }
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  const metadata = (payment?.metadata as Record<string, unknown> | null) || {};
  if (metadata.receiptSentAt) return;
  if (!plan) {
    log("warn", "subscription_receipt_missing_plan", { userId, reference });
  }

  const planLabel =
    plan === "PRO"
      ? "Pro"
      : plan === "GROWTH"
        ? "Growth"
        : plan === "BUSINESS"
          ? "Business"
          : plan === "PREMIUM"
            ? "Business"
            : plan === "STARTER"
              ? "Starter"
              : plan === "ENTERPRISE"
                ? "Enterprise"
                : "Subscription";

  const [user, businessProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    }),
    prisma.businessProfile.findUnique({
      where: { userId },
      select: { businessName: true },
    }),
  ]);
  if (!user?.email) {
    log("warn", "subscription_receipt_missing_email", { userId, reference });
    return;
  }

  const receiptNumber = reference || paymentId;
  const pdfBuffer = await buildSubscriptionReceiptPdfBuffer({
    receiptNumber,
    paidAt,
    plan: planLabel,
    amount,
    currency,
    customerName: user.name,
    customerEmail: user.email,
    customerCompany: businessProfile?.businessName || undefined,
    provider,
    reference: reference || undefined,
    interval,
    paymentMethod,
  });

  const pdfUrl = await persistSubscriptionReceiptPdf(receiptNumber, pdfBuffer);

  const subject = "Your Maboria Subscription Receipt";
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <p>Hi ${user.name || "there"},</p>
      <p>Your payment has been confirmed. Attached is your subscription receipt for your records.</p>
      <p style="margin-top: 24px;">- The Maboria Team</p>
    </div>
  `;

  await sendBillingMail({
    to: user.email,
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

  const issuedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        metadata: {
          ...(metadata || {}),
          receiptSentAt: issuedAt.toISOString(),
          receiptUrl: pdfUrl,
          receiptNumber,
        },
      },
    });
    let subscription = await tx.subscription.findFirst({
      where: { userId, ...(plan ? { plan: plan as any } : {}) },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription && plan) {
      subscription = await tx.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    }
    if (subscription) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          receiptUrl: pdfUrl,
          receiptNumber,
          receiptIssuedAt: issuedAt,
          lastPaymentReference: reference || paymentId,
          lastPaymentProvider: provider,
        },
      });
    }
  });

  log("info", "subscription_receipt_emailed", {
    userId,
    reference,
    provider,
  });
}
