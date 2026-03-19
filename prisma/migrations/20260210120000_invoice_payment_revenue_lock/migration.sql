-- AlterTable
ALTER TABLE "InvoicePayment"
  ADD COLUMN "amountOriginal" DECIMAL(14,2),
  ADD COLUMN "currencyOriginal" TEXT,
  ADD COLUMN "fxRateUsed" DECIMAL(18,8),
  ADD COLUMN "amountConverted" DECIMAL(14,2),
  ADD COLUMN "currencyDefault" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "viaSubaccount" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refundOfId" TEXT;

-- Backfill legacy confirmed rows with locked values
UPDATE "InvoicePayment"
SET
  "amountOriginal" = COALESCE("amountOriginal", "amount"),
  "currencyOriginal" = COALESCE("currencyOriginal", "currency"),
  "amountConverted" = COALESCE("amountConverted", "amount"),
  "currencyDefault" = COALESCE("currencyDefault", "currency"),
  "fxRateUsed" = COALESCE("fxRateUsed", CASE WHEN "amount" <> 0 THEN 1 ELSE NULL END),
  "confirmedAt" = COALESCE("confirmedAt", CASE WHEN "status" = 'SUCCEEDED' THEN "createdAt" ELSE NULL END)
WHERE "status" = 'SUCCEEDED';

-- CreateIndex
CREATE INDEX "InvoicePayment_userId_confirmedAt_idx" ON "InvoicePayment"("userId", "confirmedAt");

-- CreateIndex
CREATE INDEX "InvoicePayment_refundOfId_idx" ON "InvoicePayment"("refundOfId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_refundOfId_fkey"
  FOREIGN KEY ("refundOfId") REFERENCES "InvoicePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
