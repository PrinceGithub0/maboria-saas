-- CreateTable
CREATE TABLE "InvoiceComplianceRecord" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sellerCountryCode" TEXT,
    "buyerCountryCode" TEXT,
    "supportLevel" TEXT,
    "taxSystem" TEXT,
    "buyerType" TEXT,
    "supplyType" TEXT,
    "requiresEInvoicing" BOOLEAN NOT NULL DEFAULT false,
    "blockingIssueCount" INTEGER NOT NULL DEFAULT 0,
    "warningIssueCount" INTEGER NOT NULL DEFAULT 0,
    "infoIssueCount" INTEGER NOT NULL DEFAULT 0,
    "document" JSONB NOT NULL,
    "validationSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceComplianceIssue" (
    "id" TEXT NOT NULL,
    "complianceRecordId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceComplianceIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceComplianceRecord_invoiceId_key" ON "InvoiceComplianceRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceComplianceRecord_sellerCountryCode_updatedAt_idx" ON "InvoiceComplianceRecord"("sellerCountryCode", "updatedAt");

-- CreateIndex
CREATE INDEX "InvoiceComplianceRecord_supportLevel_updatedAt_idx" ON "InvoiceComplianceRecord"("supportLevel", "updatedAt");

-- CreateIndex
CREATE INDEX "InvoiceComplianceIssue_complianceRecordId_severity_idx" ON "InvoiceComplianceIssue"("complianceRecordId", "severity");

-- CreateIndex
CREATE INDEX "InvoiceComplianceIssue_code_severity_idx" ON "InvoiceComplianceIssue"("code", "severity");

-- AddForeignKey
ALTER TABLE "InvoiceComplianceRecord" ADD CONSTRAINT "InvoiceComplianceRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceComplianceIssue" ADD CONSTRAINT "InvoiceComplianceIssue_complianceRecordId_fkey" FOREIGN KEY ("complianceRecordId") REFERENCES "InvoiceComplianceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
