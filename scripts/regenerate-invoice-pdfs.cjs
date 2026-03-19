const Module = require("module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.apply(this, arguments);
};

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "commonjs", moduleResolution: "node" },
});
require("tsconfig-paths/register");

const { prisma } = require("../lib/prisma");
const { ensureInvoicePdf, resolveInvoiceCustomer } = require("../lib/invoice");

(async () => {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      poNumber: true,
      status: true,
      generatedAt: true,
      currency: true,
      items: true,
      tax: true,
      discount: true,
      total: true,
      lateFeeAmount: true,
      lateFeeTotalAccumulated: true,
      pdfUrl: true,
      metadata: true,
      userId: true,
    },
  });

  for (const invoice of invoices) {
    const metadata = invoice.metadata || {};
    let business = metadata.businessProfile;

    const profile = await prisma.businessProfile.findUnique({
      where: { userId: invoice.userId },
      select: {
        businessName: true,
        country: true,
        defaultCurrency: true,
        businessAddress: true,
        businessEmail: true,
        businessPhone: true,
        taxId: true,
        vatEnabled: true,
        vatRate: true,
        vatRateDisplay: true,
        vatPricingMode: true,
      },
    });

    if (profile) {
      business = profile;
    } else if (!business?.businessName) {
      const account = await prisma.user.findUnique({
        where: { id: invoice.userId },
        select: { name: true, email: true },
      });
      const fallbackName =
        (account?.name || "").trim() ||
        (account?.email ? account.email.split("@")[0] : "") ||
        "Business";

      business = {
        businessName: fallbackName,
        country: "NG",
        defaultCurrency: invoice.currency || "USD",
        businessAddress: null,
        businessEmail: account?.email || null,
        businessPhone: null,
        taxId: null,
        vatEnabled: false,
        vatRate: 0,
        vatRateDisplay: null,
        vatPricingMode: "EXCLUSIVE",
      };
    }

    await ensureInvoicePdf({
      invoice,
      business,
      billTo: resolveInvoiceCustomer(metadata),
      forceRegenerate: true,
    });

    console.log("regenerated", invoice.invoiceNumber);
  }

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
