import PDFDocument from "pdfkit";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { log } from "./logger";
import { formatCurrencyCode } from "./currency";
import { formatDateDMY } from "./date";

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const logoPath = path.join(process.cwd(), "public", "branding", "Maboria Company logo.png");

const issuer = {
  name: process.env.SUBSCRIPTION_RECEIPT_NAME || "Maboria",
  address: process.env.SUBSCRIPTION_RECEIPT_ADDRESS || "100 Alexander Avenue, Ikoyi, Lagos, Nigeria",
  email: process.env.SUBSCRIPTION_RECEIPT_EMAIL || "info@maboria.com",
  phone: process.env.SUBSCRIPTION_RECEIPT_PHONE || "+2347063310000",
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

export function buildSubscriptionReceiptPdfBuffer(input: {
  receiptNumber: string;
  paidAt: Date;
  plan: string;
  amount: number;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference?: string | null;
}) {
  const fontPath = ensureFontPath();
  const logo = tryReadLogo();
  const doc = new PDFDocument({ margin: 54, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  doc.registerFont("Inter", fontPath);
  doc.font("Inter");

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let y = 48;

  if (logo) {
    doc.image(logo, left, y, { width: 40, height: 40 });
  }

  doc
    .fontSize(18)
    .fillColor("#111827")
    .text(issuer.name, left + (logo ? 54 : 0), y + 6, { align: "left" });

  doc
    .fontSize(12)
    .fillColor("#111827")
    .text("SUBSCRIPTION RECEIPT", right - 200, y + 8, { width: 200, align: "right" });

  y += 52;
  doc
    .fontSize(9.5)
    .fillColor("#374151")
    .text(issuer.address, left, y)
    .text(issuer.email, left, (y += 14))
    .text(issuer.phone, left, (y += 14));

  y += 24;
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  y += 18;
  doc
    .fontSize(11)
    .fillColor("#111827")
    .text("Receipt Number", left, y)
    .text("Date", left + 220, y)
    .text("Status", left + 380, y);
  y += 16;
  doc
    .fontSize(10.5)
    .fillColor("#111827")
    .text(input.receiptNumber, left, y)
    .text(formatDateDMY(input.paidAt), left + 220, y)
    .text("PAID", left + 380, y);

  y += 26;
  doc
    .fontSize(11)
    .fillColor("#111827")
    .text("Billed To", left, y)
    .text("Payment", left + 320, y);
  y += 16;
  doc
    .fontSize(10.5)
    .fillColor("#111827")
    .text(input.customerName || "Subscriber", left, y)
    .text(input.customerEmail || "", left, y + 14)
    .text(`${input.plan} plan - ${input.provider}`, left + 320, y)
    .text(input.reference ? `Ref: ${input.reference}` : "", left + 320, y + 14);

  y += 54;
  doc
    .rect(left, y, right - left, 90)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  doc
    .fontSize(11)
    .fillColor("#111827")
    .text("Description", left + 14, y + 12)
    .text("Amount", right - 140, y + 12, { width: 120, align: "right" });

  doc
    .fontSize(10.5)
    .fillColor("#111827")
    .text(`${input.plan} subscription`, left + 14, y + 40)
    .text(formatCurrencyCode(input.amount, input.currency), right - 140, y + 40, {
      width: 120,
      align: "right",
    });

  y += 120;
  doc
    .fontSize(11)
    .fillColor("#111827")
    .text("Total Paid", right - 140, y, { width: 120, align: "right" });
  y += 18;
  doc
    .fontSize(14)
    .fillColor("#111827")
    .text(formatCurrencyCode(input.amount, input.currency), right - 160, y, {
      width: 140,
      align: "right",
    });

  y += 50;
  doc
    .fontSize(9.5)
    .fillColor("#6B7280")
    .text("Thank you for subscribing to Maboria.", left, y);

  doc
    .fontSize(9)
    .fillColor("#9CA3AF")
    .text("Generated with Maboria", 0, doc.page.height - 60, { align: "center" });

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
}: {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference?: string | null;
  paidAt: Date;
  plan?: string | null;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  const metadata = (payment?.metadata as Record<string, unknown> | null) || {};
  if (metadata.receiptSentAt) return;
  if (!plan) {
    log("warn", "subscription_receipt_missing_plan", { userId, reference });
  }

  const planLabel =
    plan === "GROWTH"
      ? "Pro"
      : plan === "STARTER"
        ? "Starter"
        : plan === "ENTERPRISE"
          ? "Enterprise"
          : "Subscription";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
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
    provider,
    reference: reference || undefined,
  });

  const subject = "Your Maboria subscription is confirmed";
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <p>Hi ${user.name || "there"},</p>
      <p>Thank you for subscribing to Maboria. Your payment has been confirmed.</p>
      <p>Attached is your subscription receipt for your records.</p>
      <p style="margin-top: 24px;">— The Maboria Team</p>
    </div>
  `;

  await sendEmail({
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

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      metadata: {
        ...(metadata || {}),
        receiptSentAt: new Date().toISOString(),
      },
    },
  });

  log("info", "subscription_receipt_emailed", {
    userId,
    reference,
    provider,
  });
}

